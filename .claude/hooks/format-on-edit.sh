#!/usr/bin/env bash
# PostToolUse hook: prettier-format the edited file. Receives hook JSON on stdin.
# Never blocks: silently no-ops on non-TS files, dist/node_modules, or missing prettier.
FILE=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path') or '')" 2>/dev/null)
case "$FILE" in
  ''|*node_modules*|*/dist/*) ;;
  *.ts|*.tsx) npx --no-install prettier --write "$FILE" >/dev/null 2>&1 || true ;;
esac
