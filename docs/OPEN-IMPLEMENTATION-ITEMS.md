# Open implementation items (not a release checklist pass)

Current confirmed remote commit is 231e53b on codex/clean-erp-foundation. Later cloud commits are not automatically on GitHub. Full feature gaps remain in the approved project completion Page and scope reports.

## Targeted follow-ups from cross-slice review

- CLOSED in a3f1502: sales now records sparse key/changed-line/settlement before/after evidence and skips unchanged native detail writes. Independent6 targeted probes plus85 focused/130 combined tests passed; limited synthetic PostgreSQL engine acceptance now passed at 318440a (evidence commit 23f1085), not every command path or production acceptance. Transfer equivalent is in f8ebc86.
- CLOSED in a3f1502: sales fingerprint binds stable account and actual business command, not transient hall context; receipt replay still rechecks current permission. Transfer equivalent is in f8ebc86. Do not re-open these resolved source defects without new evidence.
- Inventory native reads, complete published-scope absent stock as zero, whole-query NOT_READY and sparse first-use persistence have staged actual PostgreSQL evidence. Exact e4aa8b2 adds real source-confirmed native authorization/read acceptance:22/22. Production data, a deployable three-page host and real browser transport acceptance remain missing.
- Product drawer and native product reads are implemented. The bc87b5b three-page portable synthetic preview has been delivered as a downloadable Space attachment; it is not browser/pixel acceptance. Actual media storage/thumbnail/original delivery remains unavailable and returns an honest501.
- Authentication UI and bounded transports are implemented. Actual scrypt, sessions, current role/hall, native read policies and logout passed the e4aa8b2 PostgreSQL + Fastify.inject suite22/22. Evidence: evidence/postgres-real-native-profile-acceptance-e4aa8b2/. This is not listening HTTP/TLS/browser or production acceptance.
- Real PostgreSQL17.11 runs only in the authorized isolated dot-cloud development/test environment with synthetic data. Preserve distinct checkpoints:318440a sparse12/12, c48eba1 backend11/11, d9a2844 explicit-test-policy HTTP16/16 and e4aa8b2 native-profile22/22. The first b508ce8 syntax failure remains retained. Do not relabel earlier explicit fixture policies as native authorization or replay old618/T45/setup jobs.
- Customer/supplier independent maintenance and sales/transfer read pages retain their reviewed implementation. bc87b5b restored sales full-page read-only detail and separately lazy detail styles; the earlier party unresolved receipt403 recovery defect is fixed in2d7bf43. Complete sales/transfer write forms, current usable reference providers and native write-authorization composition remain incomplete.

No line in this document authorizes a database write, migration execution, deployment, credentials, local task, or permission change. The code implementation follows the user's approved rewrite scope; production validation is a separate stage.

## Visual acceptance correction

The prior synthetic inventory appearance was rejected by Billy. Exact frozen Demo UI source is now available and verified; restoration is active, but no real-Demo screenshot comparison or real-browser acceptance has occurred. See FRONTEND-ACCEPTANCE-STATUS.md. No functional test count overrides this missing acceptance.

## Latest catalog price decision

User message Sentinel_3d67bb2097188191afc75e5acf73ba9f requires all frozen Demo price fields, labels, ordering and semantics at product rather than SKU level. Exact minimal static evidence is now available in evidence/frozen-demo-price-fields-b8bcfe3/ (JSON SHA256 14f54050c9b699789b7c5fc28f844103d79b4047f8bc254b815a45c795d171aa). It confirms purchasePrice, price, wholesale5 through wholesale10, minimumPrice in original order; all nine new-product defaults are null, blank is unset, numerical zero remains zero, nonempty prices are nonnegative with at most two decimals. This closes the local configuration evidence gap only. Full nine-field persistence/API/import mapping is not implemented by that evidence, and defaults must not overwrite existing/imported facts. No currency is inferred from the static price configuration alone.

## Current integration checkpoint

Exact e4aa8b2 passed the complete offline check:all:1040 synthetic tests,93 DOM groups,176 dependency entries, root/web types, build and bundled smoke. See evidence/checkpoint-e4aa8b2/result.json. All1111 frozen committed files matched after execution. Actual native PG22/22 is separate evidence, not part of the1040 count or a substitute for browser acceptance.

The bc87b5b full-page three-page synthetic preview is delivered, with consumed-input provenance unchanged through e4aa8b2. Remaining business launch gates: real host/HTTPS/browser composition; sales/transfer forms, current references, write authorization and receipt recovery; media; real master/history import and historical first-unapprove; post-publication product inventory readiness; controlled release and operations acceptance. Explicit HTTPS development-host source is implemented in6f26617 and its checks integrated in257264d; it has not started a server or completed browser acceptance. These are implementation/testing gaps, not requests to reapprove settled business rules.

## Confirmed sales action authorization

User message Sentinel_cf3a0ee0df048191acfb5423d632f7a9 confirms salesperson own-hall SAVE/VOID, own actual creator APPROVE and no UNAPPROVE; ADMIN/WAREHOUSE may act across halls. Commit60457e0 implements action checks using current identity locks in the command transaction and all four service/receipt call sites, preserving state, economics, CAS, idempotency and inventory/history guards.196 focused tests, final typecheck and independent14/147 checks passed. This remains action-only, not complete write-reference/economics composition or production route enablement. Its genuine PostgreSQL lock acceptance is being prepared separately; older22 native-read tests do not cover it.
