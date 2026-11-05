# Historical barcode closed transaction/auth candidate

Source-only checkpoint, 2026-11-04 UTC. External work is in `historical-attestation-sql-candidate/transaction-auth-closure-20261104` beside this checkout. Its README, before copies, patch, hashes and RED/GREEN logs are the exact evidence. This note does not install or route SQL.

Distinct unwired writer and registrar successors require a read-write READ COMMITTED context and real importer revalidation after phase work, retaining prior pre-write authentication. A distinct finish coordinator accepts the private importer session instead of a role-only check, locks and validates the root receipt/audit against that actor, runs existing closed operation/publication proof calls, and revalidates authentication after those calls. No session token is returned or persisted. All original entry/terminal refusal gates remain and native writer DML is unchanged.

New source suite: RED 7 failures / 4 preservation passes; GREEN 11/11. Combined with predecessor authentication, root-init linkage, preparation and integration suites: 27/27. No PostgreSQL execution/parsing, build/typecheck, real data, production or Mac validation occurred. This is not proof of actual lock/auth behavior, durable provenance, final deferred closure or commit. No full application regression or readiness is claimed.

Next engineering boundary remains the exact host/catalog and complete closed V1/INIT/deferred proof integration, followed only when authorized by isolated engine validation. Existing external candidates, application paths, migrations, grants, triggers, released packages and sales SQL remain unchanged.
