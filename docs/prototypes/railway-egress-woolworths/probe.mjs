// wayfinder #242 — does the Woolworths search API answer from this host's egress IP?
// Same request shape as docs/prototypes/ingredient-product-matching/woolies.py
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://www.woolworths.com.au";
const TERMS = JSON.parse(process.env.PROBE_TERMS || "[]");
const DELAY = Number(process.env.PROBE_DELAY || 1000);

const jar = new Map();
const absorb = (res) => {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
};
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = { where: {}, seed: null, terms: [], sample: null };

// 1. who are we
try {
  const r = await fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(15000) });
  out.where = await r.json();
} catch (e) { out.where = { error: String(e) }; }

// 2. seed the session cookie off the search page
{
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/shop/search/products?searchTerm=carrot`, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(45000),
    });
    absorb(res);
    const body = await res.text();
    out.seed = {
      status: res.status, ms: Date.now() - t0, bytes: body.length,
      cookies: [...jar.keys()],
      server: res.headers.get("server"), xcdn: res.headers.get("x-cdn"),
      incap: /incap|imperva|_Incapsula/i.test(body) || [...res.headers.keys()].some((h) => /incap/i.test(h)),
      snippet: res.ok ? null : body.slice(0, 400),
    };
  } catch (e) { out.seed = { error: String(e), ms: Date.now() - t0 }; }
}

// 3. sequential search terms
for (const [i, term] of TERMS.entries()) {
  const loc = "/shop/search/products?searchTerm=" + encodeURIComponent(term);
  const t0 = Date.now();
  const rec = { n: i + 1, term };
  try {
    const res = await fetch(`${BASE}/apis/ui/Search/products`, {
      method: "POST",
      headers: {
        "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json",
        Origin: BASE, Referer: BASE + loc, Cookie: cookie(),
      },
      body: JSON.stringify({
        SearchTerm: term, PageNumber: 1, PageSize: 10, SortType: "TraderRelevance",
        IsSpecial: false, Location: loc, formatObject: JSON.stringify({ name: term }),
        isBundle: false, isMobile: false, Filters: [],
      }),
      signal: AbortSignal.timeout(45000),
    });
    absorb(res);
    rec.status = res.status;
    rec.ms = Date.now() - t0;
    const text = await res.text();
    let d = null;
    try { d = JSON.parse(text); } catch { rec.body = text.slice(0, 400); }
    if (d) {
      rec.total = d.SearchResultsCount;
      const p = d.Products?.[0]?.Products?.[0];
      if (p) rec.top = { id: p.Stockcode, name: p.Name, price: p.Price, instore: p.InstorePrice, cup: p.CupString, avail: p.IsAvailable };
      rec.ids = (d.Products || []).slice(0, 5).map((g) => g.Products?.[0]?.Stockcode);
      if (!out.sample) {
        out.sample = {
          topLevelKeys: Object.keys(d),
          storeFields: Object.fromEntries(Object.entries(d).filter(([k]) => /store|fulfil|location|suburb|postcode/i.test(k))),
          productStoreFields: p ? Object.fromEntries(Object.entries(p).filter(([k]) => /store|fulfil|price|delivery/i.test(k))) : null,
        };
      }
    }
  } catch (e) { rec.error = String(e); rec.ms = Date.now() - t0; }
  out.terms.push(rec);
  process.stderr.write(`[${rec.n}/${TERMS.length}] ${term}: ${rec.status ?? rec.error} ${rec.total ?? ""}\n`);
  if (i < TERMS.length - 1) await sleep(DELAY);
}

console.log("PROBE_JSON_START");
console.log(JSON.stringify(out));
console.log("PROBE_JSON_END");
