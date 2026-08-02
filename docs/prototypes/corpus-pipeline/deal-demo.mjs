// Deal demo (#316/#319): drive the Cook flow end-to-end headless and capture
// evidence screenshots. Likes ONLY owned cards (photoUrl /owned-images/...) so
// the crowned Top Pick is an owned Recipe, proving the owned mint path.
// Run: cd <worktree>/frontend && node ../docs/prototypes/corpus-pipeline/deal-demo.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = 'http://localhost:3000';
const API = 'http://localhost:3001/api';
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, 'gate', 'screens');
fs.mkdirSync(shots, { recursive: true });

const shot = (page, name, opts = {}) =>
  page.screenshot({ path: path.join(shots, name), ...opts });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(30_000);

try {
  // --- 1. Entry fork -> Cook setup -------------------------------------
  await page.goto(FRONTEND + '/');
  await page.getByRole('button', { name: /Cooking/ }).click();
  await page.waitForURL('**/cook');

  await page.fill('#hostName', 'Pilot');
  await page.selectOption('#mealType', 'main course');
  await page.getByRole('button', { name: 'italian', exact: true }).click();
  // headcount 2 -> 4
  await page.getByRole('button', { name: 'More people' }).click();
  await page.getByRole('button', { name: 'More people' }).click();
  await page.getByRole('button', { name: 'Start swiping' }).click();

  // --- 2. Lobby -> deck --------------------------------------------------
  await page.waitForURL(/\/session\/([A-Z0-9]+)$/, { timeout: 60_000 });
  const sessionCode = page.url().split('/').pop();
  console.log('Session:', sessionCode);

  // The dealt deck, straight from the API the page itself reads.
  const deck = (await (await fetch(`${API}/options/${sessionCode}`)).json()).restaurants;
  const isOwned = (e) => (e.photoUrl ?? '').startsWith('/owned-images/');
  const owned = deck.filter(isOwned);
  const vendor = deck.filter((e) => !isOwned(e));
  console.log(`\nDeal composition: ${deck.length} cards — ${owned.length} owned, ${vendor.length} vendor`);
  for (const e of deck) console.log(`  [${isOwned(e) ? 'OWNED ' : 'vendor'}] ${e.name}  (${e.photoUrl ?? 'no photo'})`);
  if (vendor.length === 0) console.log('  (owned-only deck — vendor half absent, likely Spoonacular quota)');

  await page.getByRole('button', { name: 'Start Selecting' }).click();
  await page.waitForURL('**/select');

  // --- 3. Swipe: like owned, pass vendor; screenshot first 3 cards ------
  const topCardTitle = () => page.locator('[data-swipe-card].cursor-grab h2').first();
  for (let i = 0; i < deck.length; i++) {
    await topCardTitle().waitFor();
    const shown = (await topCardTitle().textContent())?.trim();
    const entry = deck.find((e) => e.name === shown) ?? deck[i];
    if (shown !== deck[i]?.name)
      console.log(`  note: card ${i + 1} shows "${shown}", API order said "${deck[i]?.name}"`);
    const like = isOwned(entry);
    // First three cards, plus every owned card — the owned dish image in the
    // deck is the evidence this prototype exists for.
    if (i < 3 || like) {
      await page.waitForTimeout(1200); // let the card image settle
      await shot(page, `deck-card-${i + 1}.png`);
    }
    console.log(`  card ${i + 1}/${deck.length}: ${entry.name} -> ${like ? 'LIKE (owned)' : 'pass (vendor)'}`);
    await page.getByRole('button', { name: like ? 'Like' : 'Pass', exact: true }).click();
    await page.waitForTimeout(400); // feedback overlay settles
  }

  // --- 4. Submit ---------------------------------------------------------
  await page.getByRole('button', { name: 'Submit Selections' }).click();

  // --- 5. Top Pick / results --------------------------------------------
  await page.waitForURL('**/results', { timeout: 60_000 });
  await page.locator('[data-recipe-crown]').waitFor();
  const crowned = (await page.locator('[data-recipe-crown] p.text-lg').textContent())?.trim();
  console.log('\nCrowned Recipe:', crowned);
  // The mint runs server-side; the button appears with the results payload.
  await page.getByRole('button', { name: 'Shopping list' }).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800); // hero photo
  await shot(page, 'top-pick.png');

  // --- 6. Shopping list (pricing can take a while behind politeness) ----
  await page.getByRole('button', { name: 'Shopping list' }).click();
  await page.waitForURL('**/list/**');
  const listUrl = page.url();
  console.log('Shopping list URL:', listUrl);
  await page.locator('[data-list-total]').waitFor({ timeout: 300_000 });
  await page.waitForTimeout(500);
  await shot(page, 'shopping-list.png', { fullPage: true });

  const total = (await page.locator('[data-list-total]').textContent())?.trim();
  const coverage = (await page.locator('[data-coverage]').textContent())?.trim();
  const scaled = (await page.locator('p.text-xs.font-semibold.tracking-\\[0\\.14em\\]').first().textContent())?.trim();
  const lines = await page.locator('li[data-line-state]').evaluateAll((els) =>
    els.map((el) => ({
      state: el.getAttribute('data-line-state'),
      staple: el.hasAttribute('data-staple'),
      text: el.querySelector('p')?.textContent?.trim(),
    }))
  );
  console.log(`\nList headline: ${scaled} | total ${total} | ${coverage}`);
  const byState = {};
  for (const l of lines) byState[l.state] = (byState[l.state] ?? 0) + 1;
  console.log('Line states:', JSON.stringify(byState));
  for (const l of lines) console.log(`  [${l.state}${l.staple ? ', staple' : ''}] ${l.text}`);

  // --- 7. Cook view ------------------------------------------------------
  await page.getByRole('link', { name: 'Cook' }).click();
  await page.waitForURL('**/cook');
  await page.locator('ol li, main p.text-center').first().waitFor();
  await page.waitForTimeout(500);
  await shot(page, 'cook-view.png', { fullPage: true });

  const stepCount = await page.locator('ol > li').count();
  const credit = page.locator('p', { hasText: 'Method from' });
  const creditVisible = (await credit.count()) > 0;
  const creditText = creditVisible ? (await credit.first().textContent())?.trim() : '(no credit line rendered)';
  console.log(`\nCook view: ${stepCount} steps.`);
  console.log(`Credit area: ${creditText}`);
  console.log(
    creditVisible
      ? 'VERDICT: credit line RENDERS for this owned Recipe.'
      : 'VERDICT: no credit line for the owned Recipe.'
  );

  console.log('\nScreenshots in', shots);
} finally {
  await browser.close();
}
