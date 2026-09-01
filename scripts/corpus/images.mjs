// Owned Recipe hero images (#330). Every Owned Recipe gets a generated photo:
// `gpt-image-2` at medium quality, 1536x1024, through OpenAI's Batch API (half
// price, and a corpus build has no latency requirement), centre-cropped to
// 1200x900 WebP and uploaded to Cloudflare R2. The record then references the
// image by URL — no image bytes ever enter the repository, which is exactly
// the split ADR 0011 draws: recipes ship with the deploy, images are an upload.
//
// Model, size, aspect, file-size budget and hosting are all settled in
// docs/evidence/owned-recipe-images/cost.md, which carries the measurement
// method and the sources behind every number here.
//
// Operator vehicle, not application code: needs `cwebp` (libwebp) and `aws`
// (R2 speaks S3) on PATH, and OPENAI_API_KEY / R2_* in the environment. The
// pure functions below are asserted by images.test.mjs in the lint job.
//
//   node scripts/corpus/images.mjs submit  <recordsDir>            # one batch
//   node scripts/corpus/images.mjs collect <batchId> <recordsDir>  # crop+stamp
//   node scripts/corpus/images.mjs one     <slug> <recordsDir>     # regenerate
//   node scripts/corpus/images.mjs publish                         # upload

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The custom domain the R2 bucket is bound to. r2.dev is rate-limited and dev-only. */
export const IMAGE_BASE_URL = 'https://img.dinder.it.com';

/** The one priced 4:3-ish cell in gpt-image-2's table; 4:3 sizes are not priced. */
export const MASTER_SIZE = { width: 1536, height: 1024 };

/** Covers the desktop Match hero at DPR 2 (1216px) and the Deck photo at DPR 3. */
export const OUTPUT_SIZE = { width: 1200, height: 900 };

/** 110 KB target, 150 KB hard cap; the pilot's 50 images ran to a 118 KB median. */
const TARGET_BYTES = 115000;

/** OpenAI batch rates, USD per 1M tokens (standard rate halved for Batch). */
const RATE_PER_TOKEN = { input: 2.5 / 1e6, output: 15.0 / 1e6 };

const API = 'https://api.openai.com/v1';
const DEFAULT_OUT = '.corpus-images';

/**
 * An Owned Recipe's frozen slug, taken from the placeId it was authored with —
 * never re-derived from the title, so a retitled dish keeps its image.
 */
export function slugOf(record) {
  const placeId = record?.placeId ?? '';
  if (!placeId.startsWith('owned:')) {
    throw new Error(`not an Owned Recipe placeId (expected owned:<slug>): ${placeId}`);
  }
  return placeId.slice('owned:'.length);
}

export const imageUrl = (slug) => `${IMAGE_BASE_URL}/${slug}.webp`;

/** The record as it commits: its image is a URL into the bucket. */
export const withImageUrl = (record) => ({ ...record, image: imageUrl(slugOf(record)) });

/** The largest rectangle of `output`'s aspect that fits, centred, in `master`. */
export function centreCrop(master, output) {
  const aspect = output.width / output.height;
  const width = Math.min(master.width, Math.round(master.height * aspect));
  const height = Math.min(master.height, Math.round(master.width / aspect));
  return {
    x: Math.floor((master.width - width) / 2),
    y: Math.floor((master.height - height) / 2),
    width,
    height,
  };
}

/** cwebp crops first, then resizes, then encodes down to the size budget. */
export function cwebpArgs(masterPath, outPath, master = MASTER_SIZE) {
  const { x, y, width, height } = centreCrop(master, OUTPUT_SIZE);
  return [
    '-crop', String(x), String(y), String(width), String(height),
    '-resize', String(OUTPUT_SIZE.width), String(OUTPUT_SIZE.height),
    '-size', String(TARGET_BYTES),
    '-pass', '6',
    '-mt',
    masterPath, '-o', outPath, '-quiet',
  ];
}

// A thousand images sharing one framing, surface and light would read as a
// different product sitting next to Spoonacular's domestic photography — the
// blend is meant to be invisible. Rotate the look deterministically off the
// slug so a regenerated Recipe keeps the one it had.
const ANGLES = ['from directly overhead', 'at a 45-degree angle', 'from just above the plate rim'];
const SURFACES = [
  'a scrubbed wooden table',
  'a pale ceramic benchtop',
  'a linen cloth',
  'a scratched steel bench',
];
const LIGHTS = [
  'soft daylight from a side window',
  'warm evening kitchen light',
  'flat overcast daylight',
];

const pick = (list, seed) => {
  let hash = 5381;
  for (const ch of seed) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
};

/** The generation prompt for one Owned Recipe. */
export function imagePrompt(record) {
  const slug = slugOf(record);
  return [
    `A photograph of ${record.title}, plated and ready to eat,`,
    `shot ${pick(ANGLES, `a${slug}`)} on ${pick(SURFACES, `s${slug}`)}`,
    `in ${pick(LIGHTS, `l${slug}`)}.`,
    'Home cooking in a domestic kitchen: no studio gloss, no garnish theatre,',
    'no text, no hands, no props beyond the meal itself.',
    'The food fills the middle horizontal third of the frame with headroom above',
    'and below, so a wide centre crop still shows the dish.',
  ].join(' ');
}

