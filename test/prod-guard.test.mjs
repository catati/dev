import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { decide, JUDGED_TOOLS } from '../plugins/catati/hooks/prod-guard.mjs';

const hook = new URL('../plugins/catati/hooks/prod-guard.mjs', import.meta.url).pathname;
const DEV = '028a7270e2ad8a208cd6b01800f363f3';
const PROD = '69f8dc2296dd15d29e03693d6492f163';
const APPROVE = 'Approve only if Shien asked for this specific prod action.';
const TF_PROD = '/home/user/terraform/cat-hotel/prod';

const bash = (command, cwd = '/home/user/repo') => ['Bash', { command }, cwd];
const cloudflare = (account_id, code) => ['mcp__cloudflare__execute', { account_id, code }];
const request = (method, path, body = '') =>
	`async () => cloudflare.request({ method: '${method}', path: '${path}'${body} })`;
const D1_QUERY = `/accounts/${PROD}/d1/database/542f100a/query`;
const d1Query = (sql) => request('POST', D1_QUERY, `, body: { sql: ${JSON.stringify(sql)} }`);
const trigger = (input) => ['mcp__github__actions_run_trigger', { owner: 'catati', repo: 'terraform', ...input }];
const shopifyTool = (name) => [`mcp__Shopify__${name}`, {}];
const commitBody = (body) => `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`;

