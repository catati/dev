import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  decide,
  OVERBOOKED_NIGHTS_SQL_SHA256,
} from '../plugins/catati/hooks/guard-prod.mjs'

const sh = (command) => decide('Bash', { command })?.decision ?? null
const DEV = '028a7270e2ad8a208cd6b01800f363f3'
const PROD = '69f8dc2296dd15d29e03693d6492f163'
const cf = (account_id, code) =>
  decide('mcp__cloudflare__execute', { account_id, code })?.decision ?? null
const call = (method, path) =>
  `async () => cloudflare.request({ method: '${method}', path: '${path}' })`

test('Bash: production writes ask for approval, dev and production reads pass', () => {
  assert.equal(sh('firebase deploy --project prod --only functions'), 'ask')
  assert.equal(
    sh('gcloud functions delete x --project catati-cat-hotel'),
    'ask'
  )
  assert.equal(sh('firebase deploy --project dev --only functions'), null)
  assert.equal(sh('gcloud auth list'), null)
  assert.equal(sh('firebase functions:list --project prod'), null)
  assert.equal(
    sh('gcloud run services describe x --project catati-cat-hotel'),
    null
  )
  assert.equal(sh('grep prod CLAUDE.md'), null)
})

test('Bash: a make segment that deploys to prod asks, a read that names one passes', () => {
  for (const command of [
    'make deploy-prod',
    'make deploy ENV=prod',
    'make -C api deploy-prod',
    'cd api && make deploy-prod',
    'bash -c "make deploy-prod"',
  ])
    assert.equal(sh(command), 'ask', command)
  for (const command of [
    'grep -n deploy-prod Makefile',
    'grep -n "make deploy-prod" docs/agents/github-ci-cd.md',
    'cat Makefile | grep "make deploy-prod"',
    "rg 'make deploy ENV=prod' docs",
    'git commit -m "docs: say make deploy-prod asks"',
  ])
    assert.equal(sh(command), null, command)
})

const prodWriteCommands = [
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
]

const allowedCommands = [
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
  'wrangler deploy --help',
  'CLOUDFLARE_ENV=dev wrangler deploy',
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
]

test('Bash: Wrangler and Shopify writes to prod, or with no env, ask for approval', () => {
  for (const command of prodWriteCommands)
    assert.equal(sh(command), 'ask', command)
})

test('Bash: dev targets, dry runs, local writes and prod reads pass', () => {
  for (const command of allowedCommands)
    assert.equal(sh(command), null, command)
})

const SHIEN_ASKED =
  /Approve only if Shien asked for this specific prod action\./
const reason = (toolName, toolInput) =>
  decide(toolName, toolInput)?.reason ?? ''

test('every prod-write prompt says Shien must ask, the unknown-account prompt does not', () => {
  assert.match(reason('Bash', { command: 'make deploy-prod' }), SHIEN_ASKED)
  assert.match(
    reason('Bash', { command: 'npx wrangler deploy --env prod' }),
    SHIEN_ASKED
  )
  assert.match(
    reason('Bash', { command: 'shopify app deploy --config prod' }),
    SHIEN_ASKED
  )
  assert.match(
    reason('Bash', { command: 'firebase deploy --project prod' }),
    SHIEN_ASKED
  )
  assert.match(
    reason('mcp__cloudflare__execute', {
      account_id: PROD,
      code: call('PUT', '/workers/scripts/cat-hotel-admin'),
    }),
    SHIEN_ASKED
  )
  assert.match(
    reason('mcp__cloudflare__execute', {
      account_id: DEV,
      code: call('PUT', '/zones/abc/dns_records'),
    }),
    SHIEN_ASKED
  )
  assert.match(reason('mcp__Shopify__update-product', {}), SHIEN_ASKED)
  assert.doesNotMatch(
    reason('mcp__cloudflare__execute', {
      code: call('PUT', '/d1/database/cat-hotel'),
    }),
    SHIEN_ASKED
  )
})

test('Cloudflare: writes are judged by account, not resource name', () => {
  assert.equal(
    cf(DEV, call('POST', `/accounts/${DEV}/d1/database/cat-hotel/query`)),
    null
  )
  assert.equal(
    cf(DEV, call('PUT', `/accounts/${DEV}/workers/scripts/cat-hotel-admin`)),
    null
  )
  assert.equal(cf(PROD, call('PUT', '/workers/scripts/cat-hotel-admin')), 'ask')
  assert.match(
    decide('mcp__cloudflare__execute', {
      account_id: PROD,
      code: call('PUT', '/workers/scripts/cat-hotel-admin'),
    }).reason,
    /production account Catati/
  )
  assert.equal(
    cf(DEV, call('DELETE', `/accounts/${PROD}/workers/scripts/cat-hotel-api`)),
    'ask'
  )
  assert.equal(cf(undefined, call('PUT', '/d1/database/cat-hotel')), 'ask')
  assert.equal(cf('someone-else', call('PUT', '/d1/database/9f1c')), 'ask')
})

const REVIEWED_SQL = 'SELECT plan_id FROM bookings'
const reviewedPin = createHash('sha256').update(REVIEWED_SQL).digest('hex')
const prodReportCode = (sql) =>
  `async () => (await cloudflare.request({ method: 'POST', path: '/accounts/${PROD}/d1/database/542f100a-e7ed-46d3-9eb4-9aaa9b7606a7/query', body: { sql: ${JSON.stringify(sql)} } })).result[0].results`
const reportDecision = (account_id, code, reportSqlSha256 = reviewedPin) =>
  decide(
    'mcp__cloudflare__execute',
    { account_id, code },
    { reportSqlSha256 }
  )?.decision ?? null

test('Cloudflare: the pinned overbooked nights hash is a sha256', () => {
  assert.match(OVERBOOKED_NIGHTS_SQL_SHA256, /^[0-9a-f]{64}$/)
})

test('Cloudflare: the hook allows exactly the prod report call whose SQL has the pinned hash', () => {
  const report = prodReportCode(REVIEWED_SQL)
  assert.equal(reportDecision(PROD, report), null)
  assert.equal(reportDecision(PROD, report, OVERBOOKED_NIGHTS_SQL_SHA256), 'ask')
  for (const code of [
    `async () => { await (${report})(); return cloudflare.request({ method: 'DELETE', path: '/accounts/${PROD}/workers/scripts/cat-hotel-api' }) }`,
    `${report} && cloudflare.request({ method: 'DELETE', path: '/accounts/${PROD}/workers/scripts/cat-hotel-api' })`,
    `${report} `,
    ` ${report}`,
    report.replace('542f100a', '542f100b'),
    report.replace(JSON.stringify(REVIEWED_SQL), `${JSON.stringify(REVIEWED_SQL)} + ''`),
    report.replace(JSON.stringify(REVIEWED_SQL), "'SELECT plan_id FROM bookings'"),
    report.replace(JSON.stringify(REVIEWED_SQL), ` ${JSON.stringify(REVIEWED_SQL)}`),
    report.replace(JSON.stringify(REVIEWED_SQL), '"\\u0053ELECT plan_id FROM bookings"'),
  ])
    assert.equal(reportDecision(PROD, code), 'ask', code)
  assert.equal(reportDecision(undefined, report), 'ask')
  assert.equal(reportDecision(DEV, report), 'ask')
  assert.equal(
    reportDecision(PROD, [
      `await cloudflare.request({ method: 'DELETE', path: '/accounts/${PROD}/workers/scripts/cat-hotel-api' })`,
    ]),
    'ask'
  )
})

const editedReportSql = {
  'AS window, session': 'SELECT s.token FROM bookings AS window, session s',
  'then DELETE': `${REVIEWED_SQL}; DELETE FROM bookings`,
  'newline DELETE': `${REVIEWED_SQL}\nDELETE FROM bookings`,
  BOM: `\uFEFF${REVIEWED_SQL}`,
  'line comment': `${REVIEWED_SQL} -- note`,
  'block comment': `/* note */ ${REVIEWED_SQL}`,
  pragma: 'PRAGMA table_list',
  sqlite_master: 'SELECT * FROM sqlite_master',
  'trailing space': `${REVIEWED_SQL} `,
}

test('Cloudflare: the hook asks for the prod report call built from any SQL but the reviewed one', () => {
  for (const [name, sql] of Object.entries(editedReportSql))
    assert.equal(reportDecision(PROD, prodReportCode(sql)), 'ask', name)
})

const hook = fileURLToPath(
  new URL('../plugins/catati/hooks/pre-tool-use.mjs', import.meta.url)
)

