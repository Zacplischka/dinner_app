#!/bin/zsh
# #318's culinary layer, judge 1: GPT via codex exec (independent of the Claude author).
# Judge 2 (Claude, adversarial framing) is run by the orchestrator as a subagent —
# ponytail: gemini CLI is deauthorized for this account and the ChatGPT plan exposes one
# model; a true second family needs a GEMINI_API_KEY at corpus time (pilot deviation, reported).
# Usage: judge.sh <records/<slug>/recipe.json>  -> writes <slug>/judge-gpt.json. Exit 0 = pass.
set -e
RECIPE="$1"
DIR=$(dirname "$RECIPE")
PROMPT="You are an independent culinary reviewer for an Australian home-cooking recipe corpus. Judge ONLY the recipe JSON below on these axes: (1) quantity sanity for the stated servings; (2) cook times and temperatures realistic; (3) method order causally correct and complete — nothing used before prepared, nothing listed but unused; (4) seasoning present and sane; (5) IS THE DISH THE DISH its title claims — a shopper cooking this gets the thing they expect; (6) declared diets actually hold against every ingredient. Convention: salt, pepper, water and olive oil are pantry staples the method may use without listing — never fail for those. Answer with STRICT JSON only, no markdown fence: {\"pass\": true|false, \"reasons\": [\"...\"]} where reasons lists every failure (empty if pass). Recipe: $(cat "$RECIPE")"

codex exec --skip-git-repo-check -s read-only "$PROMPT Output only the JSON verdict as your final message." 2>/dev/null | python3 -c "
import sys, re, json
t = sys.stdin.read()
m = re.findall(r'\{[^{}]*\"pass\"[^{}]*\}', t, re.S)
print(m[-1] if m else json.dumps({'pass': False, 'reasons': ['no verdict parsed']}))" > "$DIR/judge-gpt.json"

python3 - "$DIR" <<'EOF'
import json, sys, pathlib
d = pathlib.Path(sys.argv[1])
g = json.loads((d/"judge-gpt.json").read_text())
print(f"gpt: {'PASS' if g['pass'] else 'FAIL ' + '; '.join(g['reasons'])}")
sys.exit(0 if g["pass"] else 1)
EOF
