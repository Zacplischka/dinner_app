#!/usr/bin/env python3
"""Throwaway ingredient -> Coles product matcher. Prototype for dinner_app#231.

Deliberately dumb: one search per distinct ingredient name, trust Coles'
relevance ranking, take the first in-stock result, parse the pack size, work
out how many packs to buy. The point is to measure how far dumb gets you.

  python3 match.py fetch    # one batched Apify run -> products.json  (costs money)
  python3 match.py report   # grade offline from products.json
"""
import json, math, os, re, subprocess, sys, urllib.parse, urllib.request
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
ACTOR = "stealth_mode~coles-product-search-scraper"
MAX_ITEMS = 2            # results per search term; $0.01 each
MEMORY_MB = 1024         # start event is $0.10 per GB, min 1 -> keep at 1GB

# ponytail: token read straight off the repo .env; never source that file (eBay
# tokens in it break the shell).
def token():
    env = os.path.join(HERE, ".env")
    if not os.path.exists(env):
        env = "/Users/zacharyplischka/projects/Hobby/dinner_app/.env"
    for line in open(env):
        if line.startswith("APIFY_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("no APIFY_TOKEN")


def recipes():
    return json.load(open(os.path.join(HERE, "recipes.json")))


# The map already says ~30 hardcoded pantry staples sit on the list unticked and
# out of the total, so they never need a product match. Excluding them here is
# the spec, not a budget dodge - though it does save ~$0.30 of Apify credit.
STAPLES = {"soy sauce", "sesame oil", "plain flour", "butter", "dried oregano",
           "ground cumin", "smoked paprika", "garam masala", "ground turmeric",
           "star anise", "cinnamon stick"}


def terms(rs, override=None):
    """Distinct search terms, round-robin across recipes.

    Coles blocks us long before the list is exhausted, so the order decides
    what a partial sample looks like. Round-robin means stopping early costs
    depth in every recipe rather than losing the last recipes entirely.
    """
    out = OrderedDict()
    for col in range(max(len(r["ingredients"]) for r in rs)):
        for r in rs:
            if col >= len(r["ingredients"]):
                continue
            i = r["ingredients"][col]
            if i["name"] in STAPLES:
                continue
            out.setdefault(i["name"], (override or {}).get(i["name"], i["name"]))
    return out


def harvest(outfile):
    """Pull every result from every recent run of this actor into outfile.

    Runs keep going after the driver dies, and partial results before an abort
    are charged regardless - so sweep them all up.
    """
    tok = token()
    have = json.load(open(outfile)) if os.path.exists(outfile) else []
    seen = {(it.get("from_url"), it.get("id")) for it in have}
    runs = json.load(urllib.request.urlopen(
        f"https://api.apify.com/v2/acts/{ACTOR}/runs?token={tok}&limit=50&desc=1",
        timeout=60))["data"]["items"]
    added = 0
    for r in runs:
        if not r.get("defaultDatasetId"):
            continue
        try:
            items = json.load(urllib.request.urlopen(
                f"https://api.apify.com/v2/datasets/{r['defaultDatasetId']}/items"
                f"?token={tok}&limit=10000", timeout=120))
        except Exception:
            continue
        for it in items:
            k = (it.get("from_url"), it.get("id"))
            if k not in seen:
                seen.add(k); have.append(it); added += 1
    json.dump(have, open(outfile, "w"), indent=1)
    urls = {it.get("from_url") for it in have}
    print(f"harvested +{added} items; {len(have)} total across {len(urls)} terms")


def as_url(q):
    return "https://www.coles.com.au/search/products?q=" + urllib.parse.quote(q)


def run_batch(urls, tok):
    """One actor run over a handful of URLs. Returns its dataset items.

    ponytail: batches of BATCH, not one big run - the actor scrapes URLs
    sequentially and quits the whole run on the first hard failure, so a single
    blocked term would otherwise cost every term after it. Each run start is
    $0.10, which is the price of that containment.
    """
    import time
    body = json.dumps({"urls": urls, "max_items_per_url": MAX_ITEMS,
                       "ignore_url_failures": True,
                       # ponytail: no proxy. Residential AU took >7min on a single
                       # term; unproxied runs 15-100s and just fails sometimes,
                       # which the retry below absorbs more cheaply.
                       "proxy": {"useApifyProxy": False}}).encode()
    req = urllib.request.Request(
        f"https://api.apify.com/v2/acts/{ACTOR}/runs?token={tok}&memory={MEMORY_MB}",
        data=body, headers={"Content-Type": "application/json"})
    run = json.load(urllib.request.urlopen(req, timeout=60))["data"]
    while run["status"] in ("READY", "RUNNING"):
        time.sleep(10)
        run = json.load(urllib.request.urlopen(
            f"https://api.apify.com/v2/actor-runs/{run['id']}?token={tok}",
            timeout=60))["data"]
    items = json.load(urllib.request.urlopen(
        f"https://api.apify.com/v2/datasets/{run['defaultDatasetId']}/items"
        f"?token={tok}&limit=10000", timeout=120))
    return items, run.get("usageTotalUsd") or 0.0


# One big run per attempt, not small batches: the actor charges $0.10 to start
# regardless, scrapes sequentially, and keeps (and bills for) everything it got
# before it aborts. So the most results per start fee comes from handing it
# everything and just re-running from wherever it died.
BATCH = 40
BUDGET_USD = 2.60


def fetch(queries, outfile):
    tok = token()
    have = json.load(open(outfile)) if os.path.exists(outfile) else []
    done = {it.get("from_url") for it in have}
    todo = [as_url(q) for q in queries if as_url(q) not in done]
    print(f"{len(done)} terms already cached, {len(todo)} to go")
    spent, attempts, dead = 0.0, {}, 0
    while todo and spent < BUDGET_USD:
        batch, todo = todo[:BATCH], todo[BATCH:]
        try:
            items, cost = run_batch(batch, tok)
        except Exception as e:
            print("  batch failed:", e)
            continue
        spent += cost
        got = {it.get("from_url") for it in items}
        have += items
        json.dump(have, open(outfile, "w"), indent=1)   # resumable
        missed = [u for u in batch if u not in got]
        for u in missed:                                 # one retry per term, then give up
            attempts[u] = attempts.get(u, 0) + 1
            if attempts[u] < 5:
                todo.append(u)
        print(f"  +{len(items)} items, {len(missed)} blocked, ${spent:.2f} spent, "
              f"{len(todo)} left")
        dead = dead + 1 if not items else 0
        if dead >= 6:
            print("  six runs blocked back to back - stopping")
            break
        # Coles tightens the block the harder we push; let it cool between runs.
        import time as _t
        _t.sleep(90 if not items else 45)
    print(f"total ${spent:.2f} -> {outfile}")


# ---------------------------------------------------------------- pack sizes

# Coles `size` strings seen in the wild: "400g", "1kg", "500mL", "1L", "6 Pack",
# "Bunch", "Each", "per 1kg", "2 x 400g".
SIZE_RE = re.compile(r"(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b", re.I)
COUNT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(pack|pk|pack\b|each)", re.I)
TO_BASE = {"kg": 1000.0, "g": 1.0, "l": 1000.0, "ml": 1.0}


def parse_size(size):
    """-> (quantity_in_base_units, 'mass'|'volume'|'count', display) or None."""
    if not size:
        return None
    s = size.strip()
    m = SIZE_RE.search(s)
    if m:
        mult = float(m.group(1)) if m.group(1) else 1.0
        qty = float(m.group(2)) * TO_BASE[m.group(3).lower()] * mult
        kind = "volume" if m.group(3).lower() in ("ml", "l") else "mass"
        return qty, kind, s
    m = COUNT_RE.search(s)
    if m:
        return float(m.group(1)), "count", s
    if re.fullmatch(r"(each|bunch|punnet|head|bag|loaf)", s, re.I):
        return 1.0, "count", s
    return None


# recipe unit -> base units. Volumetric spoons are only comparable to a
# millilitre pack size; nothing here converts volume to mass.
UNIT_TO_BASE = {
    "g": (1.0, "mass"), "kg": (1000.0, "mass"),
    "ml": (1.0, "volume"), "l": (1000.0, "volume"),
    "tbsp": (20.0, "volume"), "tsp": (5.0, "volume"),   # AU tablespoon = 20mL
    "": (1.0, "count"),
}
VAGUE = {"handful", "bunch", "thumb", "sprigs", "head", "packet", "loaf",
         "punnet", "pinch", "stalks", "clove", "cloves"}


def need_in_base(ing):
    u = (ing["unit"] or "").lower()
    if u in VAGUE:
        return None, "vague", u
    if u not in UNIT_TO_BASE:
        return None, "unknown-unit", u
    mult, kind = UNIT_TO_BASE[u]
    return ing["amount"] * mult, kind, u


# ---------------------------------------------------------------- the match

def pick(results):
    """The dumb pick: first in-stock result Coles ranked, skipping ads."""
    for r in results:
        if r.get("ad_id"):
            continue
        if r.get("availability") is False:
            continue
        return r
    return results[0] if results else None


def deep_link(p):
    slug = re.sub(r"[^a-z0-9]+", "-", (p.get("name") or "").lower()).strip("-")
    return f"https://www.coles.com.au/product/{slug}-{p['id']}"


def report(products_file, queries):
    items = json.load(open(products_file))
    by_url = {}
    for it in items:
        by_url.setdefault(it.get("from_url"), []).append(it)

    rows = []
    for name, q in queries.items():
        url = "https://www.coles.com.au/search/products?q=" + urllib.parse.quote(q)
        res = by_url.get(url, [])
        p = pick(res)
        ing = INGREDIENT_BY_NAME[name]
        need, kind, unit = need_in_base(ing)
        size = parse_size(p.get("size")) if p else None
        packs, packs_note = None, ""
        if p and size and need is not None:
            if size[1] == kind:
                packs = math.ceil(need / size[0] - 1e-9)
            elif kind == "count" and size[1] in ("mass", "volume"):
                packs_note = "count-vs-weight"
            elif kind == "volume" and size[1] == "mass":
                packs_note = "volume-vs-mass"
            else:
                packs_note = f"{kind}-vs-{size[1]}"
        elif p and not size:
            packs_note = "unparsed-pack-size"
        elif need is None:
            packs_note = kind  # vague / unknown-unit
        rows.append({
            "ingredient": name, "query": q, "original": ing["original"],
            "n_results": len(res),
            "product": (p or {}).get("name"), "brand": (p or {}).get("brand"),
            "size": (p or {}).get("size"),
            "price": ((p or {}).get("pricing") or {}).get("now"),
            "category": ((p or {}).get("merchandise_heir") or {}).get("category"),
            "alternatives": [r.get("name") for r in res[1:]],
            "packs": packs, "note": packs_note,
            "link": deep_link(p) if p else None,
        })
    json.dump(rows, open(os.path.join(HERE, "rows.json"), "w"), indent=1)

    print(f"{'ingredient':26} {'->':2} {'product':46} {'size':10} {'$':>6} {'packs':>5} note")
    for r in rows:
        print(f"{r['ingredient'][:26]:26} -> {str(r['product'])[:46]:46} "
              f"{str(r['size'])[:10]:10} {str(r['price']):>6} "
              f"{str(r['packs']):>5} {r['note']}")
    misses = [r for r in rows if r["product"] is None]
    print(f"\n{len(rows)} terms | no result: {len(misses)} "
          f"| unpriceable packs: {sum(1 for r in rows if r['packs'] is None)}")


if __name__ == "__main__":
    RS = recipes()
    INGREDIENT_BY_NAME = {i["name"]: i for r in RS for i in r["ingredients"]}
    Q = terms(RS)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "fetch":
        fetch(list(Q.values()), os.path.join(HERE, "products.json"))
    elif cmd == "harvest":
        harvest(os.path.join(HERE, "products.json"))
    elif cmd == "terms":
        print(len(Q)); [print(t) for t in Q.values()]
    else:
        report(os.path.join(HERE, "products.json"), Q)
