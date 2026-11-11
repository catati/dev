import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../bin/catati.mjs', import.meta.url).pathname;
const template = (name) => readFileSync(new URL(`../templates/${name}`, import.meta.url));

const cleanMakefile = ['install test e2e:', '\t@true', 'verify: lint', '\t@true', 'lint help:', '\t@true', ''].join('\n');

function cleanRepo() {
	return {
		'.github/ISSUE_TEMPLATE/issue.yml': template('issue.yml'),
		'.github/workflows/ci.yml': 'on: push\n',
		Makefile: cleanMakefile,
		'.env.example': 'KEY=\n',
		'web/.env.example': 'KEY=\n',
		'.env': 'KEY=real\n',
		'.prod.env': 'KEY=real\n',
	};
}

function runCheck(files, t, { git = true, from = '' } = {}) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-'));
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
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/ISSUE_TEMPLATE/issue.yml': 'name: Issue\n' }, t), {
		status: 1,
		lines: ['templates-equal: .github/ISSUE_TEMPLATE/issue.yml: differs from templates/issue.yml'],
	});
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/ISSUE_TEMPLATE/issue.yml': undefined }, t), {
		status: 1,
		lines: ['templates-equal: .github/ISSUE_TEMPLATE/issue.yml: file is missing'],
	});
});

test('make-targets flags each missing core target', (t) => {
	const files = { ...cleanRepo(), Makefile: 'install test verify lint help:\n\t@true\ne2e-test:\n\t@true\nE2E := e2e\n' };
	assert.deepEqual(runCheck(files, t), { status: 1, lines: ['make-targets: Makefile: no target e2e'] });
});

test('ci-workflow flags a CI workflow with another name', (t) => {
	const files = { ...cleanRepo(), '.github/workflows/ci.yml': undefined, '.github/workflows/checks.yml': 'on: push\n' };
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: [
			'ci-workflow: .github/workflows/ci.yml: file is missing',
			'workflow-names: .github/workflows/checks.yml: workflow is not named ci.yml or deploy.yml',
		],
	});
});

test('env-example flags env templates with another name', (t) => {
	const files = { ...cleanRepo(), 'example.env': 'KEY=\n', 'app/.env.sample': 'KEY=\n' };
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: ['env-example: app/.env.sample: env template is not named .env.example', 'env-example: example.env: env template is not named .env.example'],
	});
});

test('an allow line suppresses its check until it expires', (t) => {
	const allowed = 'catati-allow(env-example): tool reads this name; expires 2999-01-01\n';
	const expired = 'catati-allow(env-example): tool reads this name; expires 2000-01-01\n';
	assert.deepEqual(runCheck({ ...cleanRepo(), 'example.env': `# ${allowed}KEY=\n` }, t), { status: 0, lines: [] });
	assert.deepEqual(runCheck({ ...cleanRepo(), 'example.env': `# ${expired}KEY=\n` }, t), {
		status: 1,
		lines: [
			'env-example: example.env: env template is not named .env.example',
			'allow: example.env: catati-allow(env-example) expired 2000-01-01',
		],
	});
});

test('a repo-level allow covers files that cannot hold a comment', (t) => {
	const files = {
		...cleanRepo(),
		'.github/ISSUE_TEMPLATE/issue.yml': 'name: Issue\n',
		'.catati-allow': 'catati-allow(templates-equal): migrating to the shared template; expires 2999-01-01\n',
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
		errors: ['catati: not inside a git repository'],
	});
});

test('a file it cannot read prints one line naming the path and exits with 2', (t) => {
	const { status, lines, errors } = runCheck({ ...cleanRepo(), Makefile: new Link('Makefile') }, t);
	assert.deepEqual({ status, lines, errors: errors?.length }, { status: 2, lines: [], errors: 1 });
	assert.match(errors[0], /^catati: cannot read Makefile: ELOOP$/);
});

test('an allow line with a date that does not exist is malformed', (t) => {
	const line = 'catati-allow(env-example): tool reads this name; expires 2999-02-31';
	assert.deepEqual(runCheck({ ...cleanRepo(), 'example.env': `# ${line}\nKEY=\n` }, t), {
		status: 1,
		lines: ['env-example: example.env: env template is not named .env.example', `allow: example.env: malformed allow: # ${line}`],
	});
});

test('workflow-names flags a workflow that is not ci.yml or deploy.yml', (t) => {
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/workflows/deploy.yml': 'on: push\n' }, t), { status: 0, lines: [] });
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/workflows/apply-dev.yml': 'on: push\n' }, t), {
		status: 1,
		lines: ['workflow-names: .github/workflows/apply-dev.yml: workflow is not named ci.yml or deploy.yml'],
	});
});

const cleanWrangler = [
	'{',
	'\t// shared keys',
	'\t"name": "repo-api", /* top level */',
	'\t"vars": { "URL": "https://x.dev/a//b" },',
	'\t"env": {',
	'\t\t"dev": { "name": "repo-api", "account_id": "dev-account", },',
	'\t\t"prod": { "name": "repo-api", "account_id": "prod-account" },',
	'\t},',
	'}',
	'',
].join('\n');

const deployMakefile = `${cleanMakefile}deploy-dev:\n\t@true\n`;

test('env-names flags a Wrangler env key that is not dev or prod', (t) => {
	const clean = { ...cleanRepo(), Makefile: deployMakefile, 'api/wrangler.jsonc': cleanWrangler };
	assert.deepEqual(runCheck(clean, t), { status: 0, lines: [] });
	const staging = cleanWrangler.replace('"prod": {', '"staging": { "name": "repo-api", "account_id": "a" },\n\t\t"prod": {');
	assert.deepEqual(runCheck({ ...clean, 'api/wrangler.jsonc': staging }, t), {
		status: 1,
		lines: ['env-names: api/wrangler.jsonc: env key staging is not dev or prod'],
	});
});

test('env-names flags a GitHub environment that is not dev or prod or puts the env first', (t) => {
	const clean = [
		'jobs:',
		'  plan:',
		'    environment: plan-prod',
		'  deploy:',
		'    environment:',
		'      name: prod',
		'      url: https://x.dev',
		'  other:',
		"    environment: { name: 'dev' }",
		'  matrix:',
		'    environment: ${{ inputs.env }}',
		'',
	].join('\n');
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/workflows/deploy.yml': clean }, t), { status: 0, lines: [] });
	const broken = clean.replace('plan-prod', 'prod-plan').replace('name: prod', 'name: production');
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/workflows/deploy.yml': broken }, t), {
		status: 1,
		lines: [
			'env-names: .github/workflows/deploy.yml: environment prod-plan puts the env first; end it in -dev or -prod',
			'env-names: .github/workflows/deploy.yml: environment production is not dev or prod and does not end in -dev or -prod',
		],
	});
});

test('env-names flags a path that names another environment', (t) => {
	const clean = { ...cleanRepo(), 'shopify.app.prod.toml': '', 'docs/productions.md': '', 'node_modules/x/staging.js': '' };
	assert.deepEqual(runCheck(clean, t), { status: 0, lines: [] });
	const files = { ...clean, 'shopify.app.production.toml': '', 'preview/index.html': '' };
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: [
			'env-names: preview/index.html: path names environment preview; use dev or prod',
			'env-names: shopify.app.production.toml: path names environment production; use dev or prod',
		],
	});
});
