# CURRENT form browser proposal reader

This opt-in client covers the five standalone `/current-form/.../query` routes. It
uses the shared bounded same-origin session transport, not client actor/role/grant
claims. Input parsers run before network activity. Counts decode from canonical
integer strings to bigint; page/count/ID and batch-order mismatches fail rather
than returning partial or guessed facts. Staff may retain another hall; source
warehouses may be disabled with stock while targets must be enabled. Missing
minimum-price and barcode authority remains explicitly UNAVAILABLE.

Payment method references carry their own native id/name and null account-only
metadata. Payment-account requests require the selected native method; returned
account metadata must match it. No all-method account fallback, guessed catalogue,
retry, cache, listener or command is introduced.

Ten focused synthetic Fetch/Response tests pass. This is not browser visual, real
socket/TLS, PostgreSQL, full create-form or production-host acceptance. No UI
picker or host automatically consumes this client yet. The root test script
includes `apps/web/src/current-form/*.test.ts` for subsequent full checks.
