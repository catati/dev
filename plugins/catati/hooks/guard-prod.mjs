import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const ACCOUNTS = {
  dev: '028a7270e2ad8a208cd6b01800f363f3',
  prod: '69f8dc2296dd15d29e03693d6492f163',
}
const LITERAL_METHOD =
  /^(?:^|[^\w$])(['"]?)method\1\s*:\s*(['"])(GET|POST|PUT|PATCH|DELETE)\2(?=\s*[,}])/
const REQUEST_OPENS_WITH_METHOD =
  /\bcloudflare\.request\(\s*\{\s*(['"]?)method\1\s*:\s*(['"])(GET|POST|PUT|PATCH|DELETE)\2(?=\s*[,}])/g
const LITERAL_PATH =
  /^(?:^|[^\w$])(['"]?)path\1\s*:\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`)(?=\s*[,}])/
const OPAQUE_CODE = [
  /[^\x09\x0a\x0d\x20-\x7e]/,
  /\\[ux0-7]/,
  /\.\.\./,
  /\[(?!\s*\d+\s*\])/,
  /\b(Object|Reflect|Proxy|Request|Response|fetch|eval|Function|constructor|prototype|__proto__|parse|import|require|globalThis|this|with|setTimeout|setInterval)\b/,
]
const ZONE_PATH = /\/zones\//
const CLI =
  /(^|[;&|(]\s*|\bsudo\s+|\b(exec|dlx|npx)\s+)(firebase|gcloud|gsutil)(\s|$)/
const PROD_TARGET =
  /--project[ =](prod|catati-cat-hotel)(?![\w-])|\s-P\s+prod\b|projects\/catati-cat-hotel(?![\w-])|gs:\/\/catati-cat-hotel(?![\w-])/
const MAKE_PROD = /deploy-prod|ENV=prod/
const READ_VERB =
  /\b(list|ls|get|describe|read|show|cat|whoami|logs?|tail|info|status)\b|:(list|get|export-config)\b|-(list|get)\b/
const WRITE_VERB =
  /\b(deploy|delete|create|update|set|add|remove|apply|import|rm|mv|cp|put|push|release|promote|reset|seed|migrate|execute|publish|rollback|secrets?:set|deploy-prod)\b|:(set|delete|deploy)\b/
const SHOPIFY_WRITE =
  /^mcp__Shopify__(graphql_mutation|create-|update-|bulk-update-|add-to-|set-inventory|publish-|upload|import-|switch-shop)/

export const OVERBOOKED_NIGHTS_SQL_SHA256 =
  'cdaf8a5842a0faf36146ff62ff5722c64f732f5c372475c886dfe4709fcdb854'

const PROD_DATABASE = '542f100a-e7ed-46d3-9eb4-9aaa9b7606a7'
const reportCall = (sql) =>
  `async () => (await cloudflare.request({ method: 'POST', path: '/accounts/${ACCOUNTS.prod}/d1/database/${PROD_DATABASE}/query', body: { sql: ${JSON.stringify(sql)} } })).result[0].results`
const [REPORT_HEAD, REPORT_TAIL] = reportCall('\0').split(JSON.stringify('\0'))

function isOverbookedNightsProdRead(accountId, code, pin) {
  if (accountId !== ACCOUNTS.prod || typeof code !== 'string') return false
  if (!code.startsWith(REPORT_HEAD) || !code.endsWith(REPORT_TAIL)) return false
  let sql
  try {
    sql = JSON.parse(code.slice(REPORT_HEAD.length, code.length - REPORT_TAIL.length))
  } catch {
    return false
  }
  return (
    typeof sql === 'string' &&
    createHash('sha256').update(sql, 'utf8').digest('hex') ===
      pin &&
    code === reportCall(sql)
  )
}

const allow = null
const ask = (reason) => ({ decision: 'ask', reason })
const deny = (reason) => ({ decision: 'deny', reason })
const prodWrite = (reason) =>
  ask(`${reason} Approve only if Shien asked for this specific prod action.`)

const VERIFIER_PASS = /^VERIFIER PASS ([0-9a-f]{40})$/
const TERRAFORM = 'catati/terraform'
const TERRAFORM_PROD_PATHS = ['.github/workflows/']
const GH_SHORT_VALUE_FLAGS = new Set('RXHfFqtpbA')
const GH_SHORT_BOOLEAN_FLAGS = new Set('idmrsh')
const GH_LONG_BOOLEAN_FLAGS = new Set([
  '--help',
  '--version',
  '--paginate',
  '--include',
  '--silent',
  '--verbose',
  '--slurp',
  '--admin',
  '--auto',
  '--delete-branch',
  '--disable-auto',
  '--merge',
  '--rebase',
  '--squash',
])
const GH_API_VALUE_FLAGS = new Set([
  '-X',
  '--method',
  '-H',
  '--header',
  '-f',
  '--raw-field',
  '-F',
  '--field',
  '--input',
  '-q',
  '--jq',
  '-t',
  '--template',
  '--hostname',
  '-p',
  '--preview',
  '--cache',
])
const GH_API_FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field'])
const READ_METHODS = new Set(['GET', 'HEAD'])
const PFLAG_FALSE = new Set(['0', 'f', 'F', 'false', 'FALSE', 'False'])
const PR_URL = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/
const API_MERGE_ROUTE =
  /^repos\/([^/]+\/[^/]+)\/pulls\/(\d+)\/(merge|merge-async|ccr\/auto_merge)$/
const API_GUARDED_ROUTE = /pulls|merge|^repositories\//
const API_ROUTINE_PULL_WRITES = [
  /^repos\/[^/]+\/[^/]+\/pulls$/,
  /^repos\/[^/]+\/[^/]+\/pulls\/\d+$/,
  /^repos\/[^/]+\/[^/]+\/pulls\/\d+\/(requested_reviewers|comments|reviews|update-branch)$/,
  /^repos\/[^/]+\/[^/]+\/pulls\/\d+\/comments\/\d+\/replies$/,
  /^repos\/[^/]+\/[^/]+\/pulls\/\d+\/ccr\/(ready_for_review|convert_to_draft|comments\/\d+\/(un)?resolve)$/,
]
const ACTIONS_WRITE_ROUTE =
  /^(repos\/[^/]+\/[^/]+|repositories\/\d+)\/(dispatches$|actions(\/|$)|check-(suites|runs)\/[^/]+\/rerequest$)/
const GITHUB_API_URL = /^(?:https?:\/\/)?api\.github\.com(?::\d+)?(\/[^\s?#]*)/i
const GRAPHQL_RUN_WORD = /rerequest|dispatch|workflow|deployment|approve|rerun/i
const HTTP_CLIENTS = new Set(['curl', 'wget', 'http', 'https', 'xh', 'xhs'])
const CURL_VALUE_LETTERS = new Set('AbcCdDeEFHKmoPQrtTuUwxXyYz')
const GH_ALIAS = ask(
  'A gh alias can run any gh command or shell text later, so the guard cannot judge what it runs. Run the command itself.'
)
const GH_CHANGES_RUN = [
  ['workflow', 'run'],
  ['run', 'rerun'],
  ['run', 'cancel'],
  ['run', 'delete'],
]
const WORKFLOW_RUN = ask(
  'This starts, reruns, approves, cancels or deletes a GitHub Actions run, or changes another Actions resource, and a workflow such as cat-hotel deploy-prod or terraform apply-prod changes production. Approve only if Shien asked for this specific run.'
)
const HIDDEN_MERGE = /\bgh\b[\s\S]*(\bmerge\b|auto_merge)/
const PULLS_PATH = /\bpulls\//i
const PUT_WORD = /\bput\b/i
const INERT_PROGRAMS = new Set([
  'grep',
  'rg',
  'git',
  'echo',
  'printf',
  'cat',
  'jq',
  'head',
  'tail',
  'wc',
  'less',
])
const PAGE_SIZE = 100
const GH_OPTIONS = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 20000,
}
const AUTO_MERGE = deny(
  'Auto-merge is refused. GitHub merges whatever head the pull request has when its checks pass, so a push after the verifier record would merge an unverified commit. Merge by hand once the head has a verifier record (docs/agents/github-ci-cd.md).'
)
const RUN_GH_DIRECTLY =
  'Run gh pr merge as its own command with the PR number, -R owner/repo and --match-head-commit.'

export const gitHub = {
  api(path) {
    try {
      return JSON.parse(execFileSync('gh', ['api', path], GH_OPTIONS))
    } catch (error) {
      throw new Error(
        String(error.stderr || error.message)
          .trim()
          .replace(/\s*\n\s*/g, ' ')
      )
    }
  },
  originRepo(dir) {
    const url = execFileSync(
      'git',
      ['-C', dir, 'remote', 'get-url', 'origin'],
      GH_OPTIONS
    ).trim()
    return /github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(url)?.[1] ?? null
  },
}

function readPull(api, repo, number) {
  const all = (path) => {
    const items = []
    for (let page = 1; ; page += 1) {
      const batch = api(
        `repos/${repo}/${path}?per_page=${PAGE_SIZE}&page=${page}`
      )
      items.push(...batch)
      if (batch.length < PAGE_SIZE) return items
    }
  }
  return {
    headSha: api(`repos/${repo}/pulls/${number}`).head.sha,
    comments: all(`issues/${number}/comments`).map((c) => c.body ?? ''),
    files: all(`pulls/${number}/files`).flatMap((f) =>
      [f.filename, f.previous_filename].filter(Boolean)
    ),
  }
}

const verifierPassed = (pull) =>
  pull.comments.some(
    (body) =>
      VERIFIER_PASS.exec(body.split('\n')[0].trim())?.[1] === pull.headSha
  )

const distinct = (values) => [
  ...new Set(values.map((value) => value.toLowerCase())),
]

function mergeDecision(
  { repo, number, pins, addPin },
  { cwd, ghRepo, github }
) {
  if (distinct(pins).length > 1)
    return deny(
      `This merge pins more than one head commit (${pins.join(', ')}), and gh sends only one of them. Pin the verified head once.`
    )
  const pin = pins.at(-1)
  if (!number)
    return ask(
      'The guard cannot tell which pull request this merge names. Give its number, and its repo with -R owner/repo, so the guard can read the verifier record.'
    )
  if (!repo && ghRepo)
    return ask(
      'GH_REPO is set, so gh may merge a pull request in a repo other than the one this directory names. Pass -R owner/repo so the guard reads the pull request gh merges.'
    )
  if (!repo && !cwd)
    return ask(
      'The guard cannot tell which directory gh runs in (after pushd, popd, a cd in a pipeline, or a cd to a variable), so it cannot tell which repo this merge names. Pass -R owner/repo.'
    )
  let slug
  let pull
  try {
    slug = (repo ?? github.originRepo(cwd))?.toLowerCase()
    if (!slug) throw new Error(`no GitHub origin in ${cwd}`)
    pull = readPull(github.api, slug, number)
  } catch (error) {
    return ask(
      `The guard could not read pull request ${repo ?? cwd}#${number} from GitHub (${error.message}), so it cannot confirm a verifier PASS at the head commit. Approve only after you check the record yourself.`
    )
  }
  if (!verifierPassed(pull))
    return deny(
      `${slug}#${number} has no verifier record for its head commit ${pull.headSha}. Merge only after a fresh non-author verifier passes at that commit and the root posts a pull request comment whose first line is "VERIFIER PASS ${pull.headSha}" (docs/agents/github-ci-cd.md).`
    )
  if (pin?.toLowerCase() !== pull.headSha)
    return deny(
      `${slug}#${number} is verified at ${pull.headSha}, but this merge ${pin ? `pins ${pin}` : 'pins no head commit'}, so a push after the check could merge an unverified commit. Add ${addPin(pull.headSha)}.`
    )
  if (
    slug === TERRAFORM &&
    pull.files.some((f) => TERRAFORM_PROD_PATHS.some((p) => f.startsWith(p)))
  )
    return prodWrite(
      `Merging ${slug}#${number} changes .github/workflows/, and a workflow change can make a merge apply production. Read the workflow diff first.`
    )
  return allow
}

function shortCluster(arg, next) {
  const parts = []
  for (let at = 1; at < arg.length; at += 1) {
    const letter = arg[at]
    parts.push(`-${letter}`)
    if (GH_SHORT_VALUE_FLAGS.has(letter)) {
      const inline = arg.slice(at + 1).replace(/^=/, '')
      if (inline) return { parts: [...parts, inline], usesNext: false }
      return { parts: [...parts, ...next], usesNext: next.length > 0 }
    }
    if (!GH_SHORT_BOOLEAN_FLAGS.has(letter))
      return { parts: [arg], usesNext: false }
  }
  return { parts, usesNext: false }
}

function expandGhShortFlags(args) {
  const out = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--') {
      out.push(...args.slice(i))
      break
    }
    if (/^-[^-]/.test(arg)) {
      const { parts, usesNext } = shortCluster(arg, args.slice(i + 1, i + 2))
      out.push(...parts)
      if (usesNext) i += 1
    } else {
      out.push(arg)
      const longValue =
        arg.startsWith('--') &&
        !arg.includes('=') &&
        !GH_LONG_BOOLEAN_FLAGS.has(arg)
      if (longValue && i + 1 < args.length) out.push(args[++i])
    }
  }
  return out
}

function ghCommandWord(args, from) {
  for (let i = from; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--') return -1
    if (!arg.startsWith('-')) return i
    const boolean = arg.startsWith('--')
      ? GH_LONG_BOOLEAN_FLAGS.has(arg)
      : GH_SHORT_BOOLEAN_FLAGS.has(arg[1])
    if (!arg.includes('=') && !boolean) i += 1
  }
  return -1
}

const without = (args, ...indexes) =>
  args.filter((_, index) => !indexes.includes(index))

const GH_PR_MERGE_SHORT = {
  b: 'body',
  F: 'body-file',
  t: 'subject',
  A: 'author-email',
  R: 'repo',
  d: 'delete-branch',
  m: 'merge',
  r: 'rebase',
  s: 'squash',
  h: 'help',
}
const GH_PR_MERGE_VALUE_NAMES = new Set([
  'body',
  'body-file',
  'subject',
  'author-email',
  'match-head-commit',
  'repo',
])

function parseMergeArgs(args) {
  const flags = new Map()
  const positionals = []
  const add = (name, value) =>
    flags.set(name, [...(flags.get(name) ?? []), value])
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--') {
      positionals.push(...args.slice(i + 1))
      break
    }
    const long = /^--([^=]+)(?:=([\s\S]*))?$/.exec(arg)
    const short = /^-([^-])$/.exec(arg)
    const name = long?.[1] ?? GH_PR_MERGE_SHORT[short?.[1]] ?? short?.[1]
    if (!long && !short) positionals.push(arg)
    else if (GH_PR_MERGE_VALUE_NAMES.has(name))
      add(name, long?.[2] ?? args[++i] ?? '')
    else add(name, long?.[2] ?? null)
  }
  return { flags, positionals }
}

const flagOn = (values = []) =>
  values.some((value) => value === null || !PFLAG_FALSE.has(value))

function ghPrMergeDecision(args, context) {
  context.seen.merge = true
  const { flags, positionals } = parseMergeArgs(args)
  if (flagOn(flags.get('auto'))) return AUTO_MERGE
  if (flagOn(flags.get('disable-auto'))) return allow
  const unread = args.filter((word) => /[$`]|\{[^}]*,[^}]*\}/.test(word))
  const repos = flags.get('repo') ?? []
  if (distinct(repos).length > 1)
    return deny(
      `This merge names more than one repo (${repos.join(', ')}), and gh uses only one of them. Pass -R owner/repo once.`
    )
  const selector = positionals[0] ?? ''
  const url = PR_URL.exec(selector)
  const number = /^#?(\d+)$/.exec(selector)?.[1]
  const repo = repos.at(-1)?.split('/').slice(-2).join('/') ?? null
  return combine([
    unread.length > 0 &&
      ask(
        `This merge has words the shell fills in later (${unread.join(' ')}), so the guard cannot tell whether they turn on auto-merge or change the pin. ${RUN_GH_DIRECTLY}`
      ),
    mergeDecision(
      {
        repo: url?.[1] ?? repo,
        number: Number(url?.[2] ?? number) || null,
        pins: flags.get('match-head-commit') ?? [],
        addPin: (sha) => `--match-head-commit ${sha}`,
      },
      context
    ),
  ])
}

function apiFields(args) {
  const values = []
  for (let i = 0; i < args.length; i += 1) {
    if (GH_API_FIELD_FLAGS.has(args[i])) {
      values.push(args[i + 1] ?? '')
      i += 1
    } else {
      const inline = /^(?:-[fF]|--(?:raw-)?field=)(.+)$/.exec(args[i])?.[1]
      if (inline) values.push(inline)
    }
  }
  return values
}

function apiEndpoints(args) {
  const words = []
  for (let i = 0; i < args.length; i += 1) {
    if (!args[i].startsWith('-')) words.push(args[i])
    else if (GH_API_VALUE_FLAGS.has(args[i])) i += 1
  }
  return words
}

function apiRoute(endpoint) {
  let path
  try {
    path = decodeURIComponent(endpoint)
  } catch {
    return null
  }
  const parts = []
  for (const part of path
    .replace(/[?#][\s\S]*$/, '')
    .replace(/^[a-z]+:\/\/[^/]*/i, '')
    .toLowerCase()
    .split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  if (parts[0] === 'api' && parts[1] === 'v3') parts.splice(0, 2)
  return parts.join('/')
}

function apiMethods(args, fields) {
  const overridden = flagValues(args, '--header', '-H').some((header) =>
    /^\s*x-http-method-override\s*:/i.test(header)
  )
  const methods = flagValues(args, '--method', '-X').map((m) => m.toUpperCase())
  if (methods.length) return { overridden, methods }
  const sendsBody = fields.length > 0 || flagValues(args, '--input').length > 0
  return { overridden, methods: [sendsBody ? 'POST' : 'GET'] }
}

function graphqlUnread(args, fields) {
  return (
    flagValues(args, '--input').length > 0 ||
    fields.some((field) => /[$`]|^@/.test(field.slice(field.indexOf('=') + 1)))
  )
}

function ghApiDecision(args, context) {
  const fields = apiFields(args)
  const { overridden, methods } = apiMethods(args, fields)
  if (!overridden && methods.every((method) => READ_METHODS.has(method)))
    return allow
  const endpoints = apiEndpoints(args)
  if (endpoints.some((endpoint) => UNKNOWN_WORD.test(endpoint)))
    return ask(
      `This gh api write names an endpoint the shell fills in later (${endpoints.join(' ')}), so the guard cannot tell whether it merges. Write the path out, or ${RUN_GH_DIRECTLY}`
    )
  const routes = endpoints.map(apiRoute)
  if (routes.some((route) => route !== null && ACTIONS_WRITE_ROUTE.test(route)))
    return WORKFLOW_RUN
  const target = routes
    .map((route) => route !== null && API_MERGE_ROUTE.exec(route))
    .find(Boolean)
  const mutation = /\bmutation\b/i.test(fields.join(' '))
  if (routes.includes('graphql') && mutation && GRAPHQL_RUN_WORD.test(fields.join(' ')))
    return WORKFLOW_RUN
  if (routes.includes('graphql'))
    return graphqlUnread(args, fields) ||
      (/\bmutation\b/i.test(fields.join(' ')) &&
        /merge/i.test(fields.join(' ')))
      ? ask(
          `This GraphQL write may merge or enable auto-merge, and the guard cannot read which pull request it names. ${RUN_GH_DIRECTLY}`
        )
      : allow
  if (!target) {
    const unmatched = (route) =>
      route === null ||
      (API_GUARDED_ROUTE.test(route) &&
        !API_ROUTINE_PULL_WRITES.some((routine) => routine.test(route)))
    if (routes.some(unmatched))
      return ask(
        `This gh api write names a pull request, merge or repositories path that the guard cannot match to repos/<owner>/<repo>/pulls/<n>/merge (${apiEndpoints(args).join(' ')}), so it cannot read the verifier record. Use the plain repos/<owner>/<repo>/pulls/<n>/merge path, or ${RUN_GH_DIRECTLY}`
      )
    return allow
  }
  context.seen.merge = true
  const [, repo, number, action] = target
  if (action === 'ccr/auto_merge')
    return !overridden && methods.every((method) => method === 'DELETE')
      ? allow
      : AUTO_MERGE
  if (flagValues(args, '--input').length)
    return deny(
      'This merge reads its body from --input, which the guard cannot read, and gh then sends -f fields as query parameters. Pass the body as -f sha=<verified head> instead.'
    )
  return mergeDecision(
    {
      repo: repo === '{owner}/{repo}' ? null : repo,
      number: Number(number),
      pins: fields
        .filter((field) => field.startsWith('sha='))
        .map((field) => field.slice(4)),
      addPin: (sha) => `-f sha=${sha}`,
    },
    context
  )
}

const UNKNOWN_WORD = /[$`]/
const UNKNOWN_SUBCOMMAND = ask(
  `A gh subcommand here comes from a variable or a substitution, so the guard cannot tell whether it merges. ${RUN_GH_DIRECTLY}`
)

function ghDecision(rawArgs, context) {
  const args = expandGhShortFlags(rawArgs)
  const first = ghCommandWord(args, 0)
  if (UNKNOWN_WORD.test(args[first] ?? '')) return UNKNOWN_SUBCOMMAND
  if (args[first] === 'api') return ghApiDecision(without(args, first), context)
  if (!['pr', 'workflow', 'run', 'alias'].includes(args[first])) return allow
  const second = ghCommandWord(args, first + 1)
  if (UNKNOWN_WORD.test(args[second] ?? '')) return UNKNOWN_SUBCOMMAND
  if (args[first] === 'alias' && ['set', 'import'].includes(args[second]))
    return GH_ALIAS
  const changesRun = GH_CHANGES_RUN.some(
    ([group, verb]) => args[first] === group && args[second] === verb
  )
  if (changesRun) return WORKFLOW_RUN
  if (args[first] !== 'pr' || args[second] !== 'merge') return allow
  return ghPrMergeDecision(without(args, first, second), context)
}

function substitutedMerge(segment) {
  const backtick = segment.replace(/'[^']*'/g, '').includes('`')
  return backtick && HIDDEN_MERGE.test(segment)
    ? ask(
        `This command runs a gh merge inside backticks, so the guard cannot read which pull request it merges. ${RUN_GH_DIRECTLY}`
      )
    : allow
}

function gitRunsString(args, words) {
  const runs =
    args.some(
      (arg) =>
        /^-c/.test(arg) ||
        /^--config-env/.test(arg) ||
        /^--exec(=|$)/.test(arg) ||
        arg === '-x'
    ) ||
    (args.includes('bisect') && args.includes('run')) ||
    args.includes('foreach')
  return runs && HIDDEN_MERGE.test(words)
    ? ask(
        `This git command runs a string (-c, --config-env, --exec, bisect run or submodule foreach) that holds a gh merge, so the guard cannot read which pull request it merges. ${RUN_GH_DIRECTLY}`
      )
    : allow
}

function curlOptions(args) {
  const options = { methods: flagValues(args, '--request'), data: false, upload: false }
  args.forEach((arg, i) => {
    if (/^--(data|json|form|config)/.test(arg)) options.data = true
    if (/^--upload-file(=|$)/.test(arg)) options.upload = true
    if (!/^-[^-]/.test(arg)) return
    for (let at = 1; at < arg.length; at += 1) {
      const letter = arg[at]
      if (!CURL_VALUE_LETTERS.has(letter)) continue
      if (letter === 'X') options.methods.push(arg.slice(at + 1) || (args[i + 1] ?? ''))
      if ('dFK'.includes(letter)) options.data = true
      if (letter === 'T') options.upload = true
      return
    }
  })
  return options
}

const curlMethods = (args) => curlOptions(args).methods

function httpWrites(name, args) {
  const writesMethod = (method) => !READ_METHODS.has(method.toUpperCase())
  if (name === 'curl') {
    const { methods, data, upload } = curlOptions(args)
    return data || upload || methods.some(writesMethod)
  }
  if (name === 'wget')
    return (
      args.some((arg) =>
        /^(--(post|body)-(data|file)|--execute|-e)(=|$)/.test(arg)
      ) || flagValues(args, '--method').some(writesMethod)
    )
  const words = args.filter((arg) => !arg.startsWith('-'))
  const method = /^[A-Za-z]+$/.test(words[0] ?? '') ? words[0] : null
  return (
    (method !== null && writesMethod(method)) ||
    args.some((arg) => /^(--form|-f|--raw|--multipart)(=|$)/.test(arg)) ||
    words.some((word) => /^[^=:@/]+(:=|=(?!=)|@)/.test(word))
  )
}

function githubRunTarget(args) {
  return args.some((arg) => {
    const path = GITHUB_API_URL.exec(arg)?.[1]
    if (path === undefined) return false
    if (path.includes('%')) return true
    const route = apiRoute(path)
    return route === null || ACTIONS_WRITE_ROUTE.test(route)
  })
}

function curlPut(args) {
  return (
    curlMethods(args).some((method) => method.toUpperCase() === 'PUT') ||
    args.some((arg) => /^(-T|--upload-file(=|$))/.test(arg))
  )
}

const mentionsGhMerge = (text) =>
  /\bgh\b/.test(text) && /\bmerge\b|auto_merge/.test(text)

function assignedMerge(env) {
  const hidden = Object.entries(env).filter(([, value]) =>
    mentionsGhMerge(value)
  )
  return hidden.length
    ? ask(
        `This command sets ${hidden.map(([name]) => name).join(', ')} to a string that holds a gh merge, and a program may run it. ${RUN_GH_DIRECTLY}`
      )
    : allow
}

function shellFedMerge(command, seen) {
  const items = split(command)
  const visible = tokens(items.map((item) => item.text ?? '').join('\n'))
  const consumer = items.some(
    (item) =>
      item.kind === 'segment' &&
      STRING_CONSUMERS.has(program(tokens(item.text)).name)
  )
  return consumer && !seen.merge && mentionsGhMerge(visible.join(' '))
    ? ask(
        `This command hands text that names a gh merge to a shell, eval or xargs, so the guard cannot read which pull request it merges. ${RUN_GH_DIRECTLY}`
      )
    : allow
}

function wrappedMerge(words, name) {
  if (name === 'gh' || INERT_PROGRAMS.has(name)) return allow
  const hidden =
    HIDDEN_MERGE.test(words) ||
    (UNKNOWN_WORD.test(name) && /merge/i.test(words)) ||
    (PULLS_PATH.test(words) && PUT_WORD.test(words))
  return hidden
    ? ask(
        `This command may run gh or a GitHub merge call through ${name ? `\`${name}\`` : 'a wrapper'}, so the guard cannot read which pull request it merges. ${RUN_GH_DIRECTLY}`
      )
    : allow
}

function readsStdin(item) {
  if (item.kind !== 'segment') return false
  const { name, args } = program(tokens(item.text))
  if (STDIN_RUNNERS.has(name)) return nestedCommands(name, args) === null
  if (SOURCES.has(name)) return args[0] === '<' || STDIN_FILES.has(args[0])
  if (!SHELLS.has(name) || nestedCommands(name, args) !== null) return false
  const { readsStdin: stdinFlag, operand } = shellOptions(args)
  const file = args[operand]
  return (
    stdinFlag ||
    file === undefined ||
    file === '<' ||
    file === '-' ||
    STDIN_FILES.has(file)
  )
}

function stdinShell(items, command) {
  return items.some(readsStdin) && /merge|pulls/i.test(command)
    ? ask(
        `This command feeds text that mentions a gh merge into a shell, so the guard cannot read which pull request it merges. ${RUN_GH_DIRECTLY}`
      )
    : allow
}

function shellFedText(items) {
  if (!items.some(readsStdin)) return []
  return items.flatMap((item) => {
    if (item.kind === 'data') return [item.text]
    if (item.kind !== 'segment' || readsStdin(item)) return []
    return wordSuffixes(tokens(item.text))
  })
}

function literalValues(code, word, [pattern, first], requests) {
  const values = []
  for (const at of code.matchAll(new RegExp(word, 'gi'))) {
    const literal = pattern.exec(code.slice(Math.max(0, at.index - 1)))
    if (!literal) return null
    values.push(literal.slice(first).find((value) => value !== undefined))
  }
  return values.length < requests ? null : values
}

function requestShape(code) {
  if (typeof code !== 'string') return null
  if (OPAQUE_CODE.some((pattern) => pattern.test(code))) return null
  const requests = code.match(/\bcloudflare\b/g)?.length ?? 0
  const plainRequests = code.match(/\bcloudflare\.request\(/g)?.length ?? 0
  if (requests !== plainRequests) return null
  const opened = code.match(REQUEST_OPENS_WITH_METHOD)?.length ?? 0
  return {
    methods:
      opened === requests
        ? literalValues(code, 'method', [LITERAL_METHOD, 3], requests)
        : null,
    paths: literalValues(code, 'path', [LITERAL_PATH, 2], requests),
    accountOnlyInPaths: ['accountId', 'account_id'].every(
      (name) =>
        code.split(name).length === code.split(`\${${name}}`).length
    ),
  }
}

const DEV_ACCOUNT_SEGMENTS = new Set([
  '${accountId}',
  '${account_id}',
  ACCOUNTS.dev,
])

function devPath(path) {
  if (!path.startsWith('/') || /\.\.|%|\\|\/\/|\s/.test(path)) return false
  const interpolations = path.match(/\$\{[^}]*\}?/g) ?? []
  if (interpolations.some((part) => !DEV_ACCOUNT_SEGMENTS.has(part)))
    return false
  const [, root, account] = path.split('/')
  return root.toLowerCase() === 'accounts' && DEV_ACCOUNT_SEGMENTS.has(account)
}

function decideCloudflareWrite(accountId, code, shape) {
  if (ZONE_PATH.test(code))
    return prodWrite(
      'This Cloudflare write changes a zone, and zones serve production traffic. For a route change, edit the Worker wrangler.jsonc and ship it through main.'
    )
  if (accountId === ACCOUNTS.prod || String(code).includes(ACCOUNTS.prod))
    return prodWrite(
      `This Cloudflare write changes the production account Catati (${ACCOUNTS.prod}). Only a call whose every method is a literal 'GET' passes there. For dev, use account_id ${ACCOUNTS.dev} (catati-dev) and dev resource ids.`
    )
  if (accountId !== ACCOUNTS.dev)
    return ask(
      `This Cloudflare write names no known account. Pass account_id ${ACCOUNTS.dev} (catati-dev) so the guard can confirm it targets dev.`
    )
  if (shape?.accountOnlyInPaths && shape.paths?.every(devPath)) return allow
  return ask(
    `This catati-dev call writes through a path the guard cannot read, or one that names another account. Write each path as a literal or a template whose only part filled in is \${accountId}, under /accounts/\${accountId}/ or /accounts/${ACCOUNTS.dev}/.`
  )
}

const KEYWORDS = new Set([
  'do',
  'then',
  'else',
  'elif',
  'if',
  'while',
  'until',
  '{',
  '!',
])
const WRANGLER_BOOLEAN_FLAGS = new Set([
  '--remote',
  '--local',
  '--dry-run',
  '--help',
  '--version',
  '--json',
  '--yes',
  '-y',
  '-v',
  '--preview',
  '--minify',
  '--keep-vars',
])
const WRANGLER_VALUE_FLAGS = new Set([
  '--env',
  '-e',
  '--config',
  '-c',
  '--cwd',
  '--name',
  '--command',
  '--file',
  '--output',
  '--message',
  '--tag',
  '--var',
  '--define',
  '--compatibility-date',
  '--compatibility-flags',
  '--persist-to',
  '--port',
  '--ip',
  '--format',
  '--search',
  '--status',
  '--header',
  '--method',
  '--sampling-rate',
  '--binding',
  '--database',
  '--account-id',
  '--log-level',
])
const LOCAL_GROUPS = new Set(['d1', 'kv', 'r2'])
const RUNNERS = new Set(['pnpm', 'yarn', 'npm', 'bun', 'npx', 'pnpx', 'bunx'])
const RUNNER_VERBS = new Set(['exec', 'dlx', 'x'])
const VALUE_FLAGS = new Set([
  '--dir',
  '-C',
  '--filter',
  '-F',
  '--prefix',
  '-p',
  '--package',
  '--cwd',
])
const PREFIX_VALUE_FLAGS = new Map([
  ['sudo', ['-u', '-g', '-C', '-D', '-p', '-U', '-r', '-t']],
  ['env', ['-u', '--unset', '-C', '--chdir']],
  ['timeout', ['-s', '--signal', '-k', '--kill-after']],
  ['nice', ['-n', '--adjustment']],
  ['stdbuf', ['-i', '-o', '-e', '--input', '--output', '--error']],
  ['exec', ['-a']],
  ['time', ['-f', '--format', '-o', '--output']],
  ['nohup', []],
  ['command', []],
  ['builtin', []],
])
const PREFIX_LONG_VALUE_FLAGS = new Set([
  '--user',
  '--group',
  '--chdir',
  '--prompt',
  '--host',
  '--role',
  '--type',
  '--close-from',
  '--chroot',
  '--other-user',
  '--signal',
  '--kill-after',
  '--adjustment',
  '--unset',
  '--input',
  '--output',
  '--error',
  '--format',
])

function prefixFlagWidth(flag, valueFlags) {
  if (valueFlags.includes(flag)) return 2
  if (flag.startsWith('--'))
    return PREFIX_LONG_VALUE_FLAGS.has(flag) ? 2 : 1
  for (let at = 1; at < flag.length; at += 1)
    if (valueFlags.includes(`-${flag[at]}`)) return at === flag.length - 1 ? 2 : 1
  return 1
}
const ENV_SPLIT_STRING = /^(?:-S|--split-string)=?(.*)$/
const WATCH_VALUE_FLAGS = new Set(['-n', '--interval', '-q', '--equexit'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh'])
const INTERPRETER = /^(python[\d.]*|node|nodejs|deno|perl|ruby|php)$/
const STRING_LITERAL = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`/g
const STRING_CONSUMERS = new Set([...SHELLS, 'eval', 'source', '.', 'xargs'])
const SHELL_LONG_VALUE_FLAGS = new Set(['--rcfile', '--init-file'])
const OPAQUE_WRAPPERS = new Set([
  'xargs',
  'doas',
  'caffeinate',
  'script',
  'ssh',
  'docker',
  'podman',
  'su',
  'runuser',
  'sg',
  'busybox',
  'setsid',
  'ionice',
  'chrt',
  'taskset',
  'flock',
  'find',
  'tmux',
  'screen',
  'strace',
  'ltrace',
  'chroot',
  'unshare',
  'nsenter',
  'parallel',
  'unbuffer',
  'gtimeout',
  'kubectl',
  'trap',
  'coproc',
])
const STDIN_RUNNERS = new Set(['at', 'batch'])
const SOURCES = new Set(['source', '.'])
const STDIN_FILES = new Set(['/dev/stdin', '/dev/fd/0', '/proc/self/fd/0'])
const UNREADABLE_PROGRAM = /[$`*?{}]|\[.*\]/
const WRANGLER_READS = [
  'dev',
  'types',
  'whoami',
  'login',
  'logout',
  'tail',
  'docs',
  'check',
  'deployments list',
  'deployments view',
  'deployments status',
  'versions list',
  'versions view',
  'secret list',
  'd1 list',
  'd1 info',
  'd1 export',
  'd1 migrations list',
  'd1 time-travel info',
  'kv namespace list',
  'kv key list',
  'kv key get',
  'r2 bucket list',
  'r2 bucket info',
  'r2 object get',
  'queues list',
  'queues info',
  'workflows list',
  'workflows describe',
  'workflows instances list',
  'workflows instances describe',
  'pages project list',
  'pages deployment list',
].map((command) => command.split(' '))
const SHOPIFY_WRITES =
  /^(app |theme )?(deploy|release|push|publish|execute|import|delete|rollback|versions? (release|deploy))\b/

const HEREDOC_READERS = new Set([...SHELLS, 'eval', 'source', '.'])
const HEREDOC_DELIMITER = /^(?:'[^']*'|"[^"]*"|\\.|[^\s;&|()<>])+/

function heredocBody(text, from, { delimiter, strip }) {
  const lines = []
  let at = from
  while (at < text.length) {
    const stop = text.indexOf('\n', at)
    const line = text.slice(at, stop === -1 ? text.length : stop)
    at = stop === -1 ? text.length : stop + 1
    if ((strip ? line.replace(/^\t+/, '') : line) === delimiter)
      return { body: lines.join('\n'), next: at }
    lines.push(line)
  }
  return null
}

const REDIRECTION =
  /\d*(?:<<<|<<-?|>>|[<>]&|&>|[<>])\s*(?:'[^']*'|"[^"]*"|[^\s;&|()<>]+)?/g

function heredocReader(segment) {
  return program(tokens(segment.replace(REDIRECTION, ' '))).name
}

function bodySubstitutions(body) {
  const items = []
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '\\') i += 1
    else if (body[i] === '$' && body[i + 1] === '(') {
      const inner = scan(body, i + 2, true)
      items.push({ kind: 'substitution', text: body.slice(i + 2, inner.end) })
      i = inner.end
    } else if (body[i] === '`') {
      const close = body.indexOf('`', i + 1)
      const end = close === -1 ? body.length : close
      items.push({ kind: 'substitution', text: body.slice(i + 1, end) })
      i = end
    }
  }
  return items
}

function heredocItems({ reader, quoted }, body) {
  if (HEREDOC_READERS.has(reader)) return [{ kind: 'substitution', text: body }]
  const interpreted = INTERPRETER.test(reader ?? '')
    ? stringLiterals(body).map((text) => ({ kind: 'guess', text }))
    : []
  const data = { kind: 'data', text: body }
  const substitutions = quoted ? [] : bodySubstitutions(body)
  if (!INERT_PROGRAMS.has(reader))
    return [
      data,
      { kind: 'verdict', result: wrappedMerge(body, reader) },
      ...substitutions,
      ...interpreted,
    ]
  return [data, ...substitutions]
}

function scan(text, from, nested) {
  const items = []
  let current = ''
  let quote = null
  let before = null
  let depth = 0
  let heredocs = []
  const flush = (operator) => {
    const segment = current.trim()
    for (const heredoc of heredocs) heredoc.reader ??= heredocReader(segment)
    if (segment)
      items.push({
        kind: 'segment',
        text: segment,
        subshell: before === '|' || operator === '|' || operator === '&',
      })
    current = ''
    before = operator
  }
  let i = from
  while (i < text.length) {
    const ch = text[i]
    if (quote === "'") {
      if (ch === "'") quote = null
      current += ch
      i += 1
    } else if (ch === '\\') {
      current += text.slice(i, i + 2)
      i += 2
    } else if (
      !quote &&
      ch === '#' &&
      (i === from || /[\s;&|()]/.test(text[i - 1]))
    ) {
      const stop = text.indexOf('\n', i)
      i = stop === -1 ? text.length : stop
    } else if (!quote && ch === '$' && text[i + 1] === "'") {
      const close = ansiQuoteEnd(text, i + 2)
      current += text.slice(i, close + 1)
      i = close + 1
    } else if (ch === '$' && text[i + 1] === '(') {
      const inner = scan(text, i + 2, true)
      items.push({ kind: 'substitution', text: text.slice(i + 2, inner.end) })
      current += '$(…)'
      i = inner.end + 1
    } else if (ch === '`') {
      const end = backtickEnd(text, i + 1)
      items.push({ kind: 'substitution', text: text.slice(i + 1, end) })
      current += text.slice(i, end + 1)
      i = end + 1
    } else if (quote) {
      if (ch === quote) quote = null
      current += ch
      i += 1
    } else if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
      i += 1
    } else if (text.startsWith('<<<', i)) {
      current += '<<<'
      i += 3
    } else if (text.startsWith('<<', i)) {
      let at = i + 2
      const strip = text[at] === '-'
      if (strip) at += 1
      while (text[at] === ' ' || text[at] === '\t') at += 1
      const word = HEREDOC_DELIMITER.exec(text.slice(at))?.[0] ?? ''
      heredocs.push({
        delimiter: word.replace(/['"\\]/g, ''),
        quoted: /['"\\]/.test(word),
        strip,
        reader: null,
      })
      current += text.slice(i, at + word.length)
      i = at + word.length
    } else if (ch === '\n' && heredocs.length) {
      flush('\n')
      i += 1
      for (const heredoc of heredocs) {
        const found = heredocBody(text, i, heredoc)
        if (!found) continue
        items.push(...heredocItems(heredoc, found.body))
        i = found.next
      }
      heredocs = []
    } else if (ch === '(') {
      flush(ch)
      items.push({ kind: ch })
      depth += 1
      i += 1
    } else if (ch === ')') {
      if (nested && depth === 0) {
        flush(null)
        return { items, end: i }
      }
      flush(ch)
      items.push({ kind: ch })
      depth -= 1
      i += 1
    } else if (ch === '&' && (/[<>]$/.test(current) || text[i + 1] === '>')) {
      current += ch
      i += 1
    } else if (';&|\n'.includes(ch)) {
      const doubled = ch !== ';' && ch !== '\n' && text[i + 1] === ch
      flush(doubled ? ch + ch : ch)
      i += doubled ? 2 : 1
    } else {
      current += ch
      i += 1
    }
  }
  flush(null)
  return { items, end: text.length }
}

function backtickEnd(text, from) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1
    else if (text[i] === '`') return i
  }
  return text.length
}

function ansiQuoteEnd(text, from) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1
    else if (text[i] === "'") return i
  }
  return text.length
}

export function split(command) {
  return scan(command.replace(/\\\r?\n/g, ''), 0, false).items
}

export class UnreadableWord extends Error {}

const ANSI_SIMPLE = {
  a: '\x07',
  b: '\b',
  e: '\x1b',
  E: '\x1b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '?': '?',
}
const ANSI_NUMERIC = [
  { lead: /^[0-7]{1,3}/, base: 8, max: 0x7f, skip: 0 },
  { lead: /^x[0-9a-fA-F]{1,2}/, base: 16, max: 0x7f, skip: 1 },
  { lead: /^u[0-9a-fA-F]{1,4}/, base: 16, max: 0x10ffff, skip: 1 },
  { lead: /^U[0-9a-fA-F]{1,8}/, base: 16, max: 0x10ffff, skip: 1 },
]

function ansiCharacter(code, escape) {
  const surrogate = code >= 0xd800 && code <= 0xdfff
  if (code === 0 || surrogate)
    throw new UnreadableWord(`$'…' escape ${escape} does not decode to text`)
  return String.fromCodePoint(code)
}

function ansiEscape(text, at) {
  const rest = text.slice(at + 1)
  const letter = rest[0] ?? ''
  if (Object.hasOwn(ANSI_SIMPLE, letter))
    return { text: ANSI_SIMPLE[letter], next: at + 2 }
  for (const { lead, base, max, skip } of ANSI_NUMERIC) {
    const digits = lead.exec(rest)?.[0]
    if (!digits) continue
    const code = parseInt(digits.slice(skip), base)
    if (code > max)
      throw new UnreadableWord(`$'…' escape \\${digits} is not ASCII text`)
    return {
      text: ansiCharacter(code, `\\${digits}`),
      next: at + 1 + digits.length,
    }
  }
  if (letter === 'c') {
    const control = rest[1] ?? ''
    if (!/^[\x20-\x7e]$/.test(control) || control === '\\')
      throw new UnreadableWord(`$'…' escape \\c${control} has no fixed value`)
    const code = control === '?' ? 0x7f : control.toUpperCase().charCodeAt(0) & 0x1f
    return { text: ansiCharacter(code, `\\c${control}`), next: at + 3 }
  }
  return { text: `\\${letter}`, next: at + 1 + letter.length }
}

function tokens(segment) {
  const words = []
  let word = null
  let quote = null
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i]
    if (quote === "'") {
      if (ch === "'") quote = null
      else word += ch
    } else if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '\\' && '$`"\\'.includes(segment[i + 1] ?? '')) {
        word += segment[i + 1]
        i += 1
      } else word += ch
    } else if (quote === '$') {
      if (ch === "'") quote = null
      else if (ch === '\\') {
        const escape = ansiEscape(segment, i)
        word += escape.text
        i = escape.next - 1
      } else word += ch
    } else if (/\s/.test(ch)) {
      if (word !== null) words.push(word)
      word = null
    } else if (ch === '#' && word === null) break
    else {
      word ??= ''
      if (ch === '$' && segment[i + 1] === "'") {
        quote = '$'
        i += 1
      } else if (ch === "'" || ch === '"') quote = ch
      else if (ch === '\\') {
        word += segment[i + 1] ?? ''
        i += 1
      } else word += ch
    }
  }
  if (word !== null) words.push(word)
  return words
}

