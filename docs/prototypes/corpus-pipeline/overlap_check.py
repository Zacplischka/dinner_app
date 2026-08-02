#!/usr/bin/env python3
"""#315's in-run overlap checker: authored method text vs transient source captures.

Flags: shared 5-gram shingles above threshold, any 12+ word verbatim run,
and a full quantity-set match against any single source's observations.
Usage: overlap_check.py <records/<slug>/recipe.json> <sources-transient/<slug>/>
Exit 0 = pass, 1 = flagged (reasons on stdout).
"""
import json, re, sys
from pathlib import Path

SHINGLE_N = 5
MAX_SHARED_SHINGLES = 8   # ponytail: threshold picked by eye on the spike; retune if spike shows noise
MAX_VERBATIM_RUN = 12

def words(text):
    return re.findall(r"[a-z']+", text.lower())

def shingles(ws, n=SHINGLE_N):
    return {" ".join(ws[i:i+n]) for i in range(len(ws) - n + 1)}

def longest_common_run(a, b):
    bset, best = set(" ".join(b[i:i+MAX_VERBATIM_RUN]) for i in range(max(0, len(b)-MAX_VERBATIM_RUN+1))), 0
    for i in range(max(0, len(a) - MAX_VERBATIM_RUN + 1)):
        if " ".join(a[i:i+MAX_VERBATIM_RUN]) in bset:
            best = MAX_VERBATIM_RUN
            break
    return best

def main(recipe_path, sources_dir):
    recipe = json.loads(Path(recipe_path).read_text())
    method = " ".join(recipe["steps"])
    mwords = words(method)
    mshingles = shingles(mwords)
    reasons = []
    for src in sorted(Path(sources_dir).glob("*.txt")):
        swords = words(src.read_text(errors="ignore"))
        shared = mshingles & shingles(swords)
        if len(shared) > MAX_SHARED_SHINGLES:
            reasons.append(f"{src.name}: {len(shared)} shared 5-gram shingles (max {MAX_SHARED_SHINGLES}): {sorted(shared)[:5]}…")
        if longest_common_run(mwords, swords) >= MAX_VERBATIM_RUN:
            reasons.append(f"{src.name}: verbatim run of {MAX_VERBATIM_RUN}+ words")
    # quantity fingerprint: authored (name, amount, unit) tuples all present in one source's text
    for src in sorted(Path(sources_dir).glob("*.txt")):
        stext = src.read_text(errors="ignore").lower()
        amounts = [f"{ing['amount']:g} {ing['unit']}".strip() for ing in recipe["extendedIngredients"] if ing.get("unit")]
        if amounts and all(a in stext for a in amounts):
            reasons.append(f"{src.name}: full authored quantity set appears verbatim in one source")
    print("\n".join(reasons) if reasons else "clean")
    return 1 if reasons else 0

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--selfcheck":
        import tempfile, os
        d = tempfile.mkdtemp()
        Path(d, "0.txt").write_text("heat the oil in a large pot over medium heat and brown the mince well")
        r = {"steps": ["Heat the oil in a large pot over medium heat and brown the mince well, then rest."],
             "extendedIngredients": [{"name": "beef mince", "amount": 500, "unit": "g"}]}
        rp = Path(d, "r.json"); rp.write_text(json.dumps(r))
        assert main(rp, d) == 1, "verbatim copy must flag"
        r["steps"] = ["Brown the beef in batches until deeply coloured. Add the sauce and simmer."]
        rp.write_text(json.dumps(r))
        assert main(rp, d) == 0, "independent text must pass"
        print("selfcheck ok"); sys.exit(0)
    sys.exit(main(sys.argv[1], sys.argv[2]))
