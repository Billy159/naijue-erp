# Native catalog-lock witness prerequisite

This is a bounded read-only necessary-condition check, not complete catalog stability proof. It is called only by the still-disabled capacity issuer. It never acquires locks, assigns a transaction ID, changes privileges or accepts a caller's stability assertion. No database was contacted for this change.

The witness uses the actual runtime27 issuer's original pool and managed context, verifies its native backend PID, assigned transaction ID and virtual transaction, then rechecks around runtime readiness. These identities are pinned privately to that context. Missing/changed evidence or concurrent use poisons the context; retrying with restored values cannot recover it. Detached/borrowed/closed contexts cannot supply the witness.

## Exact lock classes expected

All required relation locks must be granted to the same backend and virtual transaction. Accepted PostgreSQL lock modes are ShareLock, ShareRowExclusiveLock, ExclusiveLock or AccessExclusiveLock. AccessShareLock, RowShareLock, RowExclusiveLock and ShareUpdateExclusiveLock do not satisfy this predicate. Shared catalogs use lock database OID zero; per-database catalogs use the current database OID.

The 29 fixed catalog relations are pg_class, pg_attribute, pg_attrdef, pg_proc, pg_namespace, pg_type, pg_collation, pg_constraint, pg_depend, pg_policy, pg_trigger, pg_rewrite, pg_inherits, pg_index, pg_am, pg_amop, pg_amproc, pg_opclass, pg_opfamily, pg_language, pg_authid, pg_auth_members, pg_database, pg_db_role_setting, pg_parameter_acl, pg_default_acl, pg_shdepend, pg_extension and pg_init_privs. They cover the currently inspected metadata classes, not every possible PostgreSQL/native/dynamic dependency. The query also refuses effective direct catalog table/column DML through its bounded reachable-role set.

## Current hard blocker

There is no established authorized path for the ordinary runtime to acquire these locks. It must refuse. Giving it system-catalog UPDATE privileges to obtain locks would undermine the boundary and is not proposed. The existing issuer expects an idle physical connection, so a future privileged prelocked-session handoff would itself need a separately reviewed design and explicit authorization; this change does not add one.

Present locks alone do not prove complete stability. PostgreSQL helper/cache behavior, unlisted metadata/native dependencies, privileged or external actors, same-session operations, source provenance, original transaction ownership and exact lock acquisition/retention protocol must still be established. Relation-lock observations do not authorize any of those actions. The source predicate and simulated issued-client tests have not been executed against PostgreSQL. No current target readiness or live acceptance is claimed.