function program(input) {
  const words = [...input]
  const env = {}
  let i = 0
  while (i < words.length) {
    const word = words[i]
    const base = word.replace(/^\\/, '').split('/').pop()
    const assignment = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(word)
    if (assignment) {
      env[assignment[1]] = assignment[2]
      i += 1
    } else if (KEYWORDS.has(word)) i += 1
    else if (PREFIX_VALUE_FLAGS.has(base)) {
      const valueFlags = PREFIX_VALUE_FLAGS.get(base)
      i += 1
      while (i < words.length && words[i].startsWith('-')) {
        const splitString = base === 'env' && ENV_SPLIT_STRING.exec(words[i])
        if (splitString) {
          const inline = splitString[1]
          words.splice(
            i,
            inline ? 1 : 2,
            ...tokens(inline || (words[i + 1] ?? ''))
          )
          break
        }
        i += prefixFlagWidth(words[i], valueFlags)
      }
      if (base === 'timeout') i += 1
    } else if (base === 'corepack') i += 1
    else if (RUNNERS.has(base.replace(/@.*$/, ''))) {
      i += 1
      while (i < words.length) {
        const next = words[i]
        if (VALUE_FLAGS.has(next)) i += 2
        else if (next.startsWith('-') || RUNNER_VERBS.has(next)) i += 1
        else break
      }
    } else break
  }
  const raw = (words[i] ?? '').replace(/^\\/, '')
  const name = raw.startsWith('@shopify/cli')
    ? 'shopify'
    : raw.split('/').pop().replace(/@.*$/, '')
  return { env, raw, name, args: words.slice(i + 1) }
}

