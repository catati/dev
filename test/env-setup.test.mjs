import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const rule = readFileSync(new URL('../plugins/catati/rules/pstack-models.md', import.meta.url));
const setupScript = readFileSync(new URL('../env/setup.sh', import.meta.url), 'utf8');

function snapshot(path) {
	const { mtimeMs, ino } = statSync(path);
	return { bytes: readFileSync(path), mtimeMs, ino };
}

test('env/setup.sh carries the model rule byte for byte', () => {
	const embedded = setupScript.match(/<<'RULE'\n([\s\S]*?\n)RULE\n/)?.[1];
	assert.equal(embedded, rule.toString());
});

test('the env/setup.sh rule step installs a missing rule once and keeps an existing one', (t) => {
	const home = mkdtempSync(join(tmpdir(), 'catati-'));
	t.after(() => rmSync(home, { recursive: true, force: true }));
	const rulePath = join(home, '.claude', 'rules', 'pstack-models.md');
	const step = setupScript.match(/# --- pstack model rule -+\n[\s\S]*?\n(?=# --- )/)[0];
	const runStep = () => execFileSync('bash', ['-euo', 'pipefail', '-c', step], { env: { PATH: process.env.PATH, HOME: home } });
	runStep();
	const first = snapshot(rulePath);
	assert.deepEqual(first.bytes, rule);
	runStep();
	assert.deepEqual(snapshot(rulePath), first);
	writeFileSync(rulePath, 'judgment and prose: sonnet high\n');
	const own = snapshot(rulePath);
	runStep();
	assert.deepEqual(snapshot(rulePath), own);
	assert.deepEqual(readdirSync(join(home, '.claude', 'rules')), ['pstack-models.md']);
});

test('env/setup.sh installs agent-browser at an exact version', () => {
	const installs = [...setupScript.matchAll(/^npm install -g .*\bagent-browser@(\S+)/gm)].map((m) => m[1]);
	assert.equal(installs.length, 1, 'env/setup.sh installs agent-browser exactly once');
	assert.match(installs[0], /^\d+\.\d+\.\d+$/);
	assert.match(setupScript, /^agent-browser --version$/m, 'the install step runs agent-browser once to link and check it');
});

test('the env/setup.sh skill step installs the packaged agent-browser skill once and keeps an existing one', (t) => {
	const root = mkdtempSync(join(tmpdir(), 'catati-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const home = join(root, 'home');
	const bin = join(root, 'bin');
	const packaged = join(root, 'npm-root', 'agent-browser', 'skills', 'agent-browser');
	mkdirSync(bin);
	mkdirSync(packaged, { recursive: true });
	writeFileSync(join(packaged, 'SKILL.md'), '---\nname: agent-browser\n---\n');
	writeFileSync(join(bin, 'npm'), `#!/bin/sh\necho '${join(root, 'npm-root')}'\n`, { mode: 0o755 });
	const step = setupScript.match(/^skills_dir=[\s\S]*?\nfi\n/m)?.[0];
	assert.ok(step, 'env/setup.sh has the agent-browser skill step');
	const skillPath = join(home, '.claude', 'skills', 'agent-browser', 'SKILL.md');
	const runStep = () => execFileSync('bash', ['-euo', 'pipefail', '-c', step], { env: { PATH: `${bin}:${process.env.PATH}`, HOME: home } });
	runStep();
	assert.equal(readFileSync(skillPath, 'utf8'), '---\nname: agent-browser\n---\n');
	const first = snapshot(skillPath);
	runStep();
	assert.deepEqual(snapshot(skillPath), first);
	writeFileSync(skillPath, '---\nname: agent-browser\ndescription: mine\n---\n');
	runStep();
	assert.equal(readFileSync(skillPath, 'utf8'), '---\nname: agent-browser\ndescription: mine\n---\n');
	rmSync(skillPath);
	runStep();
	assert.deepEqual(readdirSync(join(home, '.claude', 'skills', 'agent-browser')), []);
	assert.deepEqual(readdirSync(join(home, '.claude', 'skills')), ['agent-browser']);
});
