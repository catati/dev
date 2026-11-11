import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checks } from '../lib/check.mjs';

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

function runCheck(files, t, { git = true, from = '', origin } = {}) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const root = join(parent, 'repo');
	mkdirSync(join(root, from), { recursive: true });
	if (git) execFileSync('git', ['init', '-q'], { cwd: root });
	if (origin) execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: root });
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

test('env-names flags an env config file or Terraform root named for another environment', (t) => {
	const clean = {
		...cleanRepo(),
		'shopify.app.prod.toml': '',
		'.env.dev': '',
		'infra/prod/main.tf': '',
		'preview/index.html': '',
		'staging/modules/db/main.tf': '',
		'web/components/link-preview.vue': '',
		'web/public/og-preview.png': '',
		'scripts/pr-preview.sh': '',
		'api/scripts/production-plans.json': '{}',
		'docs/release-preview.md': '',
		'node_modules/x/staging.json': '',
	};
	assert.deepEqual(runCheck(clean, t), { status: 0, lines: [] });
	const files = {
		...clean,
		'shopify.app.production.toml': '',
		'api/config.Staging.yaml': '',
		'.env.development': '',
		'api/.dev.vars.preview': '',
		'infra/Staging/main.tf': '',
	};
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: [
			'env-names: .env.development: path names environment development; use dev or prod',
			'env-names: api/.dev.vars.preview: path names environment preview; use dev or prod',
			'env-names: api/config.Staging.yaml: path names environment staging; use dev or prod',
			'env-names: shopify.app.production.toml: path names environment production; use dev or prod',
			'env-names: infra/Staging: path names environment staging; use dev or prod',
		],
	});
});

test('secret-names flags a secret named for an environment or the org', (t) => {
	const clean = 'env:\n  TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n  GH: ${{ secrets.GITHUB_TOKEN }}\n  P: ${{ secrets.PRODUCT_KEY }}\n';
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/workflows/ci.yml': clean }, t), { status: 0, lines: [] });
	const broken = `${clean}  A: \${{ secrets.CATATI_API_TOKEN }}\n  B: \${{ secrets.SHOPIFY_TOKEN_PROD }}\n  C: \${{ secrets.CATATI_API_TOKEN }}\n`;
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/workflows/ci.yml': broken }, t), {
		status: 1,
		lines: [
			'secret-names: .github/workflows/ci.yml: secret CATATI_API_TOKEN names an environment or the org; name it for what it holds',
			'secret-names: .github/workflows/ci.yml: secret SHOPIFY_TOKEN_PROD names an environment or the org; name it for what it holds',
		],
	});
});

test('wrangler-envs flags a wrangler.jsonc without env.dev and env.prod, each with name and account_id', (t) => {
	const clean = { ...cleanRepo(), Makefile: deployMakefile, 'api/wrangler.jsonc': cleanWrangler };
	assert.deepEqual(runCheck(clean, t), { status: 0, lines: [] });
	const broken = cleanWrangler.replace('"account_id": "prod-account"', '"account_id": 7').replace(/\t\t"dev".*\n/, '');
	assert.deepEqual(runCheck({ ...clean, 'api/wrangler.jsonc': broken, 'web/wrangler.jsonc': '{ "name": ' }, t), {
		status: 1,
		lines: [
			'wrangler-envs: api/wrangler.jsonc: no env.dev',
			'wrangler-envs: api/wrangler.jsonc: env.prod has no account_id',
			'wrangler-envs: web/wrangler.jsonc: cannot parse as JSONC',
		],
	});
});

