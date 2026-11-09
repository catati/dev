import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../templates/pr-format.yml', import.meta.url), 'utf8');
const installStep = workflow
	.split('      - name: Install the pinned @catati/dev\n        run: |\n')[1]
	.split('\n      - name:')[0]
	.split('\n')
	.map((line) => line.slice(10))
	.join('\n');

const sha = 'e6696afacb0fde8a8528ba2f89141648e619dd0d';

function runInstallStep(t, pin) {
	const root = mkdtempSync(join(tmpdir(), 'catati-pr-format-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const repo = join(root, 'repo');
	const stubs = join(root, 'stubs');
	mkdirSync(repo);
	mkdirSync(stubs);
	writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'some-repo', devDependencies: { '@catati/dev': pin } }));
	const npmLog = join(root, 'npm-args');
	writeFileSync(join(stubs, 'npm'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${npmLog}'\n`);
	chmodSync(join(stubs, 'npm'), 0o755);
	const result = spawnSync('bash', ['-e', '-c', installStep], {
		cwd: repo,
		encoding: 'utf8',
		env: { PATH: `${stubs}:${process.env.PATH}`, RUNNER_TEMP: join(root, 'runner') },
	});
	let npmArgs = null;
	try {
		npmArgs = readFileSync(npmLog, 'utf8').trim().split('\n');
	} catch {}
	return { status: result.status, stdout: result.stdout, npmArgs };
}

test('pr-format installs a git+https pin at a full commit SHA', (t) => {
	const pin = `git+https://github.com/catati/dev.git#${sha}`;
	const { status, npmArgs } = runInstallStep(t, pin);
	assert.equal(status, 0);
	assert.equal(npmArgs.at(-1), `@catati/dev@${pin}`);
});

for (const [name, pin] of [
	['a github: spec', `github:catati/dev#${sha}`],
	['a short SHA', 'git+https://github.com/catati/dev.git#e6696af'],
	['a branch name', 'git+https://github.com/catati/dev.git#main'],
	['an uppercase SHA', `git+https://github.com/catati/dev.git#${sha.toUpperCase()}`],
	['another repo', `git+https://github.com/catati/devx.git#${sha}`],
	['a git+ssh spec', `git+ssh://git@github.com/catati/dev.git#${sha}`],
	['no pin', ''],
]) {
	test(`pr-format rejects ${name} and installs nothing`, (t) => {
		const { status, stdout, npmArgs } = runInstallStep(t, pin);
		assert.equal(status, 1);
		assert.match(stdout, /must be git\+https:\/\/github\.com\/catati\/dev\.git#<full commit SHA>/);
		assert.equal(npmArgs, null);
	});
}
