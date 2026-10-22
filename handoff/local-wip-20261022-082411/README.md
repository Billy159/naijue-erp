# Local ERP work-in-progress checkpoint - NOT A RELEASE

This branch saves the latest local working source, including cloud WIP and subsequent local frontend/backend changes. It is not the old base commit alone. No main update, forced push, production migration, real-data import or deployment is authorized by this checkpoint.

## Source and reconstruction

- SOURCE-MANIFEST.json lists every one of the 2,299 original source/test/evidence files with bytes, SHA-256, Git blob identity and mode. All 424 non-ignored new source files are included, as are 110 modified tracked files. The parent is 378c58089352ec9bdb93eec80639c1fb9b3a5124.
- 32 untracked temporary compiled test files (23,408,002 bytes) are excluded and retained on the Mac. node_modules, build/review output, .env, credentials, real business inputs, private XLSX/ZIPs, backups, database clusters and TLS keys are outside this save.
- reference-demo contains the frozen b8bcfe3e source/manifests subset; vendor dependencies/media/build outputs are omitted. Restore dependencies through the lockfile if later needed. The original whole demo remains independently frozen.
- Existing validation metadata retains historical local paths. Map the source repository root to this checkout and the control reports to this handoff folder; do not treat absent private paths as cloud-local files or fabricate authorizations.
- backend/run1 reconstructs all 104 original failed-run source contexts from current source plus the included source-overrides, checked against SOURCE_PINS.json. Historical receipts are immutable evidence, not claims about the repaired SQL.

## Actual unfinished state

- Frontend fixed accepted content was synthetic v13.1; its HTML/build output is intentionally excluded. The copied Chinese prompt is historical for that fixed version, not a promise that this WIP tree passed browser acceptance. The old localhost listener is DOWN, cause unknown.
- Current source adds Breadcrumb/Tag, SavedRecords/Sparse shared Arco Table/Pagination and an explicit synthetic readonly profile. Headless6, fixture9+2, actual Application3 DOM groups are scoped green. Visible Arco toolbar first DOM option lookup still FAILS; the full pointer retry and newer-focus/blur/Tab/Esc counterexample have NOT run. New combined build/browser have NOT run. Business1 plus separate tools1 React roots are explicit.
- Product full-page P08/P09/P12 remain partial; P10 barcode, P11 nine-price and P13 complete warehouse stock read paths remain incomplete. Full 35 page/tab + 65 overlay family visual acceptance has zero full rows passed; component-level passes do not change that denominator.
- Sealed history18 real PG run1 has 7/9 child scenarios PASS but is overall FAIL (TAP including parent: 7 PASS,3 FAIL). Nonzero STAGE hit SQLSTATE55000 due record/alias conflict; wrong-document negative hit23505 before target23514. The target is STOPPED and preserved.
- Repair is identifier-only DDL18 plus exact schema/function pins and a unique-preserving negative fixture. Protocol10/10 and focused types passed; repaired SQL/run2 are NOT RUN. 1-17 DDL is unchanged. Nonzero PUBLISH remains CLOSED, full production composite source providers are missing, and real private header source-only run3 remains SPOOL_LIMIT FAIL at selected320MiB. No private retry or fabricated mapping/approval is permitted.
- Prior DB/media recovery and schema11 PG+HTTPS Node tests are scoped historical evidence. Browser business/TLS acceptance, application disaster recovery, complete real import and formal launch are not passed.

## Continue locally after this save

Cloud migration is deferred by the latest user decision. Original frontend/backend owners remain paused until the controller verifies this GitHub snapshot. Then coordinate the prepared new schema18 run2 target with frontend ACK and the full unchanged resource guard, and resume frontend toolbar diagnosis/combined build/real browser acceptance. Never reuse a failed database or confuse this WIP checkpoint with deployment approval.
