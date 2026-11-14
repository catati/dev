import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { decide, JUDGED_TOOLS } from '../plugins/catati/hooks/prod-guard.mjs';

const hook = new URL('../plugins/catati/hooks/prod-guard.mjs', import.meta.url).pathname;
const DEV = '028a7270e2ad8a208cd6b01800f363f3';
const PROD = '69f8dc2296dd15d29e03693d6492f163';
const APPROVE = 'Approve only if Shien asked for this specific prod action.';

const bash = (command, cwd = '/home/user/repo') => ['Bash', { command }, cwd];
const cloudflare = (account_id, code) => ['mcp__cloudflare__execute', { account_id, code }];
const d1Query = (account, sql) =>
	`async () => (await cloudflare.request({ method: 'POST', path: '/accounts/${account}/d1/database/542f100a/query', body: { sql: ${JSON.stringify(sql)} } })).result[0].results`;
const trigger = (input) => ['mcp__github__actions_run_trigger', { owner: 'catati', repo: 'terraform', ...input }];
const shopifyTool = (name) => [`mcp__Shopify__${name}`, {}];

const rows = {
	'Wrangler write': {
		asks: [
			bash('npx wrangler deploy'),
			bash('wrangler deploy --env prod'),
			bash('wrangler secret put X --env prod'),
			bash(`CLOUDFLARE_ACCOUNT_ID=${PROD} wrangler deploy --env dev`),
			bash('sudo -E npx wrangler deploy'),
			bash('bash -c "wrangler deploy --env prod"'),
			bash('echo $(wrangler deploy)'),
			bash('echo "`wrangler deploy --env=prod`"'),
			bash('cd api && pnpm --dir api exec wrangler deploy -e prod'),
			bash('timeout 60 nice -n 5 ./node_modules/.bin/wrangler versions upload'),
			bash('eval "wrangler deploy"'),
			bash('wrangler d1 execute DB --env prod --remote --command "DELETE FROM bookings"'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1; DELETE FROM bookings"'),
			bash('wrangler d1 execute DB --env prod --remote --command "WITH x AS (SELECT 1) DELETE FROM bookings"'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1 -- x"'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1 /* x */"'),
			bash('wrangler d1 execute DB --env prod --remote --file q.sql'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1" --command "SELECT 2"'),
		],
		passes: [
			bash('npx wrangler deploy --env dev'),
			bash('pnpm --dir api exec wrangler d1 migrations apply DB --env dev --remote'),
			bash('wrangler deploy --dry-run'),
			bash('wrangler d1 execute DB --local --command "DELETE FROM bookings"'),
			bash('wrangler tail --env prod'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1"'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT created_at FROM bookings;"'),
			bash(`CLOUDFLARE_ACCOUNT_ID=${DEV} wrangler deploy --env dev`),
			bash('echo "wrangler deploy"'),
		],
	},
	'Terraform write': {
		asks: [
			bash('terraform -chdir=cat-hotel/prod apply'),
			bash('terraform destroy', '/home/user/terraform/cat-hotel/prod'),
			bash('tofu -chdir=cat-hotel/prod import a.b c'),
			bash('terraform -chdir=cat-hotel/prod state rm aws_x.y'),
		],
		passes: [
			bash('terraform -chdir=cat-hotel/dev apply'),
			bash('terraform -chdir=cat-hotel/prod plan'),
			bash('terraform -chdir=cat-hotel/prod state list'),
			bash('terraform apply', '/home/user/terraform/cat-hotel/dev'),
			bash('terraform destroy', '/home/user/terraform/production-notes'),
		],
	},
	'Shopify CLI write': {
		asks: [
			bash('shopify app deploy'),
			bash('shopify app release --config prod'),
			bash('shopify theme publish'),
			bash('shopify theme delete -t 1'),
			bash('shopify theme push'),
		],
		passes: [
			bash('shopify app release --config dev'),
			bash('shopify app deploy -c dev'),
			bash('shopify theme push --development'),
			bash('shopify theme push -u'),
			bash('shopify app info'),
		],
	},
	'Prod make target': {
		asks: [bash('make deploy-prod'), bash('make deploy-prod ENV=prod'), bash('make -C api migrate-prod')],
		passes: [bash('make deploy-dev'), bash('make verify'), bash('make check-bindings ENV=prod'), bash('make plan-prod')],
	},
	'Deploy run': {
		asks: [
			bash('gh workflow run deploy.yml'),
			bash('gh workflow run deploy -f ref=main'),
			bash('gh run rerun 1'),
			bash('gh api -X POST repos/catati/terraform/actions/workflows/deploy.yml/dispatches'),
			bash('gh api -X POST repos/catati/cat-hotel/actions/runs/1/pending_deployments'),
			bash('curl -X POST https://api.github.com/repos/catati/cat-hotel/actions/runs/1/rerun'),
			trigger({ method: 'run_workflow', workflow_id: 'deploy.yml', ref: 'main' }),
			trigger({ method: 'run_workflow', workflow_id: '123456', ref: 'main' }),
			trigger({ method: 'rerun_workflow_run', run_id: 1 }),
			trigger({ method: 'rerun_failed_jobs', run_id: 1 }),
		],
		passes: [
			bash('gh workflow run ci.yml'),
			bash('gh run list'),
			bash('gh run view 1'),
			bash('gh api repos/catati/terraform/actions/workflows/ci.yml/dispatches'),
			trigger({ method: 'run_workflow', workflow_id: 'ci.yml', ref: 'main' }),
			trigger({ method: 'cancel_workflow_run', run_id: 1 }),
			trigger({ method: 'delete_workflow_run_logs', run_id: 1 }),
		],
	},
	'Cloudflare connector write': {
		asks: [
			cloudflare(PROD, d1Query(PROD, 'UPDATE bookings SET status = 1')),
			cloudflare(PROD, d1Query(PROD, 'SELECT 1; DROP TABLE bookings')),
			cloudflare(undefined, `async () => cloudflare.request({ method: 'PUT', path: '/accounts/x/workers/scripts/api' })`),
			cloudflare(PROD, `async () => cloudflare.request({ method: m, path: '/accounts/x/workers' })`),
			cloudflare(DEV, `async () => cloudflare.request({ method: 'DELETE', path: '/accounts/${PROD}/workers/scripts/api' })`),
			cloudflare(PROD, `async () => cloudflare.request({ method: 'POST', path: '/accounts/x/d1/database/y/query', body: { sql: q } })`),
		],
		passes: [
			cloudflare(DEV, `async () => cloudflare.request({ method: 'POST', path: '/accounts/${DEV}/workers/scripts/api' })`),
			cloudflare(PROD, `async () => cloudflare.request({ method: 'GET', path: '/accounts/${PROD}/workers/scripts' })`),
			cloudflare(PROD, `async () => cloudflare.request({ "method": "GET", path: '/accounts' })`),
			cloudflare(PROD, d1Query(PROD, 'SELECT\n  plan_id,\n  date(check_in, \'-1 day\')\nFROM bookings\nUNION\nSELECT 1')),
			cloudflare(PROD, `async () => cloudflare.request({ method: 'POST', path: '/accounts/x/d1/database/y/raw', body: { sql: 'SELECT 1' } })`),
		],
	},
	'Shopify connector write': {
		asks: [shopifyTool('graphql_mutation'), shopifyTool('update-product'), shopifyTool('set-inventory'), shopifyTool('theme_publish')],
		passes: [shopifyTool('get-shop-info'), shopifyTool('graphql_query'), shopifyTool('search_products'), shopifyTool('list-orders')],
	},
};

const label = ([tool, input]) => `${tool} ${JSON.stringify(input)}`;

for (const [row, { asks, passes }] of Object.entries(rows)) {
	test(`${row} asks on a prod write`, () => {
		for (const call of asks) {
			const result = decide(...call);
			assert.equal(result?.decision, 'ask', label(call));
			assert.ok(result.reason.endsWith(APPROVE), result.reason);
		}
	});
	test(`${row} passes what is not a prod write`, () => {
		for (const call of passes) assert.equal(decide(...call), null, label(call));
	});
}

test('the guard passes the dropped asks, which are not prod writes', () => {
	for (const command of ['git -c push.negotiate=true push', 'gh secret list', 'gh pr merge 5 --squash', 'gh api repos/catati/dev/git/refs'])
		assert.equal(decide(...bash(command)), null, command);
	for (const tool of ['Edit', 'Write', 'mcp__github__merge_pull_request', 'mcp__github__enable_pr_auto_merge'])
		assert.equal(decide(tool, { file_path: '/repo/.claude/settings.json', pullNumber: 1 }, '/repo'), null, tool);
});

test('JUDGED_TOOLS names each tool or prefix that decide judges', () => {
	assert.deepEqual(JUDGED_TOOLS, ['Bash', 'mcp__cloudflare__execute', 'mcp__Shopify__', 'mcp__github__actions_run_trigger']);
});

function runHook(stdin) {
	const result = spawnSync(process.execPath, [hook], { input: stdin, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, '');
	return result.stdout;
}

test('the hook prints one ask line for a prod write and nothing for a dev write', () => {
	const asked = runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npx wrangler deploy --env prod' } }));
	assert.equal(asked.trim().split('\n').length, 1);
	const output = JSON.parse(asked).hookSpecificOutput;
	assert.equal(output.hookEventName, 'PreToolUse');
	assert.equal(output.permissionDecision, 'ask');
	assert.match(output.permissionDecisionReason, /--env prod/);
	assert.equal(runHook(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npx wrangler deploy --env dev' } })), '');
});

test('the hook reads the cwd from its input', () => {
	const input = (cwd) => JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'terraform apply' }, cwd });
	assert.equal(JSON.parse(runHook(input('/work/terraform/cat-hotel/prod'))).hookSpecificOutput.permissionDecision, 'ask');
	assert.equal(runHook(input('/work/terraform/cat-hotel/dev')), '');
});

test('the hook asks, and exits 0, on an input it cannot read', () => {
	for (const stdin of [
		JSON.stringify({ tool_name: 'Bash', tool_input: { command: 42 } }),
		JSON.stringify({ tool_name: 'mcp__cloudflare__execute', tool_input: { account_id: PROD } }),
		JSON.stringify({ tool_name: 'mcp__github__actions_run_trigger', tool_input: { method: 'approve_everything' } }),
		JSON.stringify({ tool_name: 'Bash' }),
		'not json',
	]) {
		const output = JSON.parse(runHook(stdin)).hookSpecificOutput;
		assert.equal(output.permissionDecision, 'ask', stdin);
		assert.ok(output.permissionDecisionReason.startsWith('The prod guard could not read this call ('), output.permissionDecisionReason);
	}
});

test('the hook prints nothing for a tool it does not judge', () => {
	assert.equal(runHook(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/x' } })), '');
});