function flagValues(args, long, short) {
  const values = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === long || arg === short) {
      values.push(args[i + 1] ?? '')
      i += 1
    } else if (arg.startsWith(`${long}=`))
      values.push(arg.slice(long.length + 1))
    else if (
      short &&
      !arg.startsWith('--') &&
      arg.startsWith(short) &&
      arg.length > short.length
    )
      values.push(arg.slice(short.length).replace(/^=/, ''))
  }
  return values
}

function flagValue(args, long, short) {
  return flagValues(args, long, short)[0] ?? null
}

function positionals(args, unknownTakesValue) {
  const words = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith('-')) words.push(arg)
    else if (arg.includes('=') || WRANGLER_BOOLEAN_FLAGS.has(arg)) continue
    else if (unknownTakesValue || WRANGLER_VALUE_FLAGS.has(arg)) i += 1
  }
  return words
}

const startsWith = (words, prefix) =>
  prefix.every((word, index) => words[index] === word)

function wranglerReadOnly(args) {
  return [true, false].every((unknownTakesValue) =>
    wranglerReadsWith(args, positionals(args, unknownTakesValue))
  )
}

function wranglerReadsWith(args, words) {
  if (['--dry-run', '--help', '--version', '-v'].some((f) => args.includes(f)))
    return true
  if (
    LOCAL_GROUPS.has(words[0]) &&
    args.includes('--local') &&
    !args.includes('--remote')
  )
    return true
  if (words.length === 0) return true
  if (WRANGLER_READS.some((prefix) => startsWith(words, prefix))) return true
  const commands = flagValues(args, '--command')
  return (
    startsWith(words, ['d1', 'execute']) &&
    !args.some((arg) => /^--file(=|$)/i.test(arg)) &&
    commands.length > 0 &&
    commands.every(isPlainSqlRead)
  )
}

