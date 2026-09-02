// The corpus pipeline's third gate layer (#337): the tally. Every non-Staple
// Ingredient Line of an Owned Recipe has to land *in the Tally* — Priced or
// Estimated after the full #241 quantity ladder — and the judgement is per
// Recipe, not per batch: a Shopping List with one unpriceable line is a
// Shopping List with a hole in it, and averaging that away across a corpus
// would hide exactly the Recipe that has one. Read
// docs/adr/0010-woolworths-public-search-api-is-the-grocery-pricing-source.md
// before changing anything here.
//
//   - **It runs last of the machine layers** because it is the only one that
//     spends money nobody can print: the politeness budget ADR 0010 chose (one
//     browsing human, app-wide). Structural and culinary are free, so they get
//     first refusal on every Recipe and this layer only ever sees drafts that
//     already deserve measuring.
//   - **It measures at store 1101, through production's egress**, by running
//     the measurement *inside the Railway container* (#245's method) rather
//     than from here. Production is served store 1101 where residential AU gets
//     3221, with different result sets, different top-5 orderings and different
//     prices; basket-level divergence between the two stores is ~1.5%, so the
//     pilot's store-3221 numbers are the wrong store's numbers. The gate refuses
//     any answer that did not come from the reference store.
//   - **It never runs beside live traffic.** The queue is per-process, so a
//     measurement run and a Shopping List mint are two hands on one budget —
//     the pilot brushed a 403 doing precisely that. The container half refuses
//     to start, and refuses to continue, while any live Session exists.
//   - **A store-availability miss is a fact about the store, not a defect in
//     the Recipe.** Buk choy simply is not ranged at 1101. Both fail the Recipe
//     — this is a *this-store* gate and the spec says so — but only one of them
//     is something an author can rewrite, and the report keeps them apart.
//
// The measurement runs the code that is *deployed*, not the code in this
// worktree: `railway ssh` executes the container's own copy of this file
// against the container's own `backend/dist`. That is the point — the answer is
// about production's matcher, ladder, Staples and store, not about a lane's.
//
//   node scripts/corpus/tally.mjs check   <recordsDir> [slug...]
//   node scripts/corpus/tally.mjs measure <base64-payload>   # inside the container only

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

/**
 * The store the corpus is judged against — production's, per #242/#245. Not a
 * default that a run may override: a Recipe measured anywhere else has not been
 * through this gate.
 */
export const REFERENCE_STORE_ID = 1101;

/** The two of #234's four states that count towards a Tally. */
const IN_TALLY = new Set(['priced', 'estimated']);

/** The ladder's own words for "the store priced nothing", as opposed to ours. */
const NO_PRICE = 'no price on product';

/** The line the container prints its one verdict on, so CLI noise never is one. */
const VERDICT = 'TALLY ';

// ------------------------------------------------------- what travels

/**
 * The Recipes as the container prices them: every ingredient, Staples included.
 * The Staple rule is `backend/src/services/staples.ts` and it runs there, beside
 * the mint's own use of it — filtering here would be a second spelling of it,
 * and the gate's meaning would drift from the Shopping List's.
 */
export const probePayload = (records) =>
  records.map(({ slug, recipe }) => ({
    slug,
    ingredients: recipe.ingredients.map(({ name, searchTerm, amount, unit }) => ({
      name,
      ...(searchTerm === undefined ? {} : { searchTerm }),
      amount,
      unit,
    })),
  }));

// ------------------------------------------------------- the grading

/**
 * One Recipe's measurement as a verdict. `defects` are the author's to fix;
 * `storeFacts` are the store's and no rewrite reaches them; `unmeasured` is
 * neither — the Retailer answered unusably and this Recipe simply has no
 * measurement yet, which is not a pass and not a failure either.
 */