function hookProcessDecision(tool_name, tool_input, cwd, entry = hook) {
  const result = spawnSync(process.execPath, [entry], {
    input: JSON.stringify({ tool_name, tool_input, cwd }),
    encoding: 'utf8',
    timeout: 10_000,
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
    ? JSON.parse(result.stdout).hookSpecificOutput.permissionDecision
    : null
}

test('hook process: a prod deploy asks and a dev deploy passes, from any folder', () => {
  const folder = mkdtempSync(join(tmpdir(), 'guard-prod-'))
  for (const cwd of [folder, undefined]) {
    assert.equal(
      hookProcessDecision(
        'Bash',
        { command: 'wrangler deploy --config /nonexistent/wrangler.jsonc' },
        cwd
      ),
      'ask'
    )
    assert.equal(
      hookProcessDecision('Bash', { command: 'wrangler deploy --env dev' }, cwd),
      null
    )
  }
})

test('Cloudflare: zone writes ask for approval in either account', () => {
  assert.equal(cf(DEV, call('PUT', '/zones/abc/dns_records')), 'ask')
  assert.equal(cf(PROD, call('PATCH', '/zones/abc/settings')), 'ask')
})

test('Cloudflare: a write on Catati asks even when it names only a -dev resource', () => {
  assert.equal(
    cf(PROD, call('POST', '/d1/database/catati-cat-hotel-dev/query')),
    'ask'
  )
  assert.equal(
    cf(PROD, call('PUT', '/workers/scripts/catati-cat-hotel-api-dev')),
    'ask'
  )
  assert.equal(
    cf(
      PROD,
      "async () => { const tag = 'notes-dev'; return cloudflare.request({ method: 'POST', path: `/accounts/${accountId}/d1/database/542f100a-e7ed-46d3-9eb4-9aaa9b7606a7/query`, body: { sql: 'DELETE FROM bookings' } }) }"
    ),
    'ask'
  )
})

test('Cloudflare: reads pass in any account', () => {
  assert.equal(cf(PROD, call('GET', '/workers/scripts/cat-hotel-admin')), null)
  assert.equal(cf(undefined, call('GET', '/zones')), null)
  assert.equal(cf(DEV, call('GET', '/d1/database')), null)
})

test('Shopify connector: writes ask for approval, reads pass', () => {
  assert.equal(decide('mcp__Shopify__update-product', {})?.decision, 'ask')
  assert.equal(decide('mcp__Shopify__graphql_mutation', {})?.decision, 'ask')
  assert.equal(decide('mcp__Shopify__get-order', {}), null)
  assert.equal(decide('mcp__Shopify__graphql_query', {}), null)
})

const HEAD = 'a'.repeat(40)
const OLD = 'b'.repeat(40)
const NEAR_HEAD = `${'a'.repeat(39)}b`
const PIN = `--match-head-commit ${HEAD}`
const pass = (sha) => `VERIFIER PASS ${sha}\n\nAll checks green.`
const fakeGitHub = (pulls, origins = {}) => {
  const routes = {}
  for (const [key, pull] of Object.entries(pulls)) {
    const [repo, number] = key.toLowerCase().split('#')
    const { headSha = HEAD, comments = [], files = [] } = pull
    routes[`repos/${repo}/pulls/${number}`] = { head: { sha: headSha } }
    routes[`repos/${repo}/issues/${number}/comments`] = comments.map(
      (body) => ({ body })
    )
    routes[`repos/${repo}/pulls/${number}/files`] = files.map((file) =>
      typeof file === 'string' ? { filename: file } : file
    )
  }
  const reads = []
  return {
    reads,
    api(path) {
      reads.push(path)
      const [route, query] = path.toLowerCase().split('?')
      const body = routes[route]
      if (!body) throw new Error('gh: Not Found (HTTP 404)')
      if (!Array.isArray(body)) return body
      const params = new URLSearchParams(query)
      const perPage = Number(params.get('per_page') ?? 30)
      const page = Number(params.get('page') ?? 1)
      return body.slice((page - 1) * perPage, page * perPage)
    },
    originRepo(dir) {
      if (!(dir in origins)) throw new Error('not a git repository')
      return origins[dir]
    },
  }
}
const run = (github, toolName, toolInput, cwd = '/work', env = {}) =>
  decide(toolName, toolInput, { cwd, github, env })
const merge = (...args) => run(...args)?.decision ?? null
const mcpMerge = (github, owner, repo, pullNumber, expectedHeadSha = HEAD) =>
  merge(github, 'mcp__github__merge_pull_request', {
    owner,
    repo,
    pullNumber,
    expectedHeadSha,
  })
const shMerge = (github, command, cwd = '/work', env = {}) =>
  merge(github, 'Bash', { command }, cwd, env)
const shReason = (github, command, cwd = '/work') =>
  run(github, 'Bash', { command }, cwd)?.reason ?? ''

test('merge: refused without a verifier PASS on the first line of a comment for the head commit', () => {
  const github = fakeGitHub({
    'catati/cat-hotel#1': { comments: [] },
    'catati/cat-hotel#2': { comments: [pass(OLD)] },
    'catati/cat-hotel#3': { comments: ['Looks good', pass(HEAD)] },
    'catati/cat-hotel#4': {
      comments: [`Verifier said VERIFIER PASS ${HEAD}`, `PASS ${HEAD}`],
    },
    'catati/cat-hotel#5': { comments: [`Report\nVERIFIER PASS ${HEAD}`] },
    'catati/cat-hotel#6': { comments: [pass(NEAR_HEAD)] },
  })
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 1), 'deny')
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 2), 'deny')
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 3), null)
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 4), 'deny')
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 5), 'deny')
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 6), 'deny')
  assert.match(
    run(github, 'mcp__github__merge_pull_request', {
      owner: 'catati',
      repo: 'cat-hotel',
      pullNumber: 2,
    }).reason,
    new RegExp(`VERIFIER PASS ${HEAD}`)
  )
})

test('merge: a verified merge must pin the verified head commit', () => {
  const github = fakeGitHub(
    { 'catati/cat-hotel#3': { comments: [pass(HEAD)] } },
    { '/work': 'catati/cat-hotel' }
  )
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 3, null), 'deny')
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 3, OLD), 'deny')
  assert.equal(
    mcpMerge(github, 'catati', 'cat-hotel', 3, HEAD.toUpperCase()),
    null
  )
  assert.match(
    run(github, 'mcp__github__merge_pull_request', {
      owner: 'catati',
      repo: 'cat-hotel',
      pullNumber: 3,
    }).reason,
    new RegExp(`expectedHeadSha "${HEAD}"`)
  )
  const commands = {
    'gh pr merge 3 --squash': `--match-head-commit ${HEAD}`,
    [`gh pr merge 3 --match-head-commit ${OLD}`]: `--match-head-commit ${HEAD}`,
    'gh api -X PUT repos/catati/cat-hotel/pulls/3/merge': `-f sha=${HEAD}`,
    [`gh api -X PUT repos/catati/cat-hotel/pulls/3/merge -f sha=${OLD}`]: `-f sha=${HEAD}`,
  }
  for (const [command, fix] of Object.entries(commands)) {
    assert.equal(shMerge(github, command), 'deny', command)
    assert.ok(shReason(github, command).includes(fix), command)
  }
  for (const command of [
    `gh pr merge 3 ${PIN}`,
    `gh pr merge 3 --match-head-commit=${HEAD}`,
    `gh api -X PUT repos/catati/cat-hotel/pulls/3/merge -f sha=${HEAD}`,
    `gh api -X PUT repos/catati/cat-hotel/pulls/3/merge -F sha=${HEAD} -f merge_method=squash`,
    `gh api -X PUT repos/catati/cat-hotel/pulls/3/merge --raw-field=sha=${HEAD}`,
  ])
    assert.equal(shMerge(github, command), null, command)
})

test('merge: a verified catati/terraform PR asks when it changes a workflow, passes for a prod root or docs', () => {
  const verified = (files) => ({ comments: [pass(HEAD)], files })
  const github = fakeGitHub({
    'catati/terraform#1': verified(['cat-hotel/prod/main.tf']),
    'catati/terraform#2': verified(['.github/workflows/apply.yml']),
    'catati/terraform#3': verified(['README.md', 'docs/tokens.md']),
    'catati/terraform#4': verified(['cat-hotel/dev/main.tf']),
    'catati/cat-hotel#5': verified(['.github/workflows/ci.yml']),
    'catati/terraform#6': { files: ['README.md'] },
    'catati/terraform#7': verified([
      {
        filename: 'docs/old-deploy.yml',
        previous_filename: '.github/workflows/deploy.yml',
      },
    ]),
  })
  assert.equal(mcpMerge(github, 'catati', 'terraform', 1), null)
  assert.equal(mcpMerge(github, 'catati', 'terraform', 2), 'ask')
  assert.equal(mcpMerge(github, 'Catati', 'Terraform', 2), 'ask')
  assert.match(
    run(github, 'mcp__github__merge_pull_request', {
      owner: 'Catati',
      repo: 'Terraform',
      pullNumber: 2,
      expectedHeadSha: HEAD,
    }).reason,
    /apply production/
  )
  assert.equal(mcpMerge(github, 'catati', 'terraform', 3), null)
  assert.equal(mcpMerge(github, 'catati', 'terraform', 4), null)
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 5), null)
  assert.equal(mcpMerge(github, 'catati', 'terraform', 6), 'deny')
  assert.equal(mcpMerge(github, 'catati', 'terraform', 7), 'ask')
})

test('merge: reads every page of comments and files', () => {
  const filler = (n, make) => Array.from({ length: n }, (_, i) => make(i))
  const github = fakeGitHub({
    'catati/cat-hotel#1': {
      comments: [...filler(150, (i) => `comment ${i}`), pass(HEAD)],
    },
    'catati/terraform#2': {
      comments: [pass(HEAD)],
      files: [...filler(250, (i) => `docs/${i}.md`), '.github/workflows/deploy.yml'],
    },
  })
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 1), null)
  assert.equal(mcpMerge(github, 'catati', 'terraform', 2), 'ask')
})

test('merge: gh pr merge and the REST merge call resolve the repo from the flag, a URL, cd or the cwd', () => {
  const github = fakeGitHub(
    {
      'catati/cat-hotel#7': {},
      'catati/terraform#7': { comments: [pass(HEAD)] },
    },
    { '/work': 'catati/cat-hotel', '/home/user/terraform': 'catati/terraform' }
  )
  const commands = {
    [`gh pr merge 7 --squash ${PIN}`]: 'deny',
    [`gh pr merge 7 --squash -R catati/terraform ${PIN}`]: null,
    [`gh pr merge --repo github.com/catati/terraform -t "x 7" 7 ${PIN}`]: null,
    [`gh pr -R catati/terraform merge 7 ${PIN}`]: null,
    [`gh pr --repo catati/terraform merge 7 ${PIN}`]: null,
    [`gh pr --repo=catati/terraform merge 7 ${PIN}`]: null,
    [`gh pr merge https://github.com/catati/terraform/pull/7 --squash ${PIN}`]:
      null,
    [`cd /home/user/terraform && gh pr merge 7 --squash ${PIN}`]: null,
    [`cd ../home/user/terraform && gh pr merge 7 ${PIN}`]: null,
    [`gh api -X PUT repos/catati/cat-hotel/pulls/7/merge -f sha=${HEAD}`]:
      'deny',
    [`gh api --method=PUT /repos/catati/terraform/pulls/7/merge -f sha=${HEAD}`]:
      null,
    [`gh api -X PUT 'repos/catati/cat-hotel/pulls/7/merge?merge_method=squash' -f sha=${HEAD}`]:
      'deny',
    [`gh api -X PUT https://api.github.com/repos/catati/cat-hotel/pulls/7/merge -f sha=${HEAD}`]:
      'deny',
    [`gh api -X PUT 'https://api.github.com/repos/catati/terraform/pulls/7/merge?merge_method=squash' -f sha=${HEAD}`]:
      null,
    [`cd /home/user/terraform && gh api -X PUT repos/{owner}/{repo}/pulls/7/merge -f sha=${HEAD}`]:
      null,
    [`bash -c "gh pr merge 7 ${PIN}"`]: 'deny',
  }
  for (const [command, expected] of Object.entries(commands))
    assert.equal(shMerge(github, command), expected, command)
  assert.equal(
    shMerge(
      github,
      `gh pr -R catati/cat-hotel merge 7 ${PIN}`,
      '/home/user/terraform'
    ),
    'deny'
  )
})

