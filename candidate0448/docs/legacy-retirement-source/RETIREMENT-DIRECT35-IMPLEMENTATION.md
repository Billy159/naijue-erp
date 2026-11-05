# Direct35 source implementation, 2026-11-04

## Implemented

The new modules `fresh35-retirement-source.mjs`, `fresh35-retirement-plan.mjs`
and `fresh35-retirement-schema.mjs` work from the current **178-function** sales
installation source, not the earlier177-function source-only candidates.

The exact source composition is now35 retained tables and152 retained routines:

- Nine publication/party body specializations and ten retained-core guard
  specializations. Their exact predecessor and successor body hashes are checked.
- Twenty-six historical-only functions are omitted when generating a **new**
  schema. This includes both obsolete composite-input functions and all five
  source-row cast holders. No existing database object is deleted.
- The seven core-to-history foreign keys become validated NULL-only checks in
  the new schema. Columns and unrelated constraints are preserved.
- `import_batch` and `import_record`, ordinary documents, audit and operation
  receipts remain. Whole-package command/closure, sales settlement restoration,
  zero-amount archive trace and source evidence routines retain their current
  exact178-profile bodies.
- `valid_history_counts` and the three pure historical JSON projection helpers
  remain unchanged. Their literal JSON labels are not physical table references;
  deleting the count validator would break a retained import-batch CHECK.

The compiler consumes a schema-only dump from an independently verified empty
178-function synthetic predecessor. It checks every predecessor function body,
requires all56 tables and178 routines, preserves unrelated section bytes,
replaces19 bodies and seven FK sections, and omits only the declared objects.
The plan is an in-process genuine immutable object, with source-file hashes.
This source token is not a database admission capability.

The compiler is deliberately not a generic PostgreSQL parser. It recognizes a
bounded pg_dump layout, checks outer statements against their section's real
object target, rejects unexpected statement kinds and extra object declarations,
handles dollar bodies/comments/quoted identifiers, named identity arguments and
timestamp aliases, and preserves the trailing dump-complete/unrestrict material.
A changed or unsupported dump format fails rather than being guessed.

## What has not happened

No database was connected by these modules. No table was dropped, no business
row was read or changed, no real-data migration was attempted, and no new35
schema was installed or tested on PostgreSQL by this implementation task.

The model tests build a **non-executable parser fixture**, not an observed schema
or an independently reviewed catalogue. Their35/152 output is source evidence
only. Source matching cannot authenticate the dump's origin or establish the
safety of its owner/ACL/security metadata.

The old177/178 profiles, trusted installation records and live import host remain
unchanged and correctly reject a different35/152 catalogue. The earlier blocked
fresh35/fresh56 review entry points remain blocked. This implementation does not
change those refusals to create an unverified path into production.

## Required completion gates

1. The separate authorized task has now produced and stopped the current178
   synthetic predecessor. Its application dump SHA256 is
   `1552f7a055ceaa42cfea7656b4f22a52ce3f7bad83915e8c4661f905a7954354`,
   bound to source spec
   `396d45bd8303a6f8e0e453e93467f4f17643a835e5f0b6574864d37df4f1a81a`.
   Same-snapshot function, object, ACL and dependency observations are available
   in the sibling `cloud-pg-schema178-20261104-1710/evidence` directory. This is
   predecessor structure evidence, not current runtime admission.
2. Actual dump compilation now succeeds. The sibling
   `fresh35-retirement-projection-20261104` directory contains the generated
   schema, all1089 disposition decisions, source bindings, regression log and
   SHA256SUMS. Projected SQL SHA256 is
   `0d80a108e9e8c02b2f53b77e5cfe432186f9f5d21fab6642ae643abfa52c4be9`.
   It contains35 tables,152 functions,152 external-trigger declarations,32
   policies and four sequences. Of1089 source sections,776 remain unchanged,
   26 historical routines and251 legacy-table objects are omitted,19 bodies and
   seven FK sections change, and ten obsolete function metadata sections are
   omitted. Independent full metadata/ACL/semantic review and an actual35
   catalogue comparison remain required; output section counts are not engine
   observations.
3. Review and engine-test the new `fresh35-retirement-install.mjs` atomic
   source wrapper. It binds the exact synthetic target name/OID/system identifier,
   PG17 version and ordinary owner, requires an absent application schema and no
   user relations, initializes27 exact source migration descriptions with fresh
   transaction timestamps, and verifies35/152 pins, seven NULL checks and empty
   business tables before COMMIT. The wrapper now requires pinned complete
   predecessor metadata plus explicit fresh identity mapping, and incorporates
   complete source-derived catalogue postconditions. Missing evidence refuses
   rendering instead of producing a body/count-only executable wrapper. It only
   renders SQL, does not connect or create credentials/roles, and does not make a
   populated-target migration possible.
4. Create a distinct152-function catalogue, ACL and trusted-installation-record
   profile, and an explicitly selected standard full-package host path. Do not
   relax the existing profiles to admit both old and new catalogues.
