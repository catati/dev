import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const repo = new URL('..', import.meta.url).pathname;
const readJson = (path) => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const marketplace = readJson('.claude-plugin/marketplace.json');
const entry = marketplace.plugins.find((plugin) => plugin.name === 'catati');
const pluginRoot = join(repo, entry.source);
const manifest = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
const probe = join(pluginRoot, 'hooks', 'probe.sh');

function runProbe(t, env) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-probe-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const result = spawnSync(probe, { cwd: parent, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: parent, ...env } });
	return { ...result, cwd: parent, marker: join(parent, '.claude', 'catati-plugin-hook-ran') };
}

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

test('the SessionStart hook runs the probe from the plugin root', () => {
	const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
	const commands = hooks.hooks.SessionStart.flatMap((group) => group.hooks.map((hook) => hook.command));
	assert.deepEqual(commands, ['"${CLAUDE_PLUGIN_ROOT}/hooks/probe.sh"']);
});

test('the probe writes the time, the directory and the project dir, and nothing else', (t) => {
	const { status, stdout, stderr, cwd, marker } = runProbe(t, { CLAUDE_PROJECT_DIR: '/work/repo' });
	assert.equal(status, 0);
	assert.equal(stdout + stderr, '');
	const [time, dir, project, ...rest] = readFileSync(marker, 'utf8').split('\n');
	assert.match(time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
	assert.equal(dir, cwd);
	assert.equal(project, '/work/repo');
	assert.deepEqual(rest, ['']);
});

test('the probe records an unset project dir and overwrites the marker', (t) => {
	const first = runProbe(t, {});
	const second = spawnSync(probe, { cwd: first.cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: first.cwd } });
	assert.equal(second.status, 0);
	assert.equal(readFileSync(first.marker, 'utf8').split('\n')[2], 'unset');
	assert.equal(readFileSync(first.marker, 'utf8').split('\n').length, 4);
});

test('the probe exits 0 when it cannot write the marker', (t) => {
	const { status, stdout, stderr } = runProbe(t, { HOME: '/dev/null' });
	assert.equal(status, 0);
	assert.equal(stdout + stderr, '');
});
