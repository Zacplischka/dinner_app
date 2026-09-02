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
//   - **Spoonacular is a second shared budget**, and a harsher one: the ladder's
//     Convert rung spends #261's daily points, the ceiling is app-wide, and once
//     it trips every Cook Branch reads "unavailable" until UTC midnight — no
//     amount of waiting for a quiet hour gives it back. So a run takes a
//     fraction of the day's points (`TALLY_POINT_SHARE`) and no more, and a line
//     the source refused is `unmeasured`, never a defect: the author cannot
//     rewrite their way out of our quota.
//   - **A store-availability miss is a fact about the store, not a defect in
//     the Recipe.** Buk choy simply is not ranged at 1101. Both fail the Recipe
//     — this is a *this-store* gate and the spec says so — but only one of them
//     is something an author can rewrite, and the report keeps them apart. The
//     split reads the store's own evidence — no ranging, no stock, no price, an
//     unreadable pack, a variable pack with no unit price — never the ladder's
//     `reason` prose, which `shared/types/grocery.ts` says to branch on never.
//   - **It reports each Recipe as it finishes.** A dropped SSH session, a
//     redeploy or a Session opening mid-run must not throw away measurements
//     the budget already paid for; the missing-Recipe check names what is left.
//
// The measurement runs the code that is *deployed*, not the code in this
// worktree: `railway ssh` executes the container's own copy of this file
// against the container's own `backend/dist`. That is the point — the answer is
// about production's matcher, ladder, Staples and store, not about a lane's.
//
//   node scripts/corpus/tally.mjs check   <recordsDir> [slug...]
//   node scripts/corpus/tally.mjs measure <base64-payload>   # inside the container only

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { recordSlugs } from './records.mjs';

/**
 * The store the corpus is judged against — production's, per #242/#245. Not a
 * default that a run may override: a Recipe measured anywhere else has not been
 * through this gate.
 */
export const REFERENCE_STORE_ID = 1101;

/** The two of #234's four states that count towards a Tally. */
const IN_TALLY = new Set(['priced', 'estimated']);

/**
 * The share of the day's Spoonacular points (#261) one run may spend. The
 * counter is app-wide and the ceiling is a day long, so a corpus run that
 * emptied it would take the Cook Branch down with it until UTC midnight.
 * ponytail: a flat half. Lower it if a run and a busy evening ever collide.
 */
const TALLY_POINT_SHARE = 0.5;

/** Pack kinds priced off the unit price rather than a pack size (#241). */
const UNIT_PRICED_PACKS = new Set(['variable', 'range']);

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
 * neither — something answered unusably and this line simply has no measurement
 * yet, which is not a pass and not a failure either.
 *
 * Every branch below reads a fact the container carried back — the outcome, the
 * state, whether the product is stocked, priced, in a readable pack, in one with
 * a unit price. None reads `reason`: it is the ladder's diagnostic prose, the
 * shared type says never to branch on it, and a reword of it in
 * `quantityLadder.ts` would otherwise turn every store fact into an author
 * defect with nothing to catch it. It is quoted in the defect text, and that is
 * all it is for.
 */
