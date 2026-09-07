# Cat moments — #453

The three implementation agents planned the following page replacements before editing. All use the original Price Patrol ginger cat and shared canvas drawing, with no new dependencies or backend contract changes.

| Moment              | Scene and actual trigger                                                                           | Completion and existing actions                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Grocery Run         | Cat and trolley while a loaded Shopping List has pending Woolworths pricing; compact in Cook View. | Pricing complete or failed removes motion immediately. Ingredients, method, Claims and links stay usable. No item counts or invented progress. |
| Saved you a seat    | Dining chair or cinema seat/popcorn after the Participant submits, while someone is still swiping. | Real names/counts remain authoritative. Completion, expiry, Restart and Leave remove the scene.                                                |
| Menu Delivery       | Courier cat with a menu only during the cold Group Order fetch.                                    | Pinned Menu or error replaces the scene immediately. Back to the Match stays reachable on short phones.                                        |
| Getting together    | One chair per actual Participant; Ready and offline state alter its appearance.                    | No vacant target seats. Start removes the scene, failed start restores it, and dietary review keeps its own presentation.                      |
| Neighbourhood Scout | Walking cat and schematic storefront while the current nearby Venue request is pending.            | Success/error/Change area ends it. Same-area retries and late responses cannot overwrite a newer search.                                       |
| Tonight’s pick      | Three-second cloche or projector reveal for a real crown.                                          | Results/actions render immediately. Then the scene holds still. Match copy remains exclusive to unanimity; fallback Top Pick stays neutral.    |
| A little further?   | Three-second map unfold after a successful search returns zero Venues.                             | Holds still beside Change area. Errors and filter misses keep their own recovery actions.                                                      |

## Motion and accessibility

`AnimatedScene` owns pause/play, reduced motion, resize and frame cleanup. Continuous waits can be paused without pausing requests. Hidden documents schedule no animation frames. Finite reveals stop at their final frame, which reduced-motion users see immediately. Canvas artwork is hidden from assistive technology; readable HTML carries meaning. Grocery status and menu/discovery loading use the existing persistent announcement region. Price Patrol retains its existing live status.

## Verification

The frontend unit suite passed all 626 tests before final accessibility refinements; the subsequent focused pass passed 87 tests, including the new persistent failure-announcement check. Repository typechecking, frontend lint and production build passed. Lint reports only the existing SelectionPage ref-cleanup warning tracked separately.

Browser checks exercise the built frontend through actual HTTP/Socket.IO/Comparison-stream boundaries with deterministic responses. They make no paid provider calls or production mutations. The new specs cover all seven scenes, food/Watch variants, immediate terminal transitions, live roster redraw while paused, finite reveals, reduced motion, and phone layout. The existing Price Patrol spec runs alongside them to check the extracted drawing/runtime. Screenshots are written to the Playwright output directory and CI retains artifacts on failure.

Reproduce with the normal local backend/Redis test setup:

```sh
npm run test:unit --workspace=@dinder/frontend
npm run typecheck
npm run lint --workspace=@dinder/frontend
npm run build:frontend
npm run test:e2e --workspace=@dinder/frontend -- cat-discovery-grocery.spec.ts cat-social-menu.spec.ts price-patrol.spec.ts
```

The keyless mobile CI subset includes both new specs. Independent Standards and Spec reviews use main commit `228a7c87ca36441af22ae38e6079f94bda62812a` as their fixed base.