test('wrangler-envs flags a remote Wrangler command without --env and any --keep-vars', (t) => {
	const scripts = (deploy) => JSON.stringify({ scripts: { dev: 'wrangler dev', types: 'wrangler types', deploy } });
	const builds = (command) => JSON.stringify({ triggers: [{ build_command: 'pnpm build', deploy_command: command }] });
	const clean = {
		...cleanRepo(),
		Makefile: `${cleanMakefile}check:\n\tpnpm exec wrangler versions upload --dry-run --env dev && \\\n\t  wrangler d1 execute DB --local\n`,
		'api/package.json': scripts('wrangler d1 migrations apply DB --env=dev --remote && wrangler deploy --env dev'),
		'cat-hotel/dev/builds.json': builds('npx wrangler deploy --env dev'),
	};
	assert.deepEqual(runCheck(clean, t), { status: 0, lines: [] });
	const files = {
		...clean,
		Makefile: `${cleanMakefile}check:\n\tpnpm exec wrangler versions upload --dry-run || exit 1; \\\n\t  wrangler d1 execute DB --remote\n`,
		'api/package.json': scripts('wrangler d1 migrations apply DB --remote | tee log; wrangler deploy --env dev --keep-vars'),
		'cat-hotel/dev/builds.json': builds('npx wrangler deploy'),
	};
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: [
			'wrangler-envs: Makefile: wrangler versions runs without --env: pnpm exec wrangler versions upload --dry-run',
			'wrangler-envs: Makefile: wrangler d1 runs without --env: wrangler d1 execute DB --remote',
			'wrangler-envs: api/package.json: wrangler d1 runs without --env: wrangler d1 migrations apply DB --remote',
			'wrangler-envs: api/package.json: passes --keep-vars: wrangler deploy --env dev --keep-vars',
			'wrangler-envs: cat-hotel/dev/builds.json: wrangler deploy runs without --env: npx wrangler deploy',
		],
	});
});

test('make-targets also needs deploy-dev when the repo has a wrangler.jsonc', (t) => {
	assert.deepEqual(runCheck({ ...cleanRepo(), Makefile: deployMakefile, 'api/wrangler.jsonc': cleanWrangler }, t), { status: 0, lines: [] });
	assert.deepEqual(runCheck({ ...cleanRepo(), 'api/wrangler.jsonc': cleanWrangler }, t), {
		status: 1,
		lines: ['make-targets: Makefile: no target deploy-dev'],
	});
});

test('resource-names flags a Wrangler resource that is not <repo>-<component> or ends in an env', (t) => {
	const config = (names) =>
		JSON.stringify({
			name: names[0],
			ratelimits: [{ name: 'SIGN_IN_LIMIT' }],
			env: {
				dev: { name: 'repo', account_id: 'a', d1_databases: [{ binding: 'DB', database_name: names[1] }] },
				prod: { name: 'repo', account_id: 'b', queues: { consumers: [{ queue: names[2], dead_letter_queue: names[3] }] } },
			},
		});
	const clean = { ...cleanRepo(), Makefile: deployMakefile };
	const good = { ...clean, 'wrangler.jsonc': config(['repo-api', 'repo', 'repo-events', 'repo-events-dlq']) };
	assert.deepEqual(runCheck(good, t, { origin: 'https://github.com/catati/repo.git' }), { status: 0, lines: [] });
	const bad = { ...clean, 'wrangler.jsonc': config(['catati-repo-api', 'repo-dev', 'repo_events', 'repo-events-dlq']) };
	assert.deepEqual(runCheck(bad, t), { status: 0, lines: [] });
	assert.deepEqual(runCheck(bad, t, { origin: 'git@github.com:catati/repo' }), {
		status: 1,
		lines: [
			'resource-names: wrangler.jsonc: resource catati-repo-api is not repo-<component> with no environment suffix',
			'resource-names: wrangler.jsonc: resource repo-dev is not repo-<component> with no environment suffix',
			'resource-names: wrangler.jsonc: resource repo_events is not repo-<component> with no environment suffix',
		],
	});
});

test('allow lines cover the new checks in a JSONC comment and in .catati-allow', (t) => {
	const config = cleanWrangler.replace('"repo-api", /* top level */', '"catati-repo-api", // catati-allow(resource-names): renamed later; expires 2999-01-01');
	const files = {
		...cleanRepo(),
		Makefile: deployMakefile,
		'wrangler.jsonc': config,
		'package.json': JSON.stringify({ scripts: { deploy: 'wrangler deploy' } }),
		'.catati-allow': 'catati-allow(wrangler-envs): deploy script moves to deploy-dev; expires 2999-01-01\n',
	};
	assert.deepEqual(runCheck(files, t, { origin: 'https://github.com/catati/repo' }), { status: 0, lines: [] });
});

test('wrangler-envs reads only Makefile recipe lines and skips echo and printf', (t) => {
	const makefile = [
		'# wrangler deploy ships the worker',
		'DEPLOY = wrangler deploy',
		cleanMakefile,
		'deploy-dev:',
		'\t# wrangler deploy without an env would ship prod',
		'\t@echo "make deploy-dev runs wrangler deploy --env dev"',
		"\tprintf 'wrangler deploy\\n' && wrangler deploy --env dev",
		'',
	].join('\n');
	const clean = { ...cleanRepo(), Makefile: makefile };
	assert.deepEqual(runCheck(clean, t), { status: 0, lines: [] });
	const broken = makefile.replace('&& wrangler deploy --env dev', '&& wrangler \\\n\t  deploy');
	assert.deepEqual(runCheck({ ...clean, Makefile: broken }, t), {
		status: 1,
		lines: ['wrangler-envs: Makefile: wrangler deploy runs without --env: wrangler deploy'],
	});
});