test('merge: asks when gh may read another repo than the guard can see', () => {
  const github = fakeGitHub(
    {
      'catati/cat-hotel#7': {},
      'catati/terraform#7': { comments: [pass(HEAD)] },
    },
    { '/work': 'catati/cat-hotel', '/home/user/terraform': 'catati/terraform' }
  )
  const terraform = '/home/user/terraform'
  for (const command of [
    `GH_REPO=catati/cat-hotel gh pr merge 7 ${PIN}`,
    `export GH_REPO=catati/cat-hotel && gh pr merge 7 ${PIN}`,
    `GH_REPO=catati/cat-hotel gh api -X PUT repos/{owner}/{repo}/pulls/7/merge -f sha=${HEAD}`,
    `pushd /work && gh pr merge 7 ${PIN}`,
    `echo \`gh pr merge 7 ${PIN}\``,
    'echo 7 | xargs -I{} gh api -X PUT repos/catati/cat-hotel/pulls/{}/merge',
  ])
    assert.equal(shMerge(github, command, terraform), 'ask', command)
  assert.equal(
    shMerge(github, `gh pr merge 7 ${PIN}`, terraform, {
      GH_REPO: 'catati/cat-hotel',
    }),
    'ask'
  )
  for (const [command, expected] of Object.entries({
    [`GH_REPO=catati/cat-hotel gh pr merge 7 -R catati/terraform ${PIN}`]: null,
    [`pushd /work && gh pr merge 7 -R catati/cat-hotel ${PIN}`]: 'deny',
    "git commit -m 'merged `gh pr merge 7`'": null,
    'git commit -m "merged `gh pr merge 7`"': 'deny',
    'echo 7 | xargs gh pr view': null,
    'echo 7 | xargs gh pr merge --squash': 'deny',
  }))
    assert.equal(shMerge(github, command, terraform), expected, command)
})

test('merge: auto-merge is refused outright, turning it off passes', () => {
  const github = fakeGitHub({
    'catati/cat-hotel#7': { comments: [pass(HEAD)] },
  })
  for (const command of [
    `gh pr merge 7 --auto --squash ${PIN}`,
    'gh api -X PUT repos/catati/cat-hotel/pulls/7/ccr/auto_merge',
  ])
    assert.equal(shMerge(github, command), 'deny', command)
  assert.equal(
    merge(github, 'mcp__github__enable_pr_auto_merge', {
      owner: 'catati',
      repo: 'cat-hotel',
      pullNumber: 7,
    }),
    'deny'
  )
  assert.match(
    run(github, 'mcp__github__enable_pr_auto_merge', {}).reason,
    /unverified/
  )
  for (const command of [
    'gh pr merge 7 --disable-auto',
    'gh api -X DELETE repos/catati/cat-hotel/pulls/7/ccr/auto_merge',
  ])
    assert.equal(shMerge(github, command), null, command)
  assert.equal(
    merge(github, 'mcp__github__disable_pr_auto_merge', {
      owner: 'catati',
      repo: 'cat-hotel',
      pullNumber: 7,
    }),
    null
  )
  assert.deepEqual(github.reads, [])
})

