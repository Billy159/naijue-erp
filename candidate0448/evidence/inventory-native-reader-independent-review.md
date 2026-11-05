# Independent native inventory reader review

Verdict: accepted as a bounded source/protocol checkpoint, with no blocking defect found in the frozen reader. This is not PostgreSQL-engine, production, or performance acceptance.

Frozen reader: `adapters/postgres/src/inventory-query-reader.ts`, 378 lines, SHA256 `6bed8e3ec64639d4869e2119006186d76892b1dffb3f9755f9a0e2d723466846`.

## Reviewed boundaries

- The existing application contracts, parsers and response validators, native product reader patterns, 0007 cutoff publication/immutability proof, and frozen b8bcfe3 category UI evidence were inspected directly.
- Each invocation uses one acquired client and RR READ ONLY snapshot. Authorized warehouse/hall intersection, native identity/label verification, publication, count, page, stock summary and DTO construction stay in that snapshot. Trusted authentication and current authorization remain external injected responsibilities; no role/admin shortcut is added.
- Inventory readiness checks all filtered SKU membership, size relationships and stock consistency before paging. A missing publication/member or inconsistent off-page stock fact rejects even an empty visible page. The full-filter count and signed SUM are not page totals.
- Published existing SKU absence yields exact zero; an absent SKU coordinate remains not-applicable. Existing zero balances and negative signed-bigint cell values are preserved. Aggregate totals are not narrowed to bigint or JavaScript Number.
- Product paging is stable by native code under C collation and ID. Source size order and authorized warehouse display order are preserved. Hydration is page-ID-bounded in set queries, with explicit row and matrix-work overflow failure. No global member/SKU hydration, application N+1, source/history reread or zero Cartesian relation is introduced.
- Candidate count/page use identical native authorization/reference/search predicates. Selection IDs are context, not grants. Warehouse/category paths do not read stock; other nonempty reference pages check returned-ID-associated membership/size/category relationships. Candidate readiness is reference-page readiness, not a promise about all off-page stock. Invalid returned candidates reject rather than being removed after counting.
- Category exact-ID-or-direct-parent membership is shared by filtering paths. The parent behavior is documented as an inference from non-strict SHOW_PARENT UI and explicit two-level source constraints, not a recovered C.inCategory body. Inventory rejects deeper/cyclic taxonomy; candidate rows/associated returned references receive bounded hierarchy checks.
- Failure handling requests rollback, discards failed-BEGIN/uncertain-COMMIT clients, aggregates rollback failure and never retries automatically. Signal checks reject after delayed acquisition and late COMMIT acknowledgment; they do not cancel in-flight SQL or pool acquisition.

## Independent verification

- `node --test evidence/inventory-native-reader-independent-probes.mjs`: 10/10 pass against the frozen hash. Log: `inventory-native-reader-independent-probes.log`.
- Scoped strict TypeScript check of the reader plus new protocol test entry: exit 0. Config/log: `inventory-native-reader-independent-tsconfig.json` and `inventory-native-reader-independent-typecheck.log`.
- Independent probes cover signed-minimum quantities whose aggregate is below signed-bigint minimum, zero versus not-applicable, exact ordering, mutation during delayed pool acquisition, abort after acquisition and during acknowledged COMMIT, whole-filter failure before paging, matrix overflow before matrix allocation, all six candidate kinds, returned-ID-only proof, invalid category rollback and empty candidate pages.
- Owner's persisted final evidence was inspected, not rerun by this reviewer: 23/23 new protocol tests and 109/109 focused inventory/cutoff regressions pass. The owner manifest's source/test/document hashes match the independent hash manifest. `sha256sum -c evidence/inventory-native-reader-independent-sha256.txt` passes all four entries.

## Explicit residuals

Real PostgreSQL SQL parsing/type inference, plans/index use, isolation, concurrent integrity, grants, durable commit and realistic load remain unverified. Protocol clients return scripted rows and cannot establish those properties. Database/pool timeouts must be configured by the host.

Off-page display-label validity is an upstream clean-import responsibility, not an additional full-catalog scan on every read. Current page/candidate display facts fail closed without fabricated labels. Whole-filter membership/stock invariants needed for count and summary remain mandatory. Guard-presence checks do not defend against privileged disable/corrupt/re-enable activity.

No implementation, schema, root/package file or existing test was edited by this review. Only the dedicated independent evidence files were added. No database, server, network, installation, browser, commit or push was used.