export function tallyReport({ slug, lines }) {
  const report = { slug, measured: 0, inTally: 0, defects: [], storeFacts: [], unmeasured: [] };
  for (const line of lines) {
    // A Staple is assumed already at home: outside the list total, outside
    // every Tally, and so outside this count as well.
    if (line.staple) continue;
    const term = line.searchTerm ?? line.name;
    if (line.outcome === 'failed') {
      report.unmeasured.push(`"${term}" — Woolworths answered unusably; nothing was measured`);
      continue;
    }
    report.measured += 1;
    if (IN_TALLY.has(line.state)) {
      report.inTally += 1;
    } else if (line.outcome === 'no_product') {
      report.storeFacts.push(`"${term}" is not ranged at store ${REFERENCE_STORE_ID}`);
    } else if (line.available === false) {
      report.storeFacts.push(`"${term}" is ranged at store ${REFERENCE_STORE_ID} but not stocked`);
    } else if (line.reason === NO_PRICE) {
      report.storeFacts.push(`"${term}" is ranged at store ${REFERENCE_STORE_ID} with no price`);
    } else {
      report.defects.push(
        `ingredient ${JSON.stringify(line.name)} is out of the Tally: ${line.reason} — ` +
          'restate its amount in a unit the ladder can buy, or give it a matchable "searchTerm"'
      );
    }
  }
  report.passed = !report.defects.length && !report.storeFacts.length && !report.unmeasured.length;
  return report;
}

// ------------------------------------------------------- the probe

const execFileAsync = promisify(execFile);

/**
 * The measurement, run where production runs. The payload is base64 so that
 * nothing between here and the container — a shell, an SSH argv — has a quote
 * or a brace to chew on.
 *
 * `railway ssh` needs a registered key and `ssh.railway.com` in known_hosts
 * (AGENTS.md); without them this fails before it spends a single request.
 */
export async function railwayProbe(payload, run = execFileAsync) {
  const { stdout } = await run(
    'railway',
    [
      'ssh',
      'node',
      'scripts/corpus/tally.mjs',
      'measure',
      Buffer.from(JSON.stringify(payload)).toString('base64'),
    ],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const verdict = String(stdout)
    .split('\n')
    .find((line) => line.startsWith(VERDICT));
  if (!verdict) throw new Error(`TALLY_NO_MEASUREMENT: the container answered\n${stdout}`);
  return JSON.parse(verdict.slice(VERDICT.length));
}

/**
 * Every Recipe measured, in the order asked. Refuses an answer from the wrong
 * store, and refuses a short one: a Recipe the run skipped has not passed this
 * layer, and letting it read as a pass is the failure mode the gate exists for.
 */
export async function tallyGate(records, probe = railwayProbe) {
  const { storeId, recipes } = await probe(probePayload(records));
  if (storeId !== REFERENCE_STORE_ID) {
    throw new Error(
      `TALLY_WRONG_STORE: measured at ${storeId}, not ${REFERENCE_STORE_ID} — ` +
        'the corpus is judged at production’s reference store or not at all'
    );
  }
  const measured = new Set(recipes.map((recipe) => recipe.slug));
  const missing = records.filter((record) => !measured.has(record.slug)).map((r) => r.slug);
  if (missing.length) throw new Error(`TALLY_UNMEASURED_RECIPES: ${missing.join(', ')}`);
  return { storeId, reports: recipes.map(tallyReport) };
}

// ------------------------------------------------------- the container half

/**
 * The live Sessions standing between this run and the politeness budget — the
 * first one found, because one is already the answer. Read-only: a SCAN, never
 * a pattern delete.
 */
export async function liveSessions(redis) {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'session:*', 'COUNT', 500);
    if (keys.length) return keys;
    cursor = next;
  } while (cursor !== '0');
  return [];
}

/**
 * The measurement itself, and the only half that touches Woolworths. It runs in
 * the production container, so it composes production's own services out of
 * `backend/dist` exactly as `server.ts` does — same matcher, same ladder, same
 * price cache, same 500 ms politeness floor, same store.
 *
 * ponytail: the three lines that turn an ingredient into a state mirror
 * `ShoppingListService.buildLine`, which is not exported and would need a whole
 * Session's worth of dependencies to reach. Mirror them if the mint changes;
 * the seed corpus failing this gate is what would say so.
 */
