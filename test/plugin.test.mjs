import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

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

test('setup-dev is the one Catati skill; the only other is the hidden agent-browser stub, and each names its own folder', () => {
	const skills = join(pluginRoot, 'skills');
	const names = readdirSync(skills).sort();
	assert.deepEqual(names, ['agent-browser', 'setup-dev']);
	for (const name of names) {
		const frontmatter = readFileSync(join(skills, name, 'SKILL.md'), 'utf8').match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
		assert.match(frontmatter, new RegExp(`^name: ${name}$`, 'm'));
		assert.match(frontmatter, /^description: \S/m);
	}
	assert.match(readFileSync(join(skills, 'agent-browser', 'SKILL.md'), 'utf8'), /^hidden: true$/m);
});

test('every file the setup-dev skill links to exists', () => {
	const dir = join(pluginRoot, 'skills', 'setup-dev');
	const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8');
	const links = [...skill.matchAll(/\]\(([^)#]+)\)/g)].map((match) => match[1]);
	assert.ok(links.length > 0);
	for (const link of links) assert.ok(existsSync(join(dir, link)), link);
});

test('routine lines call setup-dev by its plugin name, because routines load it from the plugin', () => {
	const project = readFileSync(join(pluginRoot, 'skills', 'setup-dev', 'references', 'project.md'), 'utf8');
	assert.doesNotMatch(project, /project-setup|repo-setup/);
	assert.match(project, /`Start: use the Skill tool to run catati:setup-dev with args "start"/);
	assert.match(project, /`End: use the Skill tool to run catati:setup-dev with args "end <kind>"/);
});

test('no plugin text clones catati/dev, because a synced plugin carries the standard', () => {
	const files = readdirSync(pluginRoot, { recursive: true }).filter((name) => name.endsWith('.md'));
	for (const name of files) assert.doesNotMatch(readFileSync(join(pluginRoot, name), 'utf8'), /git clone[^\n]*catati\/dev/, name);
});

const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
const commandsOf = (event) => hooks[event].flatMap((group) => group.hooks.map((hook) => hook.command));

test('the SessionStart hook runs the session setup from the plugin root', () => {
	assert.deepEqual(commandsOf('SessionStart'), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"']);
});

test('the WorktreeCreate and WorktreeRemove hooks both run worktree.mjs', () => {
	for (const event of ['WorktreeCreate', 'WorktreeRemove']) assert.deepEqual(commandsOf(event), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/worktree.mjs"']);
	assert.deepEqual(Object.keys(hooks).sort(), ['PreToolUse', 'SessionStart', 'WorktreeCreate', 'WorktreeRemove']);
});

test('the PreToolUse guard runs on every edit, Bash call and MCP merge tool of any server', () => {
	assert.deepEqual(commandsOf('PreToolUse'), Array(2).fill('node "${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"'));
	const [tools, merges] = hooks.PreToolUse;
	assert.deepEqual(tools.matcher.split('|').sort(), ['Bash', 'Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
	const matches = (name) => new RegExp(merges.matcher).test(name);
	for (const name of ['mcp__github__merge_pull_request', 'mcp__github__enable_pr_auto_merge', 'mcp__plugin_github_github__merge_pull_request']) assert.ok(matches(name), name);
	for (const name of ['mcp__github__disable_pr_auto_merge', 'mcp__github__merge_pull_requests', 'Bash']) assert.ok(!matches(name), name);
});

test('a PreToolUse guard that crashes or times out does not block the call, since the verifier-record status is the backstop', () => {
	for (const group of hooks.PreToolUse) for (const hook of group.hooks) assert.equal(hook.onFailure, undefined);
});

test('setup-dev references name plugin files under <plugin>/, and env/.env.example names paths that exist', () => {
	const references = join(pluginRoot, 'skills', 'setup-dev', 'references');
	for (const name of readdirSync(references)) {
		const text = readFileSync(join(references, name), 'utf8');
		for (const [, path] of text.matchAll(/`([^`\s]*(?:templates|conventions|scripts|rules)\/[^`\s]*)`/g)) assert.match(path, /^<plugin>\//, `${name}: ${path}`);
	}
	const example = readFileSync(join(repo, 'env', '.env.example'), 'utf8');
	for (const [, path] of example.matchAll(/\(([\w./-]+\.md)\)/g)) assert.ok(existsSync(join(repo, path)), path);
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

test('the agent-browser skill names the version env/setup.sh pins, so a pin bump refreshes it', () => {
	const skill = readFileSync(join(pluginRoot, 'skills', 'agent-browser', 'SKILL.md'), 'utf8');
	const pin = readFileSync(join(repo, 'env', 'setup.sh'), 'utf8').match(/^npm install -g .*\bagent-browser@(\S+)/m)?.[1];
	assert.ok(pin);
	assert.match(skill, new RegExp(`Copied unchanged from agent-browser ${pin.replaceAll('.', '\\.')} `));
});
