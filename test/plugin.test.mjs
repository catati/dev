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

test('each skill names its own folder and has a description', () => {
	const skills = join(pluginRoot, 'skills');
	const names = readdirSync(skills).sort();
	assert.deepEqual(names, ['agent-browser', 'project-setup', 'repo-setup']);
	for (const name of names) {
		const frontmatter = readFileSync(join(skills, name, 'SKILL.md'), 'utf8').match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
		assert.match(frontmatter, new RegExp(`^name: ${name}$`, 'm'));
		assert.match(frontmatter, /^description: \S/m);
	}
});

test('project-setup calls itself by its plugin name, because routines load it from the plugin', () => {
	const skill = readFileSync(join(pluginRoot, 'skills', 'project-setup', 'SKILL.md'), 'utf8');
	assert.doesNotMatch(skill, /(?<![\w:])\/?project-setup with args|(?<![\w:])\/project-setup\b/);
	assert.match(skill, /`Start: use the Skill tool to run catati:project-setup with args "start"/);
	assert.match(skill, /`End: use the Skill tool to run catati:project-setup with args "end <kind>"/);
});

const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
const commandsOf = (event) => hooks[event].flatMap((group) => group.hooks.map((hook) => hook.command));

test('the SessionStart hook runs the session setup from the plugin root', () => {
	assert.deepEqual(commandsOf('SessionStart'), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs"']);
});

test('the WorktreeCreate and WorktreeRemove hooks both run worktree.mjs, and the plugin has no other hook, so no PreToolUse prod guard', () => {
	for (const event of ['WorktreeCreate', 'WorktreeRemove']) assert.deepEqual(commandsOf(event), ['node "${CLAUDE_PLUGIN_ROOT}/hooks/worktree.mjs"']);
	assert.deepEqual(Object.keys(hooks).sort(), ['SessionStart', 'WorktreeCreate', 'WorktreeRemove']);
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
