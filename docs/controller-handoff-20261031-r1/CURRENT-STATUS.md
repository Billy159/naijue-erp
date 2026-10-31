# r1 preparation branch

This branch adopts every file declared by the 2026-10-31 r1 source handoff. The package has no original Git commit; 6a85 is comparison provenance only. Retained baseline reports and historical evidence are not current acceptance.

No production deployment workflow or webhook was present when checked. This is a source preparation branch, not a deployment request.

Dependency verification and root TypeScript/build passed using Node24.21.0 and the existing dependency tree with identical lockfile. Root standard run:3417 tests,3414 pass,1 fail,1 skipped,1 todo. The failure was the first capacity CLI case during the parallel run; targeted capacity CLI file rerun passed17/17 without changing production code or assertions. npm available locally was11.19.0, while package declares11.9.0; no install or lockfile changes were made.

The user explicitly approved removal of the retired inventory/pagination.tsx only from this preparation branch (call_60c2936d10684229a2f00ac301907319/0). It was removed; runtime TypeScript check now passes. The r1 replacement is runtime/common/ui/pagination.tsx. Original workspace and Git history remain untouched. No runtime fallback was added.

V6 target preparation remains incomplete: routine predecessors, exact column ACL and independently reviewed catalog, fresh isolated ordinary-login business commits and restore evidence remain required. V7 offline test success does not prove engine/application deployment. Production database and service changes require separate approval.

QB independently accepted the offline V7 preparation/read-only tools and immediate source consumers at e2286116128efe7da06bf0c2103d9eacf2a1873f. Scope: source only; existing 14+5+9 tests reused, no new database connection or environment action. No new findings. This is not V6/V7 engine, ordinary-login or deployment acceptance. Original T45 is collecting only missing catalog/ACL definition facts and identifying existing QA targets read-only; D1 is deriving the expected least-privilege matrix.

The source least-privilege closure has identified two cmin SELECT and three precise child-table DELETE requirements conflicting with the old preparation contract. A five-atom versioned contract successor proposal is awaiting explicit user approval for source implementation only; no actual grant or environment change is authorized by that request. V7 ledger balance semantics and migration versions remain unchanged. D1 closure and T45 catalog increments were adopted; expected definitions are not overwritten by actual values.

The human explicitly approved the five-atom source/contract successor (call_4b2e8a96c83740ef9163778f9ef8c196/0). D1 owns issuer/API/preparation/read-only/comparison/source-host consumer changes; T45 owns release config/generator/deploy/boot/rollback changes; C owns Git and handoff records. Implementation is in progress. This approval does not apply grants, create targets or deploy. QA275 proved no TCP listening and the existing /qa-socket:5432 path; no service configuration was changed.

Release V8 checkpoint cc70d8ff received independent QB scoped PASS. T45 then adopted only the reviewed helper pin in boot and rollback; generator check and affected boot14/rollback6 passed. Original historical pins/guards were retained. D1 integration remains in progress. Exact QA socket source extension is a separate pending confirmation; no environment changes were performed.

D1 V8 issuer/API/tools checkpoint19d6e5b9a1c753603840bd68625b8de1eefb3385 is pushed and verified. Exact16 leaves;243 offline directed checks and related strict type checks passed. QB incremental source review is in progress; source implementation does not prove actual ordinary-login/engine/business/deployment. D1 continues the dormant real-business integration entry, T45 prepares the concrete new-empty-target carrier. QA finite Unix source support awaits its distinct human confirmation; no environment mutations.

QB independently accepted exact16 V8 issuer/API/tools leaves at19d6e5b9, with no new source findings. Existing243 offline checks/strict evidence reused. Non-CORE API actually rejects old V7 before borrowing a connection. This does not cover the new integration leaf, actual PG, ordinary-login/business/recovery or deployment. QA Unix source extension confirmation remains pending.
