#!/usr/bin/env python3
"""The cheap improvement: stop trusting rank 1, score the top 5 instead.

Two generic signals, no per-ingredient synonym table, no LLM:

  1. Shape - does the pack size parse into the same kind of measurement the
     recipe asked for (mass/volume/count)?
  2. Scale - is the pack within a sane multiple of what the recipe needs?
     A 40g jerky bar is not 800g of brisket; a 5kg sack is not 300g of rice.

Plus one small blocklist of shop sections that never contain an ingredient.
That is the whole intervention.
"""
import json, math, os, re
from match import recipes, terms, parse_size, need_in_base

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, "woolies_products.json")))
RS = recipes()
ING = {i["name"]: i for r in RS for i in r["ingredients"]}

# Sections of the shop that never hold a cooking ingredient. Deliberately tiny -
# the point is to show a short list does most of the work.
BAD = re.compile(r"chips|confection|soft drink|cordial|pet food|dog|cat food|"
                 r"hair|skin|beauty|kitchen|cleaning|energy drink", re.I)

STOP = {"fresh", "dried", "ground", "whole", "chopped", "sliced", "diced", "grated",
        "crushed", "trimmed", "leaves", "stalks", "cloves", "sprigs", "bunch",
        "tinned", "canned", "flat", "leaf", "green", "red", "brown", "short",
        "grain", "thai", "japanese", "greek", "lebanese", "desiree", "iceberg"}


def sections(h):
    return " ".join(str(h.get(k) or "") for k in ("cats", "subcats", "sapcat", "sapsub"))


def keywords(name):
    return [w for w in re.findall(r"[a-z]+", name.lower())
            if w not in STOP and len(w) > 2]


def score(h, need, kind, ing_name):
    s = 0.0
    if h.get("avail") is False:
        s -= 2
    # A real supermarket line carries a SAP category; marketplace/third-party
    # listings (garlic presses, novelty imports) carry none. Cheapest filter here.
    if not h.get("sapcat"):
        s -= 5
    if BAD.search(sections(h)):
        s -= 4
    # Identity has to survive re-ranking, or "chicken stock" becomes vegetable stock.
    kw = keywords(ing_name)
    nm = (h.get("name") or "").lower()
    if kw:
        s += 2.0 * sum(1 for w in kw if w in nm) / len(kw)
    size = parse_size(h.get("size"))
    if size and kind:
        # 1g == 1mL. Crude, but cooking-accurate for the wet things this matters
        # for (cream, stock, yoghurt, milk) and it rescues "200g sour cream"
        # from being unable to match a 300mL tub.
        same = size[1] == kind or {size[1], kind} == {"mass", "volume"}
        if same:
            s += 2
            if need:
                ratio = size[0] / need
                if 0.25 <= ratio <= 4:
                    s += 2
                elif ratio > 10 or ratio < 0.05:
                    s -= 2
        else:
            s -= 1
    elif not size:
        s -= 0.5
    return s


def pick_naive(hits):
    for h in hits:
        if h.get("avail") is False:
            continue
        return h
    return hits[0] if hits else None


def pick_smart(hits, need, kind, ing_name):
    if not hits:
        return None
    best, bi = None, 0
    for i, h in enumerate(hits):
        # rank still counts for something; it is a real relevance signal
        sc = score(h, need, kind, ing_name) - i * 0.35
        if best is None or sc > best:
            best, bi = sc, i
    return hits[bi]


def rows():
    out = []
    for name, q in terms(RS).items():
        hits = (DATA.get(q) or {}).get("hits") or []
        need, kind, _ = need_in_base(ING[name])
        n, s = pick_naive(hits), pick_smart(hits, need, kind, name)
        packs = None
        size = parse_size(s.get("size")) if s else None
        if s and size and need is not None and (size[1] == kind or {size[1], kind} == {'mass','volume'}):
            packs = math.ceil(need / size[0] - 1e-9)
        out.append({"ingredient": name, "original": ING[name]["original"],
                    "naive": (n or {}).get("name"), "smart": (s or {}).get("name"),
                    "smart_size": (s or {}).get("size"), "smart_price": (s or {}).get("now"),
                    "packs": packs, "changed": (n or {}).get("id") != (s or {}).get("id")})
    return out


if __name__ == "__main__":
    rs = rows()
    json.dump(rs, open(os.path.join(HERE, "reranked.json"), "w"), indent=1)
    ch = [r for r in rs if r["changed"]]
    print(f"re-ranker changed the pick on {len(ch)}/{len(rs)} ingredients\n")
    for r in ch:
        print(f"{r['original'][:30]:30}\n   was: {r['naive']}\n   now: {r['smart']} "
              f"({r['smart_size']}, ${r['smart_price']}) x{r['packs']}")
    print(f"\npriceable lines: {sum(1 for r in rs if r['packs'] is not None)}/{len(rs)} "
          f"(naive was 43/68)")
