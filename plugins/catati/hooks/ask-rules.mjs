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

export function globMatches(pattern, text) {
  const pieces = pattern.split('*')
  if (pieces.length === 1) return text === pattern
  const first = pieces[0]
  const last = pieces.at(-1)
  if (text.length < first.length + last.length) return false
  if (!text.startsWith(first) || !text.endsWith(last)) return false
  const end = text.length - last.length
  let at = first.length
  for (const piece of pieces.slice(1, -1)) {
    const found = text.indexOf(piece, at)
    if (found === -1 || found + piece.length > end) return false
    at = found + piece.length
  }
  return true
}

const KEYWORDS = new Set(['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '{'])
const PLAIN_WRAPPERS = new Set(['command', 'builtin', 'noglob', 'nohup', 'time'])
const WRAPPER_VALUE_FLAGS = {
  timeout: new Set(['-s', '--signal', '-k', '--kill-after']),
  nice: new Set(['-n', '--adjustment']),
  stdbuf: new Set(['-i', '-o', '-e', '--input', '--output', '--error']),
  xargs: new Set(['-I', '-i', '-d', '-E', '-e', '-L', '-l', '-n', '-P', '-s', '-a', '--delimiter', '--max-args', '--max-procs', '--max-lines', '--max-chars', '--arg-file', '--replace', '--eof']),
}
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

function skipFlags(words, at, valueFlags) {
  let i = at
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '--') return i + 1
    const flag = words[i].split('=')[0]
    i += valueFlags.has(flag) && !words[i].includes('=') && words[i] === flag ? 2 : 1
  }
  return i
}

function shellWords(text) {
  const words = []
  let word = ''
  let quote = null
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null
      word += ch
    } else if (ch === "'" || ch === '"') {
      quote = ch
      word += ch
    } else if (/\s/.test(ch)) {
      if (word) words.push(word)
      word = ''
    } else word += ch
  }
  if (word) words.push(word)
  return words
}

export function unwrap(text) {
  const words = shellWords(text)
  let i = 0
  for (;;) {
    const word = words[i]
    if (word === undefined) break
    if (ASSIGNMENT.test(word) || KEYWORDS.has(word) || PLAIN_WRAPPERS.has(word)) {
      i = PLAIN_WRAPPERS.has(word) ? skipFlags(words, i + 1, new Set()) : i + 1
    } else if (word in WRAPPER_VALUE_FLAGS) {
      i = skipFlags(words, i + 1, WRAPPER_VALUE_FLAGS[word])
      if (word === 'timeout') i += 1
    } else break
  }
  return words.slice(i).join(' ')
}

const parsed = ASK_RULES.map((rule) => {
  const [, tool, pattern] = rule.match(/^(\w+)\((.*)\)$/s)
  return { rule, tool, pattern }
})
const BASH_RULES = parsed
  .filter(({ tool }) => tool === 'Bash')
  .map(({ rule, pattern }) => ({ rule, pattern }))
const EDIT_RULES = parsed.filter(({ tool }) => tool === 'Edit')

function commandCandidates(command, depth = 0) {
  const candidates = [command.trim(), unwrap(command)]
  if (depth > 8) return candidates
  for (const item of split(command)) {
    if (item.kind === 'segment') {
      candidates.push(item.text.trim(), unwrap(item.text))
      for (const [, inner] of item.text.matchAll(/`([^`]*)`/g))
        candidates.push(...commandCandidates(inner, depth + 1))
    }
    else if (item.kind === 'substitution')
      candidates.push(...commandCandidates(item.text, depth + 1))
  }
  return candidates
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
    const hit = BASH_RULES.find(({ pattern }) =>
      candidates.some((text) => globMatches(pattern, text))
    )
    return hit ? askFor(hit.rule) : null
  }
  const field = FILE_TOOLS[toolName]
  if (!field || typeof toolInput?.[field] !== 'string') return null
  const path = resolve(cwd, toolInput[field].replace(/^~(?=\/|$)/, homedir()))
  const hit = EDIT_RULES.find(({ pattern }) => editMatches(pattern, path))
  return hit ? askFor(hit.rule) : null
}
