import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IMAGE_BASE_URL,
  MASTER_SIZE,
  OUTPUT_SIZE,
  batchCostUsd,
  batchRequests,
  centreCrop,
  cwebpArgs,
  imagePrompt,
  imageUrl,
  slugOf,
  withImageUrl,
} from './images.mjs';

const record = (slug, title) => ({
  placeId: `owned:${slug}`,
  title,
  servings: 4,
  extendedIngredients: [],
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
  assert.equal(stamped.image, `${IMAGE_BASE_URL}/pad-thai.webp`);
  assert.equal(imageUrl('pad-thai'), stamped.image);
  assert.equal(stamped.title, 'Pad Thai');
  assert.equal(stamped.servings, 4);
});

test('measured cost comes from the batch usage, at batch rates', () => {
  // 1000 Recipes at gpt-image-2 medium 1536x1024: ~1,366 output tokens each
  // at $15.00/1M batch is $20.50, the figure #313 estimated.
  const usd = batchCostUsd([{ input_tokens: 250, output_tokens: 1366 }]);
  assert.equal(usd.toFixed(4), '0.0211');
  assert.equal(batchCostUsd([]), 0);
});