const SQL_READ_START = /^\s*(select|explain|with)\b/i
const SQL_WRITE_WORD =
  /\b(insert|update|delete|replace|upsert|drop|alter|create|attach|detach|vacuum|reindex|pragma|analyze|begin|commit|rollback|savepoint|release|returning|load_extension)\b/i

function isPlainSqlRead(sql) {
  return (
    /^[\x20-\x7e]*$/.test(sql) &&
    !/;|--|\/\*|\\/.test(sql) &&
    SQL_READ_START.test(sql) &&
    !SQL_WRITE_WORD.test(sql)
  )
}

function wranglerDecision(args, env) {
  if (wranglerReadOnly(args)) return allow
  const target = flagValue(args, '--env', '-e') ?? env.CLOUDFLARE_ENV ?? ''
  if (target === 'dev') return allow
  if (target === '')
    return prodWrite(
      'This Wrangler command has no --env, so a frontend resolves to its top-level config, which is the production Worker. For dev, use --env dev.'
    )
  return prodWrite(
    `This Wrangler command writes outside dev (--env ${target}). For dev, use --env dev. The deploy-prod job is the usual path for a prod deploy.`
  )
}

function shopifyDecision(args) {
  const words = args.filter((arg) => !arg.startsWith('-')).join(' ')
  if (!SHOPIFY_WRITES.test(words)) return allow
  const config = (flagValue(args, '--config', '-c') ?? '')
    .split('/')
    .pop()
    .replace(/^shopify\.app\.|\.toml$/g, '')
  if (config === 'dev') return allow
  return prodWrite(
    'This Shopify command can change the production app or store. For dev, pass --config dev.'
  )
}

