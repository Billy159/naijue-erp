# Bounded native transfer command editor

This is a frontend command/form slice, not a production write host or a claim that real transfer creation is usable.

## Implemented

- Exact existing `/transfers/commands` and `/transfers/receipts/:requestKey` client. No actor/role from JSON, automatic retry, optimistic stock, or synthetic fallback.
- One session-owned workspace retains original complete command, key, expected version, draft and invalid raw input across action/route detach. Current identity/permission replacement clears them.
- Source full-page header/action/remark hierarchy and the existing four-dimensional native transfer matrix projection. Only existing actual lines can edit quantity, date and note. Warehouse endpoints, SKU identity, saved names and original barcode remain unchanged. Legal SKU without an actual row stays blank; nonexistent SKU is a separate dash. Duplicate-SKU/sparse/large grids use 40 actual rows per page, not a Cartesian DOM.
- Runtime DRAFT SAVE / APPROVE / VOID and APPROVED UNAPPROVE are guarded by persisted state and CAS. Historical cutoff documents and VOID remain non-editable. Dirty local input cannot silently be saved by approval/void. Transfer posting receipts require exactly two entries per saved actual line, matching the existing domain planner. No balance/negative-stock check is added.
- Invalid, zero, negative, decimal, noncanonical and overflowing quantities never dispatch. Invalid raw strings also block leaving. Explicit discard is available only without unresolved writes.
- A stopped/disconnected/dispatched request stays uncertain. Receipt absence is not evidence of non-commit. Explicit replay preserves original key, target, CAS and content. Correlated commit still requires explicit authoritative reread/adoption before more actions. List results are marked stale after a commit until explicit refresh.
- Form module and detail CSS activate only when opened. Closing a pending preparation/detail read rejects late work. Default application and development-host configuration remains read-only; optional `transfers.commands` explicitly opts into a session workspace.

## Deliberately blocked

- New creation requires a complete explicit `TransferFormPreparationProvider`. There is no native implementation, arbitrary number generator, historical-filter reference reuse, global eager catalogue, generated barcode, unknown-to-null/zero substitution or enabled button without that provider.
- Shared current warehouse/SKU reader work is separate. This frontend does not wire a complete authoritative current original-barcode preparer; historical line snapshots are not current barcode authority. Any separately implemented current provider must retain its explicit availability status until verified. Transfer document numbering was not established by the customer/supplier KH/GYS approval. These gaps and a trusted write composition must be resolved before real new-create activation.
- No schema, migration, domain policy, authentication policy, real database writes, production server, deployment, export, print, scan or history functionality is added.

## Source and verification

Frozen source: `/frontend/transfer-current.js:76`, `/frontend/transfer-golden.js:30–35` and `/frontend/transfer-matrix-experiment.js:24–26,50–67` within the verified b8bcfe3 evidence package. Trusted authenticated creator replaces the legacy selectable creator; this approved identity boundary is not relaxed.

Focused checks:

- `node --test apps/web/src/transfers/commands/*.test.ts`
- `node apps/web/src/transfers/commands/tests/run-dom-tests.mjs`
- `tsc --noEmit -p apps/web/src/transfers/tsconfig.json`
- Existing transfer read-only DOM and static route build checks remain applicable.

Tests use clearly synthetic HTTP/native fixtures and JSDOM. They are not real browser, pixels, network waterfall, real authorization, real PostgreSQL, real-data command success or whole-system acceptance.
