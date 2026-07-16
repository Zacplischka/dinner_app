#!/usr/bin/env bash
# PostToolUse hook: prettier-format edited files. Receives Claude or Codex hook JSON on stdin.
# Never blocks: silently no-ops on non-TS files, dist/node_modules, or missing prettier.
python3 -c 'import json,re,sys
t=json.load(sys.stdin).get("tool_input", {})
paths=[t["file_path"]] if t.get("file_path") else re.findall(r"(?m)^\*\*\* (?:Add|Update) File: (.+)$", t.get("command", ""))
sys.stdout.buffer.write(b"\0".join(path.encode() for path in paths)+(b"\0" if paths else b""))' 2>/dev/null |
while IFS= read -r -d '' FILE; do
  case "$FILE" in
    *node_modules*|*/dist/*) ;;
    *.ts|*.tsx) npx --no-install prettier --write "$FILE" >/dev/null 2>&1 || true ;;
  esac
done