test('wrangler-envs reads -e, make prefixes, versioned wrangler and flag values', (t) => {
	const scripts = (...commands) => JSON.stringify({ scripts: Object.fromEntries(commands.map((c, i) => [`s${i}`, c])) });
	const clean = {
		...cleanRepo(),
		'package.json': scripts('wrangler deploy -e dev', 'wrangler deploy -e=prod', 'wrangler -c wrangler.jsonc --env dev deploy'),
	};
	assert.deepEqual(runCheck(clean, t), { status: 0, lines: [] });
	const files = { ...clean, 'package.json': scripts('@wrangler deploy', 'npx wrangler@4 deploy', 'wrangler --config x deploy') };
	assert.deepEqual(runCheck(files, t), {
		status: 1,
		lines: [
			'wrangler-envs: package.json: wrangler deploy runs without --env: @wrangler deploy',
			'wrangler-envs: package.json: wrangler deploy runs without --env: npx wrangler@4 deploy',
			'wrangler-envs: package.json: wrangler deploy runs without --env: wrangler --config x deploy',
		],
	});
});

test('workflow-names reads the workflows it flags, so an allow line in one works', (t) => {
	const workflow = '.github/workflows/plan.yml';
	assert.ok(checks.find((c) => c.id === 'workflow-names').reads([workflow, '.github/workflows/ci.yml']).includes(workflow));
	const files = { ...cleanRepo(), [workflow]: '# catati-allow(workflow-names): renamed later; expires 2999-01-01\non: push\n' };
	assert.deepEqual(runCheck(files, t), { status: 0, lines: [] });
});

test('resource-names does not treat a Durable Object binding name as a resource', (t) => {
	const config = JSON.stringify({
		name: 'repo-api',
		durable_objects: { bindings: [{ name: 'counter', class_name: 'Counter' }] },
		workflows: [{ name: 'repo-booking', binding: 'BOOKING', class_name: 'Booking' }],
		env: {
			dev: { name: 'repo-api', account_id: 'a', durable_objects: { bindings: [{ name: 'rooms', class_name: 'Rooms' }] } },
			prod: { name: 'repo-api', account_id: 'b' },
		},
	});
	const files = { ...cleanRepo(), Makefile: deployMakefile, 'wrangler.jsonc': config };
	const origin = 'https://github.com/catati/repo.git';
	assert.deepEqual(runCheck(files, t, { origin }), { status: 0, lines: [] });
	assert.deepEqual(runCheck({ ...files, 'wrangler.jsonc': config.replace('repo-booking', 'booking') }, t, { origin }), {
		status: 1,
		lines: ['resource-names: wrangler.jsonc: resource booking is not repo-<component> with no environment suffix'],
	});
});

test('wrangler-envs expands Makefile variables and reads commands inside parentheses', (t) => {
	const makefile = (recipe) =>
		[
			'WRANGLER = pnpm exec wrangler',
			'DEPLOY := $(WRANGLER) deploy',
			'FLAGS ?= --minify',
			'FLAGS += --env dev',
			cleanMakefile,
			'deploy-dev:',
			recipe,
			'',
		].join('\n');
	const clean = { ...cleanRepo(), Makefile: makefile('\t$(DEPLOY) ${FLAGS} && (cd api && wrangler deploy --env dev)') };
	assert.deepEqual(runCheck(clean, t), { status: 0, lines: [] });
	const broken = makefile('\t$(DEPLOY) --minify\n\t${WRANGLER} versions upload\n\t(cd api && wrangler deploy)');
	assert.deepEqual(runCheck({ ...clean, Makefile: broken }, t), {
		status: 1,
		lines: [
			'wrangler-envs: Makefile: wrangler deploy runs without --env: pnpm exec wrangler deploy --minify',
			'wrangler-envs: Makefile: wrangler versions runs without --env: pnpm exec wrangler versions upload',
			'wrangler-envs: Makefile: wrangler deploy runs without --env: wrangler deploy',
		],
	});
});