function shellOptions(args) {
  const options = { readsString: false, readsStdin: false }
  let i = 0
  while (i < args.length && /^[-+]/.test(args[i]) && args[i] !== '--') {
    const arg = args[i]
    i += 1
    if (arg === '-') return { ...options, readsStdin: true, operand: i }
    if (arg.startsWith('--')) {
      if (SHELL_LONG_VALUE_FLAGS.has(arg)) i += 1
    } else {
      if (arg.startsWith('-') && arg.includes('c')) options.readsString = true
      if (arg.startsWith('-') && arg.includes('s')) options.readsStdin = true
      if (/[oO]$/.test(arg)) i += 1
    }
  }
  if (args[i] === '--') i += 1
  return { ...options, operand: i }
}

function shellCommandString(args) {
  const { readsString, operand } = shellOptions(args)
  return readsString ? args.slice(operand).join(' ') : null
}

function wordSuffixes(args) {
  return args
    .map((arg, at) => (arg.startsWith('-') ? null : args.slice(at).join(' ')))
    .filter((command) => command !== null)
}

function nestedCommands(name, args) {
  if (name === 'eval') return [args.join(' ')]
  if (name === 'watch') {
    let i = 0
    while (i < args.length && args[i].startsWith('-'))
      i += WATCH_VALUE_FLAGS.has(args[i]) ? 2 : 1
    return [args.slice(i).join(' ')]
  }
  if (OPAQUE_WRAPPERS.has(name)) return null
  if (STDIN_RUNNERS.has(name)) {
    const here = hereString(args)
    return here === null ? null : [here]
  }
  if (!SHELLS.has(name)) return null
  const command = shellCommandString(args) ?? hereString(args)
  return command === null ? null : [command]
}

