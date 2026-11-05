# Pin conflict triage and successor integration plan

## Verified source findings

The earlier 13-file lexical inventory is not 13 active runtime failures. The
new read-only `fresh56-pin-conflict-analysis.mjs` finds exact SHA256-matching body
literals for all177 predecessor routine pins. None of those exact bodies embeds
any of the20 changed predecessor hashes. This is content matching, not a SQL
parser or proof of runtime reachability. In particular, do not globally replace
all old hashes or create unnecessary successor routine bodies.

The source hits in standard initialization, whole-package access and whole
search-path SQL are installation preflight checks in outer DO blocks. They must
continue checking the original predecessors during the original installation
stages. The search-path file is also used as the old source catalogue's body-pin
authority by `loadWholeCatalogSpec`; that ongoing use is the real whole-host
blocker after candidate body changes.

The eleven hashes in `native-import-accounting-capability.ts` belong to the
separate runtime26 issuer. Production runtime27 flows are wired through:

- `createProductionRuntime27ApplicationApi` in production-provider-composition.ts
- `createPostgresRuntime27DocumentApplicationApi` in postgres-read-api.ts
- `createRuntime27CommandIssuer(..., 'WHOLE_V2')` in runtime27-command-issuer.ts

That assembly passes no runtime26 review and therefore does not invoke
`createNativeRuntime26Issuer`. The runtime27 issuer's pinned business-ready
function is not among the20 candidate changes. These three runtime27 flow files
contain none of the20 old hash literals. This does not prove business behavior,
full admission completeness, or engine compatibility. Runtime26 profiles must
remain unchanged and reject incompatible targets.

## Prioritized safe integration, not implemented or authorized installation

1. **Whole-package import host:** introduce a distinct genuine successor source
   spec, exact catalogue query and installation-record format/loader. Bind its
   177 pins (20 new,157 unchanged), exact seven FK-to-NULL-check changes, source
   manifest, physical target identity, roles, ACL, policies, trigger metadata and
   observed reviewed catalogue hash together. Existing `loadWholeCatalogSpec`,
   `verifyWholeInstalledCatalog`, `WHOLE_INSTALLATION_RECORD_V1` and the old host
   must keep rejecting the new target. A plain object or alternate hash accepted
   in the old spec is not sufficient. Host selection must be explicit and must
   not silently fall back to either profile.
2. **Installation order:** retain original preflight hashes while creating the
   original67-input predecessor. Apply publication9, FK7 and rowtype11 only in
   the fresh empty56 state and a single owner-controlled transaction/exclusive
   writer window, with exact before/after conservation. The older balance-only
   candidate must not also run. Do not rerun old access/search-path scripts after
   body replacement or weaken them to accept both shapes. The current generated
   review remains unconditionally blocked, so this order is not executable.
3. **Ordinary runtime27 sales/transfers/product flows:** do not patch runtime26
   hashes. Establish engine evidence for the unchanged business-ready gate,
   runtime27 lease/role/RLS admission, ordinary transactions, publication,
   receipt/audit reciprocity and zero-versus-unknown stock on the new exact
   catalogue. If stronger full-catalogue admission is required, give runtime27
   an explicit reviewed successor observation; do not infer it from source pins.
4. **Physical35 retirement:** remain blocked. Two composite-input signatures,
   typed source-row casts, retained legacy reads and trigger reachability require
   a complete retained/dropped-object and caller plan. Rewriting hash lists does
   not make table removal safe. The current candidate is still56 tables.
5. **Evidence before promotion:** isolated engine install, complete standard
   import, publication/failure rollback, repeat import, ordinary sales/returns/
   transfers/barcodes, exact catalogue+ACL observation and durable installation
   record binding. No source-only token may claim these observations occurred.

## Bounded implementation and tests

Only a new read-only diagnostic and its new test were added. The diagnostic
fails closed if any of177 pinned bodies cannot be found or source bytes differ.
It reports hashes for the inspected runtime assembly sources and leaves all
installation/admission/readiness claims false. No existing code, SQL, catalogue,
pins, issuer, registry, handoff, database or deployment was modified.

`node --test tests/fresh56-pin-conflict-analysis.test.mjs
 tests/fresh56-combined-candidate.test.mjs` passed9/9 (Node v24.22.1).
The three new tests verify full hash-matched body coverage, runtime26/runtime27
source distinction, missing-body refusal and changed-source refusal. These are
source checks, not typecheck, build, full suite, PostgreSQL or browser acceptance.
