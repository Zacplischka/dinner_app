# Toolchain security checkpoint — 9 September 2026

Ticket [#483](https://github.com/Zacplischka/dinner_app/issues/483) updates the npm workspace lock without changing Capacitor or the runtime framework. Reproduce with Node 22: `npm ci`, `npm audit --json`, `npm audit --omit=dev --json`, then the normal typecheck, lint, test and native checks.

| Locked dependency | Before (`c9d5d4c`) | After | Reason |
| --- | --- | --- | --- |
| Vitest / coverage-v8 | 1.6.1 | 4.1.11 | Maintained release fixing the [UI advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp) and [mocker advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9); the latter also affects the interrupted 3.x draft, which is unmaintained. |
| Vite | 5.4.21 | 6.4.3 | [Supported security branch](https://vite.dev/releases), including the [alternate-path fix](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff). A root override keeps Vitest and the frontend on the same patched version. |
| TypeScript ESLint parser/plugin | 6.21.0 | 8.39.1 | Supports the existing TypeScript 5.9 and ESLint 8 toolchain; its resolved minimatch 9.0.9 clears the vulnerable parser dependency path. |

The full locked-install audit fell from **14 findings (2 critical, 7 high, 5 moderate)** to **3 moderate, 0 high, 0 critical**. The production-only audit reports **0**. Counts are dated registry observations, not a promise about future advisories.

The remaining three entries describe one development-only chain: `@capacitor/cli@8.5.1 → xcode@3.0.1 → uuid@7.0.3`. The [uuid advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) concerns buffer handling in v3/v5/v6. Inspection of this locked xcode package found only `uuid.v4()` without a supplied buffer, in `lib/pbxProject.js`'s `generateUuid`. No affected call was found in that dependency path. This is exposure analysis, not removal of the flagged package. Await an upstream compatible update; npm's proposed Capacitor 8.4.3 downgrade is deliberately not applied. No forced audit fix, major uuid override, platform downgrade or secure-storage guard change is included. The production `express`/`body-parser` `qs@6.16.0` overrides remain.

Vitest 4 compatibility follows the [migration guide](https://v4.vitest.dev/guide/migration): backend workspace projects move into `vitest.config.ts`; service files remain serialized with one worker and retain module isolation so rate limiters and vendor fakes cannot leak across files. Frontend teardown resets standalone mock state separately from restoring spies; constructor mocks use a constructable function. Existing assertions remain intact. Two Spoonacular Request-input tests also cover the logging conversion exposed by the newer linter, retaining URL-query redaction.
