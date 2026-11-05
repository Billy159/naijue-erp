# Synthetic PostgreSQL zero, unknown and rollback acceptance

Status: **written, not executed**. This is an engine test for a separately approved local, disposable, synthetic-only environment. It does not install SQL, create roles, provision databases, access production, or delete test databases. The operator must review the exact source and target, approve two different fresh isolated databases, install the reviewed schema and all whole-package successors including the zero-balance guard, and retain installation and teardown evidence. Loopback checks do not prove physical isolation or exclude forwarding.

Use the checked-in Node 24 toolchain, installed dependencies and the repository's own fixture/compiler files. The entry has no external private fixture module or credential discovery. It reads an explicitly supplied absolute private JSON file. Keep credentials outside version control, command-line arguments, logs and shared evidence. The config is of the form below; replace every placeholder locally, and restrict the file to its owner:

```json
{
  "confirmedSynthetic": true,
  "cases": {
    "zero-unknown-success": {
      "host": "127.0.0.1", "port": 55432, "database": "synthetic_whole_zero_success",
      "writer": {"user": "synthetic_controller", "password": "<private>"},
      "observer": {"user": "synthetic_observer", "password": "<private>"},
      "runtime": {"user": "synthetic_runtime", "password": "<private>"}
    },
    "zero-unknown-rollback": {
      "host": "127.0.0.1", "port": 55432, "database": "synthetic_whole_zero_rollback",
      "writer": {"user": "synthetic_controller", "password": "<private>"},
      "observer": {"user": "synthetic_observer", "password": "<private>"}
    }
  }
}
```

The writer is the separately provisioned non-owner controller authorized to set the initializer and importer roles. The runtime identity is separately provisioned to set the exact ordinary runtime role; it must not share the writer's membership if the controller safety policy forbids it. The observer needs read-only access to the synthetic database's tables, sequences, and server identity for snapshots. All identities, role grants, PostgreSQL version, source pins and clean target isolation require operator review; the harness refuses non-loopback, unsafe names, repeated targets, privileged writer and nonempty business schema, but those checks are not a complete environment safety audit.

```sh
node tests/integration/run-whole-package-zero-pg.mjs --confirmed-synthetic-config /absolute/path/to/private-config.json
```

The success case imports one known 100, one explicitly sourced zero, and an uncovered third warehouse key. It requires a real zero balance with no ledger movement, no balance/ledger for the unknown key, and a real ordinary-27 reader response with exact 100, 0 and unknown plus incomplete totals. In a new read-committed transaction, it calls the new whole-package verifier and checks the real baseline/document batch IDs, source counts, verified coverage, exact quantity and monetary summaries, zero balance/no movement, and omission of the unknown key. It also exercises exact replay and conflict. The rollback case finishes the transaction and rolls it back, comparing all bounded synthetic table and sequence snapshots against the empty starting state. A failure must remain a failure: do not modify the target or disable triggers to make the test pass. This suite does not validate production data, upgrades or the legacy standard-import verify API.
