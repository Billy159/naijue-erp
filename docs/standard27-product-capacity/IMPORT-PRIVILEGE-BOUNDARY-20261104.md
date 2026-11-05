# Known import privilege boundary

This is a fixed negative prerequisite inside the already-disabled capacity issuer, not another observation collector and not a complete privileged-function closure. No SQL executes while the literal-false capacity gate remains closed. No grants or installations are introduced.

## Source-derived surface

`0027_standard_import_initialization.sql` defines the core command plus initialize/master/baseline/document/publish gateways. Its end-of-file grants distinguish initializer/importer/runtime roles. Whole-package V2 source and access SQL add prepare/step/finish/command/inspect/verify gateways. The new SQL names that fixed surface, includes all present overloads of those names, and fails if the six required core signatures are missing. Optional V2 names are checked whenever present, without pretending their absence establishes any other closure.

The query rejects effective EXECUTE through any directly relevant, inherited or session SET ROLE identity, covering the original session identity even when current_user is the restricted runtime role. Effective privilege checks include PUBLIC rights. Any ADMIN membership option held by a reachable identity also refuses, even if that edge currently has SET and INHERIT disabled or its target role is not otherwise reachable. Such an identity could alter its own membership options; current reachability alone is insufficient. It also rejects direct/inherited ownership of known gateways or the eight scoped relations, database/schema CREATE capabilities, and elevated role flags. More than 256 reachable identities refuses. It accepts no caller-supplied allowlist or expected permission bitmap.

## What a passing result would not mean

It would only indicate that this known import surface was not reachable under the queried checks. It does not validate read helpers' code, discover arbitrary renamed wrappers, prove transitive routine dependencies/dynamic SQL/native extensions safe, exclude external actors, or freeze ACL/role/catalog state. PostgreSQL helper consistency under concurrent catalog change remains unverified. The issuer still needs independently reviewed exact routine/catalog/source pins, full privileged entry closure, immutable evidence and stable writer control.

This narrow boundary may intentionally reject an existing deployment whose login identity also has importer access, even if it currently SET ROLEs to runtime. No separation is inferred, and this work does not modify those roles or grants. Any future role redesign requires its own explicit authorization and review.

Source RED/GREEN tests check exact gateway scope, session/inherited/SET reachability, effective EXECUTE and ownership checks, and unchanged admission gate. They are not PostgreSQL privilege-semantic, parser or live target acceptance tests.

## Direct DML and exact V1 definer cohort extension

The negative prerequisite now checks effective relation and column privileges on import_batch/import_record/audit_change/operation_receipt. Direct import INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER is refused. Audit/receipt INSERT remains a necessary ordinary-operation surface, but UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER and INSERT grant options are refused. Column-only rights are checked separately so absence of a table grant cannot conceal them. The INSERT exception does not validate who or what may be inserted; exact actor, immutable-evidence and operation guards still need independent proof.

Callable or owned non-system definer routines outside the exact public V1 helper cohort are now denied. The fixed cohort checks body hashes, exact routine identities, owner, return type, language, volatility, strictness, definer mode, search-path/timezone configuration, lack of defaults/variadics and textual SQL-body representation. It includes the private standard_import_record_proof and invoker standard_inventory_key_id dependencies as required pins, without granting the private helper direct runtime access. All five hashes are recomputed from their original checked-in V1 definitions by a regression test.

This deliberately rejects V2 helper replacements and broader runtime definer grants rather than interpreting them as equivalent. Any broader cohort needs explicit source/semantic review. Built-in/native code, operator/type/catalog dependencies, indirect invoker wrappers, external actors and concurrent changes remain outside this narrow predicate. It is not a complete graph proof.

Configuration spelling follows PostgreSQL's canonical GUC names; [PostgreSQL GUCArrayAdd source](https://doxygen.postgresql.org/guc_8h.html) normalizes option names before storing entries. This source reference is not a substitute for validating the expected proconfig values on an authorized target.

## Conservative indirect-route exclusions

The source prerequisite now enumerates reachable writable non-system relations using table INSERT/UPDATE/DELETE/TRUNCATE/MAINTAIN and column INSERT/UPDATE privileges, with a 2,048-relation refusal bound. It rejects writable views, materialized views, foreign tables, partitioned/inheritance relations and non-SELECT rewrite rules rather than assuming their effects remain in the visible relation. It also rejects accessible/owned non-system routines in languages other than SQL/PLpgSQL, and non-internal user triggers on writable relations that are non-origin/disabled, definer-mode or native/custom-language.

Predefined file/program/backend/checkpoint/maintenance roles are refused through effective USAGE from every reachable identity, including privileges inherited after SET ROLE. No roles or grants are changed.

These exclusions are deliberately negative and conservative. They do not prove ordinary invoker SQL/PLpgSQL trigger bodies, SELECT-only views/rules, default/generated/check/domain/type expressions, system-native functions, internal constraint triggers, extension code or indirect function calls safe. Those still require exact pinned code/catalog dependency review. MAINTAIN assumes the intended PostgreSQL 17 privilege vocabulary; incompatible target semantics must fail, never be silently ignored. No parser/live privilege or indirect-write behavior has been tested here.

## SELECT-only and type-conversion exclusions

Accessible relations now include table SELECT and column-only SELECT through the same reachable identities. The union of read/write targets is bounded at 4,096 and restricted to ordinary non-inherited heaps. Read-only views/materialized views, foreign reads and inheritance routing are refused rather than assuming a read cannot invoke code.

For those accessible relations, columns must use pg_catalog base types; custom/domain/composite types and non-base/custom array element types are refused. Non-system collations are also refused. This is relevant to ordinary reads and JSON-to-row conversion in pinned proof helpers: a custom domain/type path must not be silently trusted merely because the helper body hash matches.

These checks still do not certify built-in type implementation, index access methods/operator classes, defaults/generated expressions/CHECK/RLS expressions, internal constraint triggers or ordinary SQL/PLpgSQL call graphs. They are conservative source prerequisites, not a complete graph proof or live database acceptance. None are active while capacity admission remains false.

## Index and recorded expression dependency exclusions

The candidate now requires the exact heap handler identity and only the btree/GIN handler identities used by this schema's indexes. Operator classes/families and referenced family support/operator functions must resolve to pg_catalog. Missing method/class/family metadata refuses rather than passing SQL NULL comparisons. This checks identities and namespace classes, not the integrity of PostgreSQL's native implementation.

Defaults (including stored generated columns), CHECKs, RLS policies and indexes form a bounded set of at most 8,192 pg_depend roots. Recorded custom function/operator/type/collation dependencies are refused except four explicitly named expression helpers. Three schema validators were added to the existing exact function metadata/body-pin checks; tests recompute their hashes from migrations 0011, 0021 and 0025. The validator whose original source has no configuration must have exactly NULL proconfig, not arbitrary configuration. Cascading/null/default FK actions affecting accessible parents are also refused; NO ACTION/RESTRICT remain distinct from such writes.

This is not an exhaustive expression graph. pg_depend omits pinned system dependencies and cannot discover dynamic SQL or dependencies hidden in literal SQL/PLpgSQL bodies. It does not certify expression semantics, every transitive callable routine, built-in/native code integrity, source-cohort compatibility or concurrent catalog stability. All changes remain behind the unchanged literal-false admission gate and need exact target review plus authorized PostgreSQL testing.
