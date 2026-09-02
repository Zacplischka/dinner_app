import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IMAGE_BASE_URL,
  MASTER_SIZE,
  OUTPUT_SIZE,
  batchRequests,
  centreCrop,
  collectReport,
  costUsd,
  cwebpArgs,
  imagePrompt,
  imageUrl,
  resultLines,
  selectRecords,
  slugOf,
  withImageUrl,
} from './images.mjs';

// An Owned Recipe in this repo's own vocabulary (shared/types/models.ts), not
// Spoonacular's wire shape: `name`/`photoUrl`/`ingredients`, no source credit.
const record = (slug, name) => ({
  placeId: `owned:${slug}`,
  name,
  servings: 4,
  ingredients: [],
});

test('the frozen slug comes from the placeId, never from the title', () => {
  assert.equal(slugOf(record('pad-thai', 'Pad Thai')), 'pad-thai');
  // A retitled dish keeps its authored slug — ADR 0011's whole point.
  assert.equal(slugOf(record('pad-thai', 'Chicken Pad Thai')), 'pad-thai');
  assert.throws(() => slugOf({ placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' }), /owned:/);
});

test('the master is centre-cropped to the output aspect, losing only width', () => {
  const crop = centreCrop(MASTER_SIZE, OUTPUT_SIZE);
  // 1536x1024 holds a full-height 4:3 rect 1365 wide; 85px comes off each side.
  assert.deepEqual(crop, { x: 85, y: 0, width: 1365, height: 1024 });
});

test('a master taller than the output aspect is cropped vertically instead', () => {
  assert.deepEqual(centreCrop({ width: 1200, height: 1200 }, OUTPUT_SIZE), {
    x: 0,
    y: 150,
    width: 1200,
    height: 900,
  });
});

test('cwebp crops before it resizes, and encodes to the file-size budget', () => {
  const args = cwebpArgs('/tmp/pad-thai.png', '/tmp/pad-thai.webp');
  const crop = args.indexOf('-crop');
  const resize = args.indexOf('-resize');
  assert.ok(crop !== -1 && resize !== -1);
  assert.deepEqual(args.slice(crop, crop + 5), ['-crop', '85', '0', '1365', '1024']);
  assert.deepEqual(args.slice(resize, resize + 3), ['-resize', '1200', '900']);
  // -size is what keeps the corpus inside the 150 KB cap; -q alone hopes.
  const size = args.indexOf('-size');
  assert.deepEqual(args.slice(size, size + 2), ['-size', '115000']);
  assert.deepEqual(args.slice(-4), ['/tmp/pad-thai.png', '-o', '/tmp/pad-thai.webp', '-quiet']);
});

test('one submission carries a request per Recipe, keyed by frozen slug', () => {
  const requests = batchRequests([record('pad-thai', 'Pad Thai'), record('moussaka', 'Moussaka')]);
  assert.deepEqual(
    requests.map((r) => r.custom_id),
    ['pad-thai', 'moussaka']
  );
  for (const r of requests) {
    assert.equal(r.method, 'POST');
    assert.equal(r.url, '/v1/images/generations');
    assert.equal(r.body.model, 'gpt-image-2');
    assert.equal(r.body.size, '1536x1024');
    assert.equal(r.body.quality, 'medium');
    assert.equal(r.body.n, 1);
  }
  assert.match(requests[0].body.prompt, /Pad Thai/);
  // A vendor-shaped record fails the whole submission rather than spending a
  // batch on "A photograph of undefined".
  assert.throws(() => batchRequests([{ placeId: 'owned:pad-thai', title: 'Pad Thai' }]), /no name/);
});

test('a submission can be narrowed to named slugs, so a reject batch is a batch', () => {
  const entries = ['pad-thai', 'moussaka', 'beef-pho'].map((slug) => ({
    file: `${slug}/recipe.json`,
    record: record(slug, slug),
  }));
  // No slugs named: the whole corpus, one submission.
  assert.equal(selectRecords(entries).length, 3);
  // Named: only those. Without this the second batch the budget prices can
  // only be the whole corpus again (~US$24 re-billed) or `one` per reject at
  // double rate, which puts the run over its band.
  assert.deepEqual(
    selectRecords(entries, ['beef-pho', 'pad-thai']).map((e) => slugOf(e.record)),
    ['beef-pho', 'pad-thai']
  );
  // A typo must not quietly shrink a paid submission.
  assert.throws(() => selectRecords(entries, ['pad-tahi']), /pad-tahi/);
});

test('the prompt is stable per Recipe but varies its look across the corpus', () => {
  const padThai = record('pad-thai', 'Pad Thai');
  assert.equal(imagePrompt(padThai), imagePrompt(padThai));
  const slugs = ['pad-thai', 'moussaka', 'beef-pho', 'zucchini-slice', 'tuna-mornay', 'shakshuka'];
  const looks = new Set(slugs.map((s) => imagePrompt(record(s, 'X')).replace('X', '')));
  assert.ok(looks.size >= 3, `expected varied framing/surface/light, got ${looks.size}`);
});

test('the record references its image by URL — no bytes, no repository path', () => {
  const stamped = withImageUrl(record('pad-thai', 'Pad Thai'));
  // photoUrl, not Spoonacular's `image`: the Deck reads photoUrl, so the wire
  // name would stamp a field nothing downstream ever looks at.
  assert.equal(stamped.photoUrl, `${IMAGE_BASE_URL}/pad-thai.webp`);
  assert.equal(imageUrl('pad-thai'), stamped.photoUrl);
  assert.equal(stamped.image, undefined);
  assert.equal(stamped.name, 'Pad Thai');
  assert.equal(stamped.servings, 4);
});

test('measured cost comes from the usage, and the sync endpoint costs double', () => {
  // 1000 Recipes at gpt-image-2 medium 1536x1024: ~1,366 output tokens each
  // at $15.00/1M batch is $20.50, the figure #313 estimated.
  const usage = [{ input_tokens: 250, output_tokens: 1366 }];
  assert.equal(costUsd(usage).toFixed(4), '0.0211');
  // `one` calls /v1/images/generations, which is billed undiscounted — pricing
  // it at batch rates reports half of what lands on the bill.
  assert.equal(costUsd(usage, 2).toFixed(4), '0.0422');
  assert.equal(costUsd([]), 0);
});

test('a partly-failed batch reports against what was submitted, not what came back', () => {
  const usages = Array.from({ length: 1100 }, () => ({ input_tokens: 250, output_tokens: 1366 }));
  const report = collectReport({ submitted: 1160, usages, failed: ['pad-thai', 'moussaka'] });
  // The output file holds only the 1100 that worked; counting its lines would
  // print 1100/1100 and publish a corpus with 60 holes in it.
  assert.match(report, /^1100\/1160 images/);
  // The advice has to name the batch path: 464 rejects through `one` at double
  // rate is US$42.79, over the band the evidence README prices the run in.
  assert.match(report, /2 missing — .*`submit <recordsDir>` \(batch rates\): pad-thai moussaka/);
  const clean = collectReport({ submitted: 2, usages: [], failed: [] });
  assert.equal(clean.split('\n').length, 1);
  assert.match(clean, /^0\/2 images, measured cost US\$0\.00 — record it in docs\//);
});

test('batch output is parsed line by line as it streams', async () => {
  // A base64 master per line puts a corpus batch's output well past Node's
  // ~512 MB string cap, so it can never be read with one .text().
  const chunks = ['{"custom_id":"pad-thai"}\n{"custom_', 'id":"moussaka"}\n'];
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  const seen = [];
  for await (const line of resultLines({ body })) seen.push(line.custom_id);
  assert.deepEqual(seen, ['pad-thai', 'moussaka']);
});
