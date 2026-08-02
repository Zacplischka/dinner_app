#!/usr/bin/env python3
"""Wayfinder #245: measure the tally launch gate at production's store.

Runs the 10-recipe / 87-line corpus through match -> re-rank -> the #241
resolution ladder against store-1101 search results (woolies_products_1101.json,
captured from inside the Railway container), and grades every non-staple line
into #234's four terminal states:

  priced             in tally
  estimated          in tally (variable-weight, unit price x needed mass)
  unpriced-matched   out (product + link, no number)
  unmatched          out (no viable candidate; #243 trigger)

Gate: median recipe must put >= 80% of its non-staple lines in the tally.

  python3 gate.py            # full report
  python3 gate.py old        # same pipeline on the residential capture (grade transfer)
"""
import json, math, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from match import recipes, terms, STAPLES
from rerank import BAD, sections, pick_smart

# ---------------------------------------------------------------- pack parser
# #241: whitelist, never guess. Only known-good shapes produce a number.
FIXED = re.compile(r"(?i)^(\d+(?:\.\d+)?)\s*(kg|g|ml|l)$")
MULTI = re.compile(r"(?i)^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)$")
MULTI2 = re.compile(r"(?i)^(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\s*x\s*(\d+)\s*pack$")
NPACK = re.compile(r"(?i)^(\d+)\s*(?:pack|pk)$")
EACH = re.compile(r"(?i)^(each|1ea|ea|bunch|punnet|head|bag|loaf)$")
VARIABLE = re.compile(r"(?i)^(per|approx)")
RANGE = re.compile(r"\d\s*(?:-|–)\s*\d")
# "1.1kg - 2.2kg": a variable-weight pack stated as a range. Same pricing as
# "per kg" packs — unit price x needed mass (#245's cheap win).
RANGE_PACK = re.compile(r"(?i)^\d+(?:\.\d+)?\s*(?:kg|g|ml|l)?\s*(?:-|–)\s*\d+(?:\.\d+)?\s*(?:kg|g|ml|l)$")
TO_G = {"kg": 1000.0, "g": 1.0, "l": 1000.0, "ml": 1.0}
KIND = {"kg": "mass", "g": "mass", "l": "volume", "ml": "volume"}


def parse_pack(size):
    """-> ('fixed', qty_base, kind) | ('count', n) | ('variable',) | ('range',) | None"""
    s = (size or "").strip()
    if not s:
        return None
    if RANGE_PACK.match(s):
        return ("variable",)
    if RANGE.search(s):
        return ("range",)
    if VARIABLE.match(s):
        return ("variable",)
    m = FIXED.match(s)
    if m:
        return ("fixed", float(m.group(1)) * TO_G[m.group(2).lower()], KIND[m.group(2).lower()])
    m = MULTI.match(s)  # "2 x 400g"
    if m:
        return ("fixed", float(m.group(1)) * float(m.group(2)) * TO_G[m.group(3).lower()], KIND[m.group(3).lower()])
    m = MULTI2.match(s)  # "250mL x 4 pack"
    if m:
        return ("fixed", float(m.group(1)) * TO_G[m.group(2).lower()] * float(m.group(3)), KIND[m.group(2).lower()])
    m = NPACK.match(s)
    if m:
        return ("count", float(m.group(1)))
    if EACH.match(s):
        return ("count", 1.0)
    return None


CUP = re.compile(r"(?i)\$(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)?\s*(kg|g|ml|l)")


def cup_per_gram(cup):
    m = CUP.search(cup or "")
    if not m:
        return None
    return float(m.group(1)) / (float(m.group(2) or 1) * TO_G[m.group(3).lower()])


# ---------------------------------------------------------------- the ladder
# Recipe units. Counts ('') and count-like words compare directly against a
# count-sold pack; g/kg/mL/L against fixed packs; tbsp/tsp are AU volumetric.
COUNT_UNITS = {"", "packet", "head", "loaf", "punnet"}
MASS = {"g": 1.0, "kg": 1000.0}
VOL = {"ml": 1.0, "l": 1000.0, "tbsp": 20.0, "tsp": 5.0}

# Rung 4: the static vague-unit table (grams), which per #244 owns
# bunch/handful/sprig for fresh herbs *unconditionally*, shadowing Spoonacular.
TABLE = {"bunch": 60.0, "handful": 10.0, "sprigs": 3.0, "sprig": 3.0,
         "thumb": 25.0, "leaves": 0.5, "pinch": 0.5}
HERB_UNITS = {"bunch", "handful", "sprigs", "sprig", "leaves"}
FRESH_HERBS = re.compile(r"(?i)coriander|basil|parsley|rosemary|mint|thyme|dill|sage|chive|kaffir")
# Per-ingredient override: cloves are a fraction of the each-sold head (~10/head).
CLOVES_PER_HEAD = 10

