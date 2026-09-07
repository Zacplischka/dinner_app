## Scope

Implement the twelve improvements accepted after three-agent production UAT on 7 September 2026. Evidence and exact reproduction steps are recorded in the local UAT reports; the implementation will preserve a checked-in acceptance summary.

## Acceptance criteria

- [x] Keep last-choice Undo and Backspace available after the final swipe until explicit submission, in every Branch.
- [x] Keep Shopping List product links, claimant names and Release within 320px and 390px viewports; retain usable touch targets.
- [x] Allow simultaneous independent Participant preference edits without losing/rejecting an unrelated edit. Preserve shared choice, dietary review, Ready and start concurrency safety; show actionable errors beside choices.
- [x] Provide Back to the Match for Group Order no-menu/unavailable/internal failure states; do not warn about nonexistent basket items.
- [x] Preserve Cook View step progress across List/Cook navigation, scoped to the list and local viewer.
- [x] Fix fresh garlic cloves matching garlic paste and preserve recognizable ingredient wording. This is a scoped contribution to #367; do not close that broader issue unless its remaining cases are resolved.
- [x] Show delivery Platform links beside the Comparison verdict and retain visible price-column identity on long menus.
- [x] Improve pre-selection Recipe effort information and add a method preview, with honest handling of missing source data.
- [x] Prioritize Try another deck / Change choices on all-pass results while keeping the intentional Top Pick fallback as a secondary suggestion.
- [x] Make Eat Out/Takeaway lobby and Selection copy describe actual controls; no new Restaurant preference system in this change.
- [x] Provide a full-synopsis destination from expanded Movie Details when the committed overview is shortened; no runtime TMDB calls.
- [x] Offer Choose another venue after an empty Comparison, preserving the existing area/list.

## Validation

The complete local suite passed: 1,029 backend tests and 651 frontend tests. Final quantity and keyboard review changes passed their focused suites (102 backend tests and 28 frontend tests). Final typecheck, browser-test typecheck and lint passed; lint retains the existing SelectionPage cleanup warning tracked in #426.

All 26 browser scenarios across the four new UAT specs and the extended social/menu spec passed on the production-built frontend in mobile Chrome emulation and desktop Chromium, including focused reruns after correcting a fractional-pixel assertion. Four independent browser contexts exercised simultaneous lobby changes against the real local backend. Watch exercised final-choice Undo, reload, keyboard correction, all-pass results and shared restart. Deterministic service-boundary fixtures covered claimed Shopping Lists, local Cook progress, Recipe method keyboard access, menu failures, long Comparisons, venue recovery and rejected-edit visibility. These checks did not query paid providers or modify production.

Three agents cross-reviewed the diff against base `86508a7d`, with authors excluded from their own files. Standards review found a missing native-summary focus stop; Spec review found an error that could scroll under the sticky header. Both were fixed, browser-verified and independently rechecked. Production merge/deploy is separate from this implementation request.

## Related existing work

#367 Product Matcher; #407 small shopping action targets; #341 Owned Recipe Store expansion. #425 restaurant contact/hours metadata remains separate.

## Implementation notes

Personal choice collisions retry at the existing lobby command boundary, only while the viewer's own state, shared choices, roster and round remain unchanged. The backend revision checks still reject stale shared settings, Ready and Start commands. Retries are bounded and remaining errors scroll into view.

Recipe Details now exposes the existing normalized method, ingredient/step counts, and supplied time/description. Missing source cooking times remain explicitly unavailable; this change does not invent timings or regenerate the recipe corpus. Movie Details offers the full synopsis on TMDB without introducing runtime TMDB API calls.

The garlic correction applies to fresh-garlic requests and their swap candidates. Explicit paste/powder requests retain their normal matching behavior. A clove count explicitly present in the source wording is retained for display and quantity calculation; grams are not treated as individual cloves. Existing minted Shopping Lists keep their frozen snapshots. The other product-matching cases in #367 remain separate.
