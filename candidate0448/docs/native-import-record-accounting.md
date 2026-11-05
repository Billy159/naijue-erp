# Native import record checkpoint accounting V1

**SYNTHETIC ONLY. The local successor integrates accounting into the original cutoff store behind an explicit independent native source authorizer, with no permissive default. A new isolated PG17.11 run applied reviewed migrations 1–15 and passed 9/9 tests including a nonempty signed baseline and FINAL. Six prior failed rounds remain preserved. This is limited synthetic engine evidence, not real-file import readiness or production acceptance; no existing database has been migrated.**

## Why another INSERT is wrong

The native WAREHOUSE and canonical SKU creators already create their immutable `import_record`. The original `IMPORT_CHUNK` tries to INSERT those records again to advance progress. The 0007 source-identity guard intentionally rejects that duplicate. Neither swallowing a uniqueness violation, an upsert, nor counting existing rows into checkpoint counters preserves receipt ownership.

0015 introduces one private typed `import_record_accounting_claim`, uniquely identified by `(import_batch_id, import_record_id)`. A claim binds the exact record's batch/type/target through a composite FK and records the **original** receipt operation, next checkpoint sequence, actual operation time and fixed validator version. Its deferred receipt FK permits the original receipt to be inserted at the original end of the transaction. Claims cannot be updated, deleted or truncated. There is no new receipt action, no change to the original six-key receipt result, and no creation of native data, accounts or zero inventory.

## Main command and original-time representation

The opt-in CHUNK/PUBLISH command adds:

```ts
accountingVersion: "NATIVE_IMPORT_RECORD_ACCOUNTING_V1"
```

Each WAREHOUSE/SKU item also adds:

```ts
nativeRecord: {
  id: "<exact creator-plan import_record UUID>",
  reviewedAt: "2026-10-21T00:00:00.123456Z", // example, not a real approval
  decisionReason: "<exact independently approved creator-plan text>"
}
```

The full **main command** goes into the original `requestHash(command)`. Neither `nativeRecord` nor the version may be passed as an unhashed auxiliary object. The versioned validator rejects array-shaped objects, sparse/nonstandard arrays, array named properties, accessors, symbols and unknown keys: request hashing must not ignore properties that validation uses. Baseline items cannot supply `nativeRecord` to adopt an existing ledger.

`reviewedAt` must be the exact original creator plan's explicitly approved canonical UTC text with six fractional digits and a real calendar date. The authorizer must authenticate that original representation. SQL compares its timestamp meaning with the record; WAREHOUSE additionally compares the **original string** in `native_party_import_evidence.warehouse_record`. SKU V1 source evidence retains a whole creator fingerprint, but not a separately recoverable original review-time string. Therefore SKU review text/reason/ID require the independent original-plan authorizer; SQL readback is not a fresh reauthentication of that private plan. Do not reconstruct a purported original string from PostgreSQL `timestamptz`, silently normalize an old noncanonical plan, or claim to have recomputed its whole creator fingerprint. Such a plan needs separate review before this new capability can consume it.

`authorizeNativeImportAccountingCommand` gives an independent authorizer a clone of the entire exact command. Shape checks, hashes supplied by the caller, SQL existence/counts and returned `passed` flags are never authorization. No public endpoint or permissive authorizer is introduced.

## Transaction-scoped helper, not another store

New files:

- `packages/application/src/native-import-record-accounting.ts`: DTO validation, explicit exact schema15 capability, independent authorization seam and pure new-claim checkpoint calculation.
- `adapters/postgres/src/native-import-record-accounting.ts`: `createNativeImportRecordAccountant(client, transaction)`, followed by `claimMembership`, `claimBaseline`, `claimFinalApproval` and `checkpoint`.
- `adapters/postgres/migrations/0015_native_import_record_accounting.sql`: additive ownership/delta/reciprocal/publication guards.

The accountant never connects, begins, commits, rolls back, releases a client, writes a receipt/audit, updates a checkpoint, posts a ledger, inserts a balance, creates native targets or retries. The existing store must call it **on the original client after original receipt handling and authorization**. The supplied operation ID must be the unchanged stable original actor/key operation ID; the supplied request hash must equal the hash of the full versioned command.

