# Imported HISTORY queries and schema19 publication

This is backend source work, not a production import/release. Sealed18 run2 (9 scenarios / 10 TAP tests, no skips, owned PG stopped) is reused unchanged. The new target is a separate fresh synthetic schema19 publication goal. The complete private dataset has not been imported. Exclude all 2,958 PRODUCT-level anomalous barcode rows; historical unknown persons and times stay NULL. Existing frontend required inputs and shared web contracts were not changed by backend.

## Read surface

Four standalone read-only POST endpoints: `/imported-history/sales/query`, `/imported-history/sales/detail/query`, `/imported-history/transfers/query`, `/imported-history/transfers/detail/query`. The controller-owned application factory installs them only with explicit `importedHistoryRead.authorization`; old factory/default/native/LIVE authorization does not enable them. The existing trusted session authenticator owns cookie, Origin and fetch-site verification. No commands, editing capability, listener or source-file loader is added by the plugin.

The independent historical grant binds dataset HISTORY, actor account, kind, operation and exact detail target. ALL requires explicit policy; sales HALL_IDS uses the original source-bound historical hall_id. Transfer HALL_IDS is denied pending a reviewed original-membership policy. No current warehouse-hall or inferred creator branch broadens access.

COUNT, filtered ordered page and detail run in one REPEATABLE READ READ ONLY snapshot with exact schema19 runtime capability. A visible document must belong to IMPORTED, have complete immutable batch/document closure, exact validated counts, completed checkpoint and FINAL claim/receipt/audit evidence. STAGED, VALIDATING and PASSED are hidden. The read path does not invoke the lock-taking offline `assert_history_typed_closure`. It does not read LIVE documents or fall back to synthetic rows. Source keys, hashes, file paths, raw cells and passwords are absent from DTOs.

Page sizes are 20/50/100/200. Detail lines and settlements have separate finite pages. Money and signed quantities remain decimal strings; totals are exact decimal count strings. Local timestamps preserve six microseconds without assigning UTC; instants remain a separate UTC field. A missing creator is UNKNOWN; a known original creator with no native binding is UNRESOLVED, never silently attributed to an administrator. Immutable historical account/method names are retained separately from current payment configuration.

## Publication

The pure `captureHistoryTypedClosurePlan` validates own enumerable data descriptors before cloning, exact hashes/count maps and source/entity/document correspondence. The complete optional plan belongs to the original MAIN command/hash. Whole-source authorization remains mandatory on every attempt, including exact receipt replay. Presence of a plan or a committed manifest is not authorization.

`reconcileHistoryTypedPublication` uses the original locked transaction: exact immutable manifest comparison, bounded complete document readback, independent deep SQL field/coverage/global/per-document digest calculation, then independently observed SQL counts. It returns observed values, never expected-as-actual. The original store then runs full warehouse/unit stock conservation, once-only FINAL record/claim, checkpoint CAS, audit, receipt and COMMIT. History mappers do not post stock. Known pre-COMMIT failures roll back; uncertain COMMIT discards without rollback or automatic retry.

Frozen migrations1–18 and the exact18 STAGE entry are unchanged. The new0019 guard independently recomputes complete closure at the original IMPORTED transition. Exact19 DDL/routine/trigger/FK/ACL recognition is separate; future20, incomplete prefixes and disabled guards refuse. A separate exact19 STAGE entry preserves the old18 meaning. Native creator paths explicitly require full guards on18 or19, rather than skipping19 after registry recognition.

## Evidence boundary

Backend focused types and the 14 new HISTORY/publication protocol tests pass. Protocol doubles verify sequencing, request capture, bounded DTOs, authorization and failure cleanup; they do not establish PostgreSQL SQL correctness. Actual new19 engine results are recorded separately in control/reports/backend. Production publication, complete real import and production deployment remain closed. Real source/reference/native-allocation authorization providers and unresolved original-data decisions remain separate requirements; synthetic providers are not production factories.
