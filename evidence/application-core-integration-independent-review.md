# Independent application/core integration review

Status: PASS for the frozen application/transfer/shared-style changes, with one separately reproduced pre-existing party recovery defect OPEN pending its separately assigned fix and review. No production source was edited by this reviewer.

## Reviewed boundary

- `application/**`: optional native read-only transfers, real lazy HTTP readers, per-action CSS, authentication lifecycle, and pure first-party DemoFrame workspace composition.
- Shared `demo-frame.tsx`: the intentional separate customer/supplier business departure only; no merged `partyEntry`, default entity, alternative frame or changed frame geometry.
- Shared product drawer frame CSS extraction and optional explicit per-attachment stylesheet owner, while preserving inventory fallback and product lifecycle.
- Accepted transfer source manifest: `evidence/transfer-read-ui-independent-source.sha256`, SHA256 `490550323f239fd5e1ad9e648708b9f8dbaa7408d7770f5533af3ccabfa7a8c7`.
- Exact reviewed source inputs are sealed in `application-core-integration-independent-source.sha256` (62 files, including the existing transfer unit-test source; manifest SHA256 `5d2890e4c28d2b67278624082eb98432450bb8c1eff7509d4fc2fb91e2db782e`). Party controller baseline is recorded separately so its new fix is not mixed into this review freeze.
- Independently checked the owner's final `transfer-integration/source.sha256` (`d1575aba88834ba44897361d4d658e1b66d0accd7d9f836a9d5e957651ad6932`), `shared-source.sha256` (`a98bc876ecb4a2534226c4d851af9f5b7124ea9c98096c98cf1af94ef0edca1a`) and `delta.sha256` (`db9ae24913aedfd905448c05e8c224d95ea51fc497f98024f10be7f551899f64`) with `sha256sum -c`; all matched.

## Passed independent verification

`node evidence/application-core-integration-independent-dom.mjs` passed six groups against the actual composed root, native HTTP adapters, real Arco party/transfer components and shared product drawer, with mocked HTTP/CSS and no resource-loader network:

1. Pure frame rendering does not authenticate, navigate or read. Independent customers/suppliers remain separate. Omitted transfers reject navigation without CSS/read work.
2. Construction, mount and session verification have no route/style/business-read work. Route CSS failure is local and explicitly retryable. One actual transfer activation reads exactly one page of 20; repeated current-menu activation does not query. Detail/product/candidate CSS and reads remain absent while unopened.
3. Detail and product CSS failures retry locally. Closing before readiness prevents late mounting/reads. Product uses only configured `/approved/` stylesheet links, never relative fallback CSS. Closed/cancelled product late401/403 is ignored.
4. A completed synchronous native product basics response is rendered successfully. A fresh current product403 fails only the read-only transfer parent, keeps auth and permits same-menu retry. Superseded list401 is ignored. Sales403 retains its route/scope. Fresh current product401 clears all authenticated workspace content.
5. Existing uncertain party work and original key/content survive an absent receipt; leaving stays blocked and exact replay reuses the original command. App disposal clears DOM and configured CSS owners. This group does NOT accept the separate party403 defect below.
6. Already-cached shared product module code cannot bypass a different attachment's configured pending stylesheet. StrictMode starts exactly one product transport. Disposing a pending stylesheet prevents content/reads and does not invoke default CSS.

`node evidence/application-core-integration-independent-static.mjs` passed independent actual emitted ESM/CSS graph analysis:

- Startup excludes business leaves, real readers, fixtures, preview modules and Arco. Inventory/sales static closures remain Arco-free.
- Explicit transfer list uses its native HTTP adapter but excludes inline detail and product host/reader code. Detail owns shared product host code; product HTTP adapter remains a later dynamic import.
- Shell, transfer list, transfer detail and product action have separate CSS graphs. Transfer list/detail never import inventory stylesheet assets. Product action imports only shared product frame/body CSS, never inventory matrix/settings CSS.
- The new shared frame file is byte-for-byte the committed `b508ce8` inventory block, SHA256 `0c34778a74bfa84866fc9cd6438b68fe7fc14c4424d921d9e92628d12326c5b5`. Inventory source differs only by that exact removal and shared import. Inventory and transfer-product output each contain one frame declaration, not duplicated source declarations.
- Shared frame CSS geometry is unchanged. `demo-frame.tsx` differs only in its comment/type and the approved separate customer/supplier entries.

The independent DOM log contains known installed Arco React19 `element.ref` compatibility warnings; assertions pass. These warnings do not establish rendered/browser acceptance.

## Lifecycle/source findings

- `application/controller.ts:119-130` checks current parent scope activity and the actual combined request signal before global401 expiry. The fresh401 decision precedes auth cleanup aborting the same request. The403 route-local `failRoute` branch additionally requires current `transfers` route and matching scope, not party/sales workspaces.
- `application/routes/transfers.tsx:12-29` constructs only native inert transfer/reference readers and lazily imports the real product HTTP adapter on the first product read; it rechecks cancellation before/after module loading and normalizes the configured action stylesheet to `Promise<void>`.
- `inventory/product-drawer-host.tsx:21-23,53-60` caches only drawer module code. Every attached scope awaits its own configured stylesheet callback; the nullish fallback cannot run alongside an explicit loader. Late style/code settlements check attachment and scope activity.
- `application/demo-frame-presentation.tsx:12-25` is pure presentation over configured routes. Capabilities are not authorization grants. Authentication remains the existing `.auth-session` outside the workspace/topbar, an explicit source-placement difference, not claimed frozen-Demo parity.

## OPEN pre-existing party403 recovery defect

Minimal reproduction: `node evidence/application-core-integration-independent-party403-repro.mjs`. Baseline output and source hashes: `application-core-integration-independent-party403-repro.log` and `application-core-integration-independent-party403-baseline.sha256`.

1. Verify a synthetic WAREHOUSE principal; activate only customers, not transfers.
2. Edit a customer's name and submit once; make that dispatched command lose its response, leaving an unknown operation with immutable original key/content.
3. Return well-formed HTTP403/FORBIDDEN for explicit lookup of that original request key's receipt.
4. Actual baseline: `PartyMaintenanceController.checkReceipt` calls `#access`; `parties/controller.ts:232-235` disposes its session scope for forbidden; the existing application party callback expires authentication. App changes from ready/customers/authenticated to home/null/unauthenticated, editor and exact-replay controls disappear, original recovery state is cleared.

Expected: receipt403 does not establish whether the original dispatched command committed. Preserve the exact original operation/key/content and recovery state; do not treat this as disposable read-only transfer state. Current401 must still invalidate authentication, and stale/cancelled request denials must remain ignored.

This chain predates the new transfer-only403 branch. It is a real defect, not accepted baseline behavior. Parent assigned a separate bounded fix; this application review does not modify party production and must not be used to claim party recovery is closed until the separate fix passes review.

## Limits

No network, browser, listener/server, DB, install, commit, full-suite or root aggregate execution was performed. Scoped TypeScript and owner regression runs were reported by the owner, not relabelled as independent executions here. No deployment, openable production ERP, real auth, pixel/layout/keyboard/history acceptance, download timing, throughput, memory or numeric performance claim is made. Owner's initial selector/focus test-harness failures remain historical and are not relabelled as production defects or current passes. The owner's fresh portable inventory preview is 313154 bytes, above the 262144-byte Pages limit; passing source/frame checks does not imply embeddability.