const rows = {
	'Wrangler write': {
		asks: [
			bash('npx wrangler deploy'),
			bash('wrangler deploy --env prod'),
			bash('wrangler secret put X --env prod'),
			bash(`CLOUDFLARE_ACCOUNT_ID=${PROD} wrangler deploy --env dev`),
			bash('CLOUDFLARE_ACCOUNT_ID=$PROD_ID wrangler deploy --env dev'),
			bash('wrangler d1 execute DB --env prod --remote --command "DELETE FROM bookings"'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1; DELETE FROM bookings"'),
			bash('wrangler d1 execute DB --env prod --remote --command "WITH x AS (SELECT 1) DELETE FROM bookings"'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1 -- x"'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1 /* x */"'),
			bash('wrangler d1 execute DB --env prod --remote --file q.sql'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1" --command "DELETE FROM bookings"'),
			bash('wrangler deploy --env dev --env prod'),
			bash('wrangler secret bulk secrets.json --env dev --env production'),
			bash('wrangler d1 time-travel restore DB --env prod --bookmark x'),
			bash('wrangler vectorize insert idx --env prod --file x.ndjson'),
			bash('wrangler queues pause-delivery q --env prod'),
			bash('wrangler r2 bucket dev-url enable bucket'),
			bash('wrangler pages deploy dist --project-name catati-landing'),
			bash('wrangler deploy -e dev -c wrangler.prod.jsonc'),
			bash('wrangler deploy --env prod --local'),
			bash('wrangler kv key put k v --env prod --local --remote'),
			bash('wrangler kv key put k v --env prod --local=false'),
			bash('wrangler deploy --env prod --dry-run false'),
			bash('wrangler deploy --env prod --dry-run=false'),
			bash('wrangler --unknown tail deploy'),
			bash(`export CLOUDFLARE_ACCOUNT_ID=${PROD}; wrangler deploy --env dev`),
			bash(`CLOUDFLARE_ACCOUNT_ID=${PROD}; wrangler deploy --env dev`),
		],
		passes: [
			bash('npx wrangler deploy --env dev'),
			bash('pnpm --dir api exec wrangler d1 migrations apply DB --env dev --remote'),
			bash('wrangler deploy --dry-run'),
			bash('wrangler d1 execute DB --local --command "DELETE FROM bookings"'),
			bash('wrangler d1 migrations apply DB --local --env prod'),
			bash('wrangler tail --env prod'),
			bash('wrangler tail --env prod --search add'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT 1"'),
			bash('wrangler d1 execute DB --env prod --remote --command "SELECT created_at FROM bookings;"'),
			bash(`CLOUDFLARE_ACCOUNT_ID=${DEV} wrangler deploy --env dev`),
			bash('CLOUDFLARE_ENV=dev wrangler deploy'),
			bash('wrangler deploy --help'),
			bash('npx wrangler deploy --env dev>deploy.log'),
			bash('wrangler d1 migrations create DB add_rooms'),
			bash('wrangler versions view v1 --env prod'),
			bash('wrangler kv key get k --binding KV --env prod'),
			bash('wrangler d1 info DB --env prod'),
			bash('npx wrangler dev --env prod'),
			bash('wrangler'),
			bash('echo "wrangler deploy"'),
			bash('wrangler kv key put k v --env prod --local'),
			bash('wrangler r2 object put b/k --file x --local'),
			bash(`export CLOUDFLARE_ACCOUNT_ID=${DEV}; wrangler deploy --env dev`),
		],
	},
	'Terraform write': {
		asks: [
			bash('terraform -chdir=cat-hotel/prod apply'),
			bash('terraform destroy', TF_PROD),
			bash('tofu -chdir=cat-hotel/prod import a.b c'),
			bash('terraform -chdir=cat-hotel/prod state rm aws_x.y'),
			bash('terraform -chdir=cat-hotel/prod state mv a.b a.c'),
			bash('terraform -chdir=cat-hotel/prod state push x.tfstate'),
			bash('terraform -chdir=cat-hotel/prod state replace-provider a b'),
			bash('terraform -chdir=cat-hotel/prod taint aws_x.y'),
			bash('terraform -chdir=cat-hotel/prod workspace delete x'),
			bash('terraform -chdir=cat-hotel/prod workspace select default'),
			bash('terraform -chdir=cat-hotel/prod force-unlock 123'),
			bash('cd cat-hotel/prod && terraform apply'),
			bash('cd /home/user/terraform/cat-hotel/prod; terraform destroy -auto-approve'),
			bash('terraform -chdir=./cat-hotel/prod/ apply -auto-approve', '/home/user/terraform'),
			bash('cd ~/terraform/cat-hotel/prod && terraform apply'),
			bash('pushd ~/terraform/cat-hotel/prod && terraform apply -auto-approve'),
			bash('cd $HOME/terraform/cat-hotel/prod && terraform apply'),
			bash('cd $ROOT && terraform apply'),
			bash('cd - && terraform destroy'),
			bash('popd && terraform apply'),
		],
		passes: [
			bash('terraform -chdir=cat-hotel/dev apply'),
			bash('terraform -chdir=cat-hotel/prod plan'),
			bash('terraform -chdir=cat-hotel/prod state list'),
			bash('terraform -chdir=cat-hotel/prod workspace show'),
			bash('terraform apply', '/home/user/terraform/cat-hotel/dev'),
			bash('terraform destroy', '/home/user/terraform/production-notes'),
			bash('cd ../dev && terraform apply', TF_PROD),
			bash('terraform -chdir=../dev apply', TF_PROD),
			bash('cd $ROOT && terraform plan'),
			bash('cd ~ && terraform apply', TF_PROD),
			bash('cd && terraform apply', TF_PROD),
			bash('terraform taint -chdir=x'),
		],
	},
	'Shopify CLI write': {
		asks: [
			bash('shopify app deploy'),
			bash('shopify app release --config prod'),
			bash('shopify app deploy --config=shopify.app.toml'),
			bash('shopify app config push --config prod'),
			bash('shopify app config push'),
			bash('shopify theme publish'),
			bash('shopify theme delete -t 1'),
			bash('shopify theme push'),
			bash('shopify theme push -u --publish'),
			bash('shopify theme push -d --live'),
			bash('shopify app deploy --config dev --config prod'),
		],
		passes: [
			bash('shopify app release --config dev'),
			bash('shopify app deploy -c dev'),
			bash('shopify app deploy --config shopify.app.dev.toml'),
			bash('shopify app config push --config dev'),
			bash('shopify theme push --development'),
			bash('shopify theme push -u'),
			bash('shopify app info'),
		],
	},
	'Prod make target': {
		asks: [
			bash('make deploy-prod'),
			bash('make prod-deploy'),
			bash('make deploy-prod ENV=prod'),
			bash('make -C api migrate-prod'),
			bash('make -C cat-hotel/prod apply', '/home/user/terraform'),
			bash('make apply', TF_PROD),
			bash('make -C ~/terraform/cat-hotel/prod apply'),
			bash('make deploy ENV=prod'),
			bash('ENV=prod make release'),
			bash('export ENV=production; make apply'),
		],
		passes: [
			bash('make deploy-dev'),
			bash('make verify'),
			bash('make check-bindings ENV=prod'),
			bash('make plan-prod'),
			bash('make -C cat-hotel/dev apply', '/home/user/terraform'),
			bash('make -f deploy.mk check ENV=prod'),
			bash('make deploy ENV=dev'),
		],
	},
	'Deploy run': {
		asks: [
			bash('gh workflow run deploy.yml'),
			bash('gh workflow run deploy -f ref=main'),
			bash('gh workflow run apply-prod.yml -R catati/terraform'),
			bash('gh workflow run deploy-prod.yml'),
			bash('gh workflow run "$WORKFLOW"'),
			bash('gh run rerun 1'),
			bash('gh api -X POST repos/catati/terraform/actions/workflows/deploy.yml/dispatches'),
			bash('gh api -X POST repos/catati/terraform/actions/workflows/apply-prod.yml/dispatches'),
			bash('gh api repos/catati/terraform/actions/workflows/12345678/dispatches -f ref=main'),
			bash('gh api -X POST repos/catati/cat-hotel/actions/runs/1/pending_deployments'),
			bash('curl -X POST https://api.github.com/repos/catati/cat-hotel/actions/runs/1/rerun'),
			bash('gh workflow -R catati/cat-hotel run deploy.yml'),
			bash('gh workflow run --ref main deploy.yml'),
			trigger({ method: 'run_workflow', workflow_id: 'deploy.yml', ref: 'main' }),
			trigger({ method: 'run_workflow', workflow_id: 'apply-prod.yml', ref: 'main' }),
			trigger({ method: 'run_workflow', workflow_id: '123456', ref: 'main' }),
			trigger({ method: 'rerun_workflow_run', run_id: 1 }),
			trigger({ method: 'rerun_failed_jobs', run_id: 1 }),
		],
		passes: [
			bash('gh workflow run ci.yml'),
			bash('gh run list'),
			bash('gh run view 1'),
			bash('gh api repos/catati/terraform/actions/workflows/ci.yml/dispatches'),
			bash('gh workflow -R catati/deploy run ci.yml'),
			trigger({ method: 'run_workflow', workflow_id: 'ci.yml', ref: 'main' }),
			trigger({ method: 'cancel_workflow_run', run_id: 1 }),
			trigger({ method: 'delete_workflow_run_logs', run_id: 1 }),
		],
	},
	'Cloudflare connector write': {
		asks: [
			cloudflare(PROD, d1Query('UPDATE bookings SET status = 1')),
			cloudflare(PROD, d1Query('SELECT 1; DROP TABLE bookings')),
			cloudflare(undefined, request('PUT', '/accounts/x/workers/scripts/api')),
			cloudflare(PROD, `async () => cloudflare.request({ method: m, path: '/accounts/x/workers' })`),
			cloudflare(DEV, request('DELETE', `/accounts/${PROD}/workers/scripts/api`)),
			cloudflare(DEV, request('DELETE', '/zones/abc/dns_records/1')),
			cloudflare(PROD, request('POST', '/accounts/x/d1/database/y/query', ', body: { sql: q }')),
			cloudflare(PROD, request('POST', D1_QUERY, ", body: { sql: 'SELECT 1', sql: 'DELETE FROM b' }")),
		],
		passes: [
			cloudflare(DEV, request('POST', `/accounts/${DEV}/workers/scripts/api`)),
			cloudflare(DEV, request('GET', '/zones')),
			cloudflare(PROD, request('GET', `/accounts/${PROD}/workers/scripts`)),
			cloudflare(PROD, `async () => cloudflare.request({ "method": "GET", path: '/accounts' })`),
			cloudflare(PROD, d1Query("SELECT\n  plan_id,\n  date(check_in, '-1 day')\nFROM bookings\nUNION\nSELECT 1")),
			cloudflare(PROD, request('POST', '/accounts/x/d1/database/y/raw', ", body: { sql: 'SELECT 1' }")),
		],
	},
	'Shopify connector write': {
		asks: ['graphql_mutation', 'update-product', 'set-inventory', 'theme_publish'].map(shopifyTool),
		passes: [
			shopifyTool('get-shop-info'),
			shopifyTool('graphql_query'),
			shopifyTool('search_products'),
			shopifyTool('list-orders'),
			shopifyTool('show-collective-products'),
		],
	},
	'Shell structure': {
		asks: [
			bash("# Shien's ask: deploy the api\nnpx wrangler deploy --env prod"),
			bash("# don't skip the migration\npnpm --dir api exec wrangler d1 migrations apply DB --remote"),
			bash("# it's the prod root\nterraform -chdir=cat-hotel/prod apply"),
			bash("npx wrangler deploy --env dev # don't touch prod yet\nnpx wrangler deploy --env prod"),
			bash("# Release the app (Shien's go)\nshopify app release --config prod"),
			bash("# Shien's ask\nmake deploy-prod"),
			bash("cat <<EOF > out.txt\nit's done\nEOF\ngh workflow run deploy.yml"),
			bash(`${commitBody("fix: don't ask\n\n1) item")} && npx wrangler deploy --env prod`),
			bash('(npx wrangler deploy --env prod)'),
			bash('case $e in prod) wrangler deploy;; esac'),
			bash('if [ -d dist ]; then npx wrangler deploy --env prod; fi'),
			bash('if x; then :; elif y; then wrangler deploy; else :; fi'),
			bash('{ wrangler deploy --env prod; }'),
			bash('! wrangler deploy'),
			bash('until false; do wrangler deploy; done'),
			bash('while true; do terraform -chdir=cat-hotel/prod apply; done'),
			bash('function ship { wrangler deploy --env prod; }; ship'),
			bash('ship() { wrangler deploy; }'),
			bash('echo $(wrangler deploy)'),
			bash('echo "`wrangler deploy --env=prod`"'),
			bash('diff <(wrangler deploy) x'),
			bash('bash -c "wrangler deploy --env prod"'),
			bash('zsh -c "wrangler deploy"'),
			bash('eval "wrangler deploy"'),
			bash("echo 'wrangler deploy' | bash"),
			bash('bash <<< "wrangler deploy"'),
			bash("bash <<'EOF'\nwrangler deploy --env prod\nEOF"),
			bash('sh <<-EOF\n\twrangler deploy\n\tEOF'),
			bash('cat <<EOF\n$(wrangler deploy)\nEOF'),
			bash('$(which wrangler) deploy'),
			bash(`python3 -c "import os; os.system('wrangler deploy')"`),
			bash('echo "unclosed && wrangler deploy'),
		],
		passes: [
			bash(commitBody('fix(plugin): read shell words\n\nwrangler deploy --env prod now asks inside if blocks.')),
			bash(`gh pr create --title x --body "$(cat <<'EOF'\n## Test plan\nterraform -chdir=cat-hotel/prod apply\nEOF\n)"`),
			bash("cat > notes.md <<'EOF'\nTo ship: wrangler deploy --env prod\nwrangler deploy --env prod\nEOF"),
			bash("cat > docs/run.md <<'EOF'\nnpx wrangler deploy\nEOF"),
			bash("bash <<'EOF'\nwrangler deploy --env dev\nEOF"),
			bash('if [ -d dist ]; then npx wrangler deploy --env dev; fi'),
			bash('# wrangler deploy --env prod\necho done'),
			bash('echo hi # wrangler deploy'),
			bash('npm test # then; wrangler deploy --env prod'),
			bash('zsh -c "wrangler tail --env prod"'),
			bash('bash scripts/check.sh'),
			bash('echo "unclosed'),
			bash('"$EDITOR" notes.md'),
			bash('git -c push.negotiate=true push'),
			bash('git commit -m "docs: wrangler deploy --env prod"'),
			bash('grep -r "wrangler deploy" .'),
		],
	},
	'Runners and wrappers': {
		asks: [
			bash('sudo -E npx wrangler deploy'),
			bash('cd api && pnpm --dir api exec wrangler deploy -e prod'),
			bash('timeout 60 nice -n 5 ./node_modules/.bin/wrangler versions upload'),
			bash('npx wrangler@4.40.0 deploy'),
			bash('pnpm dlx wrangler@4.20.0 deploy --env prod'),
			bash('npm exec -- wrangler deploy --env prod'),
			bash('pnpm wrangler deploy'),
			bash('pnpm -w wrangler deploy'),
			bash('yarn workspace api wrangler deploy'),
			bash('yarn workspace api run wrangler deploy'),
			bash('yarn workspace api dlx wrangler deploy'),
			bash('yarn -w workspace api dlx wrangler deploy'),
			bash('bun run wrangler deploy'),
			bash('npx @shopify/cli app deploy'),
			bash('npx -p ./tools wrangler deploy'),
			bash("npx -c 'wrangler deploy --env prod'"),
			bash("npm exec -c 'wrangler deploy'"),
			bash("pnpm exec -c 'wrangler deploy'"),
			...['npx --prefix', 'npx --dir', 'bunx -C', 'npm -C', 'npm --dir', 'npm --filter'].map((runner) =>
				bash(`${runner} api ${runner.startsWith('npm') ? 'exec ' : ''}wrangler deploy`),
			),
			...['yarn --dir', 'yarn -C', 'yarn --filter', 'yarn -w', 'pnpm -w', 'pnpm --prefix'].map((runner) =>
				bash(`${runner} api exec wrangler deploy`),
			),
			...['bun -C', 'bun --dir', 'bun -w'].map((runner) => bash(`${runner} api x wrangler deploy`)),
			bash('npm --loglevel silent exec wrangler deploy'),
			bash('npm --unknown silent exec wrangler deploy'),
			bash('sudo --unknown wrangler deploy --env dev'),
			bash('exec -a deploy wrangler deploy'),
			bash('stdbuf -oL wrangler deploy --env prod'),
			bash('timeout -k 5 60 wrangler deploy --env prod'),
			bash('timeout --signal=KILL 60 wrangler deploy'),
			bash('xargs -n 1 wrangler deploy'),
			bash('xargs -I{} npx wrangler deploy --name {}'),
			bash('echo deploy | xargs npx wrangler'),
			bash('echo apply | xargs terraform', TF_PROD),
			bash(`declare -x CLOUDFLARE_ACCOUNT_ID=${PROD}; wrangler deploy --env dev`),
			bash(`typeset -x CLOUDFLARE_ACCOUNT_ID=${PROD}; wrangler deploy --env dev`),
		],
		passes: [
			bash('npx wrangler@4 deploy --env dev'),
			bash('pnpm install'),
			bash('pnpm deploy out'),
			bash('pnpm --filter api test'),
			bash('pnpm -C api run build'),
			bash('pnpm add -D wrangler@4'),
			bash('npx tsc -p .'),
			bash('npm --unknown silent install'),
			bash('yarn test'),
			bash('npm run deploy -- --env prod'),
			bash('xargs grep wrangler'),
		],
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

test('an unread shape names why it asks', () => {
	const piped = decide(...bash("echo 'wrangler deploy' | bash")).reason;
	assert.match(piped, /bash reads commands from its input, and it names wrangler/);
	assert.match(decide(...bash('npm --unknown x exec wrangler deploy')).reason, /does not know the flag --unknown/);
});

test('a GET of pending_deployments asks, because the spec names the path for gh and curl', () => {
	assert.equal(decide(...bash('gh api repos/catati/cat-hotel/actions/runs/1/pending_deployments'))?.decision, 'ask');
});

const trunkProdWrites = [
	'pnpm --dir api exec wrangler deploy --env prod',
	'npx wrangler d1 migrations apply DB -e prod --remote',
	'npx wrangler secret put KEY --env=prod',
	'wrangler deploy --env="prod"',
	'CLOUDFLARE_ENV=prod wrangler deploy',
	'pnpm wrangler deploy --env prod',
	'pnpm --dir admin exec -- wrangler deploy',
	'npx -y wrangler@4 deploy',
	'bunx wrangler deploy',
	'corepack pnpm@10.30.3 wrangler deploy',
	'../node_modules/.bin/wrangler deploy --env prod',
	'cd admin && npx wrangler deploy',
	'cd admin\nwrangler deploy',
	'cd admin && \\\n  wrangler deploy',
	'wrangler deploy --env dev && cd ../landing && wrangler deploy',
	'npx wrangler versions upload --config wrangler.jsonc',
	'wrangler secret bulk secrets.json',
	'wrangler deploy --env ""',
	'bash -c "wrangler deploy"',
	'time wrangler deploy',
	"npx wrangler d1 execute DB --remote --env prod --command 'DELETE FROM bookings'",
	'shopify app deploy --config prod',
	'shopify app deploy -c prod',
	'shopify app deploy --config shopify.app.prod.toml',
	'shopify app deploy',
	'pnpm shopify app release --config=prod',
	'for app in admin app landing; do pnpm --dir $app exec wrangler deploy; done',
	'if [ -d dist ]; then npx wrangler deploy --env prod; fi',
	'{ wrangler deploy --env prod; }',
	'npx @shopify/cli app deploy --config prod',
	'wrangler deploy -e=prod',
	'env -u FOO wrangler deploy',
	'sudo -E wrangler deploy',
	'timeout -s KILL 60 wrangler deploy',
	'wrangler deploy --message "status page fix"',
	'wrangler deploy --env prod --message "get rid of banner"',
	'wrangler versions upload --tag view --env prod',
	'wrangler secret put list --env prod',
	'wrangler deploy --env prod --local',
	'wrangler deploy --env production',
	"wrangler d1 execute DB --env prod --remote --command 'WITH x AS (SELECT 1) DELETE FROM bookings'",
	"wrangler d1 execute DB --env prod --remote --command 'select 1' --file drop.sql",
];

const trunkPasses = [
	'npx wrangler deploy --env dev',
	'pnpm --dir api exec wrangler versions upload --dry-run --env prod',
	'npx wrangler versions upload --dry-run --config wrangler.jsonc --env dev',
	'npx wrangler deployments list --env prod',
	'wrangler tail --env prod',
	'pnpm exec wrangler dev --env dev',
	'wrangler types --env dev',
	'wrangler d1 migrations apply DB --local',
	"npx wrangler d1 execute DB --remote --env prod --command 'SELECT count(*) FROM bookings'",
	'wrangler d1 export DB --remote --env prod --output x.sql',
	'shopify app deploy --config dev',
	'shopify app config validate --config prod',
	'git commit -m "wrangler deploy --env prod"',
	'grep wrangler deploy docs',
	'make deploy-dev',
	'pnpm --dir api report:overbooked-nights prod',
	'pnpm run deploy:dev',
	'pnpm --dir api deploy:dev',
	'wrangler d1 migrations list DB --env prod --remote',
	'wrangler --env prod deployments list',
	'wrangler kv namespace list',
	'wrangler r2 object get bucket/key --env prod',
	'wrangler --version',
	'wrangler -c wrangler.jsonc dev',
	'for app in admin app landing; do pnpm --dir $app exec wrangler deploy --env dev; done',
	'wrangler deploy --help',
	'CLOUDFLARE_ENV=dev wrangler deploy',
];

test("trunk's prod writes ask", () => {
	for (const command of trunkProdWrites) assert.equal(decide(...bash(command))?.decision, 'ask', command);
});

test("trunk's dev writes and prod reads pass", () => {
	for (const command of trunkPasses) assert.equal(decide(...bash(command)), null, command);
});

test('the guard passes the dropped asks, which are not prod writes', () => {
	const dropped = ['git -c x=y push', 'gh secret list', 'gh pr merge 5 --squash', 'gh api repos/catati/dev/git/refs'];
	for (const command of dropped) assert.equal(decide(...bash(command)), null, command);
	for (const tool of ['Edit', 'Write', 'mcp__github__merge_pull_request', 'mcp__github__enable_pr_auto_merge'])
		assert.equal(decide(tool, { file_path: '/repo/.claude/settings.json', pullNumber: 1 }, '/repo'), null, tool);
});

test('JUDGED_TOOLS names each tool or prefix that decide judges', () => {
	const expected = ['Bash', 'mcp__cloudflare__execute', 'mcp__Shopify__', 'mcp__github__actions_run_trigger'];
	assert.deepEqual(JUDGED_TOOLS, expected);
});

function runHook(stdin) {
	const result = spawnSync(process.execPath, [hook], { input: stdin, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stderr, '');
	return result.stdout;
}

const bashInput = (command, cwd) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd });

test('the hook prints one ask line for a prod write and nothing for a dev write', () => {
	const asked = runHook(bashInput('npx wrangler deploy --env prod'));
	assert.equal(asked.trim().split('\n').length, 1);
	const output = JSON.parse(asked).hookSpecificOutput;
	assert.equal(output.hookEventName, 'PreToolUse');
	assert.equal(output.permissionDecision, 'ask');
	assert.match(output.permissionDecisionReason, /--env prod/);
	assert.equal(runHook(bashInput('npx wrangler deploy --env dev')), '');
});

test('the hook reads the cwd from its input', () => {
	const output = JSON.parse(runHook(bashInput('terraform apply', '/w/cat-hotel/prod'))).hookSpecificOutput;
	assert.equal(output.permissionDecision, 'ask');
	assert.equal(runHook(bashInput('terraform apply', '/w/cat-hotel/dev')), '');
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
		const reason = output.permissionDecisionReason;
		assert.ok(reason.startsWith('The prod guard could not read this call ('), reason);
	}
});

test('the hook prints nothing for a tool it does not judge', () => {
	assert.equal(runHook(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/x' } })), '');
});
