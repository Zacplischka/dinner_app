#!/usr/bin/env python3
"""Fetch Woolworths search results for every recipe ingredient.

Woolworths exposes a real JSON API (POST /apis/ui/Search/products) rather than
Coles' Incapsula-guarded HTML. One GET to seed a session cookie and it answers
every term without rate limiting - 80 terms straight through, where Coles blocked
after ~5.

  python3 woolies.py        # -> woolies_products.json
"""
import http.cookiejar as cj
import json, os, random, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
BASE = "https://www.woolworths.com.au"
TOP_N = 5

jar = cj.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def seed():
    req = urllib.request.Request(
        BASE + "/shop/search/products?searchTerm=carrot",
        headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})
    opener.open(req, timeout=45).read()


def search(term):
    loc = "/shop/search/products?searchTerm=" + urllib.parse.quote(term)
    body = json.dumps({
        "SearchTerm": term, "PageNumber": 1, "PageSize": 10,
        "SortType": "TraderRelevance", "IsSpecial": False, "Location": loc,
        "formatObject": json.dumps({"name": term}), "isBundle": False,
        "isMobile": False, "Filters": [],
    }).encode()
    req = urllib.request.Request(BASE + "/apis/ui/Search/products", data=body, headers={
        "User-Agent": UA, "Content-Type": "application/json",
        "Accept": "application/json", "Origin": BASE, "Referer": BASE + loc})
    d = json.load(opener.open(req, timeout=45))
    hits = []
    for g in (d.get("Products") or [])[:TOP_N]:
        p = (g.get("Products") or [{}])[0]
        aa = p.get("AdditionalAttributes") or {}
        hits.append({
            "id": p.get("Stockcode"), "name": p.get("Name"), "brand": p.get("Brand"),
            "size": p.get("PackageSize"), "now": p.get("Price"),
            "cup": p.get("CupString"), "avail": p.get("IsAvailable"),
            "url": f"{BASE}/shop/productdetails/{p.get('Stockcode')}",
            # the re-ranker's raw material: which part of the shop this sits in
            "cats": aa.get("piescategorynamesjson"),
            "subcats": aa.get("piessubcategorynamesjson"),
            "sapcat": aa.get("sapcategoryname"),
            "sapsub": aa.get("sapsubcategoryname"),
        })
    return {"total": d.get("SearchResultsCount"), "hits": hits}


def run(term_list, outfile):
    have = json.load(open(outfile)) if os.path.exists(outfile) else {}
    todo = [t for t in term_list if t not in have]
    print(f"{len(have)} cached, {len(todo)} to fetch")
    for i, t in enumerate(todo, 1):
        try:
            have[t] = search(t)
            print(f"  [{i}/{len(todo)}] {t}: {have[t]['total']} results")
        except Exception as e:
            print(f"  [{i}/{len(todo)}] {t}: FAILED {e}")
            time.sleep(5)
            continue
        json.dump(have, open(outfile, "w"), indent=1)
        time.sleep(random.uniform(0.6, 1.4))
    print(f"done: {len(have)} terms -> {outfile}")


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    from match import recipes, terms
    seed()
    ts = list(terms(recipes()).values())
    us = [p["us"] for p in json.load(
        open(os.path.join(HERE, "us_terms.json")))["pairs"]]
    run(ts + us, os.path.join(HERE, "woolies_products.json"))
