import { readFileSync } from 'node:fs'
import { isMainModule } from './main-module.mjs'
import { askRule } from './ask-rules.mjs'
import { decide } from './guard-prod.mjs'

const RANK = { deny: 2, ask: 1 }

function guarded(check) {
  try {
    return check()
  } catch (error) {
    return {
      decision: 'ask',
      reason: `The catati guard failed on this call (${error?.message ?? error}), so it needs Shien's approval.`,
    }
  }
}

export function preToolUse(toolName, toolInput, options) {
  const results = [
    guarded(() => decide(toolName, toolInput, options)),
    guarded(() => askRule(toolName, toolInput, options)),
  ].filter(Boolean)
  if (results.length === 0) return null
  const decision = results
    .map((result) => result.decision)
    .reduce((top, next) => (RANK[next] > RANK[top] ? next : top))
  return {
    decision,
    reason: results
      .filter((result) => result.decision === decision)
      .map((result) => result.reason)
      .join(' '),
  }
}

function run() {
  let input
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return
  }
  const result = preToolUse(input.tool_name, input.tool_input, {
    cwd: input.cwd ?? process.cwd(),
  })
  if (!result) return
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: result.decision,
        permissionDecisionReason: result.reason,
      },
    })
  )
}

if (isMainModule(import.meta.url)) run()
