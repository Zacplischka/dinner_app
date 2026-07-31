#!/usr/bin/env python3
"""Fetch Coles search results straight off the public search page.

The Apify actor turned out to be scraping this same page: coles.com.au embeds
the full product list as JSON in <script id="__NEXT_DATA__">, including brand,
pack size and price. From a residential AU IP a plain GET returns it. From
Apify's datacenter IPs it is blocked hard, which is the whole reason the paid
route exists - and a warning about running this from a production host.

  python3 direct.py           # fill products_direct.json for every recipe term
  python3 direct.py us        # same for the US-vocabulary terms
"""
import json, os, random, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
TOP_N = 5          # keep the top few per term; free, so a little wider than Apify
NEXT_RE = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def search(term):
    url = "https://www.coles.com.au/search/products?q=" + urllib.parse.quote(term)
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
    })
    html = urllib.request.urlopen(req, timeout=45).read().decode("utf-8", "replace")
    m = NEXT_RE.search(html)
    if not m:
        return None, 0
    res = json.loads(m.group(1))["props"]["pageProps"].get("searchResults") or {}
    hits = [r for r in (res.get("results") or []) if r.get("_type") != "AD"]
    for h in hits:
        h["from_url"] = url
    return hits[:TOP_N], res.get("noOfResults")


def run(term_list, outfile):
    have = json.load(open(outfile)) if os.path.exists(outfile) else {}
    todo = [t for t in term_list if t not in have]
    print(f"{len(have)} cached, {len(todo)} to fetch")
    attempts, cooldown = {}, 20.0
    while todo:
        t = todo.pop(0)
        attempts[t] = attempts.get(t, 0) + 1
        try:
            hits, total = search(t)
        except Exception as e:
            hits, total = None, None
            print(f"  {t}: FAILED {e}")
        if hits is None:
            # Incapsula ramps up the moment we look automated; back off hard and
            # come back to this term at the end of the queue.
            print(f"  {t}: blocked (attempt {attempts[t]}), cooling {cooldown:.0f}s, "
                  f"{len(todo)} left")
            if attempts[t] < 4:
                todo.append(t)
            time.sleep(cooldown)
            cooldown = min(cooldown * 1.6, 180)
            continue
        have[t] = {"total": total, "hits": hits}
        json.dump(have, open(outfile, "w"), indent=1)
        print(f"  {t}: {total} results, kept {len(hits)} ({len(todo)} left)")
        cooldown = max(cooldown * 0.8, 20)
        time.sleep(random.uniform(4.0, 8.0))   # be a polite guest
    print(f"done: {len(have)} terms -> {outfile}")


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    if len(sys.argv) > 1 and sys.argv[1] == "us":
        pairs = json.load(open(os.path.join(HERE, "us_terms.json")))["pairs"]
        run([p["us"] for p in pairs], os.path.join(HERE, "us_direct.json"))
    else:
        from match import recipes, terms
        run(list(terms(recipes()).values()),
            os.path.join(HERE, "products_direct.json"))