/** One Batch API request line per Recipe — the whole corpus, one submission. */
export const batchRequests = (records) =>
  records.map((record) => ({
    custom_id: slugOf(record),
    method: 'POST',
    url: '/v1/images/generations',
    body: {
      model: 'gpt-image-2',
      prompt: imagePrompt(record),
      size: `${MASTER_SIZE.width}x${MASTER_SIZE.height}`,
      quality: 'medium',
      n: 1,
    },
  }));

/** What a run actually cost, from the usage the batch reports back. */
export const batchCostUsd = (usages) =>
  usages.reduce(
    (total, u) =>
      total +
      (u?.input_tokens ?? 0) * RATE_PER_TOKEN.input +
      (u?.output_tokens ?? 0) * RATE_PER_TOKEN.output,
    0
  );

// ---------------------------------------------------------------- side effects

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — AGENTS.md says where the credential lives`);
  return value;
};

async function openai(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, ...init.headers },
  });
  if (!response.ok) {
    const method = init.method ?? 'GET';
    throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
  }
  return response;
}

/** Every `<recordsDir>/<slug>/recipe.json`, in directory order. */
function readRecords(recordsDir) {
  return readdirSync(recordsDir)
    .map((entry) => join(recordsDir, entry, 'recipe.json'))
    .filter((file) => existsSync(file))
    .map((file) => ({ file, record: JSON.parse(readFileSync(file, 'utf8')) }));
}

/** Master PNG bytes → the 1200x900 WebP the Deck renders, and the stamped record. */
function convertAndStamp(slug, pngBase64, outDir, byFile) {
  mkdirSync(join(outDir, 'masters'), { recursive: true });
  const master = join(outDir, 'masters', `${slug}.png`);
  const webp = join(outDir, `${slug}.webp`);
  writeFileSync(master, Buffer.from(pngBase64, 'base64'));
  execFileSync('cwebp', cwebpArgs(master, webp));
  const entry = byFile.get(slug);
  if (entry) writeFileSync(entry.file, `${JSON.stringify(withImageUrl(entry.record), null, 2)}\n`);
  console.log(`${slug} → ${webp} (${readFileSync(webp).length} bytes) → ${imageUrl(slug)}`);
}

async function submit(recordsDir) {
  const records = readRecords(recordsDir).map(({ record }) => record);
  const jsonl = batchRequests(records)
    .map((r) => JSON.stringify(r))
    .join('\n');
  const form = new FormData();
  form.append('purpose', 'batch');
  form.append('file', new Blob([jsonl], { type: 'application/jsonl' }), 'images.jsonl');
  const file = await (await openai('/files', { method: 'POST', body: form })).json();
  const batch = await (
    await openai('/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_file_id: file.id,
        endpoint: '/v1/images/generations',
        completion_window: '24h',
      }),
    })
  ).json();
  console.log(`submitted ${records.length} Recipes as batch ${batch.id} (${batch.status})`);
}

async function collect(batchId, recordsDir, outDir) {
  const batch = await (await openai(`/batches/${batchId}`)).json();
  if (batch.status !== 'completed') throw new Error(`batch ${batchId} is ${batch.status}`);
  const byFile = new Map(readRecords(recordsDir).map((e) => [slugOf(e.record), e]));
  const lines = (await (await openai(`/files/${batch.output_file_id}/content`)).text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const usages = [];
  for (const line of lines) {
    if (line.error || line.response?.status_code !== 200) {
      console.error(`${line.custom_id}: ${JSON.stringify(line.error ?? line.response?.body)}`);
      continue;
    }
    convertAndStamp(line.custom_id, line.response.body.data[0].b64_json, outDir, byFile);
    usages.push(line.response.body.usage);
  }
  console.log(
    `${usages.length}/${lines.length} images, measured cost US$${batchCostUsd(usages).toFixed(2)}` +
      ` — record it in docs/evidence/owned-recipe-images/cost.md`
  );
}

/** One Recipe's photo, regenerated on its own — no batch, no 24-hour window. */
async function one(slug, recordsDir, outDir) {
  const byFile = new Map(readRecords(recordsDir).map((e) => [slugOf(e.record), e]));
  const entry = byFile.get(slug);
  if (!entry) throw new Error(`no ${join(recordsDir, slug, 'recipe.json')}`);
  const [request] = batchRequests([entry.record]);
  const body = await (
    await openai('/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
    })
  ).json();
  convertAndStamp(slug, body.data[0].b64_json, outDir, byFile);
  console.log(`measured cost US$${batchCostUsd([body.usage]).toFixed(4)}`);
}

/** Publishing images is an upload, not a deploy. R2 speaks S3. */
function publish(outDir) {
  execFileSync(
    'aws',
    [
      's3', 'sync', outDir, `s3://${env('R2_BUCKET')}/`,
      '--endpoint-url', `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      '--exclude', 'masters/*',
      '--content-type', 'image/webp',
    ],
    {
      stdio: 'inherit',
      // Explicit, so an unrelated default AWS profile can never be the identity
      // that writes to the bucket.
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: env('R2_ACCESS_KEY_ID'),
        AWS_SECRET_ACCESS_KEY: env('R2_SECRET_ACCESS_KEY'),
        AWS_DEFAULT_REGION: 'auto',
      },
    }
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  const run = {
    submit: () => submit(rest[0]),
    collect: () => collect(rest[0], rest[1], rest[2] ?? DEFAULT_OUT),
    one: () => one(rest[0], rest[1], rest[2] ?? DEFAULT_OUT),
    publish: () => publish(rest[0] ?? DEFAULT_OUT),
  }[command];
  if (!run) {
    console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n\n')[0]);
    process.exit(1);
  }
  await run();
}
