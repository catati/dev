import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { JUDGED_TOOLS } from '../plugins/catati/hooks/prod-guard.mjs';

const repo = new URL('..', import.meta.url).pathname;
const readJson = (path) => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const marketplace = readJson('.claude-plugin/marketplace.json');
const entry = marketplace.plugins.find((plugin) => plugin.name === 'catati');
const pluginRoot = join(repo, entry.source);
const manifest = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));

test('the plugin version matches package.json', () => {
	assert.equal(manifest.version, readJson('package.json').version);
});

test('the marketplace entry name matches the manifest name', () => {
	assert.equal(manifest.name, entry.name);
});

test('the plugin has no top-level bin directory, which claude.ai rejects', () => {
	assert.equal(existsSync(join(pluginRoot, 'bin')), false);
});

test('each skill names its own folder and has a description', () => {
	const skills = join(pluginRoot, 'skills');
	const names = readdirSync(skills);
	assert.deepEqual(names, ['repo-setup']);
	for (const name of names) {
		const frontmatter = readFileSync(join(skills, name, 'SKILL.md'), 'utf8').match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
		assert.match(frontmatter, new RegExp(`^name: ${name}$`, 'm'));
		assert.match(frontmatter, /^description: \S/m);
	}
});

const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
const commandsOf = (event) => hooks[event].flatMap((group) => group.hooks.map((hook) => hook.command));

test('the SessionStart hook runs the session setup from the plugin root', () => {
	assert.deepEqual(commandsOf('SessionStart'), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"']);
});

function unsentTools(matcherSource, tools = JUDGED_TOOLS) {
	const matcher = new RegExp(`^(?:${matcherSource})$`);
	return tools.filter((tool) => !matcher.test(tool));
}

test('one PreToolUse hook runs the prod guard, and its matcher sends every tool the guard judges and nothing else', () => {
	assert.equal(hooks.PreToolUse.length, 1);
	assert.deepEqual(commandsOf('PreToolUse'), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/prod-guard.mjs"']);
	const { matcher } = hooks.PreToolUse[0];
	assert.deepEqual(unsentTools(matcher), [], `hooks.json does not send ${unsentTools(matcher).join(', ')} to the prod guard`);
	const unjudged = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Read', 'mcp__github__merge_pull_request', 'mcp__github__enable_pr_auto_merge', 'mcp__github__actions_list'];
	assert.deepEqual(unsentTools(matcher, unjudged), unjudged);
});

test('the WorktreeCreate and WorktreeRemove hooks both run worktree.mjs from the plugin root', () => {
	for (const event of ['WorktreeCreate', 'WorktreeRemove']) assert.deepEqual(commandsOf(event), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/worktree.mjs"']);
	assert.deepEqual(Object.keys(hooks).sort(), ['PreToolUse', 'SessionStart', 'WorktreeCreate', 'WorktreeRemove']);
});

test('every hook module imports only files inside the plugin, because a synced plugin holds only its own folder', () => {
	const dir = join(pluginRoot, 'hooks');
	for (const name of readdirSync(dir).filter((file) => file.endsWith('.mjs'))) {
		const source = readFileSync(join(dir, name), 'utf8');
		for (const [, target] of source.matchAll(/^import [^'"]*['"]([^'"]+)['"]/gm)) {
			if (target.startsWith('node:')) continue;
			const resolved = new URL(target, `file://${join(dir, name)}`).pathname;
			assert.ok(resolved.startsWith(`${pluginRoot}/`), `${name} imports ${target}`);
			assert.ok(existsSync(resolved), `${name} imports missing ${target}`);
		}
	}
});

test('the PreToolUse command, run as Claude Code runs it, asks for a Wrangler deploy with no env from a folder that is no repo', (t) => {
	const parent = mkdtempSync(join(tmpdir(), 'catati-pre-tool-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const [command] = commandsOf('PreToolUse');
	const run = (tool_name, tool_input) => {
		const result = spawnSync('sh', ['-c', command], {
			cwd: parent,
			input: JSON.stringify({ tool_name, tool_input, cwd: parent }),
			encoding: 'utf8',
			env: { PATH: process.env.PATH, HOME: parent, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: parent },
		});
		assert.equal(result.status, 0, result.stderr);
		return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : null;
	};
	const asked = run('Bash', { command: 'wrangler deploy --config /nonexistent/wrangler.jsonc' });
	assert.equal(asked.hookEventName, 'PreToolUse');
	assert.equal(asked.permissionDecision, 'ask');
	assert.match(asked.permissionDecisionReason, /production Worker/);
	assert.equal(run('Bash', { command: 'wrangler deploy --env dev' }), null);
});
