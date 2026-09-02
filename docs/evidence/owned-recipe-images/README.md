# Owned Recipe hero images — bucket, budget, measurements

Backs [#330](https://github.com/Zacplischka/dinner_app/issues/330) on spec
[#326](https://github.com/Zacplischka/dinner_app/issues/326). The pipeline is
`scripts/corpus/images.mjs`; every constant it carries is justified here.

**Two of #330's criteria need an operator, not a commit, so they are split onto
the tickets that can meet them** rather than left open here: the R2 bucket is not
created and creating it needs a Cloudflare login
([#355](https://github.com/Zacplischka/dinner_app/issues/355)), and no
full-corpus cost has been measured because the corpus does not exist until
[#341](https://github.com/Zacplischka/dinner_app/issues/341), which now carries
that criterion. The estimate below is an estimate; it is not a measurement, and
the Measured column stays empty until a real run fills it.

## The bucket

| | |
| --- | --- |
| Provider | Cloudflare R2, on the existing `dinder.it.com` zone |
| Bucket | `dinder-recipe-images`, location hint `oc` |
| Public URL base | `https://img.dinder.it.com` — a custom domain, **not** `r2.dev` (rate-limited, documented as development-only) |
| Object key | `<frozen-slug>.webp`, so a record's image URL is `https://img.dinder.it.com/pad-thai.webp` |
| Credentials | An R2 API token (Object Read & Write, this bucket only). Where it lives: `AGENTS.md`. |
| Cost | US$0.00/month — 0.15 GB of R2's 10 GB free tier, egress free by policy |

**Status: not yet created —
[#355](https://github.com/Zacplischka/dinner_app/issues/355).** Standing it up
needs a Cloudflare login, which no credential in this repo or environment
carries, so it is a human ticket. The operator runs, once:

```bash
wrangler r2 bucket create dinder-recipe-images --location oc
# Then bind img.dinder.it.com to it as a custom domain (R2 → Settings → Public
# access → Custom domains; the dinder.it.com zone is already on this account),
# and mint an R2 API token scoped Object Read & Write to this bucket — that
# token is the three R2_* values AGENTS.md names.
```

Until it exists, `publish` has nothing to upload to and the URLs the records
carry 404. Nothing else in the pipeline depends on it: generation, cropping and
stamping all run first.

## The budget

`gpt-image-2`, `quality: "medium"`, `size: "1536x1024"`, through the Batch API.
Rates are the standard rates halved, which is what Batch means:
image output **US$15.00/1M tokens**, text input **US$2.50/1M tokens**
([OpenAI API pricing](https://developers.openai.com/api/docs/pricing)). At the
documented 1,366 output tokens for that cell, one image is **US$0.0205**.

| Run | Recipes | Estimate | Measured |
| --- | --- | --- | --- |
| Full corpus ([#341](https://github.com/Zacplischka/dinner_app/issues/341)) | ~1,160 | **US$23.77** generation (+US$0.38 of prompt input), **US$33.28** with the 40% regeneration allowance [#313](https://github.com/Zacplischka/dinner_app/issues/313) budgeted for gate rejects — inside its US$30–38 band and under the ticket's ~US$37, **provided rejects go back through a batch** | _not yet run — the corpus does not exist until [#341](https://github.com/Zacplischka/dinner_app/issues/341), which carries this criterion_ |

**Regenerations belong in a batch.** The US$33.28 line prices the ~464 rejects
at batch rates, which only holds if they are resubmitted as a second batch.
`one` calls the synchronous endpoint — no 24-hour window, and no discount:
**US$0.041 an image**, double the batch figure. Sending all 464 through `one`
costs US$19.02 rather than US$9.51, putting the run at **US$42.79** — over the
band, not under it. `one` is for the handful you look at by eye and fix.

That second batch is `submit <recordsDir> <slug>...`: named slugs submit only
those records, so the rejects `collect` listed go back through the Batch API
without re-billing the ~US$24 of keepers a bare `submit <recordsDir>` would
resubmit. A slug with no record aborts the submission rather than silently
shrinking it. Copying reject records into a scratch directory is *not* the same
thing — `collect` stamps `photoUrl` onto the file it read, so the stamp would
land on the copies and the real records would stay unstamped.

`collect` prints the run's real cost from the `usage` the batch reports back
(`costUsd`), so the measured column is filled from the run itself, not
re-derived; `one` prices its own image at standard rates (`costUsd(usage, 2)`),
so the two never quietly report the same number for different spends. Record
each bucket's figure here as it lands.

## Measurements taken

**File size.** The 50 pilot images on `prototype/corpus-pipeline` measure
n=50, min 71,326 B, median 117,796 B, mean 118,468 B, max 215,232 B — a median
on the ~118 KB the ticket predicted, but a tail 43% over the 150 KB cap
[#313](https://github.com/Zacplischka/dinner_app/issues/313) set. The pipeline
therefore encodes with cwebp's `-size 115000 -pass 6` target rather than a
quality number: the budget is enforced per image instead of hoped for.

**Crop and encode, end to end.** A real 1536×1024 master through the exact argv
`cwebpArgs` produces (`-crop 85 0 1365 1024 -resize 1200 900 -size 115000`,
libwebp 1.6.0) yields a **1200×900 WebP at 108,820 bytes** — in range, on
aspect. The 85px lost from each side is the safety margin the 3.80:1 desktop
Match-hero centre crop needs anyway.
