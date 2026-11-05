# Exact installed-candidate guard prerequisite

Status: source-only predicate inside the literal-false capacity issuer. The two SQL candidates retain their unconditional installation exceptions. No installation, grant, role change or actual SQL execution occurred.

The predicate requires both exact candidate function-body hashes and fourteen expected trigger bindings: six product/root/child/PRODUCT-evidence row triggers, four import-provenance row triggers and four provenance TRUNCATE statement triggers. It checks original enabled mode, row/statement event bits, no WHEN/column/argument/transition-table/constraint/partition-parent changes, exact table/function/schema ownership, invoker PLpgSQL function metadata, search path and an explicit owner-only EXECUTE ACL. Any additional binding to either candidate function outside the expected set rejects. Missing functions or trigger identities reject.

This is deliberately stricter than trusting a callback that says the guards exist. Source tests recompute both function hashes from the candidate bodies and pin expected identities/metadata. It does not authorize installing those candidates or certify their runtime semantics. The function ACL check can reject targets whose default privileges granted another role access; this code does not repair or change those privileges.

Other triggers are not declared reviewed merely because these fourteen match. Exact predecessor/catalog cohort, all other invoker/dependency code, privileged actors, schema stability, advisory-lock cooperation, actual role permission to lock parents, parsing and concurrent/rollback behavior remain independent blockers. One metadata query does not freeze catalog state through commit. No complete writer closure or live acceptance is claimed.
