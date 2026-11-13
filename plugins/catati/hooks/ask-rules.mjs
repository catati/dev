import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { split } from './guard-prod.mjs'

export const ASK_RULES = [
  'Bash(gh workflow run*)',
  'Bash(gh api *dispatches*)',
  'Bash(gh api *git/refs*)',
  'Bash(gh api *-X*contents/*)',
  'Bash(gh api *contents/*-X*)',
  'Bash(gh api *--method*contents/*)',
  'Bash(gh api *contents/*--method*)',
  'Bash(gh api *-f*contents/*)',
  'Bash(gh api *contents/*-f*)',
  'Bash(gh api *-F*contents/*)',
  'Bash(gh api *contents/*-F*)',
  'Bash(gh api *--input*contents/*)',
  'Bash(gh api *contents/*--input*)',
  'Bash(gh api *createCommitOnBranch*)',
  'Bash(gh api *createRef*)',
  'Bash(gh api *updateRef*)',
  'Bash(git -c *)',
  'Bash(gh secret*)',
  'Bash(gh variable*)',
  'Bash(gh repo edit*)',
  'Bash(gh repo delete*)',
  'Bash(make *ENV=prod*)',
  'Bash(gcloud *iam *)',
  'Bash(gcloud * add-iam-policy-binding*)',
  'Bash(gcloud * remove-iam-policy-binding*)',
  'Edit(/.claude/settings.json)',
  'Edit(/.claude/settings.local.json)',
  'Edit(~/.claude/settings.json)',
]

const FILE_TOOLS = {
  Edit: 'file_path',
  MultiEdit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
}
const LEADING_ASSIGNMENTS =
  /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|[^\s'"])*\s+)+/

const glob = (pattern) =>
  new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`,
    's'
  )

const parsed = ASK_RULES.map((rule) => {
  const [, tool, pattern] = rule.match(/^(\w+)\((.*)\)$/s)
  return { rule, tool, pattern }
})
const BASH_RULES = parsed
  .filter(({ tool }) => tool === 'Bash')
  .map(({ rule, pattern }) => ({ rule, test: glob(pattern) }))
const EDIT_RULES = parsed.filter(({ tool }) => tool === 'Edit')

function commandCandidates(command) {
  const segments = split(command)
    .filter((item) => item.kind === 'segment')
    .map((item) => item.text)
  return [command, ...segments].flatMap((text) => {
    const trimmed = text.trim()
    return [trimmed, trimmed.replace(LEADING_ASSIGNMENTS, '')]
  })
}

function editMatches(pattern, path) {
  if (pattern.startsWith('~/'))
    return path === resolve(homedir(), pattern.slice(2))
  return path.endsWith(pattern)
}

const askFor = (rule) => ({
  decision: 'ask',
  reason: `This call matches the catati ask rule ${rule}, so it needs Shien's approval.`,
})

export function askRule(toolName, toolInput, { cwd = process.cwd() } = {}) {
  if (toolName === 'Bash') {
    const candidates = commandCandidates(String(toolInput?.command ?? ''))
    const hit = BASH_RULES.find(({ test }) =>
      candidates.some((text) => test.test(text))
    )
    return hit ? askFor(hit.rule) : null
  }
  const field = FILE_TOOLS[toolName]
  if (!field || typeof toolInput?.[field] !== 'string') return null
  const path = resolve(cwd, toolInput[field].replace(/^~(?=\/|$)/, homedir()))
  const hit = EDIT_RULES.find(({ pattern }) => editMatches(pattern, path))
  return hit ? askFor(hit.rule) : null
}
