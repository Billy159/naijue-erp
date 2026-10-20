# Independent sales command review

Scope: `apps/web/src/sales/commands/**`, additive headless client/controller only.
Independent probes and logs live only in this directory. No implementation files
were edited by this reviewer. No network, actual HTTP/server, browser, database,
installation, full suite or commit operation was performed.

## Confirmed findings reported to the owner

1. Historical provenance promotion: an initial `CUTOFF_HISTORY` detail could be
   refreshed/adopted as runtime and then dispatch APPROVE. Reproduced by
   `probe-history.mjs`. Owner added immutable document stock-basis correlation.
2. Cross-route error classification: POST interpreted receipt-only
   `RECEIPT_NOT_FOUND` as definitive rejection. `probe-cross-route.mjs` reproduced
   it. Owner split native command/receipt error allowlists.
3. Dot-only native request keys normalize out of the browser receipt route.
   `probe-cross-route.mjs` demonstrates standard URL behavior. Owner now rejects
   `.` and `..` before dispatch and documents this technical native-key subset.
4. Impossible readback state: an APPROVE/VOID result v3 could be followed by an
   adopted DRAFT v3. `probe-readback-status.mjs` reproduced both. Owner now checks
   equal-version status agreement and retains terminal VOID closure, while
   allowing a genuinely later unapproval.
5. Authentication cleanup on a stalled error body: observed 401/403 headers could
   become timeout before auth fallback, leaving old scope/draft active.
   `probe-auth-timeout.mjs` reproduced both. Owner now invalidates immediately
   on observed 401/403 headers and cancels the body without parsing it, preserving
   an uncertain write outcome. Independent execute/receipt probes pass for both.

The one-off reproductions describe initial failures and are not final acceptance
assertions. `independent.test.mjs` is the bounded assertion matrix to rerun against
frozen final source. `working-results.tap` records the 15-case passing matrix
before adding the stalled-auth-body regression. `pre-auth-fix-results.tap` records
15 passing cases and the independently failing new cleanup case.

## Additional static checks

- Only existing POST sales commands and GET original-key receipts are constructed.
- Payload, key, target and safe-integer CAS snapshots are deeply cloned/frozen;
  replay uses the original identity and payload, never a refreshed document.
- Unknown outcomes block replacement/new commands; receipt404 is not rollback;
  no receipt lookup or replay is automatic.
- Before-client invocation cancellation is distinct from post-invocation unknown.
- Account/session/permission scope disposal clears state and rejects late results.
- Recovery returns the original operation result; reads remain separate and
  require explicit adoption, with monotonically increasing known versions.
- Approved edit/SAVE bans, exact saved settlement balance, integer quantities,
  independent signed returns, no original-sale relation and no negative-stock
  clamping remain intact.
- UI activation is false. No imports outside this command slice activate its
  workspace or substitute historical filters for current form/reference facts.
- Existing 2,000-line/100-digit parsing guards and 1,024-key tombstones are
  explicitly documented as technical guards, not new business authority.
- Root package test globs do not discover this subdirectory. The owner documents
  the explicit focused command-test invocation; no aggregate-pass claim follows.

## Final independent acceptance

Final owner manifest SHA-256:
`9124deb618497f250d825af278a5392b7efd11f498f626f2d76b634da5391d2c`.

- All 10 manifest source entries match before and after independent verification.
- `node --test evidence/sales-command-independent-review/independent.test.mjs`: 16/16 groups pass.
- `./node_modules/.bin/tsc --noEmit -p apps/web/src/sales/tsconfig.json`: exit 0.
- No remaining blocker found in the requested headless command-workspace scope.
- Genuine current form/reference providers and reviewed UI integration remain
  separate activation gates. UI activation remains false.

Final logs: `final-results.tap`, `final-scoped-typecheck.txt`,
`final-source-before.txt`, `final-source-after.txt`, `final-status.txt`, and
`final-owner-manifest.sha256`. Compiler ownership was coordinated and released.
The scoped checks are not a full suite, browser parity, integration DB or runtime
acceptance claim.
