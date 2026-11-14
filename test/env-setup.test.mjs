import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
