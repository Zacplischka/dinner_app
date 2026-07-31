#!/usr/bin/env python3
"""The numbers dinner_app#231 asks for: hit rate, failure taxonomy, per-recipe odds."""
import collections, json, os
from wgrade import build
from match import recipes

HERE = os.path.dirname(os.path.abspath(__file__))
G = json.load(open(os.path.join(HERE, "grades.json")))
rows = build()
by_name = {r["ingredient"]: r for r in rows}

tally = collections.Counter(G[r["ingredient"]][0] for r in rows)
n = len(rows)
print(f"=== match quality, top-1 pick, {n} distinct ingredients ===")
for k in ("exact", "plausible", "wrong", "none"):
    print(f"  {k:10} {tally[k]:3}  {tally[k]/n:5.0%}")
ok = tally["exact"] + tally["plausible"]
print(f"  {'usable':10} {ok:3}  {ok/n:5.0%}   (exact + plausible)")

print("\n=== pack maths ===")
nopack = [r for r in rows if r["packs"] is None]
notes = collections.Counter(r["note"].split("(")[0] for r in nopack)
print(f"  no pack count at all: {len(nopack)}/{n} ({len(nopack)/n:.0%})")
for k, v in notes.most_common():
    print(f"    {k:22} {v}")

# lines that DID produce a number - are the numbers sane?
priced = [r for r in rows if r["line_cost"] is not None]
print(f"  produced a priced line: {len(priced)}/{n}")
absurd = [r for r in priced if r["line_cost"] >= 15]
print(f"  ...of which >= $15 for one ingredient: {len(absurd)}")
for r in sorted(absurd, key=lambda r: -r["line_cost"]):
    print(f"    ${r['line_cost']:>6.2f}  {r['original'][:34]:34} -> "
          f"{r['product'][:34]} ({r['size']}) x{r['packs']}")

print("\n=== per recipe: would the whole list be right? ===")
for rc in recipes():
    names = [i["name"] for i in rc["ingredients"] if i["name"] in by_name]
    gs = [G[nm][0] for nm in names]
    bad = [nm for nm in names if G[nm][0] == "wrong"]
    nopk = [nm for nm in names if by_name[nm]["packs"] is None]
    total = sum(by_name[nm]["line_cost"] or 0 for nm in names)
    print(f"  {rc['title'][:32]:32} {len(names):2} matched | wrong {len(bad)} | "
          f"unpriceable {len(nopk)} | tally ${total:7.2f}")
    if bad:
        print(f"      wrong: {', '.join(bad)}")

clean = sum(1 for rc in recipes()
            if all(G[i['name']][0] != 'wrong' and by_name[i['name']]['packs'] is not None
                   for i in rc['ingredients'] if i['name'] in by_name))
print(f"\n  recipes with a fully correct, fully priced list: {clean}/10")