export function tallyReport({ slug, lines }) {
  const report = { slug, measured: 0, inTally: 0, defects: [], storeFacts: [], unmeasured: [] };
  const at = `at store ${REFERENCE_STORE_ID}`;
  for (const line of lines) {
    // A Staple is assumed already at home: outside the list total, outside
    // every Tally, and so outside this count as well.
    if (line.staple) continue;
    const term = line.searchTerm ?? line.name;
    const inTally = IN_TALLY.has(line.state);
    if (line.outcome === 'failed') {
      report.unmeasured.push(`"${term}" — Woolworths answered unusably; nothing was measured`);
      continue;
    }
    if (!inTally && line.convertFailed) {
      // Our quota, not their Recipe: the ladder's Convert rung never answered,
      // so the line fell down the rungs for a reason no rewrite addresses.
      report.unmeasured.push(
        `"${term}" — Spoonacular refused or was unreachable; the ladder could not convert it`
      );
      continue;
    }
    report.measured += 1;
    if (inTally) {
      report.inTally += 1;
    } else if (line.outcome === 'no_product') {
      report.storeFacts.push(`"${term}" is not ranged ${at}`);
    } else if (line.available === false) {
      report.storeFacts.push(`"${term}" is ranged ${at} but not stocked`);
    } else if (line.priced === false) {
      report.storeFacts.push(`"${term}" is ranged ${at} with no price`);
    } else if (line.packKind === null) {
      report.storeFacts.push(`"${term}" is ranged ${at} in a pack size nothing can read`);
    } else if (UNIT_PRICED_PACKS.has(line.packKind) && line.unitPriced === false) {
      report.storeFacts.push(
        `"${term}" is ranged ${at} in a ${line.packKind} pack with no unit price`
      );
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
 * The measurement, run where production runs, as one `TALLY ` line per Recipe.
 * The payload is base64 so that nothing between here and the container — a
 * shell, an SSH argv — has a quote or a brace to chew on.
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
  ).catch((error) => {
    // A run that died — dropped session, redeploy, a Session opening mid-run —
    // still measured everything it printed, and that cost budget nobody can
    // print. Keep those Recipes; TALLY_UNMEASURED_RECIPES names the rest.
    if (!String(error.stdout ?? '').includes(VERDICT)) throw error;
    return error;
  });
  const measurements = String(stdout)
    .split('\n')
    .filter((line) => line.startsWith(VERDICT))
    .map((line) => JSON.parse(line.slice(VERDICT.length)));
  if (!measurements.length && payload.length) {
    throw new Error(`TALLY_NO_MEASUREMENT: the container answered\n${stdout}`);
  }
  return measurements;
}

/**
 * Every Recipe measured, in the order asked. Refuses an answer from the wrong
 * store — per Recipe, because production can be served another store mid-run —
 * and refuses a short one: a Recipe the run skipped has not passed this layer,
 * and letting it read as a pass is the failure mode the gate exists for.
 */
export async function tallyGate(records, probe = railwayProbe) {
  const measurements = await probe(probePayload(records));
  const elsewhere = measurements.find((m) => m.storeId !== REFERENCE_STORE_ID);
  if (elsewhere) {
    throw new Error(
      `TALLY_WRONG_STORE: ${elsewhere.slug} measured at ${elsewhere.storeId}, ` +
        `not ${REFERENCE_STORE_ID} — the corpus is judged at production’s ` +
        'reference store or not at all'
    );
  }
  const measured = new Set(measurements.map((m) => m.slug));
  const missing = records.filter((record) => !measured.has(record.slug)).map((r) => r.slug);
  if (missing.length) throw new Error(`TALLY_UNMEASURED_RECIPES: ${missing.join(', ')}`);
  return { storeId: REFERENCE_STORE_ID, reports: measurements.map(tallyReport) };
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
    { createSpoonacularClient, guardDailyPoints, pointsKey },
    { cupCentsPerGram, parsePack },
  ] = await Promise.all([
    dist('config/index.js'),
    dist('redis/client.js'),
    dist('services/staples.js'),
    dist('services/woolworthsClient.js'),
    dist('services/ProductMatchService.js'),
    dist('services/quantityLadder.js'),
    dist('services/spoonacularClient.js'),
    dist('services/packParser.js'),
  ]);

  const refuseLiveTraffic = async () => {
    const live = await liveSessions(redis);
    if (live.length) {
      throw new Error(
        `TALLY_LIVE_TRAFFIC: ${live[0]} is live — the politeness budget is shared with it`
      );
    }
  };

  // The run's own, lower point ceiling: the guard already takes one, so a share
  // of the day's is one argument rather than a second counter. Past it the guard
  // refuses, the ladder falls through its rungs, and the lines that needed a
  // conversion come back `unmeasured` — tomorrow's run picks them up, and the
  // Cook Branch still has points for whoever is actually cooking tonight.
  const ceiling = Math.floor(config.spoonacular.dailyPointCeiling * TALLY_POINT_SHARE);
  const spent = Number(await redis.get(pointsKey())) || 0;
  if (spent >= ceiling) {
    await redis.quit();
    throw new Error(
      `TALLY_SPOONACULAR_BUDGET: ${spent}/${ceiling} points already spent today — ` +
        'the ladder would refuse every conversion and grade nothing; run it after UTC midnight'
    );
  }

  const matcher = createProductMatchService({
    redis,
    client: createWoolworthsClient((...args) => fetch(...args)),
  });
  // Every Spoonacular failure — the ceiling above, a categorical refusal, a
  // transport error — is ours, not the Recipe's. `createQuantityLadder` swallows
  // them by design (a mint must never fail over a conversion), so the tell is
  // caught here and travels with the line it happened on.
  let convertFailed = false;
  const client = createSpoonacularClient(guardDailyPoints(redis, (...a) => fetch(...a), ceiling));
  const noted = (call) =>
    call.catch((error) => {
      convertFailed = true;
      throw error;
    });
  const ladder = createQuantityLadder({
    redis,
    client: {
      ...client,
      ingredientInfo: (name) => noted(client.ingredientInfo(name)),
      gramsPerUnit: (name, unit) => noted(client.gramsPerUnit(name, unit)),
    },
  });

  // Read per Recipe rather than once at the end: the Matcher rewrites this key
  // the moment production is served another store, so each Recipe reports the
  // store it was actually measured at rather than the one the run ended on.
  const storeId = async () => {
    const stored = Number(await redis.get('woolworths:store'));
    return Number.isFinite(stored) && stored ? stored : config.woolworths.defaultStoreId;
  };

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
        convertFailed = false;
        const resolution = await ladder.resolveLine(
          {
            name: term,
            amount: ingredient.amount > 0 ? ingredient.amount : null,
            unit: ingredient.unit,
          },
          outcome
        );
        const match = outcome.match;
        lines.push({
          name: ingredient.name,
          searchTerm: term,
          staple: false,
          outcome: outcome.status,
          state: resolution.state,
          // Prose for the report to quote, never for it to branch on.
          reason: resolution.reason,
          convertFailed,
          // The store's own evidence, read with the ladder's own parser so the
          // grading never needs a second opinion about a pack string.
          available: match?.available,
          priced: match && match.priceCents !== undefined,
          packKind: match ? (parsePack(match.packageSize)?.kind ?? null) : undefined,
          unitPriced: match && cupCentsPerGram(match.cupString) !== null,
        });
      }
      // One line per Recipe, printed as it finishes.
      console.log(VERDICT + JSON.stringify({ storeId: await storeId(), slug, lines }));
    }
  } finally {
    await redis.quit();
  }
}

// ------------------------------------------------------- the CLI

/** Every `<recordsDir>/<slug>/recipe.json`, or just the named slugs. */
function loadRecords(recordsDir, slugs) {
  return recordSlugs(recordsDir, slugs).map((slug) => ({
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
