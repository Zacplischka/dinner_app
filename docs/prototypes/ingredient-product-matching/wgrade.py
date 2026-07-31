#!/usr/bin/env python3
"""What the dumb matcher would put on the shopping list, per ingredient."""
import json, math, os
from match import recipes, terms, parse_size, need_in_base

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, "woolies_products.json")))
RS = recipes()
ING = {i["name"]: i for r in RS for i in r["ingredients"]}
RECIPE = {i["name"]: r["title"] for r in RS for i in r["ingredients"]}


def pick(hits):
    for h in hits:
        if h.get("avail") is False:
            continue
        return h
    return hits[0] if hits else None


def build():
    out = []
    for name, q in terms(RS).items():
        d = DATA.get(q) or {}
        hits = d.get("hits") or []
        p = pick(hits)
        need, kind, unit = need_in_base(ING[name])
        size = parse_size(p.get("size")) if p else None
        packs, note = None, ""
        if p and size and need is not None:
            if size[1] == kind:
                packs = math.ceil(need / size[0] - 1e-9)
            else:
                note = f"{kind}-vs-{size[1]}"
        elif p and not size:
            note = "unparsed-size(%s)" % p.get("size")
        elif need is None:
            note = kind
        out.append({
            "recipe": RECIPE[name], "ingredient": name,
            "original": ING[name]["original"], "total": d.get("total"),
            "product": (p or {}).get("name"), "brand": (p or {}).get("brand"),
            "size": (p or {}).get("size"), "price": (p or {}).get("now"),
            "cup": (p or {}).get("cup"), "url": (p or {}).get("url"),
            "alts": [f"{h.get('name')} ({h.get('size')}, ${h.get('now')})"
                     for h in hits[1:4]],
            "packs": packs, "note": note,
            "line_cost": round(packs * p["now"], 2) if packs and p and p.get("now") else None,
        })
    return out


if __name__ == "__main__":
    rows = build()
    json.dump(rows, open(os.path.join(HERE, "wrows.json"), "w"), indent=1)
    cur = None
    for r in rows:
        if r["recipe"] != cur:
            cur = r["recipe"]
            print(f"\n=== {cur} ===")
        print(f"{r['original'][:30]:30} -> {str(r['product'])[:44]:44} "
              f"{str(r['size'] or '')[:9]:9} ${str(r['price'] or ''):>6} "
              f"x{str(r['packs'] or '-'):>3} = {str(r['line_cost'] or '-'):>6}  {r['note']}")
    print(f"\n{len(rows)} ingredients | no product: {sum(1 for r in rows if not r['product'])} "
          f"| no pack count: {sum(1 for r in rows if r['packs'] is None)}")
