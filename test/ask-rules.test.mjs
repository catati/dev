import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ASK_RULES, askRule, globMatches, unwrap } from '../plugins/catati/hooks/ask-rules.mjs'
import { preToolUse } from '../plugins/catati/hooks/pre-tool-use.mjs'

const bash = (command) => askRule('Bash', { command })?.decision ?? null
const edit = (tool, path, cwd = '/work') =>
  askRule(tool, { [tool === 'NotebookEdit' ? 'notebook_path' : 'file_path']: path }, { cwd })?.decision ?? null

test('every Bash ask rule asks for a command it names, alone or as one segment', () => {
  const examples = {
    'Bash(gh workflow run*)': 'gh workflow run deploy.yml',
    'Bash(gh api *dispatches*)': 'gh api repos/a/b/dispatches -f event_type=x',
    'Bash(gh api *git/refs*)': 'gh api repos/a/b/git/refs/heads/main',
    'Bash(gh api *-X*contents/*)': 'gh api -X PUT repos/a/b/contents/x',
    'Bash(gh api *contents/*-X*)': 'gh api repos/a/b/contents/x -X PUT',
    'Bash(gh api *--method*contents/*)': 'gh api --method PUT repos/a/b/contents/x',
    'Bash(gh api *contents/*--method*)': 'gh api repos/a/b/contents/x --method PUT',
    'Bash(gh api *-f*contents/*)': 'gh api -f message=x repos/a/b/contents/x',
    'Bash(gh api *contents/*-f*)': 'gh api repos/a/b/contents/x -f message=x',
    'Bash(gh api *-F*contents/*)': 'gh api -F content=@f repos/a/b/contents/x',
    'Bash(gh api *contents/*-F*)': 'gh api repos/a/b/contents/x -F content=@f',
    'Bash(gh api *--input*contents/*)': 'gh api --input body.json repos/a/b/contents/x',
    'Bash(gh api *contents/*--input*)': 'gh api repos/a/b/contents/x --input body.json',
    'Bash(gh api *createCommitOnBranch*)': 'gh api graphql -f query=createCommitOnBranch',
    'Bash(gh api *createRef*)': 'gh api graphql -f query=createRef',
    'Bash(gh api *updateRef*)': 'gh api graphql -f query=updateRef',
    'Bash(git -c *)': 'git -c core.hooksPath=/dev/null commit -m x',
    'Bash(gh secret*)': 'gh secret set TOKEN',
    'Bash(gh variable*)': 'gh variable set NAME',
    'Bash(gh repo edit*)': 'gh repo edit --visibility public',
    'Bash(gh repo delete*)': 'gh repo delete catati/x',
    'Bash(make *ENV=prod*)': 'make migrate ENV=prod',
    'Bash(gcloud *iam *)': 'gcloud projects iam roles list',
    'Bash(gcloud * add-iam-policy-binding*)': 'gcloud projects add-iam-policy-binding p',
    'Bash(gcloud * remove-iam-policy-binding*)': 'gcloud projects remove-iam-policy-binding p',
  }
  const bashRules = ASK_RULES.filter((rule) => rule.startsWith('Bash('))
  assert.deepEqual(Object.keys(examples).sort(), [...bashRules].sort())
  for (const [rule, command] of Object.entries(examples)) {
    const result = askRule('Bash', { command })
    assert.equal(result?.decision, 'ask', command)
    assert.match(result.reason, /Shien's approval/)
    for (const wrapped of [`cd /work && ${command}`, `true; ${command} | cat`, `FOO=1 ${command}`])
      assert.equal(bash(wrapped), 'ask', `${rule}: ${wrapped}`)
  }
})

test('a rule sees through the wrappers, keywords and substitutions Claude Code permission rules see through', () => {
  for (const command of [
    'timeout 30 gh workflow run deploy.yml',
    'timeout -s KILL -k 5 30 gh secret set X',
    'time gh secret list',
    'nice gh repo edit --visibility public',
    'nice -n 5 gh secret list',
    'nohup gh secret set X',
    'stdbuf -oL gh secret list',
    'command -p gh secret list',
    'builtin gh secret list',
    'noglob gh secret list',
    'xargs gh secret set',
    'xargs -n 1 -P 2 gh secret set',
    'echo "$(gh secret list)"',
    'echo `gh secret list`',
    'echo "`timeout 3 gh secret list`"',
    'for i in 1; do gh secret set X; done',
    'if true; then gh variable set A; else gh variable set B; fi',
    'while true; do gh workflow run x; done',
    '! gh secret list',
    '{ gh secret list; }',
    'A=1 B=2 timeout 5 make x ENV=prod',
  ])
    assert.equal(bash(command), 'ask', command)
  assert.equal(unwrap('A=1 nice -n 5 timeout 9 xargs -n 1 gh secret set'), 'gh secret set')
})

test('glob matching is anchored at both ends and takes linear time on long commands', () => {
  assert.equal(globMatches('gh secret*', 'gh secret'), true)
  assert.equal(globMatches('gh secret*', 'xgh secret'), false)
  assert.equal(globMatches('gh api *-X*contents/*', 'gh api -X PUT repos/a/contents/b'), true)
  assert.equal(globMatches('gh api *-X*contents/*', 'gh api repos/a/contents/b'), false)
  assert.equal(globMatches('make *ENV=prod*', 'make ENV=prod'), true)
  assert.equal(globMatches('make *ENV=prod*', 'make deploy ENV=dev'), false)
  assert.equal(globMatches('a*a', 'a'), false)
  const started = performance.now()
  const long = `gh api /user -f note=${'-X'.repeat(200_000)} ; wrangler deploy --env prod`
  assert.equal(preToolUse('Bash', { command: long }).decision, 'ask')
  assert.ok(performance.now() - started < 5000)
})

test('the ask rules are the 28 rules moved from cat-hotel .claude/settings.json', () => {
  assert.equal(ASK_RULES.length, 28)
  assert.equal(new Set(ASK_RULES).size, 28)
})

test('an assignment prefix with unclosed quotes is read in linear time', () => {
  for (const quote of [`'`, '"']) {
    const started = performance.now()
    assert.equal(bash(`A=${quote.repeat(5000)}x`), null)
    assert.equal(bash(`A="x" B='y' gh secret list ${quote.repeat(5000)}`), 'ask')
    assert.ok(performance.now() - started < 1000, quote)
  }
  assert.equal(bash(`A="a b" B='c d' gh secret list`), 'ask')
})

test('commands no ask rule names pass', () => {
  for (const command of [
    'ls -la',
    'git status',
    'gh pr view 7',
    'gh api repos/a/b/pulls',
    'gh api repos/a/b/contents/README.md',
    'make test',
    'make deploy ENV=dev',
    'gcloud config list',
    'echo gh secret',
  ])
    assert.equal(bash(command), null, command)
})

test('edits to a repo or user Claude settings file ask, with every file tool', () => {
  for (const tool of ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']) {
    assert.equal(edit(tool, '/home/user/cat-hotel/.claude/settings.json'), 'ask', tool)
    assert.equal(edit(tool, '.claude/settings.local.json'), 'ask', tool)
    assert.equal(edit(tool, '~/.claude/settings.json'), 'ask', tool)
    assert.equal(edit(tool, join(homedir(), '.claude', 'settings.json')), 'ask', tool)
  }
  assert.equal(edit('Edit', '/work/sub/../.claude/settings.json'), 'ask')
})

test('edits to other files pass, and tools without a path pass', () => {
  for (const path of ['/work/settings.json', '/work/.claude/settings.json.bak', '/work/.claude/hooks/x.mjs', '/work/.claude/rules/pstack-models.md'])
    assert.equal(edit('Edit', path), null, path)
  assert.equal(askRule('Read', { file_path: '/work/.claude/settings.json' }), null)
  assert.equal(askRule('Edit', {}), null)
})

test('one decision comes back when the prod guard and an ask rule both match, and deny wins', () => {
  const both = preToolUse('Bash', { command: 'make deploy-prod ENV=prod' })
  assert.equal(both.decision, 'ask')
  assert.match(both.reason, /production/)
  assert.match(both.reason, /make \*ENV=prod\*/)
  const crashed = preToolUse('mcp__cloudflare__execute', {
    account_id: '69f8dc2296dd15d29e03693d6492f163',
    code: { toString: () => { throw new Error('boom') } },
  })
  assert.equal(crashed.decision, 'ask')
  assert.match(crashed.reason, /guard failed/)
  const denied = preToolUse('mcp__github__enable_pr_auto_merge', {})
  assert.equal(denied.decision, 'deny')
  assert.equal(preToolUse('Bash', { command: 'ls' }), null)
})
