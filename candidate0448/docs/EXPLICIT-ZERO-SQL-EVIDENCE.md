# Explicit zero evidence: source integration, not engine acceptance

The batch inventory cutoff is Beijing 2026-11-02 12:00. Only independently approved, already matched warehouse/SKU identities absent from the inventory file may produce a zero baseline. Existing positive/negative entries remain unchanged; unknown identities are not zero. Historical documents never replay inventory.

## Authority and bounded transmission

The trusted local host must read the complete approval JSONL with an independently supplied SHA-256, validate its namespace, exact inventory-file hash, exact cutoff and individual resolved identities, then derive the private approval token and Merkle descriptor. The inventory package cannot supply its own authority. SQL checks consistency and membership under that descriptor, not external authorization or the relationship between a claimed raw-file hash and Merkle root. Direct arbitrary SQL/controller access is not a substitute for this trusted host boundary.

The complete approval file is not embedded in INIT. INIT carries the seven-field EXPLICIT_ZERO_APPROVAL_MERKLE_V1 descriptor. Each approved KEYS entry carries the original JSON line without LF, its one-based ordinal and sibling path. Inputs are strict UTF-8 JSONL with final LF, no CR/BOM/empty lines/duplicate JSON keys. The full file SHA includes LF bytes.

Leaf bytes are UTF-8 of EXPLICIT_ZERO_LEAF_V1, LF, decimal one-based ordinal, LF, original line. Parent bytes are UTF-8 of EXPLICIT_ZERO_NODE_V1, LF, lowercase left hash, LF, lowercase right hash. Neither has a trailing LF. Odd nodes duplicate themselves; SQL requires the duplicate sibling to equal the current hash. The ordinal starts at one; position at each level is floor(index/2), width is ceil(width/2). Exact depth is mandatory, at most 18 for at most 250000 approvals. Normal bounded KEYS batches remain in the existing transaction; no partial approval installation or new persistent authority table is introduced.

SQL binds the exact approval fact, quantity string 0, warehouse/SKU identities, source key, namespace, cutoff and inventory hash. It retains the full membership proof in source-record hashing and immutable audit records. BASELINE_SEAL requires every approved ordinal exactly once. Existing identity, source, inventory and rollback constraints remain applicable.

## Formal source chain and gates

whole-sales-catalog-v1.mjs and the protected installer consume renderWholeExplicitZeroCandidate. The renderer appends the exact historical-reception command-body successor before the existing access verifier, inside the same transaction. The full 178-routine catalog and ACL checks remain intact. Source-spec hashes include the new patch, renderer and approval implementation. Old source records do not silently become valid for this successor.

The new patch adds no database columns, tables, routines or permission statements. The combined installation still includes its predecessor permission-changing GRANT/REVOKE statements and reviewed ACL restrictions. It is not a read-only or grant-free artifact. Installation requires the separately trusted launcher/code environment, explicit authorized target/action, reviewed catalog and ACL delta, and independent OS-protected installation record publication. No record or engine acceptance is fabricated by these source tests.

Verification commands (offline only):

    node --experimental-strip-types --test tests/explicit-zero-sql-successor.test.mjs tests/historical-sales-installation-admission.test.mjs

The shared three-leaf fixture checks byte-algorithm parity as an offline model, not PostgreSQL execution. Actual PostgreSQL parser/engine, rollback, commit/replay, installed catalog, ACL and protected-record acceptance remain unverified here. No database is connected by the renderer or these tests. Host private-token enforcement must be reviewed with the normal and streaming execution paths before activation. The existing exclusive-client/no-concurrent-DDL-or-ACL-change prerequisite continues across admission and the whole transaction.

Final status for this source handoff: the host now validates private approval authority and uses the same owned, frozen primitive parameter array for validation and sending; accessor/proxy inputs are rejected. The reported getter TOCTOU issue was fixed and synthetic regression tests passed. Final independent security re-review was blocked by a safety check and was not retried or routed around. Do not describe this handoff as fully independently reviewed or engine-accepted. Final source-spec bindings and the 18-test offline SQL/catalog result are recorded under evidence/explicit-zero-sql-20261104.