function hereString(args) {
  const at = args.findIndex((arg) => arg.startsWith('<<<'))
  if (at === -1) return null
  return args[at] === '<<<' ? (args[at + 1] ?? '') : args[at].slice(3)
}

function stringLiterals(code) {
  const strings = [...code.matchAll(STRING_LITERAL)].map((match) =>
    match.slice(1).find((value) => value !== undefined)
  )
  return strings.length ? [...strings, strings.join(' ')] : []
}

function programDecision(words, { env, name, args }, context) {
  if (name === 'gh') return ghDecision(args, context)
  if (name === 'git') return gitRunsString(args, words)
  if (name === 'curl' && PULLS_PATH.test(words) && curlPut(args))
    return wrappedMerge('gh merge', name)
  if (HTTP_CLIENTS.has(name) && githubRunTarget(args) && httpWrites(name, args))
    return WORKFLOW_RUN
  if (name === 'wrangler') return wranglerDecision(args, env)
  if (name === 'shopify') return shopifyDecision(args)
  if (name === 'make' && MAKE_PROD.test(args.join(' ')))
    return prodWrite(
      'This make target deploys to production (deploy-prod or ENV=prod).'
    )
  return wrappedMerge(words, name)
}

function decideSegment(segment, context) {
  const words = tokens(segment)
  const parsed = program(words)
  const nested = nestedCommands(parsed.name, parsed.args)
  const opaque = OPAQUE_WRAPPERS.has(parsed.name)
  const guessed = [
    ...(opaque ? wordSuffixes(parsed.args) : []),
    ...(INTERPRETER.test(parsed.name)
      ? parsed.args.flatMap(stringLiterals)
      : []),
  ]
  const unreadable = !context.guessing && UNREADABLE_PROGRAM.test(parsed.raw)
  let direct = []
  if (nested !== null)
    direct = nested.map((command) => decideCommand(command, context))
  else if (!opaque) direct = [programDecision(words.join(' '), parsed, context)]
  return combine([
    substitutedMerge(segment),
    assignedMerge(parsed.env),
    unreadable &&
      ask(
        `The program word \`${parsed.raw}\` comes from a variable, a substitution, a glob or a brace, so the guard cannot tell what runs. Write the program name out.`
      ),
    ...direct,
    ...guessed.map((command) => guess(command, context)),
  ])
}

