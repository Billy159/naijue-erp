# Product writer-catalog boundary

The new collector is a read-only source component, not an issuer or admission decision. It runs only through the genuine runtime27 issuer and an active managed maintenance context. Product capacity admission remains literally false.

## Concrete observation

One SQL statement collects the complete bounded role list and membership edges, including grantor, ADMIN, INHERIT and SET options; the eight product/child/evidence relations; raw and exploded table/column ACLs (including PUBLIC); effective table/column writes for every observed role; RLS policies; trigger identities, metadata and linked routine definition hashes; and non-system SECURITY DEFINER routine metadata/hashes. The result includes database/backend/transaction identity and a PostgreSQL statement snapshot descriptor. This is a single-statement observation, not a proven coherent snapshot across catalog reads and helper calls: privilege checks and function deparsing may consult internal caches or distinct snapshots. Their consistency under concurrent DDL/ACL changes remains unverified. All fields are copied before subsequent awaits; getters/proxies and malformed bounds fail closed. The digest identifies exact text only.

Hard bounds: 256 roles, 4,096 membership edges, exactly eight scoped relations, 512 columns/triggers/policies, 2,048 definer routines, and 16 MiB returned catalog text. Overflow yields no usable observation. These bounds do not claim low latency on a large target. An assigned transaction ID is required; the observer does not force assignment or acquire product locks.

## Evidence still required before real closure

1. Execute and review this statement on an authorized isolated PostgreSQL target using its actual runtime role. Synthetic query rows are not PostgreSQL parsing, permission, or catalog evidence.
2. Independently pin exact target/source/catalog generation. Review all relation owners, inherited membership and SET ROLE paths, PUBLIC grants, schema/database CREATE rights, grant options and privileged maintenance actors. A role graph is not an authorized-writer allowlist.
3. Resolve SECURITY DEFINER EXECUTE reachability, callable dependency closure, dynamic SQL, triggers and any privileged extension/external entry points. Routine hashes are identifiers, not semantic analysis. This observer does not prove the absence of writers outside its eight relation scope.
4. Prove each permitted product/child/audit writer takes the same product-root serialization and preserves immutable source/receipt evidence. Check CREATE absence races, child-only writes, mutable dictionaries and precommit concurrency under real SQL.
5. Establish a host-controlled DDL/ACL/writer stability protocol through commit. A single READ COMMITTED statement does not establish a common view across catalog rows, has_table_privilege/has_column_privilege and pg_get_functiondef, nor does it freeze catalog state until COMMIT. Matching hashes from separate reads cannot establish helper consistency or uninterrupted stability.
6. Compare exact reviewed catalog expectations, verified import/CREATE baseline and bounded product replay before pending capacity is admitted. This collector neither replays product history nor accepts caller pins.

No installation, grant, role change beyond existing simulated issuer protocol, gate activation, real PostgreSQL, Mac, production or typecheck action was performed for this change.