5. In a separately authorized fresh35 synthetic target, verify installation,
   complete standard import, exact replay, failure rollback, ordinary create/edit/
   approve/unapprove and settlements/barcodes, zero versus unknown inventory,
   signed quantities, null dates, preserved provenance and historical-lane
   rejection. Recheck exact final catalogue and all21 legacy tables' absence.

Populated-database retirement remains a separate migration operation requiring
complete data/identity/audit conservation, backup/restore and rollback evidence,
and applicable target-specific confirmation. Fresh35 source composition is not
permission to remove any existing data or a substitute for that evidence.

## Verification

New source/plan/schema regression tests:18/18 passed under Node v24.22.1. They
cover current178 reconstruction, all19 replacements, exact35/152 disposition,
composite/cast/callee refusal, metadata-section parameter names, quoted identifiers,
FK semantics, hidden additional CREATE/INSERT statements, unchanged whole-package
critical routines, unknown dump sections preservation of the final footer, inter-object storage defaults, index USING,
function DEFAULT arguments, named array-argument/COLUMN ACLs and exact
nondeferrable foreign-key semantics.

The earlier atomic-wrapper source tests passed4/4 with a source-model render;
that permissive model-only render has since been removed. The revised tests
require genuine pinned predecessor evidence, check the complete metadata guards
inside one transaction, and reject metadata or source drift. They are source
tests, not PostgreSQL execution.

An earlier expanded49-test run passed48 and failed the pre-existing disposition
snapshot comparison solely on its predecessorSourceSpecSha256. That stale177
snapshot was not changed or rehashed to make the test green. No full typecheck,
build, full repository suite, browser or fresh35 PostgreSQL result is claimed here.

## Fresh identity mapping

The source178 test identities are not reused. `fresh35-retirement-identity.mjs`
explicitly maps only source owner/controller labels to
`fresh35_owner_20261104_r1` and `fresh35_controller_20261104_r1`. The actual mapped
projection is `direct35-schema-fresh-identities.sql` in the sibling projection
directory, SHA256
`ee3ab325dd5b412d5d0efc0b47eecbf97d9c68eae30de8ba5c37c21d3af25d3a`.

Independent review counted795 owner headers,192 ALTER OWNER statements and one
schema-USAGE controller grant. Reverse mapping restores the entire unmapped
projection byte-for-byte. All152 routine bodies,159 retained ACL blocks (apart
from the explicit new identity), privilege kinds and grant options are preserved.
The three protected role labels remain part of the contract, but their objects
and credentials must be created anew only under the new target's authorization.

The mapper rejects identities in function bodies, literals or unknown identifier
positions rather than globally replacing text. Its three tests plus the updated
four earlier wrapper tests passed7/7. Mapping is source preparation, not role
creation or permission to execute the new target. The new complete
metadata/ACL/trigger/constraint/sequence/column/policy guard remains subject to
independent source review and actual engine validation.

The earlier `RETIREMENT-DIRECT35-SOURCE-MANIFEST.json` is retained as a pre-PG
source-model snapshot. The sibling projection manifest and identity-source
binding are the newer actual178-derived source evidence; neither is a trusted
installation record or proof of a new35 database.

## Complete metadata guard and current-source boundary

The source extractor covers351 columns, four sequence parameter sets and32
policy expressions from the exact mapped SQL. Its21 source tests include signed
int8 sequence bounds. Independent review matched all351 columns to the observed
predecessor by name, ordinal, resolved type, typmod, array dimensions, nullability,
generated/identity flags and default presence. ACL statements alone are not used
as an effective ACL model: mapped whole-object/column/function/schema ACLs come
from the separately pinned predecessor observations.

The complete postcondition builder covers152 full function definitions and ACLs,
150 relations,351 column ACLs,326 constraints,111 indexes and570 triggers, plus
the source-declared columns, sequences, policies and70 rowtypes. It recomputes
the178-to35 projection and explicit role mapping internally and refuses a
supplement not branded by the source parser or bound to the exact mapped SQL
SHA256. These are generated read-only assertions, not an execution result or
runtime admission.

During integration, the current workspace's stream-import CLI changed from
`b3f59717d979f499067b1ac7639d641f9750df334b5c6107e17c479bcf0cd4c8` to
`e43218ea85f0584630222cbdfc79f53b7784d9e68804114da78bcd0b40e8e070`.
It is the only changed file among the118 predecessor installation-source pins;
all178 function-body hashes still match. Nevertheless, the complete guard
correctly refuses the current workspace against the old observed source spec.
This failure is preserved, not bypassed by replacing a stored digest.

The independent `fresh35-structure-review-20261104-1812` snapshot copies the
verified old178 closure and explicitly listed fresh35 additions for offline
structure review only. It is not the current complete source tree, does not
include or validate the new CLI, and grants no execution permission. Before a
final installation/import freeze, the new CLI must be explicitly rebound to the
final source manifest and revalidated with the required full-package tests.

The old-baseline structure snapshot passed52/52 focused source tests with no
skips, including the full metadata builder and atomic wrapper. Its
`logs/frozen-source-tests.log` and `guard-source-summary.json` record the exact
scope. The current-workspace source-binding failure is retained alongside that
success; these are different source identities, not interchangeable results.