const guess = (command, context) =>
  decideCommand(command, { ...context, guessing: true })

function combine(results) {
  const reasons = (decision) => [
    ...new Set(
      results.filter((r) => r?.decision === decision).map((r) => r.reason)
    ),
  ]
  const denied = reasons('deny')
  if (denied.length) return deny(denied.join(' '))
  const asked = reasons('ask')
  return asked.length ? ask(asked.join(' ')) : allow
}

function changedDir(cwd, target = homedir(), subshell) {
  if (!cwd || subshell || /^-|[$`*?[]/.test(target)) return null
  return resolve(cwd, target.replace(/^~(?=\/|$)/, homedir()))
}

function movedContext(context, { text, subshell }) {
  const { name, args } = program(tokens(text))
  let next = context
  if (name === 'cd')
    next = { ...next, cwd: changedDir(next.cwd, args[0], subshell) }
  if (name === 'pushd' || name === 'popd') next = { ...next, cwd: null }
  if (/\bGH_REPO=/.test(text)) next = { ...next, ghRepo: true }
  return next
}

function decideCommand(command, context) {
  const items = split(command)
  const outer = []
  let current = context
  const results = [stdinShell(items, command)]
  for (const text of shellFedText(items)) results.push(guess(text, context))
  for (const item of items) {
    if (item.kind === '(') outer.push(current)
    else if (item.kind === ')') current = outer.pop() ?? current
    else if (item.kind === 'substitution')
      results.push(decideCommand(item.text, current))
    else if (item.kind === 'verdict') results.push(item.result)
    else if (item.kind === 'guess') results.push(guess(item.text, current))
    else if (item.kind === 'segment') {
      current = movedContext(current, item)
      results.push(decideSegment(item.text, current))
    }
  }
  return combine(results)
}

function decideBash(command, context) {
  const cloudCli =
    CLI.test(command) &&
    PROD_TARGET.test(command) &&
    !(READ_VERB.test(command) && !WRITE_VERB.test(command))
  return combine([
    decideCommand(command, context),
    shellFedMerge(command, context.seen),
    cloudCli &&
      prodWrite(
        'This command can change the production Firebase or Google Cloud project. For dev, use --project dev. Read-only production commands pass.'
      ),
  ])
}

export function decide(
  toolName,
  toolInput,
  {
    cwd = process.cwd(),
    github = gitHub,
    env = process.env,
    reportSqlSha256 = OVERBOOKED_NIGHTS_SQL_SHA256,
  } = {}
) {
  const context = {
    cwd,
    github,
    ghRepo: Boolean(env.GH_REPO),
    seen: { merge: false },
  }
  if (toolName === 'mcp__github__enable_pr_auto_merge') return AUTO_MERGE
  if (toolName === 'mcp__github__merge_pull_request')
    return mergeDecision(
      {
        repo: `${toolInput?.owner}/${toolInput?.repo}`,
        number: Number(toolInput?.pullNumber),
        pins: toolInput?.expectedHeadSha
          ? [String(toolInput.expectedHeadSha)]
          : [],
        addPin: (sha) => `expectedHeadSha "${sha}"`,
      },
      context
    )

  if (toolName === 'Bash') {
    try {
      return decideBash(toolInput?.command ?? '', context)
    } catch (error) {
      if (!(error instanceof UnreadableWord)) throw error
      return ask(
        `The guard cannot read a word of this command as bash does (${error.message}), so it cannot tell whether it changes production. Write the word out plainly.`
      )
    }
  }

  if (toolName === 'mcp__cloudflare__execute') {
    const code = toolInput?.code ?? ''
    if (isOverbookedNightsProdRead(toolInput?.account_id, code, reportSqlSha256))
      return allow
    const shape = requestShape(code)
    if (shape?.methods?.every((method) => method === 'GET')) return allow
    return decideCloudflareWrite(toolInput?.account_id, code, shape)
  }

  if (toolName === 'mcp__github__actions_run_trigger')
    return ask(
      `This call (${toolInput?.method}) starts, reruns or cancels a GitHub Actions run, or deletes its logs, and a workflow such as cat-hotel deploy-prod or terraform apply-prod changes production. Approve only if Shien asked for this specific run.`
    )

  if (SHOPIFY_WRITE.test(toolName))
    return prodWrite(
      'This Shopify connector call writes to the live store. For tests, use catati-dev-store.myshopify.com.'
    )

  return allow
}
