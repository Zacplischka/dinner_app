# The pilot batch through the gate — measurements

Backs [#338](https://github.com/Zacplischka/dinner_app/issues/338) on spec
[#326](https://github.com/Zacplischka/dinner_app/issues/326). Every number the
corpus README states about this batch is a run recorded here, on the date it
ran, against the records as they stood at the named commit. Prose in a README
is not re-checkable; these files are.

| File                               | What it is                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tally-store-1101-2026-09-02.txt`  | `tally.mjs check` output, three runs: all 50 from the batch as ported; the 25 that failed, after the rewrites; all 50 again as the branch stands |
| `culinary-2026-09-02-run1.json`    | both judges over all 50, before the rewrites                                                                                                     |
| `culinary-2026-09-02-regate.json`  | both judges over the 26 records the rewrites touched                                                                                             |
| `culinary-2026-09-02-regate2.json` | both judges over the one record the re-gate sent back again                                                                                      |
| `culinary-2026-09-02-regate3.json` | both judges over the two records the re-gate's Google calls dropped                                                                              |

## Tally at store 1101

Run where production runs, over `railway ssh`, against production's Matcher,
ladder, Staples and price cache — the measurement #338 exists to take, since the
pilot's numbers were store 3221's.

| Run                                  | Records | In tally | What the failures were                                                                                                                                                                                                  |
| ------------------------------------ | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — batch as ported (`6fc6cc4`)      | 50      | 25       | 13 lines the Retailer answered with the wrong product or the ladder could not buy; 4 lines the store does not range under those words; 4 terms whose search failed transiently and were cached as failures for the hour |
| 2 — the 25 failures, after `2453d5f` | 25      | 25       | —                                                                                                                                                                                                                       |
| 3 — all 50, as the branch stands     | 50      | 50       | —                                                                                                                                                                                                                       |

The 4 transient failures (`ground cumin`, `vegetable liquid stock`, `leg ham`,
`lebanese cucumbers`) were four `failure` entries in `woolworths:price:1101:*`
with no products behind them; those four keys were deleted before run 2 so the
terms were fetched fresh, and all four then priced. No other cache entry was
touched.

Every run-1 failure and its rewrite is in the corpus README under "What the
tally sent back". The Matcher's part in them — drinks outranking the fruit for
`lemon`, gummies for `apple cider vinegar`, a produce aisle blocked as snacks for
`cashews` — is [#367](https://github.com/Zacplischka/dinner_app/issues/367): a
Sourced Recipe saying "1 lemon" gets the same iced tea.

## Culinary, two families

`gate.mjs` refuses one judge family by design. No `OPENAI_API_KEY` exists in
this environment, so the OpenAI judge ran through `codex exec` on the operator's
ChatGPT subscription — same `JUDGE_RUBRIC`, same strict-JSON verdict, `-s
read-only --ephemeral` with the verdict shape enforced by `--output-schema` — and
the Google judge ran as shipped, key per `AGENTS.md`. Both through the gate's own
`culinaryFailures`, so the two-family rule and the author-family exclusion held.
The runner is not committed: it is twenty lines of glue around a CLI whose
availability is the operator's, not the repo's.

| Run                                   | Records | Pass | Sent back                                                                                                                                                                                               |
| ------------------------------------- | ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — before the rewrites               | 50      | 41   | 8 failed, 1 errored (a dropped Google call, re-run in the re-gate)                                                                                                                                      |
| re-gate — the 26 the rewrites touched | 26      | 23   | paleo-chicken-tray-bake: baking paper under the grill; two Google calls dropped (lamb-chops-with-mash-and-peas errored, chana-masala never answered — the runner had no fetch timeout, and has one now) |
| re-gate 2 — paleo, rewritten          | 1       | 1    | —                                                                                                                                                                                                       |
| re-gate 3 — the two dropped           | 2       | 2    | —                                                                                                                                                                                                       |

The 24 records the rewrites did not touch keep their run-1 pass; every record
therefore holds a two-family pass on its content as committed.

Every verdict the OpenAI judge returned in run 1 is in the JSON with its
reason; the Google judge passed all 50 both times. The reasons were of the kind
the pilot found — a diet claimed on an ingredient not labelled for it — plus
three about the method itself (a rice step with no water, potatoes left boiling
while everything else cooked, butter into a smoking pan). All eight rewrites are
in the corpus README.

## Human

`human.mjs sample backend/recipes` names 12 of the 50, stratified by cuisine.
The verdicts are a person's and are recorded through `human.mjs verdict` when
given; nothing here stands in for them.
