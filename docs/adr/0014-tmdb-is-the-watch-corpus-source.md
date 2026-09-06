# TMDB is the Watch corpus source, built offline

ADR 0013 shipped the Watch Branch on ~300 hand-seeded films from Wikipedia and Wikidata and named the seam TMDB would take "when it runs thin". It ran thin at once: a Mood like 1970s + Horror drew from a handful of titles, posters were soft on a phone, there were no television series, and growing a seed list by hand does not scale to thousands. This record moves the supply to TMDB while keeping everything 0013 got right — the corpus is still reference data (ADR 0011), still committed, still dealt in memory, and `MovieSource` is still the seam.

**The key never reaches production.** `scripts/build-movie-corpus.mjs` calls TMDB with `TMDB_API_KEY` and writes `backend/movies/movies.json`; the backend reads that file at boot through `loadMovieCorpus()` and nothing at runtime calls TMDB. The key is an operator credential like the corpus pipeline's, plus one GitHub secret for the quarterly rebuild workflow. Prod stays keyless for the Watch Branch, and a TMDB outage cannot touch a Session.

**~5,000 films and ~1,000 series**, the English-original titles with the most votes on TMDB released from 1950 on, one detail call each (`external_ids`, `videos` appended). Sorted by vote count, not TMDB's popularity: popularity is a daily trending signal that would fill the file with this month's releases, and "the titles most people have rated" is what "well-known" means. Roughly every title with 50,000-plus IMDb votes; past ten thousand titles a Deck fills with things nobody at the table recognises.

**A series is a Movie.** `mediaType: 'movie' | 'tv'` on the shared `Movie` type, `seasons` for a series, and a third Mood axis, `mediaTypes`, empty or absent meaning both. One Deck Entry kind, one card, one crown, one Top Pick rule; the setup screen and the crown say "Series" to people. A fourth kind would have doubled the union, the guards, the card, the crown and the tests for a distinction the swipe does not care about. Both new fields are optional on the wire, so a Session persisted before this deploy re-deals through the same code (ADR 0007).

**Identity is `tmdb:<movie|tv>:<id>`** in `placeId`, like every Deck Entry's. The two TMDB id spaces overlap (film 1402 and series 1402 are different titles), so the type is part of the id. The frontend derives the title's TMDB page and its where-to-watch page from it; the IMDb id rides beside it as `imdbId` for one link on the crown. IMDb's own datasets were rejected as a source: their licence is personal and non-commercial and forbids republishing into any database, which a public site is.

**The score is TMDB's user score**, `vote_average × 10` on one 0–100 scale, replacing 0013's critics score. Every title has one, from one source, so the Top Pick's middle rung compares like with like. Known bias, accepted: series score higher than films on TMDB, so a mixed Deck's tie-break leans series.

**Deals cut to the best-known.** The corpus is in vote order and `redealMovieDeck` shuffles only the first `POOL_CAP` (120) matches of a Mood, so a broad Mood deals titles a table has heard of instead of a uniform draw over thousands; a Restart still has 105 unshown titles before it repeats one.

**Posters are TMDB's**, hot-linked at `w500`, sharp on a 2× phone. **Attribution** follows TMDB's terms: the logo and "Data from TMDB" under every overview, and the logo with "This product uses the TMDB API but is not endorsed or certified by TMDB" on the Watch setup screen. **Where to watch** is TMDB's own page for the title in Australia — JustWatch's data on the page whose licence already covers it, at the cost of no API call and no JustWatch credit of our own.

**Rebuilt at least quarterly.** TMDB forbids caching its data for longer than six months; `.github/workflows/movie-corpus.yml` runs the builder on a cron and opens a pull request when the file changes, and the diff is one title per line so a rebuild reads as a list of what came and went.

**What was rejected:**

- **TMDB at request time** — a key in Railway and `/discover` in the create path would have allowed "only what is on Netflix" as a chip, and put a third party's rate limits and outages into every Watch Session. The same reason 0013 kept Wikidata out of the create path.
- **Staying keyless** — TMDB's daily id export carries popularity without a key and Wikidata maps it to a QID, but posters would have stayed soft, a third of titles lose the join, and series would have needed TVmaze as a second source.
- **Shipping watch providers** — snapshotting AU providers per title needs a JustWatch credit and goes stale between rebuilds; a link to the page that is always current does not.

## Consequences

- The corpus is a ~3.5 MB JSON file outside `src/`, read and schema-checked at boot in tens of milliseconds; `tsc` never sees it.
- The loader's schema refuses a genre no chip offers; the unit test pins that every chip can deal. GENRES gained History, Western and Music (for Musical); DECADES gained the 1950s and 1960s.
- A Mood that matches nothing is still refused inline with the chips as the Host set them; with thousands of titles that is now rare enough that the contract test needs a fixture corpus to reach it.
- If Dinder ever takes money or shows advertising, TMDB's commercial licence is a conversation to have first.
- Supersedes ADR 0013 on source, identity, rating, posters and credit; 0013's reference-data posture and seam stand.
