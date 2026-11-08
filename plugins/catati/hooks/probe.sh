#!/bin/sh
{
	dir="${HOME:-/root}/.claude"
	mkdir -p "$dir"
	printf '%s\n%s\n%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PWD" "${CLAUDE_PROJECT_DIR:-unset}" >"$dir/catati-plugin-hook-ran"
} >/dev/null 2>&1
exit 0
