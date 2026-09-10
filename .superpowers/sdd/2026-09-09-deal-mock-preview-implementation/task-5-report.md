# Task 5 — Filters and observable search states

## RED

`npm test -- src/app/App.test.tsx` failed with all 10 new UI scenarios: `App`
did not yet accept an adapter or render filters.

## GREEN

Implemented controlled deal filters, a label-based draft criteria summary, and
separate search feedback for initial, loading, ready, empty, over-limit and
failure states. Options load and failure are explicit. A valid, explicit form
submit is the only route to `searchDeals`; an empty draft does not call it.

The date help states that the deadline is inclusive through the end of the day
and displays the selected timezone. Changing a pipeline resets its stage.

## Verification

- `npm test -- src/app/App.test.tsx` — PASS (11 tests)
- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `git diff --check` — PASS

The added UI coverage includes keyboard submit, no automatic search during a
StrictMode remount, empty-filter no-call behavior, option load failure, and
stale preview feedback after draft changes. No network, deletion, CSV, history
or chooser functionality was added.
