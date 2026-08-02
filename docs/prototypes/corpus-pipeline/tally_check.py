#!/usr/bin/env python3
"""#318 live tally gate: every non-staple line must land Priced or Estimated.

Reads records/<slug>/recipe.json, searches Woolworths live (store follows our
egress; the response's FulfilmentStoreId is recorded so 1101 is verifiable),
re-ranks with rerank.pick_smart, classifies with gate.resolve (#241/#245
ladder), and reports N/M in tally per recipe.

  python3 tally_check.py spaghetti-bolognese red-lentil-dhal
  python3 tally_check.py --all
"""
import glob
import http.cookiejar as cj
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gate import COUNT_UNITS, MASS, VOL, resolve, viable  # noqa: E402
from match import STAPLES  # noqa: E402
from rerank import pick_smart  # noqa: E402

# Pilot amendment (AGENT-BRIEF): tiny dried aromatics are Staples. Local
# extension only — match.py's set stays the #245 baseline.
STAPLES = STAPLES | {"bay leaf", "bay leaves"}

BASE = "https://www.woolworths.com.au"
# Headers copied exactly from backend/src/services/woolworthsClient.ts
# (IDENTITY_HEADERS): pinned browser UA, never rotated, identity carried in
# From + X-Requested-With per ADR 0010.
IDENTITY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "From": "zacplischka@gmail.com",
    "X-Requested-With": "Dinder/1.0 (+https://github.com/Zacplischka/dinner_app)",
}
TOP_N = 5
CACHE_FILE = os.path.join(HERE, "gate", "woolies-cache.json")
RAW_SAMPLE = os.path.join(HERE, "gate", "raw-sample.json")

# ponytail: one process, one opener, sequential fetch loop = the global queue.
jar = cj.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
_seeded = False


def _seed():
    """One GET seeds the session cookies the search API expects (same as the
    backend client's seed())."""
    req = urllib.request.Request(
        BASE + "/shop/search/products?searchTerm=carrot",
        headers={**IDENTITY_HEADERS, "Accept": "text/html,application/xhtml+xml"})
    opener.open(req, timeout=45).read()


def _search(term):
    """POST /apis/ui/Search/products — body shape copied from the backend
    client / #245 harness. Returns the trimmed top-5 candidate record."""
    global _seeded
    if not _seeded:
        _seed()
        _seeded = True
    loc = "/shop/search/products?searchTerm=" + urllib.parse.quote(term)
    body = json.dumps({
        "SearchTerm": term, "PageNumber": 1, "PageSize": 10,
        "SortType": "TraderRelevance", "IsSpecial": False, "Location": loc,
        "formatObject": json.dumps({"name": term}), "isBundle": False,
        "isMobile": False, "Filters": [],
    }).encode()
    req = urllib.request.Request(BASE + "/apis/ui/Search/products", data=body, headers={
        **IDENTITY_HEADERS, "Content-Type": "application/json",
        "Accept": "application/json", "Origin": BASE, "Referer": BASE + loc})
    d = json.load(opener.open(req, timeout=45))
    if not os.path.exists(RAW_SAMPLE):
        json.dump(d, open(RAW_SAMPLE, "w"), indent=1)
    store = d.get("FulfilmentStoreId")
    hits = []
    for g in (d.get("Products") or [])[:TOP_N]:
        p = (g.get("Products") or [{}])[0]
        aa = p.get("AdditionalAttributes") or {}
        store = store or p.get("FulfilmentStoreId")
        hits.append({
            "id": p.get("Stockcode"), "name": p.get("Name"), "brand": p.get("Brand"),
            "size": p.get("PackageSize"), "now": p.get("Price"),
            "cup": p.get("CupString"), "avail": p.get("IsAvailable"),
            "url": f"{BASE}/shop/productdetails/{p.get('Stockcode')}",
            # rerank.py's raw material: which part of the shop this sits in
            "cats": aa.get("piescategorynamesjson"),
            "subcats": aa.get("piessubcategorynamesjson"),
            "sapcat": aa.get("sapcategoryname"),
            "sapsub": aa.get("sapsubcategoryname"),
        })
    return {"store": store, "total": d.get("SearchResultsCount"), "hits": hits}


_cache = json.load(open(CACHE_FILE)) if os.path.exists(CACHE_FILE) else {}


def lookup(term):
    if term not in _cache:
        _cache[term] = _search(term)
        json.dump(_cache, open(CACHE_FILE, "w"), indent=1)
        time.sleep(0.6)  # politeness: sequential, never parallel
    return _cache[term]


def check(slug):
    recipe = json.load(open(os.path.join(HERE, "records", slug, "recipe.json")))
    rows = []
    for ing in recipe["extendedIngredients"]:
        if ing["name"] in STAPLES:
            continue
        # searchTerm (AGENT-BRIEF amendment) decouples matchable search from
        # the cook-honest display name.
        term = (ing.get("searchTerm") or ing["name"]).lower()
        rec = lookup(term)
        cands = [h for h in rec["hits"] if viable(h)]
        u = (ing["unit"] or "").lower()
        if u in MASS:
            need, kind = ing["amount"] * MASS[u], "mass"
        elif u in VOL:
            need, kind = ing["amount"] * VOL[u], "volume"
        else:
            need, kind = (ing["amount"], "count") if u in COUNT_UNITS else (None, None)
        pick = pick_smart(cands, need, kind, ing["name"]) if cands else None
        if pick is None:
            row = dict(state="unmatched", rung="-", why="no viable candidate (#243 trigger)")
        else:
            row = resolve(ing, pick)
        row.update(ingredient=ing["name"], original=ing["original"], store=rec["store"],
                   product=(pick or {}).get("name"), size=(pick or {}).get("size"),
                   id=(pick or {}).get("id"))
        rows.append(row)

    print(f"== {slug}")
    for r in rows:
        price = f"${r['price']:.2f}" if r.get("price") is not None else "-"
        print(f"  {r['original'][:36]:36} {r['state']:16} {price:>8}  "
              f"{str(r.get('product'))[:44]} {r.get('why', '')}")
    n = sum(1 for r in rows if r["state"] in ("priced", "estimated"))
    print(f"  {n}/{len(rows)} in tally ({100 * n / len(rows):.0f}%)\n")
    json.dump(rows, open(os.path.join(HERE, "gate", f"tally-{slug}.json"), "w"), indent=1)
    return n, len(rows)


if __name__ == "__main__":
    args = sys.argv[1:] or ["--all"]
    slugs = (sorted(os.path.basename(os.path.dirname(f))
                    for f in glob.glob(os.path.join(HERE, "records", "*", "recipe.json")))
             if args == ["--all"] else args)
    tot_n = tot_d = 0
    for slug in slugs:
        n, d = check(slug)
        tot_n += n
        tot_d += d
    print(f"TOTAL {tot_n}/{tot_d} in tally ({100 * tot_n / tot_d:.0f}%)  "
          f"gate (100%): {'PASS' if tot_n == tot_d else 'FAIL'}")