test('merge: every segment counts, a deny wins over an ask and asks join', () => {
  const github = fakeGitHub(
    {
      'catati/cat-hotel#7': {},
      'catati/terraform#6': {
        comments: [pass(HEAD)],
        files: ['.github/workflows/deploy.yml'],
      },
    },
    { '/work': 'catati/cat-hotel' }
  )
  const prodMerge = `gh pr merge 6 -R catati/terraform --squash ${PIN}`
  assert.equal(
    shMerge(github, `${prodMerge} && gh pr merge 7 --squash ${PIN}`),
    'deny'
  )
  assert.equal(
    shMerge(github, `make deploy-prod && gh pr merge 7 ${PIN}`),
    'deny'
  )
  assert.equal(
    shMerge(github, `gh pr merge 7 ${PIN}; make deploy-prod`),
    'deny'
  )
  const both = shReason(github, `make deploy-prod && ${prodMerge}`)
  assert.match(both, /deploys to production/)
  assert.match(both, /catati\/terraform#6 changes \.github\/workflows/)
})

test('merge: fails closed with ask, naming the gh error, when GitHub or the PR cannot be read', () => {
  const github = fakeGitHub({}, { '/work': 'catati/cat-hotel' })
  assert.equal(mcpMerge(github, 'catati', 'cat-hotel', 9), 'ask')
  assert.match(
    run(github, 'mcp__github__merge_pull_request', {
      owner: 'catati',
      repo: 'cat-hotel',
      pullNumber: 9,
    }).reason,
    /HTTP 404/
  )
  assert.equal(shMerge(github, 'gh pr merge 9', '/nowhere'), 'ask')
  assert.equal(shMerge(github, 'gh pr merge --squash', '/work'), 'ask')
  assert.equal(shMerge(github, 'gh pr merge my-branch', '/work'), 'ask')
  assert.equal(
    merge(github, 'mcp__github__merge_pull_request', { owner: 'catati' }),
    'ask'
  )
})

test('merge: reads and non-merge gh commands never call GitHub', () => {
  const github = fakeGitHub({})
  for (const command of [
    'gh pr view 7',
    'gh pr -R catati/cat-hotel view 7',
    'gh api repos/catati/cat-hotel/pulls/7/merge',
    'gh api repos/catati/cat-hotel/pulls/7',
    'git commit -m "gh pr merge 7"',
    'grep "gh pr merge" docs/agents/github-ci-cd.md',
  ])
    assert.equal(shMerge(github, command, '/work'), null, command)
  assert.deepEqual(github.reads, [])
})

const roundTwo = () =>
  fakeGitHub(
    {
      'catati/cat-hotel#7': {},
      'catati/cat-hotel#8': { comments: [pass(HEAD)] },
      'catati/terraform#6': {
        comments: [pass(HEAD)],
        files: ['.github/workflows/deploy.yml'],
      },
      'catati/terraform#7': { comments: [pass(HEAD)] },
    },
    { '/work': 'catati/cat-hotel', '/home/user/terraform': 'catati/terraform' }
  )
const expectAll = (github, cases, cwd = '/work') => {
  for (const [command, expected] of Object.entries(cases))
    assert.equal(shMerge(github, command, cwd), expected, command)
}

test('merge: gh flags before the subcommand still reach the merge gate', () => {
  expectAll(roundTwo(), {
    [`gh -X PUT api repos/catati/cat-hotel/pulls/7/merge -f sha=${HEAD}`]:
      'deny',
    [`gh --method PUT api repos/catati/cat-hotel/pulls/7/merge -f sha=${HEAD}`]:
      'deny',
    [`gh --method=PUT api repos/catati/cat-hotel/pulls/7/merge -f sha=${HEAD}`]:
      'deny',
    [`gh -R catati/cat-hotel pr merge 7 ${PIN}`]: 'deny',
    [`gh -R catati/terraform pr merge 6 ${PIN}`]: 'ask',
    [`gh -R catati/terraform pr merge 7 ${PIN}`]: null,
    'gh -X PUT api repos/catati/cat-hotel/pulls/8/ccr/auto_merge': 'deny',
    'gh -X DELETE api repos/catati/cat-hotel/pulls/8/ccr/auto_merge': null,
  })
})

test('merge: a REST write is judged on its normalised path, and an unmatched pull or merge path asks', () => {
  const github = roundTwo()
  for (const path of [
    'repos//catati/cat-hotel/pulls/7/merge',
    'repos/catati/cat-hotel/./pulls/7/merge',
    "'repos/catati/cat-hotel/pulls/7/merge#x'",
    'repos/catati/cat-hotel/pulls/%37/merge',
    'repos/catati/cat-hotel/pulls/7/%6derge',
    'repos/catati/cat-hotel/pulls/7//merge',
    'repos/catati/cat-hotel/pulls/7/merge/.',
    'repos/catati/cat-hotel/pulls/9/../7/merge',
    'REPOS/Catati/Cat-Hotel/PULLS/7/MERGE',
    'https://api.github.com//repos/catati/cat-hotel/pulls/7/merge',
  ])
    assert.equal(
      shMerge(github, `gh api -X PUT ${path} -f sha=${HEAD}`),
      'deny',
      path
    )
  expectAll(github, {
    [`gh api -X PUT repos//catati/cat-hotel/pulls/8/merge -f sha=${HEAD}`]:
      null,
    [`gh api -f sha=${HEAD} repos/catati/cat-hotel/pulls/7/merge`]: 'deny',
    [`gh api -X POST -H 'X-HTTP-Method-Override: PUT' repos/catati/cat-hotel/pulls/7/merge -f sha=${HEAD}`]:
      'deny',
    "gh api -X GET -H 'X-HTTP-Method-Override: PUT' repos/catati/cat-hotel/pulls/7/merge":
      'deny',
    [`gh api -X PUT repos/catati/cat-hotel/pulls/8/merge --input body.json -f sha=${HEAD}`]:
      'deny',
    [`gh api -X PUT repositories/1011524349/pulls/7/merge -f sha=${HEAD}`]:
      'ask',
    [`gh api -X PUT repos/catati/cat-hotel/pulls/7/%ZZ -f sha=${HEAD}`]: 'ask',
    'gh api -X POST repos/catati/cat-hotel/pulls/7/update-branch': null,
    'gh api -X POST repos/catati/cat-hotel/pulls/7/reviews/1/events': 'ask',
    'gh api -X POST repos/catati/cat-hotel/issues/7/comments -f body=hi': null,
    'gh api repos/catati/cat-hotel/pulls/7/merge -X GET': null,
  })
})

test('merge: any --auto value gh reads as on is refused, an explicit false value is an ordinary merge', () => {
  expectAll(roundTwo(), {
    [`gh pr merge 8 --auto=true ${PIN}`]: 'deny',
    [`gh pr merge 8 --auto=1 ${PIN}`]: 'deny',
    [`gh pr merge 8 --auto=yes ${PIN}`]: 'deny',
    [`gh pr merge 8 --auto=false --auto ${PIN}`]: 'deny',
    'gh pr merge 8 --disable-auto --auto': 'deny',
    [`gh pr merge 8 --auto=false ${PIN}`]: null,
    [`gh pr merge 8 --auto=0 ${PIN}`]: null,
    [`gh pr merge 7 --disable-auto=false ${PIN}`]: 'deny',
  })
})

test('merge: two different pins or repos on one merge are refused', () => {
  expectAll(roundTwo(), {
    [`gh pr merge 8 ${PIN} --match-head-commit ${OLD}`]: 'deny',
    [`gh pr merge 8 --match-head-commit=${OLD} ${PIN}`]: 'deny',
    [`gh api -X PUT repos/catati/cat-hotel/pulls/8/merge -f sha=${HEAD} -f sha=${OLD}`]:
      'deny',
    [`gh pr merge 8 ${PIN} --match-head-commit ${HEAD.toUpperCase()}`]: null,
    [`gh pr merge 7 -R catati/terraform -R catati/cat-hotel ${PIN}`]: 'deny',
  })
})

test('merge: gh behind a wrapper is judged when the guard can unwrap it, and asks when it cannot', () => {
  expectAll(roundTwo(), {
    [`exec gh pr merge 7 ${PIN}`]: 'deny',
    [`exec -a x gh pr merge 7 ${PIN}`]: 'deny',
    [`nice -n 5 gh pr merge 7 ${PIN}`]: 'deny',
    [`stdbuf -o0 gh pr merge 7 ${PIN}`]: 'deny',
    [`\\gh pr merge 7 ${PIN}`]: 'deny',
    [`bash -lc 'gh pr merge 7 ${PIN}'`]: 'deny',
    [`sh -ec 'gh pr merge 7 ${PIN}'`]: 'deny',
    [`bash -e -c 'gh pr merge 7 ${PIN}'`]: 'deny',
    [`env -S 'gh pr merge 7 ${PIN}'`]: 'deny',
    [`watch -n1 gh pr merge 7 ${PIN}`]: 'deny',
    [`watch 'gh pr merge 7 ${PIN}'`]: 'deny',
    [`echo "$(gh pr merge 7 ${PIN})"`]: 'deny',
    [`bash -lc 'gh pr merge 8 ${PIN}'`]: null,
    [`$(which gh) pr merge 8 ${PIN}`]: 'ask',
    [`G=gh; $G pr merge 8 ${PIN}`]: 'ask',
    [`find . -maxdepth 0 -exec gh pr merge 8 ${PIN} ;`]: 'ask',
    [`bash -o pipefail -c 'gh pr merge 8 ${PIN}'`]: null,
    [`bash -euo pipefail -c 'gh pr merge 7 ${PIN}'`]: 'deny',
    [`echo 'gh pr merge 8 ${PIN}' | sh`]: 'ask',
    'python3 -c "import os; os.system(\'gh pr merge 8\')"': 'deny',
    'curl -X PUT https://api.github.com/repos/catati/cat-hotel/pulls/8/merge':
      'ask',
    'git merge origin/main && git log --grep merge': null,
    'grep -rn "gh pr merge" docs | head': null,
  })
})

test('merge: a cd in a subshell or pipeline does not move the directory the guard reads', () => {
  const terraform = '/home/user/terraform'
  expectAll(roundTwo(), {
    [`(cd ${terraform}) ; gh pr merge 8 ${PIN}`]: null,
    [`(cd ${terraform}) ; gh pr merge 7 ${PIN}`]: 'deny',
    [`(cd ${terraform} && true) && gh pr merge 8 ${PIN}`]: null,
    [`cd ${terraform} | true ; gh pr merge 7 ${PIN}`]: 'ask',
    [`cd ${terraform} & gh pr merge 7 ${PIN}`]: 'ask',
    [`cd ${terraform} 2>&1 && gh pr merge 7 ${PIN}`]: null,
    [`cd ~/x && gh pr merge 7 ${PIN}`]: 'ask',
    [`cd $DIR && gh pr merge 7 ${PIN}`]: 'ask',
  })
})

test('merge: gh short-flag clusters expand the way pflag reads them', () => {
  expectAll(roundTwo(), {
    'gh api -iX PUT repos/catati/cat-hotel/pulls/7/merge': 'deny',
    'gh api -iXPUT repos/catati/cat-hotel/pulls/7/merge': 'deny',
    'gh api -iX=PUT repos/catati/cat-hotel/pulls/7/merge': 'deny',
    [`gh api -iX PUT repos/catati/cat-hotel/pulls/7/merge -f sha=${HEAD}`]:
      'deny',
    'gh -iX PUT api repos/catati/cat-hotel/pulls/7/merge': 'deny',
    'gh api -iX PUT repos/catati/cat-hotel/pulls/8/ccr/auto_merge': 'deny',
    'gh api -iHX-HTTP-Method-Override:PUT repos/catati/cat-hotel/pulls/7/merge':
      'deny',
    [`gh pr merge 7 -dR catati/terraform ${PIN}`]: null,
    [`gh pr merge 7 -dRcatati/terraform ${PIN}`]: null,
    [`gh pr merge 6 -sdR catati/terraform ${PIN}`]: 'ask',
    'gh api -i repos/catati/cat-hotel/pulls/7/merge': null,
  })
})

test('merge: quotes and backslashes are read as bash joins them into words', () => {
  expectAll(roundTwo(), {
    [`"g"h pr merge 7 ${PIN}`]: 'deny',
    [`'g'h pr merge 7 ${PIN}`]: 'deny',
    [`g\\h pr merge 7 ${PIN}`]: 'deny',
    [`\\g\\h pr merge 7 ${PIN}`]: 'deny',
    [`gh pr "mer"ge 7 ${PIN}`]: 'deny',
    [`gh pr mer\\ge 7 ${PIN}`]: 'deny',
    [`gh "p"r merge 7 ${PIN}`]: 'deny',
    [`gh 'a'pi -X PUT repos/catati/cat-hotel/pulls/7/merge -f sha=${HEAD}`]:
      'deny',
    [`gh api -X PUT repos/catati/cat-hotel/pulls/7/"mer"ge -f sha=${HEAD}`]:
      'deny',
    [`gh pr merge 8 "--a"uto ${PIN}`]: 'deny',
    [`gh pr merge 8 --a\\uto ${PIN}`]: 'deny',
    [`eval "g""h pr merge 7 ${PIN}"`]: 'deny',
    [`bash -c '"g"h pr merge 7 ${PIN}'`]: 'deny',
    [`gh $SUB merge 8 ${PIN}`]: 'ask',
    [`gh pr $VERB 8 ${PIN}`]: 'ask',
    [`gh pr merge 8 "${PIN}"`]: 'deny',
  })
})

test('merge: git options that run a string ask when the string holds a gh merge', () => {
  expectAll(roundTwo(), {
    [`git -c alias.m='!gh pr merge 8 ${PIN}' m`]: 'ask',
    [`git rebase --exec 'gh pr merge 8 ${PIN}' HEAD~1`]: 'ask',
    [`git rebase -x 'gh pr merge 8 ${PIN}' HEAD~1`]: 'ask',
    [`git -c core.pager='gh pr merge 8 ${PIN}' log -1`]: 'ask',
    [`git bisect run gh pr merge 8 ${PIN}`]: 'ask',
    'git -c core.pager=less log -1': null,
    'git merge --no-ff origin/main -m "Merge origin/main"': null,
    'git commit -m "feat: refuse a merge without gh pr merge record"': null,
  })
})

test('merge: a heredoc is judged as commands only when a shell reads it', () => {
  const body = (text) =>
    `gh pr create --title t --body "$(cat <<'MD'\n${text}\nMD\n)"`
  expectAll(roundTwo(), {
    [body(`Example:\n\ngh pr merge 7 ${PIN}`)]: null,
    [body("- `gh pr merge` now needs a record. Don't skip it.")]: null,
    [body(`\`\`\`\ngh pr merge 7 ${PIN}\n\`\`\``)]: null,
    "cat > notes.md <<'MD'\nnever run gh pr merge 7 by hand\nMD": null,
    [`bash <<'SH'\ngh pr merge 7 ${PIN}\nSH`]: 'deny',
    [`sh <<-SH\n\tgh pr merge 8 ${PIN}\n\tSH`]: null,
    'cat <<MD\n$(gh pr merge 7)\nMD': 'deny',
    [`cat <<'MD' | sh\ngh pr merge 7 ${PIN}\nMD`]: 'deny',
    [`cat <<'MD'\nnotes\nMD\ngh pr merge 7 ${PIN}`]: 'deny',
  })
})

test('merge: a GraphQL write that mentions a merge asks', () => {
  expectAll(roundTwo(), {
    'gh api graphql -f query=\'mutation{mergePullRequest(input:{pullRequestId:"x"}){clientMutationId}}\'':
      'ask',
    'gh api -X POST https://api.github.com/graphql -f query=\'mutation{enablePullRequestAutoMerge(input:{pullRequestId:"x"}){clientMutationId}}\'':
      'ask',
    "gh api graphql -f query='query{viewer{login}}'": null,
  })
})

test('a bash comment runs to the end of its line and hides no later command', () => {
  expectAll(roundTwo(), {
    "git fetch origin # make sure it's current\ngh pr merge 7 --squash": 'deny',
    "echo start # don't stop\ngh api -X PUT repos/catati/cat-hotel/pulls/7/merge":
      'deny',
    'git status # see cat <<EOF in docs\ngh pr merge 7 --squash': 'deny',
    'git status # say "hi\ngh pr merge 8 --squash --auto': 'deny',
    "echo $'it\\'s'; gh pr merge 7 --squash": 'deny',
    '((n = 1<<3))\ngh pr merge 7 --squash': 'deny',
    'ls # next: gh pr merge once verified': null,
    'echo "a # b" && gh pr merge 7': 'deny',
  })
  assert.equal(sh("git status # it's fine\nwrangler deploy"), 'ask')
  assert.equal(sh('git status # wrangler deploy'), null)
})

test('merge: gh pr merge flag values are never read as flags', () => {
  expectAll(roundTwo(), {
    'gh pr merge 7 --squash --subject --disable-auto': 'deny',
    'gh pr merge 7 --squash -b--disable-auto': 'deny',
    'gh pr merge 7 --squash -t --disable-auto': 'deny',
    'gh pr merge 7 --squash -A --disable-auto': 'deny',
    [`gh pr merge 8 --squash -b --match-head-commit=${HEAD}`]: 'deny',
    [`gh pr merge 8 --squash -t --auto ${PIN}`]: null,
    [`gh pr merge 8 --body=--auto ${PIN}`]: null,
  })
})

test('merge: a merge argument or REST endpoint the shell fills in later asks', () => {
  expectAll(roundTwo(), {
    'U=repos/catati/cat-hotel/pulls/7/merge; gh api -X PUT "$U"': 'ask',
    "gh api -X PUT $(printf 'repos/catati/cat-hotel/pulls/%s/merge' 7)": 'ask',
    [`gh pr merge 8 --squash --{auto,auto} ${PIN}`]: 'ask',
    [`gh pr merge 8 --squash $'--auto' ${PIN}`]: 'deny',
    [`gh pr merge 8 --squash $(echo --auto) ${PIN}`]: 'ask',
    [`AUTO=--auto; gh pr merge 8 --squash $AUTO ${PIN}`]: 'ask',
    'gh api repos/catati/cat-hotel/pulls/$N': null,
  })
})

test('merge: curl counts -XPUT, --request=PUT and -T as a PUT to a pulls path', () => {
  const url = 'https://api.github.com/repos/catati/cat-hotel/pulls/7/merge'
  expectAll(roundTwo(), {
    [`curl -sS -XPUT ${url}`]: 'ask',
    [`curl -sS -X PUT ${url}`]: 'ask',
    [`curl -sS --request=PUT ${url}`]: 'ask',
    [`curl -sS -T body.json ${url}`]: 'ask',
    [`curl -sS --upload-file body.json ${url}`]: 'ask',
    [`curl -sS ${url}`]: null,
  })
})

test('merge: a gh merge handed to a shell, eval or xargs as text asks', () => {
  expectAll(roundTwo(), {
    "<<'EOF' bash\ngh pr merge 7 --squash\nEOF": 'deny',
    "python3 - <<'PY'\nimport subprocess\nsubprocess.run(['gh', 'pr', 'merge', '7'])\nPY":
      'deny',
    "node <<'JS'\nrequire('child_process').execSync('gh pr merge 7')\nJS":
      'deny',
    "bash <(echo 'gh pr merge 7 --squash')": 'deny',
    'source <(echo gh pr merge 7 --squash)': 'deny',
    'eval "$(echo gh pr merge 7 --squash)"': 'ask',
    'bash -c "$(echo gh pr merge 7 --squash)"': 'ask',
    "echo 'gh pr merge 7 --squash' | sh /dev/stdin": 'deny',
    "echo 'pr merge 7 --squash' | xargs gh": 'deny',
    "echo 'gh pr merge 7 --squash' | xargs -I{} sh -c '{}'": 'ask',
    "GIT_EDITOR='gh pr merge 7 --squash #' git commit --amend": 'ask',
    "git submodule foreach 'gh pr merge 7 --squash'": 'ask',
    "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.m GIT_CONFIG_VALUE_0='!gh pr merge 7' git m":
      'ask',
    'python3 - <<\'PY\'\nprint("merge")\nPY': null,
    "git log --format='%H %s' | grep -i merge": null,
    "sed -n '/merge/p' docs/agents/github-ci-cd.md": null,
    'git commit -m "$(cat <<\'EOF\'\nfeat(tooling): gh pr merge gate\nEOF\n)"':
      null,
    'echo "gh pr merge 1 --auto" >> notes.md': null,
    'rg -n "gh pr merge" .claude docs': null,
    "gh api repos/catati/cat-hotel/pulls/502/comments --jq '.[].body' | grep -c merge":
      null,
    'node -e "console.log(\'merge pulls\')"': null,
    'gh pr create --title "refuse a merge" --body "Run gh pr merge 1 later"':
      null,
  })
})

test('merge: routine pull request REST writes that cannot merge pass', () => {
  expectAll(roundTwo(), {
    'gh api -X POST repos/catati/cat-hotel/pulls -f title=t -f head=b -f base=main':
      null,
    'gh api -X PATCH repos/catati/cat-hotel/pulls/7 -f body=@body.md': null,
    "gh api -X POST repos/catati/cat-hotel/pulls/7/requested_reviewers -f 'reviewers[]=x'":
      null,
    'gh api -X POST repos/catati/cat-hotel/pulls/7/comments -f body=x': null,
    'gh api -X POST repos/catati/cat-hotel/pulls/7/comments/123/replies -f body=thanks':
      null,
    'gh api -X POST repos/catati/cat-hotel/pulls/7/reviews -f event=COMMENT':
      null,
    'gh api -X PUT repos/catati/cat-hotel/pulls/7/update-branch': null,
    'gh api -X POST repos/catati/cat-hotel/pulls/7/ccr/ready_for_review': null,
    'gh api -X POST repos/catati/cat-hotel/pulls/7/ccr/convert_to_draft': null,
    'gh api -X POST repos/catati/cat-hotel/pulls/7/ccr/comments/123/resolve':
      null,
    'gh api -X POST repos/catati/cat-hotel/pulls/7/ccr/comments/123/unresolve':
      null,
    'gh api -X PUT repos/catati/cat-hotel/pulls/7/reviews/1/dismissals': 'ask',
    'gh api -X POST repos/catati/cat-hotel/pulls/7/ccr/merge_queue': 'ask',
  })
})

test('merge: a heredoc to a program that can run it is read raw, comments and shebangs included', () => {
  expectAll(roundTwo(), {
    "python3 - <<'PY'\nimport subprocess\n# merge each verified PR\nsubprocess.run(['gh', 'pr', 'merge', '7'])\nPY":
      'deny',
    "python3 - <<'PY'\nimport subprocess  # stdlib\nsubprocess.run(['gh', 'pr', 'merge', '7'])\nPY":
      'deny',
    "python3 <<'PY'\n#!/usr/bin/env python3\nimport os\nos.system('gh pr merge 7')\nPY":
      'deny',
    "ruby <<'RB'\n# go\nsystem('gh pr merge 7')\nRB": 'deny',
    "perl <<'PL'\n# go\nsystem('gh pr merge 7');\nPL": 'deny',
    "python3 - <<'PY'\n# a comment\nprint('done')\nPY": null,
  })
})

test('an unquoted heredoc to an inert program runs its substitutions as commands', () => {
  assert.equal(sh('cat <<EOF\n$(wrangler deploy)\nEOF'), 'ask')
  assert.equal(
    sh('cat <<EOF > summary.md\nDeployed: `wrangler deploy`\nEOF'),
    'ask'
  )
  assert.equal(
    sh('git commit --allow-empty -F - <<EOF\nrelease $(wrangler deploy)\nEOF'),
    'ask'
  )
  assert.equal(sh("cat <<'EOF'\n$(wrangler deploy)\nEOF"), null)
  assert.equal(sh('cat <<EOF\nwrangler deploy $(date)\nEOF'), null)
})

test('merge: a script written by a heredoc and run by a shell in the same command asks', () => {
  expectAll(roundTwo(), {
    "cat > /tmp/m.sh <<'EOF'\ngh pr merge 7 --squash\nEOF\nbash /tmp/m.sh":
      'ask',
    "cat <<'EOF' > /tmp/m.sh && bash /tmp/m.sh\ngh pr merge 7 --squash\nEOF":
      'ask',
    "tee /tmp/m.sh <<'EOF' >/dev/null\ngh pr merge 7 --squash\nEOF\nsh /tmp/m.sh":
      'ask',
    "cat > body.md <<'EOF'\nAfter verify: gh pr merge 7 --squash\nEOF": null,
  })
})

test('merge: curl reads -X inside a short-flag cluster', () => {
  const url = 'https://api.github.com/repos/catati/cat-hotel/pulls/7/merge'
  expectAll(roundTwo(), {
    [`curl -sXPUT ${url}`]: 'ask',
    [`curl -sX PUT ${url}`]: 'ask',
    [`curl -sX GET ${url}`]: null,
  })
})

test('merge: a GraphQL mutation or a query the guard cannot read asks, a plain query passes, and merge-async is a merge', () => {
  expectAll(roundTwo(), {
    'gh api graphql -F query=@/tmp/q.graphql -f id=PR_x': 'ask',
    'Q=x; gh api graphql -f query="$Q" -f id=PR_x': 'ask',
    'gh api graphql -f query="$(cat /tmp/q.graphql)" -f id=PR_x': 'ask',
    'gh api graphql -f query=\'query { repository(owner:"catati", name:"cat-hotel") { pullRequest(number: 502) { mergeable } } }\'':
      null,
    'gh api -X PUT repos/catati/cat-hotel/pulls/7/merge-async -f merge_method=squash':
      'deny',
    [`gh api -X PUT repos/catati/cat-hotel/pulls/8/merge-async -f sha=${HEAD}`]:
      null,
  })
})

test('an unquoted heredoc to any reader runs its substitutions as commands', () => {
  assert.equal(sh('tee out.txt <<EOF\n$(wrangler deploy)\nEOF'), 'ask')
  assert.equal(sh('python3 <<EOF\nprint("$(wrangler deploy)")\nEOF'), 'ask')
  assert.equal(sh("sed 's/a/b/' <<EOF\n$(make deploy-prod)\nEOF"), 'ask')
  assert.equal(sh('tee x <<EOF\n`wrangler deploy`\nEOF'), 'ask')
  assert.equal(sh("tee out.txt <<'EOF'\n$(wrangler deploy)\nEOF"), null)
})

const PROD_WRITES = ['npx wrangler deploy --env prod', 'make deploy-prod']
const WRAPPERS = [
  (c) => `echo x | xargs ${c}`,
  (c) => `xargs -n 1 ${c}`,
  (c) => `exec ${c}`,
  (c) => `nice -n 5 ${c}`,
  (c) => `bash -lc "${c}"`,
  (c) => `bash -xc "${c}"`,
  (c) => `bash -euo pipefail -c "${c}"`,
  (c) => `bash -l -o pipefail -c "${c}"`,
  (c) => `bash -O extglob -c "${c}"`,
  (c) => `sh -ec "${c}"`,
  (c) => `zsh -c "${c}"`,
  (c) => `dash -c "${c}"`,
  (c) => `echo \`${c}\``,
  (c) => `echo "\`${c}\`"`,
  (c) => `x=\`${c}\``,
  (c) => `watch ${c}`,
  (c) => `stdbuf -oL ${c}`,
  (c) => `doas ${c}`,
  (c) => `doas -u root ${c}`,
  (c) => `caffeinate ${c}`,
  (c) => `caffeinate -i ${c}`,
  (c) => `script -c "${c}"`,
  (c) => `script -q -c "${c}" /dev/null`,
  (c) => `timeout 5 ${c}`,
  (c) => `env -i ${c}`,
  (c) => `ssh host ${c}`,
  (c) => `ssh -p 22 host "${c}"`,
  (c) => `docker run img ${c}`,
  (c) => `docker run --rm -e A=1 img ${c}`,
]

test('Bash: a prod write behind any wrapper, shell flag cluster or backtick asks', () => {
  for (const wrap of WRAPPERS)
    for (const write of PROD_WRITES)
      assert.equal(sh(wrap(write)), 'ask', wrap(write))
})

test('Bash: a wrapper around a dev or read command still passes', () => {
  for (const command of [
    'echo x | xargs grep deploy-prod',
    'git ls-files | xargs grep -n wrangler',
    'ssh host ls /srv',
    'docker run --rm img wrangler deploy --env dev',
    'bash -euo pipefail -c "npx wrangler deploy --env dev"',
    'echo `date`',
    'caffeinate -i make deploy-dev',
    'script -q -c "wrangler tail --env prod" /dev/null',
  ])
    assert.equal(sh(command), null, command)
})

const d1 = (command) =>
  sh(`npx wrangler d1 execute DB --env prod --remote --command ${command}`)

test('Bash: a prod d1 --command passes only as one plain ASCII read', () => {
  for (const sql of [
    '"SELECT 1\nDELETE FROM rooms"',
    '"SELECT 1\rDELETE FROM rooms"',
    "'SELECT 1; DELETE FROM rooms'",
    "'SELECT 1 -- note'",
    "'SELECT /* x */ 1'",
    "'PRAGMA foreign_keys=OFF'",
    "'PRAGMA table_list'",
    "'WITH x AS (SELECT 1) DELETE FROM bookings'",
    "'EXPLAIN DELETE FROM bookings'",
    "'SELECT 1 FROM bookings WHERE name = é'",
    "'UPDATE bookings SET status = 1'",
    "'ATTACH DATABASE x AS y'",
    "'VACUUM'",
    "'SELECT 1' --command 'DELETE FROM rooms'",
    '"SELECT 1\\nDELETE FROM rooms"',
  ])
    assert.equal(d1(sql), 'ask', sql)
  assert.equal(
    sh(
      'npx wrangler d1 execute DB --env prod --remote --command="SELECT 1\nDELETE FROM rooms"'
    ),
    'ask'
  )
  assert.equal(
    sh('npx wrangler d1 execute DB --env prod --remote --file=read.sql'),
    'ask'
  )
  for (const sql of [
    "'SELECT count(*) FROM bookings'",
    "'SELECT deleted_at, created_at FROM bookings'",
    "'SELECT CASE WHEN paid THEN 1 ELSE 0 END FROM bookings'",
    "'WITH x AS (SELECT 1) SELECT * FROM x'",
    "'EXPLAIN QUERY PLAN SELECT * FROM rooms'",
  ])
    assert.equal(d1(sql), null, sql)
  assert.equal(
    sh(
      "npx wrangler d1 execute DB --env prod --remote --command='SELECT 1 FROM rooms'"
    ),
    null
  )
})

const workerPath = '`/accounts/${accountId}/workers/scripts/cat-hotel-api`'

test('Cloudflare: on Catati a call passes only when every method is a literal GET', () => {
  for (const code of [
    `async () => { const m = 'DEL'+'ETE'; return cloudflare.request({ method: m, path: ${workerPath} }) }`,
    "async () => cloudflare.request({ method: ['POST'][0], path: `/accounts/${accountId}/d1/database/542f100a-e7ed-46d3-9eb4-9aaa9b7606a7/query`, body: { sql: 'DELETE FROM bookings' } })",
    `async () => cloudflare.request({ method: 'PO'+'ST', path: ${workerPath} })`,
    `async () => cloudflare.request({ method: ＇DELETE＇, path: ${workerPath} })`,
    `async () => cloudflare.request({ method: 'GET'.replace('GET', 'DELETE'), path: ${workerPath} })`,
    `async () => cloudflare.request({ method: \`\${'DELETE'}\`, path: ${workerPath} })`,
    `async () => cloudflare.request({ method: '\\u0044ELETE', path: ${workerPath} })`,
    `async () => { const o = { path: ${workerPath} }; o['meth' + 'od'] = 'DELETE'; return cloudflare.request(o) }`,
    `async () => cloudflare.request({ ['meth' + 'od']: 'DELETE', path: ${workerPath} })`,
    `async () => { const init = { method: 'DELETE' }; return cloudflare.request({ ...init, method: 'GET', path: ${workerPath} }) }`,
    `async () => cloudflare.request(Object.assign({ method: 'GET', path: ${workerPath} }, JSON.parse('{"meth' + 'od":"DELETE"}')))`,
    `async () => cloudflare.request(new Request(${workerPath}, { method: 'GET' }))`,
    `async () => { const o = { method: 'GET', path: ${workerPath} }; o.method = 'DELETE'; return cloudflare.request(o) }`,
    `async () => cloudflare.request({ path: ${workerPath} })`,
    `async () => { const c = cloudflare; return c.request({ method: 'GET', path: ${workerPath} }) }`,
    `async () => cloudflare.request({ "method": "GET", method: 'DELETE', path: ${workerPath} })`,
  ]) {
    assert.equal(cf(PROD, code), 'ask', code)
    assert.equal(cf(undefined, code), 'ask', code)
  }
  for (const code of [
    `async () => cloudflare.request({ method: 'GET', path: ${workerPath} })`,
    `async () => (await cloudflare.request({ "method": "GET", path: '/accounts/x/workers/scripts' })).result[0]`,
  ])
    assert.equal(cf(PROD, code), null, code)
})

test('Cloudflare: a computed method passes on catati-dev and asks for a legacy -dev name on Catati', () => {
  const computed = (path) =>
    `async () => { const m = 'PO'+'ST'; return cloudflare.request({ method: m, path: '${path}' }) }`
  assert.equal(
    cf(DEV, computed(`/accounts/${DEV}/workers/scripts/cat-hotel-api`)),
    null
  )
  assert.equal(cf(DEV, computed('/zones/abc/dns_records')), 'ask')
  assert.equal(
    cf(PROD, computed('/workers/scripts/catati-cat-hotel-api-dev')),
    'ask'
  )
})

test('hook process: the hook decides when it is started through a symlink', () => {
  const folder = mkdtempSync(join(tmpdir(), 'guard-prod-link-'))
  const link = join(folder, 'pre-tool-use.mjs')
  symlinkSync(hook, link)
  assert.equal(
    hookProcessDecision('Bash', { command: 'make deploy-prod' }, folder, link),
    'ask'
  )
  assert.equal(
    hookProcessDecision(
      'Bash',
      { command: 'wrangler deploy --env dev' },
      folder,
      link
    ),
    null
  )
})

test('GitHub Actions: starting, rerunning or cancelling a run asks, reads pass', () => {
  for (const method of [
    'run_workflow',
    'rerun_workflow_run',
    'rerun_failed_jobs',
    'cancel_workflow_run',
    'delete_workflow_run_logs',
  ])
    assert.equal(
      decide('mcp__github__actions_run_trigger', {
        method,
        owner: 'catati',
        repo: 'cat-hotel',
        workflow_id: 'deploy-prod.yml',
        ref: 'main',
      })?.decision,
      'ask',
      method
    )
  for (const command of [
    'gh workflow run deploy-prod.yml -R catati/cat-hotel',
    'gh -R catati/cat-hotel workflow run deploy-prod.yml',
    'gh run rerun 123 -R catati/cat-hotel',
    'gh run rerun 123 --failed',
    'gh run -R catati/terraform rerun 123',
    'gh api repos/catati/cat-hotel/actions/workflows/deploy-prod.yml/dispatches -f ref=main',
    'gh api -X POST repos/catati/cat-hotel/actions/runs/123/rerun',
    'gh api -X POST /repos/catati/cat-hotel/actions/runs/123/rerun-failed-jobs',
    'gh api --method POST repos/catati/terraform/actions/jobs/9/rerun',
    'gh api repos/catati/cat-hotel/dispatches -f event_type=deploy',
  ])
    assert.equal(sh(command), 'ask', command)
  for (const command of [
    'gh run list -R catati/cat-hotel',
    'gh run view 123 --log-failed',
    'gh workflow list',
    'gh workflow view deploy-prod.yml',
    'gh api repos/catati/cat-hotel/actions/runs',
  ])
    assert.equal(sh(command), null, command)
})

test('Bash: $-quoted words decode every ANSI-C escape the way bash does', () => {
  for (const sql of [
    "$'SELECT 1\\x3b\\x44ELETE FROM rooms'",
    "$'SELECT 1\\x0aDELETE FROM rooms'",
    "$'SELECT 1\\012DELETE FROM rooms'",
    "$'SELECT 1\\rDELETE FROM rooms'",
    "$'SELECT 1\\u000aDELETE FROM rooms'",
    "$'SELECT 1\\U0000000aDELETE FROM rooms'",
    "$'SELECT 1\\cJDELETE FROM rooms'",
    "$'SELECT 1\\vDELETE FROM rooms'",
    "\"SELECT 1\"$'\\x0a'\"DELETE FROM rooms\"",
  ])
    assert.equal(d1(sql), 'ask', sql)
  for (const command of [
    "make $'deploy\\x2dprod'",
    "bash -c $'make deploy\\x2dprod'",
    "bash -c $'npx wrangler deploy --env\\x20prod'",
    "npx wrangler deploy --env $'\\x70rod'",
    "npx wrangler deploy --env $'\\160rod'",
    "npx wrangler deploy --env $'\\u0070rod'",
    "npx wrangler deploy --env $'dev\\x00'",
    "npx wrangler deploy --env $'dev\\c@'",
  ])
    assert.equal(sh(command), 'ask', command)
  for (const command of [
    "npx wrangler deploy --env $'d\\x65v'",
    "npx wrangler deploy --env $'\\144ev'",
    "npx wrangler d1 execute DB --env prod --remote --command $'SELECT\\x20count(*) FROM rooms'",
    "npx wrangler d1 execute DB --env prod --remote --command $'SELECT \\'a\\' FROM rooms'",
  ])
    assert.equal(sh(command), null, command)
})

const devWrite = (path) =>
  cf(DEV, `async () => cloudflare.request({ method: 'POST', path: ${path} })`)

test('Cloudflare: a catati-dev write passes only when each path names the dev account', () => {
  for (const path of [
    "'/accounts/' + '69f8dc2296dd15d29e03693d6492f163'.slice(0) + '/workers/scripts/cat-hotel-api'",
    "`/accounts/${'69f8dc22' + '96dd15d29e03693d6492f163'}/workers/scripts/cat-hotel-api`",
    '`/accounts/${other}/workers/scripts/cat-hotel-api`',
    "'/accounts/someone-else/workers/scripts/cat-hotel-api'",
    '`/accounts/${accountId}/workers/scripts/${name}`',
    "'/accounts/028a7270e2ad8a208cd6b01800f363f3/../69f8dc2296dd15d29e03693d6492f163/workers/scripts/x'",
    "'/accounts/028a7270e2ad8a208cd6b01800f363f3%2f..%2fx'",
    'p',
  ])
    assert.equal(devWrite(path), 'ask', path)
  assert.equal(
    cf(
      DEV,
      "async () => { const id = (await cloudflare.request({ method: 'GET', path: '/accounts' })).result.find((a) => a.name === 'Catati').id; return cloudflare.request({ method: 'DELETE', path: `/accounts/${id}/workers/scripts/cat-hotel-api` }) }"
    ),
    'ask'
  )
  assert.equal(
    cf(
      DEV,
      "async () => { const accountId = 'x'; return cloudflare.request({ method: 'DELETE', path: `/accounts/${accountId}/workers/scripts/cat-hotel-api` }) }"
    ),
    'ask'
  )
  assert.equal(
    cf(DEV, "async () => cloudflare.request({ method: 'POST' })"),
    'ask'
  )
  for (const path of [
    '`/accounts/${accountId}/workers/scripts/cat-hotel-api`',
    "'/accounts/028a7270e2ad8a208cd6b01800f363f3/d1/database/cat-hotel/query'",
  ])
    assert.equal(devWrite(path), null, path)
})

test('Cloudflare: a computed key or a spread that can override a literal GET asks', () => {
  for (const code of [
    `async () => { const o = { method: 'GET', path: ${workerPath} }; o['meth' + 'od'] = 'DELETE'; return cloudflare.request(o) }`,
    `async () => { const extra = (await cloudflare.request({ method: 'GET', path: '/accounts' })).result; return cloudflare.request({ method: 'GET', path: ${workerPath}, ...extra }) }`,
  ])
    assert.equal(cf(PROD, code), 'ask', code)
})

test('GitHub Actions: approving a deployment, force-cancelling, cancelling or deleting a run asks', () => {
  for (const command of [
    'gh api -X POST repos/catati/cat-hotel/actions/runs/5/pending_deployments -F environment_ids[]=1 -f state=approved -f comment=ok',
    'gh api -X POST repos/catati/cat-hotel/actions/runs/5/approve',
    'gh api -X POST repos/catati/cat-hotel/actions/runs/5/force-cancel',
    'gh api -X POST repos/catati/cat-hotel/actions/runs/5/cancel',
    'gh api -X DELETE repos/catati/cat-hotel/actions/runs/5',
    'gh run cancel 5 -R catati/cat-hotel',
    'gh run delete 5',
    `curl -X POST -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/repos/catati/cat-hotel/actions/workflows/deploy-prod.yml/dispatches -d '{"ref":"main"}'`,
    'curl -d @body.json https://api.github.com/repos/catati/cat-hotel/actions/runs/5/pending_deployments',
  ])
    assert.equal(sh(command), 'ask', command)
  assert.equal(
    sh('gh api repos/catati/cat-hotel/actions/runs/5/pending_deployments'),
    null
  )
  assert.equal(
    sh('curl -s https://api.github.com/repos/catati/cat-hotel/actions/runs'),
    null
  )
})

test('Bash: a prod write fed to a shell, interpreter or process wrapper asks', () => {
  const feeds = [
    (c) => `echo "${c}" | bash`,
    (c) => `echo ${c} | sh`,
    (c) => `printf '%s\\n' '${c}' | sh -s`,
    (c) => `bash <<< "${c}"`,
    (c) => `bash <<<"${c}"`,
    (c) => `bash <<'EOF'\n${c}\nEOF`,
    (c) => `su -c "${c}" deploy`,
    (c) => `busybox sh -c "${c}"`,
    (c) => `fish -c "${c}"`,
    (c) => `setsid ${c}`,
    (c) => `ionice -c 3 ${c}`,
    (c) => `flock /tmp/lock ${c}`,
    (c) => `find . -maxdepth 0 -exec ${c} \;`,
    (c) => `tmux new -d '${c}'`,
    (c) => `screen -dm ${c}`,
    (c) => `strace -f ${c}`,
    (c) => `python3 -c "import os; os.system('${c}')"`,
    (c) => `python3 -c "import subprocess; subprocess.run('${c}'.split())"`,
    (c) => `node -e "require('child_process').execSync('${c}')"`,
    (c) => `perl -e "system('${c}')"`,
    (c) => `ruby -e "system('${c}')"`,
    (c) => `python3 - <<'PY'\nimport os\nos.system('${c}')\nPY`,
    (c) => `bash <(echo "${c}")`,
    (c) => `at now <<< "${c}"`,
    (c) => `echo "${c}" | at now`,
    (c) => `unbuffer ${c}`,
    (c) => `gtimeout 5 ${c}`,
    (c) => `kubectl exec pod -- ${c}`,
    (c) => `parallel ::: "${c}"`,
  ]
  for (const feed of feeds)
    for (const write of PROD_WRITES)
      assert.equal(sh(feed(write)), 'ask', feed(write))
  for (const command of [
    'echo "make deploy-dev" | bash',
    'bash <<< "npx wrangler deploy --env dev"',
    "python3 -c \"print('hello')\"",
    "node -e \"console.log('deploy')\"",
    'find . -name "*.sql" -exec grep -l DELETE {} \;',
    'flock /tmp/lock make deploy-dev',
  ])
    assert.equal(sh(command), null, command)
})

test('Cloudflare: a catati-dev write outside /accounts/<dev> asks', () => {
  for (const path of [
    "'/zones'",
    "'/memberships/abc'",
    "'/user/tokens'",
    "'/d1/database/cat-hotel/query'",
    "'/accounts'",
  ])
    assert.equal(devWrite(path), 'ask', path)
})

test('Cloudflare: on Catati each request must open with a literal GET method', () => {
  for (const code of [
    `async () => { const a = { method: 'GET' }; await cloudflare.request({ method: 'GET', path: '/accounts' }); return cloudflare.request({ path: ${workerPath}, body: 'x' }) }`,
    `async () => { const o = { method: 'GET', path: ${workerPath} }; return cloudflare.request(o) }`,
  ])
    assert.equal(cf(PROD, code), 'ask', code)
  assert.equal(
    cf(
      PROD,
      `async () => (await cloudflare.request({ "method": "GET", path: ${workerPath} })).result.map((s) => s.id)`
    ),
    null
  )
})

const GH_RUN_PATHS = [
  'https://api.github.com/repos/catati/cat-hotel/actions/workflows/deploy.yml/dispatches',
  'https://api.github.com/repositories/1/actions/workflows/2/dispatches',
  'https://api.github.com/repos/catati/cat-hotel/%61ctions/runs/1/rerun',
  'https://API.github.com:443/repos/catati/cat-hotel/actions/runs/1/approve',
  'api.github.com/repos/catati/cat-hotel/check-suites/1/rerequest',
  'https://api.github.com/repos/catati/cat-hotel/check-runs/1/rerequest',
]

test('Bash: an HTTP client write to a GitHub Actions or check rerun path asks', () => {
  for (const url of GH_RUN_PATHS)
    for (const command of [
      `curl -sd '{"ref":"main"}' ${url}`,
      `curl -sXPOST ${url}`,
      `curl -Xd POST ${url}`,
      `curl -s --data-raw '{}' ${url}`,
      `curl --json '{}' ${url}`,
      `wget --post-data='{"ref":"main"}' ${url}`,
      `wget --method=POST ${url}`,
      `http POST ${url} ref=main`,
      `https POST ${url}`,
      `http ${url} ref=main`,
    ])
      assert.equal(sh(command), 'ask', command)
  for (const command of [
    'gh api -X POST repos/catati/cat-hotel/check-suites/1/rerequest',
    'gh api -X POST repos/catati/cat-hotel/check-runs/1/rerequest',
    'gh api -X POST repositories/1/actions/runs/2/rerun',
    `gh api graphql -f query='mutation { rerequestCheckSuite(input:{repositoryId:"x",checkSuiteId:"y"}) { clientMutationId } }'`,
    "gh alias set d 'workflow run deploy.yml'",
  ])
    assert.equal(sh(command), 'ask', command)
  for (const command of [
    'curl -s https://api.github.com/repos/catati/cat-hotel/actions/runs',
    'curl -sSL https://api.github.com/repos/catati/cat-hotel/check-runs/1',
    'wget -qO- https://api.github.com/repos/catati/cat-hotel/actions/runs',
    'http https://api.github.com/repos/catati/cat-hotel/actions/runs per_page==5',
    'curl -sd x=1 https://example.com/actions/runs/1/rerun',
  ])
    assert.equal(sh(command), null, command)
})

test('Bash: a wrapper given by full path or with a value flag in a cluster is unwrapped', () => {
  for (const write of PROD_WRITES)
    for (const command of [
      `/usr/bin/env ${write}`,
      `/usr/bin/sudo ${write}`,
      `/usr/bin/timeout 5 ${write}`,
      `/usr/bin/nice ${write}`,
      `/usr/bin/nice -n 5 ${write}`,
      `sudo -Eu root ${write}`,
      `sudo -iu deploy ${write}`,
      `timeout -sKILL 5 ${write}`,
      `timeout -vs KILL 5 ${write}`,
      `/usr/local/bin/xargs -n 1 ${write}`,
    ])
      assert.equal(sh(command), 'ask', command)
  assert.equal(sh('/usr/bin/env npx wrangler deploy --env dev'), null)
  assert.equal(sh('sudo -Eu root make deploy-dev'), null)
})

test('Bash: a program word the guard cannot read asks, as do trap, builtin and coproc with a prod payload', () => {
  for (const command of [
    '$"make" deploy-prod',
    'W=make; $W deploy-prod',
    'W=npx; $W wrangler deploy --env prod',
    '"$(echo make)" deploy-prod',
    '{make,} deploy-prod',
    'ma?e deploy-prod',
    'mak* deploy-prod',
    "trap 'make deploy-prod' EXIT",
    "trap 'npx wrangler deploy --env prod' EXIT",
    "builtin eval 'make deploy-prod'",
    'coproc make deploy-prod',
    'coproc job { npx wrangler deploy --env prod; }',
  ])
    assert.equal(sh(command), 'ask', command)
  for (const command of [
    'T=deploy-dev; make $T',
    '[ -d dist ] && echo yes',
    'for f in *.md; do grep -l deploy "$f"; done',
    "trap 'rm -f /tmp/x' EXIT",
    'echo "$(date)"',
    'X=$(git rev-parse HEAD) && echo $X',
  ])
    assert.equal(sh(command), null, command)
})

test('Bash: text fed to bash -s, /dev/stdin, source or a process substitution is read as commands', () => {
  for (const write of PROD_WRITES)
    for (const command of [
      `echo '${write}' | bash -s x`,
      `echo '${write}' | bash /dev/stdin`,
      `echo '${write}' | sh -`,
      `echo '${write}' | source /dev/stdin`,
      `echo '${write}' | . /dev/fd/0`,
      `source <(echo '${write}')`,
      `. <(echo '${write}')`,
      `echo '${write}' | bash -c "$(cat)"`,
    ])
      assert.equal(sh(command), 'ask', command)
  for (const command of [
    "echo 'make deploy-dev' | bash -s x",
    "source <(echo 'export A=1')",
    "cat <(echo 'make deploy-prod')",
  ])
    assert.equal(sh(command), null, command)
})

test('Bash: a prod d1 --command with RETURNING, load_extension or a --file of any case asks', () => {
  for (const sql of [
    "'SELECT load_extension(1)'",
    "'SELECT 1 RETURNING *'",
    "'SELECT 1' --File x.sql",
    "'SELECT 1' --FILE=x.sql",
  ])
    assert.equal(d1(sql), 'ask', sql)
})

test('Bash: a Wrangler flag the guard does not know cannot hide the subcommand', () => {
  for (const command of [
    'npx wrangler --x-provision delete dev --env prod',
    'npx wrangler --experimental-remote-bindings deploy dev --env prod',
  ])
    assert.equal(sh(command), 'ask', command)
  assert.equal(sh('npx wrangler --config wrangler.jsonc tail --env prod'), null)
})

test('Bash: brace groups and program words with a readable basename pass', () => {
  for (const command of [
    '{ npm test; } 2>&1 | tail',
    '{ echo a; echo b; } > f',
    '$HOME/.local/bin/uv sync',
    '"$(git rev-parse --show-toplevel)"/scripts/check.sh',
    '${CLAUDE_PROJECT_DIR}/x.sh',
  ])
    assert.equal(sh(command), null, command)
  for (const command of [
    '{ make deploy-prod; } 2>&1 | tail',
    '$HOME/bin/wrangler deploy --env prod',
    '$(which node) x.mjs',
    '$HOME/bin/ma?e deploy-prod',
  ])
    assert.equal(sh(command), 'ask', command)
})

test('Bash: here-strings to source, GitHub URLs in any curl form, and $ commands after a wrapper ask', () => {
  for (const command of [
    'source /dev/stdin <<< "make deploy-prod"',
    '. /dev/stdin <<< "make deploy-prod"',
    'source <<< "make deploy-prod"',
    'curl --url=https://api.github.com/repos/catati/cat-hotel/actions/workflows/deploy.yml/dispatches -d x',
    'curl -X POST https://x:t@api.github.com/repos/catati/cat-hotel/actions/workflows/1/dispatches',
    'gh api -X POST repos/catati/cat-hotel/deployments -f ref=main -f environment=prod',
    "echo '$W deploy-prod' | W=make bash",
    'W=make; echo "$W deploy-prod" | bash',
    'xargs -I{} $W deploy-prod',
    'ssh h "$W deploy-prod"',
    'W=make; setsid $W deploy-prod',
    'W=make; find . -maxdepth 0 -exec $W deploy-prod ;',
    'W=make; trap "$W deploy-prod" EXIT',
    'echo deploy --env prod | xargs npx wrangler',
    'echo deploy-prod | xargs make',
    'printf "make deploy-prod" | xargs -0 bash -c',
    'echo make deploy-prod | busybox sh',
    'alias d="make deploy-prod"',
    'sudo -h host make deploy-prod',
    'sudo -R /x make deploy-prod',
    'yarn workspace landing wrangler deploy',
    'node node_modules/wrangler/bin/wrangler.js deploy',
    'npx wrangler deploy --env dev --env prod',
    'npx wrangler deploy --env=dev --env=prod',
    'npx wrangler deploy --env dev -e prod',
    'npx wrangler deploy --env prod -- --dry-run',
    'npx wrangler deploy --env prod --message --dry-run',
    'npx wrangler deploy --env prod --name --help',
    'npx wrangler d1 execute cat-hotel --env prod --remote --command "SELECT 1" -f x.sql',
    'CLOUDFLARE_ACCOUNT_ID=69f8dc2296dd15d29e03693d6492f163 npx wrangler deploy --env dev',
  ])
    assert.equal(sh(command), 'ask', command)
  for (const command of [
    'find . -name "*.ts" -exec wc -l {} +',
    'printf "%s\\n" a b | xargs -I{} echo {}',
    'git ls-files | xargs grep -n TODO',
    'ssh h "$HOME/bin/run tests"',
    'curl -sd x https://api.github.com/repos/catati/cat-hotel/issues/1/comments',
    'CLOUDFLARE_ACCOUNT_ID=028a7270e2ad8a208cd6b01800f363f3 npx wrangler deploy --env dev',
    'alias ll="ls -la"',
    'gh api graphql -f query="mutation { addComment(input:{subjectId:\\"x\\", body:\\"fix the workflow\\"}) { clientMutationId } }"',
  ])
    assert.equal(sh(command), null, command)
})

test('guard: a program word the shell splits, a GraphQL run behind a comma or comment, a switched-off read flag, a runner workspace, a wrangler entry file and an exported account all ask', () => {
  for (const command of [
    'W="make deploy-prod "; $W/x',
    '$(printf "make deploy-prod ")/x',
    'W="npx wrangler deploy --env prod "; $W/x',
    'W="gh workflow run deploy.yml "; $W/x',
    '`echo make deploy-prod`/x',
    'gh api graphql -f query=\'mutation { a: rerequestCheckSuite,(input:{repositoryId:"x",checkSuiteId:"y"}) { clientMutationId } }\'',
    'gh api graphql -f query=\'mutation { rerequestCheckSuite #c\n (input:{repositoryId:"x",checkSuiteId:"y"}) { clientMutationId } }\'',
    'npx wrangler deploy --env prod --dry-run false',
    'npx wrangler deploy --env prod --dry-run 0',
    'npx wrangler deploy --env prod --dry-run=false',
    'npx wrangler d1 execute cat-hotel --env prod --local false --command "DELETE FROM b"',
    'npm exec --workspace api -- wrangler deploy --env prod',
    'npm exec -w api -- wrangler deploy --env prod',
    'npx -w api wrangler deploy --env prod',
    'node --no-warnings node_modules/wrangler/bin/wrangler.js deploy --env prod',
    'node node_modules/wrangler/wrangler-dist/cli.js deploy --env prod',
    'bun node_modules/wrangler/bin/wrangler.js deploy --env prod',
    'export CLOUDFLARE_ACCOUNT_ID=0000; npx wrangler deploy --env dev',
    'export CLOUDFLARE_ENV=prod; npx wrangler deploy',
  ])
    assert.equal(sh(command), 'ask', command)
  for (const command of [
    '"$HOME"/bin/tool',
    '$HOME/.local/bin/uv sync',
    '${CLAUDE_PLUGIN_ROOT}/hooks/x.mjs',
    '"$(git rev-parse --show-toplevel)"/scripts/check.sh',
    'gh api graphql -f query="mutation { addComment(input:{subjectId:\\"x\\", body:\\"rerun the workflow\\"}) { clientMutationId } }"',
    'npx wrangler deploy --env prod --dry-run',
    'npx wrangler deploy --env prod --dry-run true',
    'npx wrangler d1 execute cat-hotel --env prod --local --command "DELETE FROM b"',
    'npm exec -w api -- wrangler deploy --env dev',
    'node node_modules/wrangler/bin/wrangler.js whoami',
    'export FOO=1; npx wrangler deploy --env dev',
    `export CLOUDFLARE_ACCOUNT_ID=${DEV}; npx wrangler deploy --env dev`,
  ])
    assert.equal(sh(command), null, command)
})

test('guard: a read flag counts only when it is on once, and a trusted $ name counts only when the command never sets it', () => {
  for (const command of [
    'npx wrangler deploy --env prod --dry-run=no',
    'npx wrangler deploy --env prod --dry-run=1',
    'npx wrangler deploy --env prod --dry-run=TRUE',
    'npx wrangler deploy --env prod --dry-run --no-dry-run',
    'npx wrangler deploy --env prod --dry-run --dry-run=false',
    'npx wrangler deploy --env prod --dry-run --dry-run false',
    'npx wrangler deploy --env prod --dry-run --dryRun=false',
    'npx wrangler deploy --env prod --dry-run --no-bundle --dry-run=false',
    'npx wrangler deploy --env prod --help --no-help',
    'npx wrangler deploy --env prod -v --version=false',
    'npx wrangler d1 execute cat-hotel --env prod --local --no-local --command "DELETE FROM b"',
    'npx wrangler d1 execute cat-hotel --env prod --local --local=false --command "DELETE FROM b"',
    'HOME="make deploy-prod "; $HOME/x',
    'export HOME="make deploy-prod "; $HOME/x',
    'PWD="make deploy-prod "; $PWD/x',
    'TMPDIR="npx wrangler deploy --env prod "; $TMPDIR/x',
    'cd /tmp; HOME="make deploy-prod " && ${HOME}/x',
    'declare HOME="make deploy-prod "; $HOME/x',
    'declare "HO""ME=make deploy-prod "; $HOME/x',
    'N=HOME; declare "$N=make deploy-prod "; $HOME/x',
    'read -r HOME <<< "make deploy-prod "; $HOME/x',
    'printf -v HOME "make deploy-prod "; $HOME/x',
    'for HOME in "make deploy-prod "; do $HOME/x; done',
    'declare -n R=HOME; R="make deploy-prod "; $HOME/x',
    ': ${TMPDIR:="make deploy-prod "}; $TMPDIR/x',
    `eval $'\\x48OME="make deploy-prod "'; $HOME/x`,
    'source <(printf "HO%sME=x" ""); $HOME/x',
    'gh api graphql -f query="mutation { a: addComment(input:{subjectId:\\"x\\", body:\\"\\"\\"p\\\\\\"\\"\\" \\"\\"\\"}) { clientMutationId } rerequestCheckSuite(input:{checkSuiteId:\\"a\\",repositoryId:\\"b\\"}) { clientMutationId } b: addComment(input:{subjectId:\\"x\\", body:\\"\\"\\"q\\"\\"\\"}) { clientMutationId } }"',
    'gh api graphql -f query="mutation { a: addComment(input:{subjectId:\\"x\\", body:\\"open }) { clientMutationId } }"',
    'declare -x CLOUDFLARE_ACCOUNT_ID=0000; npx wrangler deploy --env dev',
    'typeset -x CLOUDFLARE_ACCOUNT_ID=0000; npx wrangler deploy --env dev',
    'readonly CLOUDFLARE_ACCOUNT_ID=0000; npx wrangler deploy --env dev',
    'declare CLOUDFLARE_ACCOUNT_ID=0000; npx wrangler deploy --env dev',
    'CLOUDFLARE_ACCOUNT_ID=0000; export CLOUDFLARE_ACCOUNT_ID; npx wrangler deploy --env dev',
    'read CLOUDFLARE_ACCOUNT_ID <<< 0000; export CLOUDFLARE_ACCOUNT_ID; npx wrangler deploy --env dev',
    'shopify app deploy --config dev --config prod',
    'shopify app deploy --config=dev -c shopify.app.prod.toml',
  ])
    assert.equal(sh(command), 'ask', command)
  for (const command of [
    '$HOME/.local/bin/uv run x.py',
    '"$HOME"/bin/tool --help',
    '${CLAUDE_PROJECT_DIR}/x.sh',
    'cd api && $PWD/node_modules/.bin/vitest run',
    'export PATH="$HOME/bin:$PATH"; $HOME/bin/tool',
    'npx wrangler deploy --env prod --dry-run',
    'npx wrangler deploy --env prod --dry-run=true',
    'npx wrangler deploy --env prod --dry-run true',
    'npx wrangler deploy --env prod --dry-run -- --dry-run=false',
    'npx wrangler d1 execute cat-hotel --env prod --local --command "DELETE FROM b"',
    'gh api graphql -f query="mutation { addComment(input:{subjectId:\\"x\\", body:\\"\\"\\"rerun \\\\\\"\\"\\" the workflow\\"\\"\\"}) { clientMutationId } }"',
    `declare -x CLOUDFLARE_ACCOUNT_ID=${DEV}; npx wrangler deploy --env dev`,
    'shopify app deploy --config dev -c shopify.app.dev.toml',
  ])
    assert.equal(sh(command), null, command)
  expectAll(roundTwo(), {
    [`gh pr merge 7 --disable-auto --disable-auto=false ${PIN}`]: 'deny',
    [`gh pr merge 7 --disable-auto=false --disable-auto ${PIN}`]: 'deny',
    'gh pr merge 7 --disable-auto': null,
  })
})
