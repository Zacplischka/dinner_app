# Does the Woolworths search API answer from Railway's egress IP?

Throwaway measurement for [#242](https://github.com/Zacplischka/dinner_app/issues/242). Not shipped code.

Every Woolworths number on the map so far — [#231](https://github.com/Zacplischka/dinner_app/issues/231)'s 80 terms, [#240](https://github.com/Zacplischka/dinner_app/issues/240)'s live checks — was taken from a residential Australian connection. Production runs on Railway. This runs the identical request shape from both and diffs them.

## How it was run

`probe.mjs` is `docs/prototypes/ingredient-product-matching/woolies.py` ported to Node so it can run inside the deployed container with no dependencies:

```sh
# residential control
PROBE_TERMS="$(cat terms.json)" node probe.mjs

# Railway egress — exec inside the running backend container
B64=$(base64 -i probe.mjs)
railway ssh "sh -c 'echo $B64 | base64 -d > /tmp/p.mjs && PROBE_TERMS=... node /tmp/p.mjs'"
```

Same 80 terms as #231. `railway ssh` needs a registered SSH key (`railway ssh keys add`) and `ssh.railway.com` in `known_hosts`.

## Egress points measured

| | IP | Location | ASN |
|---|---|---|---|
| Residential control | 120.148.27.185 | Melbourne, AU | AS1221 Telstra |
| Railway production | 162.220.232.86 | Santa Clara, US | AS400940 Railway |

## Results

`results/` holds the raw captures.

| file | what |
|---|---|
| `results/railway_1s.json` | 80 terms, 1s apart, from Railway |
| `results/residential_1s.json` | same 80 terms, same day, residential |
| `results/railway_burst.json` | 80 terms back-to-back, no delay, from Railway |
| `results/railway_storepin_concurrency.json` | `bff_region` store-pinning attempts + two 12-wide concurrent rounds |

194 requests from Railway, **zero non-200**. No rate limiting, no challenge, no degradation. Both egress points get the same Akamai Bot Manager cookies from the seed GET and are waved through.

The difference is the **store**: Railway is served `FulfilmentStoreId: 1101`, residential AU gets `3221`. That moves catalogue, ordering, price and availability — see #242's resolution comment for the diff.