SPOON_CACHE = os.path.join(HERE, "spoon_cache.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"


def spoon_key():
    for line in open("/Users/zacharyplischka/projects/Hobby/dinner_app/.env"):
        if line.startswith(("SPOONTACULAR_API_KEY=", "SPOONACULAR_API_KEY=")):  # .env uses the un-typo'd name
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("no SPOONTACULAR_API_KEY in .env")


_cache = json.load(open(SPOON_CACHE)) if os.path.exists(SPOON_CACHE) else {}


def _spoon(path, **params):
    key = path + "?" + urllib.parse.urlencode(sorted(params.items()))
    if key in _cache:
        return _cache[key]
    params["apiKey"] = spoon_key()
    req = urllib.request.Request(
        "https://api.spoonacular.com" + path + "?" + urllib.parse.urlencode(params),
        headers={"User-Agent": UA})  # Cloudflare 403s python-urllib's UA (#244)
    try:
        out = json.load(urllib.request.urlopen(req, timeout=30))
    except Exception as e:
        out = {"error": str(e)}
    _cache[key] = out
    json.dump(_cache, open(SPOON_CACHE, "w"), indent=1)
    time.sleep(0.3)
    return out


def spoon_known(name):
    """Rung 2's gate (#244): convert never refuses, so 'the ingredient search
    finds it' is the only trustworthy signal that a conversion is grounded."""
    d = _spoon("/food/ingredients/search", query=name, number=1)
    return bool((d.get("results") or []))


def spoon_convert(name, amount, unit):
    d = _spoon("/recipes/convert", ingredientName=name, sourceAmount=amount,
               sourceUnit=unit, targetUnit="grams")
    return d.get("targetAmount")


def spoon_consistency(name):
    d = _spoon("/food/ingredients/search", query=name, number=1)
    rs = d.get("results") or []
    if not rs:
        return None
    info = _spoon(f"/food/ingredients/{rs[0]['id']}/information", amount=1, unit="serving")
    return info.get("consistency")


def need_grams(name, amount, unit):
    """Rungs 2-4: turn (amount, unit) into grams, or (None, 'degrade')."""
    if unit in HERB_UNITS and FRESH_HERBS.search(name):
        return amount * TABLE[unit], "table(herb)"
    src = {"": "piece", "tbsp": "tablespoons", "tsp": "teaspoons"}.get(unit, unit)
    if spoon_known(name):
        g = spoon_convert(name, amount, src)
        if g and g > 0.5:  # a sub-gram answer for a whole line is #244's curry-roux tell
            return g, "spoonacular"
    if unit in VOL and spoon_consistency(name) == "liquid":
        return amount * VOL[unit], "1g=1mL"
    if unit in TABLE:
        return amount * TABLE[unit], "table"
    return None, "degrade"


def resolve(ing, pick):
    """-> dict(state, packs, price, rung, why) for a matched line."""
    unit = (ing["unit"] or "").lower()
    amt = ing["amount"]
    pack = parse_pack(pick.get("size"))
    price = pick.get("now")

    if pack is None:
        return dict(state="unpriced-matched", rung="degrade", why=f"unparsed pack {pick.get('size')!r}")
    if pack[0] == "range":
        return dict(state="unpriced-matched", rung="degrade", why=f"range pack {pick['size']!r}")

    if pack[0] == "count":
        # Rung 1, count family: recipe counts against an each/N-pack product.
        if unit in COUNT_UNITS:
            packs = math.ceil(amt / pack[1] - 1e-9)
        elif ing["name"] == "garlic cloves":
            packs = math.ceil(amt / CLOVES_PER_HEAD / pack[1] - 1e-9)
        elif unit in HERB_UNITS or unit in TABLE or unit == "bunch":
            # a bunch/handful/sprigs need against a bunch/each product: one covers it
            packs = math.ceil(amt / pack[1] - 1e-9) if unit == "bunch" else 1
        else:
            return dict(state="unpriced-matched", rung="degrade",
                        why=f"{unit or 'count'} vs count pack, no bridge")
        if price is None:
            return dict(state="unpriced-matched", rung="rung1", why="no price on product")
        return dict(state="priced", packs=packs, price=round(packs * price, 2), rung="rung1")

    if pack[0] == "fixed":
        qty, kind = pack[1], pack[2]
        # Rung 1, measure family: same family (mass<->mass, volume<->volume) divides directly.
        if unit in MASS and kind == "mass":
            need, rung = amt * MASS[unit], "rung1"
        elif unit in VOL and kind == "volume":
            need, rung = amt * VOL[unit], "rung1"
        else:
            need, rung = need_grams(ing["name"], amt, unit)
            if need is not None and kind == "volume":
                # grams against a mL pack: only sound for liquids (rung 3's gate)
                if spoon_consistency(ing["name"]) != "liquid":
                    return dict(state="unpriced-matched", rung="degrade",
                                why=f"grams vs volume pack, not liquid")
        if need is None:
            return dict(state="unpriced-matched", rung="degrade", why=f"no conversion for {unit!r}")
        packs = math.ceil(need / qty - 1e-9)
        if price is None:
            return dict(state="unpriced-matched", rung=rung, why="no price on product")
        return dict(state="priced", packs=packs, price=round(packs * price, 2), rung=rung)

    if pack[0] == "variable":
        # #241: variable-weight is priced by unit price x needed mass, as an estimate.
        rate = cup_per_gram(pick.get("cup"))
        if rate is None:
            return dict(state="unpriced-matched", rung="degrade", why=f"variable pack, no cup price {pick.get('cup')!r}")
        if unit in MASS:
            need, rung = ing["amount"] * MASS[unit], "rung1"
        else:
            need, rung = need_grams(ing["name"], amt, unit)
        if need is None:
            return dict(state="unpriced-matched", rung="degrade", why=f"variable pack, no conversion for {unit!r}")
        return dict(state="estimated", price=round(need * rate, 2), rung=rung,
                    why=f"{need:.0f}g x {pick['cup']}")


def viable(h):
    """#243's unmatched trigger: no SAP category, or a blocklisted section,
    means the candidate never reaches the picker."""
    return bool(h.get("sapcat")) and not BAD.search(sections(h))


def build(data_file):
    data = json.load(open(data_file))
    rs = recipes()
    q = terms(rs)
    lines = []
    picks = {}
    for name in q:
        hits = (data.get(q[name]) or {}).get("hits") or []
        cands = [h for h in hits if viable(h)]
        ing = next(i for r in rs for i in r["ingredients"] if i["name"] == name)
        u = (ing["unit"] or "").lower()
        if u in MASS:
            need, kind = ing["amount"] * MASS[u], "mass"
        elif u in VOL:
            need, kind = ing["amount"] * VOL[u], "volume"
        else:
            need, kind = (ing["amount"], "count") if u in COUNT_UNITS else (None, None)
        picks[name] = pick_smart(cands, need, kind, name) if cands else None

    for r in rs:
        for ing in r["ingredients"]:
            if ing["name"] in STAPLES:
                continue
            p = picks[ing["name"]]
            if p is None:
                row = dict(state="unmatched", rung="-", why="no viable candidate (#243 trigger)")
            else:
                row = resolve(ing, p)
            row.update(recipe=r["title"], ingredient=ing["name"], original=ing["original"],
                       product=(p or {}).get("name"), size=(p or {}).get("size"),
                       id=(p or {}).get("id"))
            lines.append(row)
    return lines


def report(lines):
    from collections import Counter, defaultdict
    states = Counter(l["state"] for l in lines)
    print(f"{len(lines)} non-staple lines")
    for s, c in states.most_common():
        print(f"  {s:18} {c:3}  ({100*c/len(lines):.0f}%)")
    print()
    per = defaultdict(lambda: [0, 0])
    for l in lines:
        per[l["recipe"]][1] += 1
        if l["state"] in ("priced", "estimated"):
            per[l["recipe"]][0] += 1
    pcts = []
    print(f"{'recipe':32} in-tally")
    for rec, (n, d) in per.items():
        pct = 100 * n / d
        pcts.append(pct)
        print(f"{rec[:32]:32} {n:2}/{d:2}  {pct:5.1f}%")
    pcts.sort()
    med = (pcts[len(pcts) // 2] + pcts[(len(pcts) - 1) // 2]) / 2
    print(f"\nmedian in-tally: {med:.1f}%   gate (>=80%): {'PASS' if med >= 80 else 'FAIL'}")
    print("\n--- out-of-tally lines ---")
    for l in lines:
        if l["state"] not in ("priced", "estimated"):
            print(f"{l['recipe'][:22]:22} | {l['original'][:34]:34} | {l['state']:16} | {l.get('why','')} | pick: {str(l['product'])[:40]}")


if __name__ == "__main__":
    src = "woolies_products.json" if (len(sys.argv) > 1 and sys.argv[1] == "old") else "woolies_products_1101.json"
    lines = build(os.path.join(HERE, src))
    out = "gate_lines_old.json" if src == "woolies_products.json" else "gate_lines_1101.json"
    json.dump(lines, open(os.path.join(HERE, out), "w"), indent=1)
    report(lines)