async function measure(encoded) {
  const dist = (path) => import(new URL(`../../backend/dist/${path}`, import.meta.url).href);
  const [
    { config },
    { redis },
    { isStaple },
    { createWoolworthsClient },
    { createProductMatchService },
    { createQuantityLadder },
    { createSpoonacularClient, guardDailyPoints },
  ] = await Promise.all([
    dist('config/index.js'),
    dist('redis/client.js'),
    dist('services/staples.js'),
    dist('services/woolworthsClient.js'),
    dist('services/ProductMatchService.js'),
    dist('services/quantityLadder.js'),
    dist('services/spoonacularClient.js'),
  ]);

  const refuseLiveTraffic = async () => {
    const live = await liveSessions(redis);
    if (live.length) {
      throw new Error(
        `TALLY_LIVE_TRAFFIC: ${live[0]} is live — the politeness budget is shared with it`
      );
    }
  };

  const matcher = createProductMatchService({
    redis,
    client: createWoolworthsClient((...args) => fetch(...args)),
  });
  const ladder = createQuantityLadder({
    redis,
    client: createSpoonacularClient(guardDailyPoints(redis, (...args) => fetch(...args))),
  });

  const recipes = [];
  try {
    for (const { slug, ingredients } of JSON.parse(Buffer.from(encoded, 'base64').toString())) {
      // Re-checked per Recipe: a Session that opens mid-run is live traffic too.
      await refuseLiveTraffic();
      const lines = [];
      for (const ingredient of ingredients) {
        const term = ingredient.searchTerm ?? ingredient.name;
        if (isStaple(ingredient.name)) {
          lines.push({ name: ingredient.name, searchTerm: term, staple: true });
          continue;
        }
        const outcome = await matcher.matchProduct(term);
        const resolution = await ladder.resolveLine(
          {
            name: term,
            amount: ingredient.amount > 0 ? ingredient.amount : null,
            unit: ingredient.unit,
          },
          outcome
        );
        lines.push({
          name: ingredient.name,
          searchTerm: term,
          staple: false,
          outcome: outcome.status,
          state: resolution.state,
          reason: resolution.reason,
          available: outcome.match?.available,
        });
      }
      recipes.push({ slug, lines });
    }
    // Read after the run, not before: the Matcher rewrites this key the moment
    // production is served another store, and a run that drifted mid-way must
    // report where it ended up rather than where it thought it was going.
    const stored = Number(await redis.get('woolworths:store'));
    const storeId = Number.isFinite(stored) && stored ? stored : config.woolworths.defaultStoreId;
    console.log(VERDICT + JSON.stringify({ storeId, recipes }));
  } finally {
    await redis.quit();
  }
}

// ------------------------------------------------------- the CLI

/** Every `<recordsDir>/<slug>/recipe.json`, or just the named slugs. */
function loadRecords(recordsDir, slugs) {
  const present = readdirSync(recordsDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(recordsDir, entry.name, 'recipe.json'))
    )
    .map((entry) => entry.name);
  for (const slug of slugs) {
    if (!present.includes(slug)) throw new Error(`no ${join(recordsDir, slug, 'recipe.json')}`);
  }
  return (slugs.length ? slugs : present.sort()).map((slug) => ({
    slug,
    recipe: JSON.parse(readFileSync(join(recordsDir, slug, 'recipe.json'), 'utf8')),
  }));
}

async function check(recordsDir, slugs) {
  const { storeId, reports } = await tallyGate(loadRecords(recordsDir, slugs));
  for (const report of reports) {
    const head = `${report.slug}: ${report.inTally}/${report.measured}`;
    if (report.passed) {
      console.log(`${head} in tally`);
      continue;
    }
    console.log(
      [
        `${head} in tally — FAIL`,
        ...report.defects.map((defect) => `  defect: ${defect}`),
        ...report.storeFacts.map((fact) => `  store ${storeId}: ${fact}`),
        ...report.unmeasured.map((line) => `  unmeasured: ${line}`),
      ].join('\n')
    );
  }
  const passed = reports.filter((report) => report.passed).length;
  console.log(`\n${passed}/${reports.length} in tally at store ${storeId}`);
  if (passed !== reports.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'check' && rest[0]) await check(rest[0], rest.slice(1));
  else if (command === 'measure' && rest[0]) await measure(rest[0]);
  else {
    console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n\n')[0]);
    process.exit(2);
  }
}
