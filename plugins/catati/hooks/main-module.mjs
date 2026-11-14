import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

function realPath(path) {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

export function isMainModule(moduleUrl, scriptPath = process.argv[1]) {
  if (!scriptPath) return false
  return [scriptPath, realPath(scriptPath)].some(
    (path) => pathToFileURL(path).href === moduleUrl
  )
}