test('resource-names reads only the resource name paths, at the top level and in each env', (t) => {
	const config = (names) =>
		JSON.stringify({
			name: 'repo-api',
			vars: { name: 'Catati' },
			ratelimits: [{ name: 'sign_in_limit', namespace_id: '1001' }],
			send_email: [{ name: 'mailer' }],
			durable_objects: { bindings: [{ name: 'counter', class_name: 'Counter' }] },
			r2_buckets: [{ binding: 'PHOTOS', bucket_name: names[0] }],
			queues: { producers: [{ binding: 'EVENTS', queue: names[1] }] },
			workflows: [{ name: names[2], binding: 'BOOKING', class_name: 'Booking' }],
			env: {
				dev: { name: 'repo-api', account_id: 'a', vars: { name: 'Catati Dev' }, workflows: [{ name: names[3], class_name: 'Booking' }] },
				prod: { name: 'repo-api', account_id: 'b' },
			},
		});
	const origin = 'https://github.com/catati/repo.git';
	const clean = { ...cleanRepo(), Makefile: deployMakefile, 'wrangler.jsonc': config(['repo-photos', 'repo-events', 'repo-booking', 'repo-booking']) };
	assert.deepEqual(runCheck(clean, t, { origin }), { status: 0, lines: [] });
	const broken = { ...clean, 'wrangler.jsonc': config(['Photos', 'events', 'repo-booking-prod', 'booking']) };
	assert.deepEqual(runCheck(broken, t, { origin }), {
		status: 1,
		lines: [
			'resource-names: wrangler.jsonc: resource Photos is not repo-<component> with no environment suffix',
			'resource-names: wrangler.jsonc: resource events is not repo-<component> with no environment suffix',
			'resource-names: wrangler.jsonc: resource repo-booking-prod is not repo-<component> with no environment suffix',
			'resource-names: wrangler.jsonc: resource booking is not repo-<component> with no environment suffix',
		],
	});
});

test('workflow-names and workflow reads count only YAML files in .github/workflows/', (t) => {
	const files = { ...cleanRepo(), '.github/workflows/README.md': 'Uses secrets.CATATI_API_TOKEN and environment: production\n' };
	assert.deepEqual(runCheck(files, t), { status: 0, lines: [] });
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/workflows/plan.yaml': 'on: push\n' }, t), {
		status: 1,
		lines: ['workflow-names: .github/workflows/plan.yaml: workflow is not named ci.yml or deploy.yml'],
	});
});

test('env-names skips a matrix list of environments', (t) => {
	const workflow = ['jobs:', '  deploy:', '    strategy:', '      matrix:', '        environment: [dev, prod]', '    environment: ${{ matrix.environment }}', ''].join('\n');
	assert.deepEqual(runCheck({ ...cleanRepo(), '.github/workflows/deploy.yml': workflow }, t), { status: 0, lines: [] });
});

test('resource-names reads development as an env suffix and preview as a component', (t) => {
	const config = (name) =>
		JSON.stringify({ name, env: { dev: { name, account_id: 'a' }, prod: { name, account_id: 'b' } } });
	const files = { ...cleanRepo(), Makefile: deployMakefile, 'wrangler.jsonc': config('repo-link-preview') };
	const origin = 'https://github.com/catati/repo.git';
	assert.deepEqual(runCheck(files, t, { origin }), { status: 0, lines: [] });
	const broken = runCheck({ ...files, 'wrangler.jsonc': config('repo-api-development') }, t, { origin });
	assert.equal(broken.status, 1);
	assert.ok(broken.lines.every((line) => line.includes('resource repo-api-development is not repo-<component>')));
});

test('wrangler-envs reads export and target-specific Makefile variables and skips unexpanded flags', (t) => {
	const makefile = (lines) => [cleanMakefile, ...lines, ''].join('\n');
	const clean = makefile(['deploy-dev: ENV_FLAG = --env dev', 'deploy-dev:', '\twrangler deploy $(ENV_FLAG)', 'other:', '\twrangler deploy $$WRANGLER_ENV_ARGS']);
	assert.deepEqual(runCheck({ ...cleanRepo(), Makefile: clean }, t), { status: 0, lines: [] });
	const broken = makefile(['export DEPLOY = wrangler deploy', 'override CHECK = wrangler versions upload', 'deploy-dev:', '\t$(DEPLOY)', '\t$(CHECK)']);
	assert.deepEqual(runCheck({ ...cleanRepo(), Makefile: broken }, t), {
		status: 1,
		lines: [
			'wrangler-envs: Makefile: wrangler deploy runs without --env: wrangler deploy',
			'wrangler-envs: Makefile: wrangler versions runs without --env: wrangler versions upload',
		],
	});
});
