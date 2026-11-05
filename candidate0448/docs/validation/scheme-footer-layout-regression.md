# Scheme footer layout regression

Base: 8c1be9307d855b745e670e5d5ede9265649c8fb2. This candidate remains inactive; this change is not a deployment approval.

The scheme list was excluded from the finite-height content layout. On both 1200×760 and 900×620 viewports, short and empty lists left the pager and original explanatory text above the content bottom.

The fix adds only scheme-scoped CSS: a finite-height content chain, scrollable table area, and bottom-aligned pager plus unchanged explanation. It does not change permissions, query contracts, source records, shared pagination, or the original text.

## Executed evidence, 2026-10-30 UTC

- Baseline headed regression: 4 cases, 16 page-size selections (20→50→100→20 per case), 96 layout assertion failures, no request or page errors. Normal browser closure and fixture exit 0.
- Candidate fresh build and headed regression: same 4 cases and 16 steps, zero layout violations, no blocked requests or page errors. All 232 asset/API requests settled with 200, all four contexts and browser closed, fixture exit 0.
- All 20 API request/response bodies and their order were identical between baseline and candidate.
- All 5798 tracked files were compared: only the stylesheet differed during this experiment.
- Candidate CSS SHA256: cfaa1f37b33a7df37d163bc2b41431d5c10abd39de171979ab7704a287c76e09.
- Candidate build manifest SHA256: ec9da368535e7fde45e16d8963ebe8be82de9a3c95e24d51825a25fd926c70b2.

The earlier harness attempt failed because Playwright's second callback argument overwrote a captured scenario value. That attempt is not counted as a valid baseline. A callback-only repair preceded the complete baseline/candidate executions above.

## Limits

Original isolated synthetic provider: six records or empty. No invented overflow rows, next/previous-page coverage, real PostgreSQL service, network deployment, or whole-system acceptance is claimed. Final-version aggregate checks and remaining page regressions remain separate gates. Private browser evidence is retained outside this source tree.