The accountant verifies the complete exact registry prefix 1–15 and locks cutoff → batch → all native WAREHOUSE/SKU IDs in fixed table/ID order → all source identities → all baseline inventory keys in global order. It independently checks that the locked persisted batch still equals the original frozen context. These locks do not replace the original advisory receipt lock, original CAS or original publication/reference locks.

### Existing WAREHOUSE/SKU

`claimMembership` consumes only a command-owned item and its exact existing IMPORTED source/target record. It checks source row hash/file/key, reviewed record metadata, same-batch modern creator evidence and the locked current primary native snapshot. WAREHOUSE requires its original same-batch creation intent and explicit `本次完整核准` source scope. SKU requires its representative source row, modern canonical proof, canonical alias and complete declared alias multiplicity. It does not insert or repair `import_record`. This identity-accounting check is **not** a substitute for the full locked dependency/field reconciliation at PUBLISH.

### New baseline

The original store must newly INSERT the baseline record, nonzero signed `CUTOFF_BASELINE` ledger and fresh sparse balance in this same transaction, all with exact `RETURNING` identities. No adoption/upsert or overwrite of even a previously used zero balance is allowed. It must attach every already authenticated original contributor to that exact ledger using the existing one-time NULL→baseline link guard. Only then may `claimBaseline` verify the actual three INSERT results and read back the exact record/ledger/fresh balance, complete attached contributor count, explicit unit and signed sum. Missing contributors, unknown units or an unlinked/mismatched contribution fail; NULL is not converted to zero.

The helper then uses an ordinary claim `INSERT … RETURNING`. Only one exact newly returned claim can increment a counter/cursor. A uniqueness error or zero/mismatched RETURNING result is a transaction failure, **not** a skipped success. A failed accountant cannot produce later progress. All command items must have new claims before `checkpoint()` returns the new checkpoint. It also checks exact per-item membership record/type/target and per-type multiplicity; merely matching the grand total is insufficient.

### FINAL

After the original PUBLISH manifest/complete-scope and full history readback gates, the original store inserts its exact `FINAL_COMPLETE_SCOPE` record with RETURNING. `claimFinalApproval` consumes that new result and claims it once under the original PUBLISH receipt. An added deferred record trigger forbids committing a new V2 FINAL record without that transaction's publication claim and published batch. This closes 0007's former ability to stage a FINAL record alone. Migration preflight refuses an already existing open V2 FINAL record for separate recovery; it acquires the original cutoff lock **before** checking, so an old writer cannot commit one between the check and DDL installation.

## DB induction and exact bounded deltas

No checkpoint counter is assigned from a SQL aggregate.

1. Under cutoff + locked batch, the **first** claim requires the original sequence/cursor/all-four counts to be exactly zero. A pre-existing nonzero checkpoint without claims cannot bootstrap or be automatically backfilled.
2. Every new claim owns `oldSequence + 1`. A different operation cannot share that batch/sequence.
3. Deferred claim checks bind the original IMPORT receipt/action/actor/time, its audit before/new version and after checkpoint, and its immutable receipt sequence. WAREHOUSE/SKU/ledger use CHUNK; only the one FINAL uses PUBLISH.
4. A new deferred checkpoint guard reads only the indexed current operation's bounded claim set. For each of the original four types, `newCount - oldCount` must equal that operation's new claims of that type. `newCursor - oldCursor` must equal the exact claim total. CHUNK has 1–500; PUBLISH has exactly one FINAL. The original monotonic/bounded counter, sum(cursor), CAS, audit and receipt guards remain active unchanged.
5. Reciprocal new-baseline checks require the ledger's exact own new claim; original 0007 reciprocal record/ledger/balance/receipt rules still apply. A previously committed ledger cannot acquire the new operation ID; an old receipt cannot own a new sequence. A new baseline record cannot have committed earlier without its real ledger because the original source guard already rejects that.
6. At PUBLISH only, whole-batch **observations** require every imported record to have its exact claim and observed claim totals to equal frozen counts/expected. Original full native-scope, ledger/balance and 0011 history/stock guards also run. This is validation, never progress repair.

## Canonical scope and signed conservation

