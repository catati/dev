import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
		'.github/workflows/pr-format.yml': template('pr-format.yml'),
		'.github/workflows/ci.yml': 'on: push\n',
		Makefile: cleanMakefile,
		'.env.example': 'KEY=\n',
		'web/.env.example': 'KEY=\n',
		'.env': 'KEY=real\n',
		'.prod.env': 'KEY=real\n',
	};
}

function runCheck(files, t, { git = true, from = '' } = {}) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-dev-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const root = join(parent, 'repo');
	mkdirSync(join(root, from), { recursive: true });
	if (git) execFileSync('git', ['init', '-q'], { cwd: root });
	for (const [path, content] of Object.entries(files)) {
		if (content === undefined) continue;
		mkdirSync(dirname(join(root, path)), { recursive: true });
		if (content instanceof Link) symlinkSync(content.target, join(root, path));
		else writeFileSync(join(root, path), content);
	}
	const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent };
	const { status, stdout, stderr } = spawnSync(process.execPath, [cli, 'check'], { cwd: join(root, from), encoding: 'utf8', env });
	const lines = stdout.split('\n').filter(Boolean);
	const errors = stderr.split('\n').filter(Boolean);
	return errors.length > 0 ? { status, lines, errors } : { status, lines };
}

class Link {
	constructor(target) {
		this.target = target;
	}
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

test('templates-equal flags a pr-format workflow that differs from the template', (t) => {
	const files = { ...cleanRepo(), '.github/workflows/pr-format.yml': template('pr-format.yml').toString().replace('pr-format:', 'tooling/pr-format:') };
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: ['templates-equal: .github/workflows/pr-format.yml: differs from templates/pr-format.yml'],
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

test('a run from a subdirectory checks the whole repo', (t) => {
	assert.deepEqual(runCheck({ ...cleanRepo(), 'web/app.js': '' }, t, { from: 'web' }), { status: 0, lines: [] });
	const files = { ...cleanRepo(), '.github/workflows/ci.yml': undefined, 'web/example.env': 'KEY=\n' };
	assert.deepEqual(runCheck(files, t, { from: 'web' }), {
		status: 1,
		lines: ['ci-workflow: .github/workflows/ci.yml: file is missing', 'env-example: web/example.env: env template is not named .env.example'],
	});
});

test('a run outside a git repository prints one line and exits with 2', (t) => {
	assert.deepEqual(runCheck(cleanRepo(), t, { git: false }), {
		status: 2,
		lines: [],
		errors: ['catati-dev: not inside a git repository'],
	});
});

test('a file it cannot read prints one line naming the path and exits with 2', (t) => {
	const { status, lines, errors } = runCheck({ ...cleanRepo(), Makefile: new Link('Makefile') }, t);
	assert.deepEqual({ status, lines, errors: errors?.length }, { status: 2, lines: [], errors: 1 });
	assert.match(errors[0], /^catati-dev: cannot read Makefile: ELOOP$/);
});

test('an allow line with a date that does not exist is malformed', (t) => {
	const line = 'catati-dev-allow(env-example): tool reads this name; expires 2999-02-31';
	assert.deepEqual(runCheck({ ...cleanRepo(), 'example.env': `# ${line}\nKEY=\n` }, t), {
		status: 1,
		lines: ['env-example: example.env: env template is not named .env.example', `allow: example.env: malformed allow: # ${line}`],
	});
});
