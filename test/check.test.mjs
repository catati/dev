import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../bin/catati-dev.mjs', import.meta.url).pathname;
const template = (name) => readFileSync(new URL(`../templates/${name}`, import.meta.url));

const cleanMakefile = ['install test e2e:', '\t@true', 'verify: lint', '\t@true', 'lint help:', '\t@true', ''].join('\n');

function cleanRepo() {
	return {
		'.github/ISSUE_TEMPLATE/issue.yml': template('issue.yml'),
		'.github/pull_request_template.md': template('pull_request_template.md'),
		'.github/workflows/ci.yml': 'on: push\n',
		Makefile: cleanMakefile,
		'.env.example': 'KEY=\n',
		'web/.env.example': 'KEY=\n',
		'.env': 'KEY=real\n',
		'.prod.env': 'KEY=real\n',
	};
}

function runCheck(files, t) {
	const root = mkdtempSync(join(tmpdir(), 'catati-dev-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	execFileSync('git', ['init', '-q'], { cwd: root });
	for (const [path, content] of Object.entries(files)) {
		if (content === undefined) continue;
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	const { status, stdout } = spawnSync(process.execPath, [cli, 'check'], { cwd: root, encoding: 'utf8' });
	return { status, lines: stdout.split('\n').filter(Boolean) };
}

test('a repo that follows every rule passes', (t) => {
	assert.deepEqual(runCheck(cleanRepo(), t), { status: 0, lines: [] });
});

test('templates-equal flags a changed and a missing template', (t) => {
	const files = { ...cleanRepo(), '.github/pull_request_template.md': '## Why\n', '.github/ISSUE_TEMPLATE/issue.yml': undefined };
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: [
			'templates-equal: .github/ISSUE_TEMPLATE/issue.yml: file is missing',
			'templates-equal: .github/pull_request_template.md: differs from templates/pull_request_template.md',
		],
	});
});

test('make-targets flags each missing core target', (t) => {
	const files = { ...cleanRepo(), Makefile: 'install test verify lint help:\n\t@true\ne2e-test:\n\t@true\nE2E := e2e\n' };
	assert.deepEqual(runCheck(files, t), { status: 1, lines: ['make-targets: Makefile: no target e2e'] });
});

test('ci-workflow flags a CI workflow with another name', (t) => {
	const files = { ...cleanRepo(), '.github/workflows/ci.yml': undefined, '.github/workflows/checks.yml': 'on: push\n' };
	assert.deepEqual(runCheck(files, t), { status: 1, lines: ['ci-workflow: .github/workflows/ci.yml: file is missing'] });
});

test('env-example flags env templates with another name', (t) => {
	const files = { ...cleanRepo(), 'example.env': 'KEY=\n', 'app/.env.sample': 'KEY=\n' };
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: ['env-example: app/.env.sample: env template is not named .env.example', 'env-example: example.env: env template is not named .env.example'],
	});
});

test('an allow line suppresses its check until it expires', (t) => {
	const allowed = 'catati-dev-allow(env-example): tool reads this name; expires 2999-01-01\n';
	const expired = 'catati-dev-allow(env-example): tool reads this name; expires 2000-01-01\n';
	assert.deepEqual(runCheck({ ...cleanRepo(), 'example.env': `# ${allowed}KEY=\n` }, t), { status: 0, lines: [] });
	assert.deepEqual(runCheck({ ...cleanRepo(), 'example.env': `# ${expired}KEY=\n` }, t), {
		status: 1,
		lines: [
			'env-example: example.env: env template is not named .env.example',
			'allow: example.env: catati-dev-allow(env-example) expired 2000-01-01',
		],
	});
});

test('a repo-level allow covers files that cannot hold a comment', (t) => {
	const files = {
		...cleanRepo(),
		'.github/pull_request_template.md': '## Why\n',
		'.catati-dev-allow': 'catati-dev-allow(templates-equal): migrating to the shared template; expires 2999-01-01\n',
	};
	assert.deepEqual(runCheck(files, t), { status: 0, lines: [] });
});