The four progress counters count native WAREHOUSE once, **canonical SKU once**, real nonzero baseline ledger once, and FINAL once. Historical aliases and original stock contributors remain in the separate nine-key history counts. In the parent's independently verified selected artifact, 15,121 old aliases correspond to 14,999 canonical SKUs: do not substitute the alias count for native SKU scope.

The parent reports that this selected v3 stock artifact has 38,303 nonzero effective groups, 397 negative groups and 38,314 original contributors. This helper did not open or reauthenticate those private files. These numbers are context, not values this module freezes or blindly accepts. Individual negative **and zero** contributions are retained; the synthetic zero-row test proves a `[-7, 0]` group retains both original occurrences and totals `-7` without dropping the zero row. It is not real-file or engine evidence.

Full-scope release still requires independent authenticated source selection plus same-transaction full selected warehouse scope and **per-warehouse signed** contributor → effective baseline → ledger/balance conservation, with the relevant warehouse/unit partitions (parent's selected audit: 53 warehouses / 82 unit partitions). Per-key sums or equal grand totals alone do not prove full-scope/per-warehouse conservation. No-contributor warehouse is not automatically known-zero: the actual selected-file coverage and explicit completeScope/absentMeansZero approval must establish that meaning. Never replace an unknown/missing source with zero. The accountant's per-key check does not claim to implement that entire release gate.

### Independent full-scope readback gate (locally integrated; limited synthetic engine PASS)

`reconcileNativeImportStockConservation(client, transaction)` is the original-PUBLISH **read-only** gate wired by the local successor below. Its exact authorized `stockConservation` plan is inside the main PUBLISH command/hash, not a sidecar. It includes:

- fixed conservation version, selected artifact identity, exact effective stock CSV and contributor-lineage CSV SHA256 identities;
- original contribution count and effective group count, matched to the original frozen history/native metadata (these are immutable plan observations, **not new progress counters**);
- exact complete authorized warehouse source-key/native-ID set with explicit signed sums, and the exact warehouse/unit partition set with explicit signed sums;
- independently authenticated, versioned canonical logical-identity manifest hashes for **all** original contributions and all effective groups. The source authenticator constructs the same exported `nativeStockContributorsManifestHash` / `nativeStockEffectiveGroupsManifestHash` observations. These hashes bind complete key sets, exact source row identity/hash/location, signed values, units and native mapping; effective groups also bind the complete retained effective row's typed hash.

On the original locked client the gate checks every native warehouse and its one membership claim, every original stock source occurrence's exact contributor coverage, every signed original row and its modern selected evidence, every complete retained canonical effective row and actual alias/native mapping, then **all** native ledger/balance keys and exact record/ledger/SKU claims. It validates each effective group through the existing typed source/group validator, including input-count/unit/zero-row preservation and the explicit no-zero-net capability boundary. Conflicting repeated effective rows, unknown values, orphan source rows, missing or duplicated zero contributions, changed artifact identities, wrong native keys, extra native effects or non-once claims fail closed. Identity-manifest equality prevents a missing/wrong key being hidden by coincidentally equal counts or sums.

It separately builds source, effective and native totals for **each** authorized warehouse and each exact warehouse/unit partition using BigInt. Every layer must equal the independently approved signed total for that partition. A `-1` change in one warehouse cannot be canceled by `+1` elsewhere. Source/field validation occurs before sums; unknown quantities/units/warehouses never enter an accumulator. Empty accumulators are used only after the complete warehouse set and authenticated original source coverage are established, and the plan must explicitly approve that warehouse's zero sum. Reports mark an authorized empty warehouse with `authorizedEmptyScope: true`; missing unit partitions are never treated as empty zero partitions.

The report includes the observed logical manifest hashes, three-way counts and per-warehouse/unit signed totals, plus `sourcePayloadHashRecomputed: false`. It does not claim to re-download original files, recompute the whole source payload hash, recover original row order, or recompute the creator's original whole-group fingerprint (that original contributor-array order is not separately persisted). Original source/artifact authentication remains mandatory. No checkpoint, inventory, approval, claim, receipt, audit or transaction-completion write is performed by this gate. Its source/protocol tests are not whole-batch verification; the original PUBLISH must explicitly invoke it and real engine/full-selected-artifact acceptance remains outstanding.

General zero-net groups remain unsupported by the existing stock creator and 0011 mandatory-real-baseline guard. Do not drop contributors or invent a zero ledger to bypass it. Parent's verified selected batch has no zero-net groups, so this is an unimplemented generalized capability, **not a claimed actual zero-group blocker for this batch**.

## Compatibility and outstanding integration

- 0001–0011 and the four frozen lifecycle files are unchanged. The local successor makes the schema12–15 syntax corrections recorded below and pins their exact new bytes. The shared finite contract recognizes exact reviewed15/16, and separate opt-in manifests preserve old suites. Native catalogue uses that shared finite contract; native party quotes its reserved SQL identifier without changing JSON fields. The original accounting schema15 exported constant still means1–15; the accountant explicitly accepts reviewed15/16 and refuses17, missing or duplicate versions.
- Non-V2 original SQL remains unchanged; new guards return without imposing claim accounting on those legacy mappings. Original already-published rows are not rewritten or retroactively given fake claims.
- An old exact actor/key/hash receipt must replay its original six-key result **before** requiring new DTO fields, current schema or current native readback. That preserves old receipts and legitimate later maintenance. A fresh different-key attempt to claim an already owned record fails; no no-op adoption occurs.
- Existing V2 with true original zero checkpoint and complete creator evidence may start this capability. Existing V2 nonzero progress without claims is deliberately closed to new work and needs a separately authorized recovery design. There is no migration backfill or aggregate reconstruction.
- Installing 0015 before integration makes fresh old-style V2 CHUNK/PUBLISH fail closed because they lack claims. This is intentional and a **deployment blocker**, not backwards-compatible operation for that old writer. Do not install it into production and then discover this gate.
- The local successor wires versioned native/stockConservation authorization, the original main command hash, accountant calls, RETURNING on actual inserts, all-contributor attachment, `reconcileNativeImportStockConservation`, the original single CAS/audit/receipt and full locked publication readback. No SQL-rewriting pool decorator, fake receipt action, second transaction or replacement metadata store is used. Independent review and real engine validation remain outstanding.
- Unknown-future tests now reject 16. Real schema15 synthetic acceptance covers the selected native creators and record accounting described below; broader source/binding matrices remain incomplete. Old Mac schema11 acceptance artifacts and the immutable handoff are not changed.
- The local schema15 runtime capability additionally checks enabled new claim identity/immutability/no-truncate/ownership, checkpoint delta, baseline, FINAL and publication guards, exact claim ownership/receipt constraints and indexes. This capability query itself still needs real PostgreSQL evaluation; the old guard check remains required too.

## Failure and unknown COMMIT

The original store owns failure handling. Before COMMIT attempt, roll back the entire receipt/data/claim/checkpoint/audit transaction; discard the connection if rollback fails. After any COMMIT attempt/acknowledgment loss: preserve the original error, discard, **do not ROLLBACK, reconnect/retry or resubmit automatically**. The helper has no transaction-completion code and cannot turn an uncertain result into a success.

Resolve uncertainty only by separately authorized independent original actor/key receipt and exact claim/ledger/checkpoint readback. A complete committed result can be replayed using the exact original command; a missing, partial, contradictory or still-uncertain observation is not authority to repost stock. Current authorization remains required even for replay. Never use a disconnected client's local state to infer the outcome.

## Verification and independent engine acceptance plan

```sh
node --test tests/native-import-record-accounting.test.ts \
  tests/native-import-record-accounting-postgres-protocol.test.ts \
  tests/native-import-record-accounting-migration.test.ts \
  tests/native-import-record-accounting-conservation.test.ts
./node_modules/.bin/tsc --noEmit -p tests/native-import-record-accounting-tsconfig.json
```

Focused source/protocol tests cover hashed nativeRecord/time, arrays/accessor hash attacks, authorization clones, canonical versus alias counts, wrong item/type/target/record/owner/sequence, exact prior progress, missing/duplicate claims, zero or mismatched RETURNING, creator drift, real-result baseline requirements, complete signed contributor checks, preserved zero individual contribution and FINAL once. The helper never issues transaction completion, target writes, receipts/audits or CAS. Existing cutoff/native schema/SKU-stock protocol tests remain relevant regressions; none execute SQL.

Real PostgreSQL schema15 (migrations 1–15) acceptance must be a separately authorized isolated Mac run, not a cloud connection or an alteration of the current schema11 exercise. Required evidence:

1. Apply frozen 1–15 bytes and inspect enabled triggers, constraints, FKs, private grants and registry; exercise native creator → membership claims → real signed baseline/contributor links → FINAL in one real protocol.
2. Direct-SQL negative cases: inflated or wrong-type delta with equal grand total; cursor-only change; claim with no audit/receipt/CAS; wrong batch/record/type/target/action/time/sequence/operation; same record under another key; old nonzero/no-claim bootstrap; FINAL alone and migration preflight with old FINAL; omitted or duplicate baseline/record/balance/claim; published/frozen writes. Each must fail at COMMIT with no partial rows or progress.
3. Two-client cases: same original key/hash replays one receipt/result; different keys competing for one record yield exactly one claim; stale sequence fails; failed/rolled-back predecessor leaves no claim; old FINAL writer and migration serialize through the same cutoff lock. Prove no duplicate stock ledger/balance.
4. Fault injection after every real insert/link/claim/CAS/audit/receipt and at deferred guards; inspect rollback atomicity. Induce COMMIT acknowledgment loss separately and resolve with independent readback without automatic posting/retry.
5. Read the entire authenticated scope back: canonical count not aliases, all original signed/zero contributions, every effective group, all selected warehouses and units, per-key and per-warehouse signed conservation, source/field/binding fidelity and no unknown→zero coercion. Current native maintenance drift must block fresh publication, while exact old receipt replay must not rerun publication.

Until those gates and original-store integration pass, this is a reviewed source capability proposal/implementation, **not native import readiness or production acceptance**.

## Local original-store integration — 2026-10-22

`PostgresCutoffImportStore` now supports the existing typed versioned command through optional trusted `nativeAccountingAuthorization`. Its public `CutoffImportCommand`, result, receipt actions and six response keys remain unchanged. Native metadata without the exact version or without a source authorizer fails closed before connecting. Descriptor-only detection applies the existing data-only validator before `structuredClone` in the original service, store and standalone authorizer, preserving refusal of getters/symbols/array metadata without invoking getters just to select the validator. Every exact receipt replay rechecks the current independent authorizer on a complete separate MAIN-command clone; the original actor/key lock and digest remain authoritative.

On that same original transaction/client, native WAREHOUSE/SKU membership consumes existing exact creator records through new claims instead of duplicate INSERT. A new signed baseline INSERTs its exact record/ledger/fresh balance with RETURNING, attaches all original contributions (including individual zero rows) through the existing one-time NULL link, then reads the complete group and claims the actual insert identities. Only returned new claims produce checkpoint deltas; the original CAS/audit/receipt and unknown-COMMIT discard/no-retry behavior remain. Native audit/receipt INSERT must each affect exactly one row.

PUBLISH retains the original manifest/complete-scope and full history capability/readback gates, then invokes full per-warehouse/unit source/effective/native conservation before writing and claiming its new FINAL. Nonzero SALES_HEADER/SALES_LINE/SETTLEMENT publication remains closed. The store protocol's successful FINAL scenario explicitly uses an independently authorized **empty synthetic selected scope**; it does not prove nonempty publication or real-file readiness.

The explicit finite schema15 entry pins the syntax-corrected 0015 SQL SHA `0cadbcc3dbd76a1e3546e6db983adac7d2b129ad76fcb99eba43cfaf0068794a`. A separate opt-in schema15 migration manifest preserves old suites. Legacy V2 CHUNK/PUBLISH on schema15 is refused before source/progress writes. A read-only catalogue capability check requires original inventory guards plus exact history/native/accounting table-trigger-function/event/deferred pairs, claim ownership PK/composite and deferred-receipt FKs, claim lookup indexes and no PUBLIC table grants. The fresh PG run evaluated this actual query successfully and confirmed that disabling the new claim identity trigger in a rolled-back synthetic transaction makes it refuse.

Local evidence is in controller `reports/backend/`. Complete real-source authorization/host composition, broader publication/rollback/concurrency/unknown-COMMIT engine matrices, private data import and restore remain separate unfinished gates. The real v2/v3 files have only been downloaded/hash-verified outside Git; they have not been extracted or imported.

## Fresh PG17.11 successor — limited engine evidence

`tests/integration/native-import-accounting.integration.ts` uses an explicit isolated suite and a non-admin disposable database owner. All fifteen exact SQL hashes are checked before constructing a pool; the unchanged fresh-target helper also checks direct loopback, exact database/role/port, no elevated role capabilities, empty catalogue and exclusivity. It never cleans/reuses a failed target. Each local run used its own newly initialized data directory and distinct port, and was stopped afterward.

Run7 (`127.0.0.1:55471`, synthetic-only database `naijue_erp_test_15a00107`) passed 9/9 including the parent test plus eight scenarios, with zero failures/skips. It exercised actual HALL/WAREHOUSE and immutable replay, six catalogue rows, PRODUCT, one canonical SKU with two aliases, effective SKU barcode, and two original contributions `[-7, 0]`. Both contributions link to exactly one `-7` baseline ledger/balance. A throw after the actual audit INSERT rolled all native stock/claim/progress writes back. Two simultaneous exact-key calls returned the same committed CHUNK result with one ledger and three claims. This did not instrument a specific lock-wait duration. Current source revocation refused replay. Nonempty selected warehouse/unit conservation preceded FINAL, resulting in four total claims and three original IMPORT receipts. Published contributions/claims rejected mutation.

The engine exposed source-only SQL defects, fixed without removing predicates: schema12 CASE grouping and JSON-key subtraction grouping; schema13 reserved `"authorization"` identifier quoting; schema14 JSON-key subtraction grouping; schema15 CASE grouping. Schema1–11 remains byte-identical. The new native catalogue schema check reuses explicit reviewed14/15 prefixes rather than silently accepting arbitrary later versions. Exact current migration hashes are in `tests/integration/migration-manifest.ts`; immutable source checkpoint v1 retains the earlier bytes.

Run1 failed at schema12 syntax; run2 at schema13 reserved identifier; run3 at schema15 syntax; run4 at schema12 JSON expression and the old catalogue-only14 guard; run5 at schema14 JSON expression; run6 at a fixture assertion missing the actual catalogue result field. These FAIL logs are retained under `reports/backend/pg15-run*.tap`, never relabeled. Run7 is the new passing result.

This single-warehouse, single-unit synthetic fixture does not establish the complete multi-warehouse/unit adversarial matrix, two different-key record races with measured blocking, all deferred corruption cases, network COMMIT acknowledgment loss, PhaseA resolver engine acceptance, any private-file source proof, live HTTPS host or production readiness. Nonzero historical sales/settlement publication remains fail closed.

## Additive0016 historical trigger dispatch successor

PhaseA's first real historical header INSERT revealed an original0011 trigger field-planning error: SQL may resolve a `NEW` field even when an earlier `TG_TABLE_NAME` term is false. Approved0016 changes exactly two dispatch boundaries to nested PL/pgSQL table IF blocks; all inner predicates and error messages remain unchanged. It does not rewrite0011 or any1–15 migration, touch data, drop triggers, publish, repair counters or grant privileges. Its preflight requires the exact15 prefix and original function body fingerprint, and CREATE OR REPLACE retains its OID.

The separate `HISTORY_TYPED_SCHEMA16_MIGRATIONS` and native schema contract pin0016 SHA `518fd6edcadb30f130061986c2074e61f2884a184a731269ab60c9f9afbb8620`. STAGE requires native guards on both explicitly reviewed15 and16. Runtime16 also requires the exact fixed function body MD5 `300eb6c65679f408959a717015494f00`; this is bounded catalogue capability evidence and does not defend against a privileged owner rewriting the catalogue.

The fresh schema16 PhaseA suite passed5/5 with original malformed alias/contributor predicates rejected and zero inventory effects. The accountant's16 acceptance and STAGE missing-guard refusal are separately tested at the real store protocol boundary. Full accounting CHUNK/nonempty FINAL on16 is **NOT_RUN**; its schema15 run7 evidence remains attached to the previous fixed point. SETTLEMENT/payment typed, HISTORY reads and all nonzero historical release gates remain unfinished.
