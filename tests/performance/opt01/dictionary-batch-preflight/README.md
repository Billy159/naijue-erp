# OPT01 dictionary batch preflight — tests only

No production implementation or root registration. Run with exact Node24.21.0, no transform flags, from repository root:

```sh
source /workspace/scratch/1f717a486422/toolchain/use-exact-node.sh
node --test --test-concurrency=1 tests/performance/opt01/dictionary-batch-preflight/source-contract.test.mjs
# Explicit finite manual body experiment (~10MiB payload, no raw file):
node --test --test-concurrency=1 tests/performance/opt01/dictionary-batch-preflight/boundary.manual.mjs
```

Stop new CPU work when controller declares a timing quiet window. The generator allocates long strings only on explicit invocation. It never changes QA/frozen profiles or writes raw large bodies.

## Evidence separation

- Small actual-session/source-contract tests: initial200 saved lines can hold a201st pending group, but this is the canonical wanted-set projection, not proof that an API must accept201 at once. Already-cached groups normally make a later request only1 missing group; cold/in-flight change needs explicit batching/cancellation semantics. No global cache is proposed.
- The original complete dictionary enables no-SKU matrix axes; explicit0 differs from blank/missing. Independent dictionary denial remains before reader invocation; the proposed batch intent currently fails closed.
- Manual T0/T1 protocol model: two preexisting short A and long B groups plus97 fillers =101 groups. T0 detail references short A and strictly succeeds. T1 actual SKU/product facts reference long B, which contain every retained saved SKU size. No size/group/member/name changes are modeled. Original100/page strict dictionary reads and actual saved-session logic return complete2000 target members across2 pages; same-values tuple has names alone exceeding8MiB.
- This does NOT prove actual ordinary product EDIT commits. Native/source provenance, retained SKU/member, all original runtime/capacity guards, actual ACL and real commit remain separate. Stable T1 full detail is actually rejected by the same8MiB guard, despite only2000 members (<20k), so no stable-detail success is claimed.
- A separate arithmetic counting bound covers the wider DDL/reader/native-value domain: three dispersed groups with999 independent7500-character names over64 symbols have more possible contents than two8MiB bodies. Each old page still has a conservative size bound below8MiB. This is not proof that the whole domain is currently source-admitted ordinary runtime data; a trustworthy exclusion/invariant would need exact evidence.

Canonical renderer/independent authority/source hashes and raw receipts are recorded externally under `development-results-20261031/performance-opt01/dictionary-batch-preflight-v1`. No actual browser, PG, ordinary mutation, performance or whole-page-ready verdict is signed here.
