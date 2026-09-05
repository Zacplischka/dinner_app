# A committed Wikipedia/Wikidata corpus is the movie source

The Watch Branch deals Movies ([#369](https://github.com/Zacplischka/dinner_app/issues/369)) and had no key to deal them with: TMDB and OMDb both refuse keyless calls. It also needs far less than a catalogue — a group of at most four swipes ~15 well-known films a Deck. And unlike Restaurants, whose supply is bound to where the group is and must be fetched per Session, a movie catalogue is the same everywhere, so it can be built once and shipped. This record settles the supply as reference data (ADR 0011) and names the seam the day it runs thin.

**The corpus.** ~300 well-known films, committed as `backend/src/data/movies.generated.ts` and built by `scripts/build-movie-corpus.mjs` from a seed list of titles (`scripts/movie-titles.json`). The en.wikipedia Action API supplies each film's poster thumbnail, opening sentences and Wikidata id; Wikidata SPARQL supplies year, runtime, genres, review scores and a trailer id. Both are keyless behind a descriptive User-Agent, called sequentially — about twenty requests for the whole corpus. A rebuild is a human running the script and reviewing the diff, occasionally. At runtime `MovieDeckService` filters the corpus by Mood and shuffles it in memory; nothing calls Wikipedia or Wikidata.

**Identity is the Wikidata QID**, carried in `placeId` like every Deck Entry's. ADR 0002's rationale holds unchanged — Sessions are ephemeral, so borrowing a stable public id costs nothing — and a QID buys the join to every other movie database: Wikidata carries the IMDb id, which TMDB's `/find` resolves directly.

**The rating is a critics score** on one 0–100 scale: Wikidata's hand-entered snapshot of the Rotten Tomatoes Tomatometer, else Metacritic's Metascore, else absent. IMDb's 0–10 covered a third of the seeds and sits on a different scale; mixing it in would have had the Top Pick's middle rung comparing unlike with unlike.

**Posters are hot-linked** from `upload.wikimedia.org`, which Commons permits (CORS open; any browser User-Agent gets a 200). They are English Wikipedia's fair-use uploads — identifying a film by its poster is the posture every movie app takes, and the app makes that call itself rather than inheriting a licence. Overviews are CC BY-SA 4.0; the generated module records the attribution route to each article.

**`MovieSource` is the seam.** One function from a Mood to Movies, with the corpus as its only implementation. TMDB replaces it when the corpus runs thin — a key, higher-res posters, a live score, watch providers — and nothing above the seam changes.

**What was rejected:**

- **TMDB / OMDb** — keys required (TMDB 401s without one). Kept as the upgrade path, not the v1 source.
- **iTunes Search** — returns zero movies for every query from both Australian and US egress while still answering for music; Apple has wound movie results down.
- **Wikipedia + SPARQL at request time**, cached per film in Redis — the research's first recommendation. ~2 s cold from Sydney, Wikidata's public endpoint has bad days (one heavy query took 19 s), and it puts a third party's rate limits in the create path. Copying the enrichment into the repo once removes all three.

## Consequences

- Zero marginal cost per Watch decision, no new fixed cost line, and no rate-limit exposure at runtime.
- Poster URLs can rot — Wikimedia files get renamed or deleted (research found ~1 in 40 dead in a five-year-old dataset). `RetryingPhoto` retries once and then drops the poster, leaving the title card; re-running the script regenerates the URL. There is deliberately no request-time self-healing.
- Posters are soft on a 2× phone: en.wiki fair-use uploads are ~220–320 px wide and the thumbnail service refuses to upscale them. TMDB's `w500` is the fix, behind the seam.
- The corpus is the whole catalogue. A Mood that matches nothing is refused inline with the chips as the Host set them; there is no Nearest Mood, because dropping a chip is the whole fix.
- Wikipedia text carries a CC BY-SA attribution obligation; Wikidata facts are CC0; the critics score is a snapshot, not live.
