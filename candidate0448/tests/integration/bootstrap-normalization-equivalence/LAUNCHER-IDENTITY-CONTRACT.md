# Disposable launcher identity: strict draft, no accepted receipts

`launcher-identity-contract.mjs` is a source/model validator only. It creates no
cluster, inspects no process or filesystem metadata, connects to no database,
changes no environment or permissions, and runs no executable. The SQL fixture
remains disabled by unconditional psql/SQL refusals.

## Structural binding

A source contract can be loaded only when the fixture exactly matches its pinned
renderer and retains the unconditional quit. The resulting in-process source
token is not a trusted launcher or observed identity token.

Draft JSON uses closed fields and strict bounded parsing. It binds:

-64-hex run nonce, exact fixture digest and original source-pin digest.
- Absolute model-selected Node/PostgreSQL17 executables and claimed byte hashes.
- Separate launcher/postmaster/backend PIDs, start identities, shared nonroot UID
  and exact parent/child relationship.
- Canonical run-local data and UNIX socket directories, ownership/device/inode,
 0700 mode, no symlink, empty-before-init and no restore-source claims. The short
 root `/tmp/erp-norm-<first16 nonce characters>` keeps UNIX socket paths bounded;
 the full nonce remains in the draft. A real observer must reject reused paths.
- No remote or loopback TCP: connection must name that exact local UNIX socket,
 port, synthetic database and ordinary session user.
- Matching physical system identifier, database OID, postmaster identity/version,
 backend PID and session identity.
- Inventory of exactly postgres, template0, template1 and the selected synthetic
 database, each claiming no user relations/routines, subscriptions, foreign
 servers or extra schemas/extensions. Application schema/event triggers/role
 memberships are forbidden in the test database; state must be IDLE.
- Environment exactly LANG=C, LC_ALL=C, TZ=UTC. No inherited PATH, PG*, NODE_OPTIONS,
 credential, preload or other key is permitted by this draft schema.

These are structural claims, not observations. Even perfectly matching JSON
returns only structurallyValidDraft=true with identityAuthenticated=false,
receiptAccepted=false and executionEnabled=false. The observer section must state
NOT_IMPLEMENTED with null receipt and authenticated=false. A claimed receipt,
approval flag or self-attested observation is rejected.

## Missing trusted implementation

There is intentionally no accepted receipt issuer. Both
`verifyDisposableClusterReceipt` and `launchNormalizationExperiment` always throw
TRUSTED_DISPOSABLE_CLUSTER_OBSERVER_UNIMPLEMENTED before touching arguments.

A future independently reviewed observer/launcher must collect evidence directly
from trusted OS/database channels, not this JSON or arbitrary callbacks. It must
verify executable provenance, PID-reuse-resistant process identity and parentage,
no inherited environment/configuration/FD influence, directory inode/ownership/
symlink/empty-before-init state, fresh initdb lineage and no restored data. It
must bind connection endpoint and postmaster identity to independently observed
cluster system identifier/database OID, including clean inventory across every
database and no preexisting external users or data. Evidence must remain valid
through execution and cleanup: reject races, stale/nonced or replayed receipts,
process/data/socket replacement, forged backend identity and lost observation.
A trusted transport/issuer, lifecycle binding and cleanup attestation are still
unimplemented, so no receipt or source token grants execution.

The fixed paths, ordinary role name and inventory are a reviewable Linux draft,
not verified availability or a portable production configuration. A real design
must resolve system metadata visibility without expanding privileges implicitly.
Do not weaken refusals or use operator assertion as a substitute.

## Source tests

Five contract tests cover structural-only success, all identity joins, remote/
populated/reused-directory/environment rejection, forged receipts/extra or missing
fields/duplicate JSON and unconditional no-argument-inspection live refusal.
Together with fixture source checks,12/12 passed on Node v24.22.1. No OS metadata
or PostgreSQL observation, cluster creation or SQL execution was performed.
