# r1 preparation branch

This branch adopts every file declared by the 2026-10-31 r1 source handoff. The package has no original Git commit; 6a85 is comparison provenance only. Retained baseline reports and historical evidence are not current acceptance.

No production deployment workflow or webhook was present when checked. This is a source preparation branch, not a deployment request.

Dependency verification and root TypeScript/build passed using Node24.21.0 and the existing dependency tree with identical lockfile. Root standard run:3417 tests,3414 pass,1 fail,1 skipped,1 todo. The failure was the first capacity CLI case during the parallel run; targeted capacity CLI file rerun passed17/17 without changing production code or assertions. npm available locally was11.19.0, while package declares11.9.0; no install or lockfile changes were made.

The user explicitly approved removal of the retired inventory/pagination.tsx only from this preparation branch (call_60c2936d10684229a2f00ac301907319/0). It was removed; runtime TypeScript check now passes. The r1 replacement is runtime/common/ui/pagination.tsx. Original workspace and Git history remain untouched. No runtime fallback was added.

V6 target preparation remains incomplete: routine predecessors, exact column ACL and independently reviewed catalog, fresh isolated ordinary-login business commits and restore evidence remain required. V7 offline test success does not prove engine/application deployment. Production database and service changes require separate approval.

QB independently accepted the offline V7 preparation/read-only tools and immediate source consumers at e2286116128efe7da06bf0c2103d9eacf2a1873f. Scope: source only; existing 14+5+9 tests reused, no new database connection or environment action. No new findings. This is not V6/V7 engine, ordinary-login or deployment acceptance. Original T45 is collecting only missing catalog/ACL definition facts and identifying existing QA targets read-only; D1 is deriving the expected least-privilege matrix.
