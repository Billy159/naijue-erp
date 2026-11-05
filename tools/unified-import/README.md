# Unified ordinary-document standard package and controlled execution

One `UNIFIED_STANDARD_PACKAGE_V1` receiver and ordinary business model. This tool
never reads raw spreadsheets, invokes old history staging, installs SQL, changes
schema or accepts caller SQL. Use the repository's Node **24.21.0**.

## Source implementation versus observed acceptance

Offline validation and plan compilation are implemented. Finite initialization,
master/key/document/publication, original-key status and guarded resume handlers
are implemented against **`STANDARD_IMPORT_SQL_V1`**, but this author's tests use
controlled synthetic transports, **not a PostgreSQL acceptance result**. Actual
SQL42/profile/ACL, business lifecycle and CLI positives require the parent's
isolated engine evidence. Missing APIs, target pins, role/auth or private inputs
fail closed; there is no success fallback or arbitrary force flag.

The only connector scope currently accepted is **ISOLATED_SET_ROLE_PROOF** on the
already approved target `127.0.0.1:57403`, database
`opt03_synthetic_profile_20261102_v1`, system ID `7703451823620812828`, PG `170011`.
`6618` is an unrelated tool session identifier and is explicitly rejected as a
port. Exact approved initializer/importer NOLOGIN roles are selected with finite
SET ROLE statements. This proves neither a nonowner LOGIN connection nor denial
of escalation by the parent owner session. **Production CLI scope is rejected; REAL package execution is rejected in this
synthetic-only test scope.**
No connection or PostgreSQL execution was performed by this implementation worker.

## Offline commands

```sh
node tools/unified-import/cli.mjs version
node tools/unified-import/cli.mjs capability-report
node tools/unified-import/cli.mjs contract-schema
node tools/unified-import/cli.mjs validate --package /standard-package --offline \
  --manifest-sha256 FROZEN_MANIFEST_SHA256 --report /new-outside-report
node tools/unified-import/cli.mjs plan --package /standard-package --offline \
  --manifest-sha256 FROZEN_MANIFEST_SHA256 \
  --registration docs/rapid-launch-20261022/NEW-TPLUS-BATCH-REGISTRATION-20261102.json \
  --target-proof /reviewed-actual-SQL42-target-proof.json --report /new-plan-report
```

`plan --offline` without a target proof emits an explicitly **unbound** plan that
cannot execute. Real packages require registered source metadata and exact
header batch identity/cutoff. The recorded real registration is metadata, not
independent verification of the actual files or execution authorization. The
baseline ID is `stableImportId('standard-initial-baseline-v1',namespace,metadataSha)`;
the document batch ID is the package's preserved registered batch ID. REAL metadata
is pinned to the selected repository registration for namespace
`naijue:tplus:20261102`, batch `11b111ed-f128-09a0-b6cd-f153ef926fa5`, cutoff
`2026-11-02T04:00:00Z`; this is identity evidence, not file verification or permission. Neither is
derived from the final manifest containing generated IDs. Plan SHA is a client
identity, **not** a PostgreSQL JSONB hash or a source-truth certificate.

## Controlled execution interface

All commands require `--connection-file` and `--target-proof`. Every non-inspector
command additionally requires the same `--package`, `--manifest-sha256`, optional
`--registration`, and explicit `--allow-synthetic` for synthetic bytes.

- `inspect-target`: actual finite server inspection and protected role facts.
- `initialize --initialization-file PRIVATE_FILE --report JOURNAL`: separate fresh
  initializer capability. Private file is exactly `{admin,encoded_scrypt}`; admin
  is `{staff_id,account_id,login_name,staff_name}`. The current Node scrypt codec's
  encoded value is passed **only as the SQL function's private second argument**.
  It never enters package, plan, audit request, journal, receipt or stdout.
- `resume-initialize` takes the same initializer inputs/journal. It first resolves
  the original public request under the server lock barrier, then replays that
  same key/private parameter so even a COMMITTED original must pass the server
  private-fingerprint comparison. Existing identical requests/receipts are reused
  without overwriting; missing receipt acknowledgement can be recovered.
- `apply --session-file PRIVATE_FILE --current-admin-file PRIVATE_FILE --report JOURNAL`:
  actual finite requests, one atomic transaction per acknowledged chunk. No schema
  DDL or arbitrary table DML. This does not silently initialize an existing target.
- `status --session-file PRIVATE_FILE --request ORIGINAL_REQUEST_FILE`: original
  immutable request readback; no new key and no replay. Initializer status may use
  its protected role with no session; that cannot establish secret equivalence.
- `resume --session-file PRIVATE_FILE --current-admin-file PRIVATE_FILE --report JOURNAL`:
  use a **new connection after UNKNOWN quarantine**. SQL status takes the same
  cutoff and actor/request locks as the writer before a fresh READ COMMITTED read.
  COMMITTED is read back without another business call; acknowledged ABSENT allows
  only the exact original request/key, rechecked by the writer under the same lock.
- `receipt-check --session-file PRIVATE_FILE --current-admin-file PRIVATE_FILE`:
  explicitly limited immutable original-request/receipt closure, **not current
  native data, balances, reconciliation or cutover verification**.
- `verify --session-file PRIVATE_FILE --current-admin-file PRIVATE_FILE` invokes
  the finite `standard_import_verify` API with the original final document-publish
  request. The server must fence affected documents/stock keys, reconcile all 27
  source-count categories, replay immutable migration/runtime audits to actual
  current ordinary rows, and check actual ledger sums/balances/versions and explicit
  key proofs. Legitimate later edits are `VERIFIED_CHANGED_AFTER_IMPORT`, not
  overwritten. Unknown/malformed/missing API results fail closed; no receipt-only
  fallback. Source support is implemented, **actual engine acceptance is pending**.

Private JSON input files must be regular non-symlink owner-private files (mode
0600 or stricter). Session file is exactly `{session_token: OPAQUE_43_CHAR_VALUE}`.
Connection file has exactly these keys (values below are descriptions, not usable
credentials): `format_version=STANDARD_IMPORT_CONNECTION_V1`,
`scope=ISOLATED_SET_ROLE_PROOF`, `host=127.0.0.1`, `port=57403`, the exact database,
explicit `user`, explicit `password` (empty allowed for the approved local auth),
and `role=erp_unified27_initializer_2393dbc6db9581c2` or
`erp_unified27_importer_2393dbc6db9581c2`. No connection strings, ambient `PG*`,
`DATABASE_URL`, pgpass, HBA changes or security-seed fallback. Target proof has
exact `{protocol,system_identifier,database_oid,database_name,catalog_sha256}`;
obtain the actual reviewed **SQL42** catalog/ACL fingerprint, not a source27 count.
The server independently resolves a live current ADMIN from the opaque session;
caller JSON never chooses a historical actor. Keep server parameter logging and
private credential handoff under the main controller's security policy. The adapter
requires a dedicated idle connection: do not wrap its calls in an outer BEGIN or
SAVEPOINT. Each finite call owns its top-level transaction.

Each request is journaled **before sending**, each receipt only **after COMMIT
acknowledgement**. Files are exclusively created; resume may only reuse identical
bytes, never overwrite conflicting evidence. Request presence is not commit proof.
Opaque active private values are also rejected if hidden in ordinary business
fields, before any SQL or journal write. Idle pg socket errors are consumed without
logging private driver text, then fence and discard the connection once. ABSENT
status preserves null hash/checkpoints/receipt, never invented hash/zero.
Statement failure rolls back; failed/unknown COMMIT or rollback quarantines the
connection and emits only safe outcome/operation/SQLSTATE metadata. Earlier
acknowledged chunks remain committed if a later chunk fails. There is no automatic
whole-import rollback or replay after UNKNOWN. `rollback-plan`, `rehearse`,
`prepare`, `dry-run`, `import` and `reconcile` remain NOT_IMPLEMENTED, exit 3.

READY package consistency is not target execution eligibility. The plan reports
shared `PackageIssue`-shaped admission blockers for already-deleted catalog insert
facts and an enabled hall linked to a disabled default customer, mirroring retained
DB guards without clearing original source values or changing the package schema.
Unsupported cases fail before a connection, not after partial source rewrites.

The first fresh program retains all **26 master occurrences across 20 files**,
all explicit stock keys (zero gets proof, no zero ledger), both ordinary document
aggregates and **all 16 settlements**. Existing native attachment requires exact
`EXISTING_VERIFIED` facts; changed existing rows are never overwritten. Composite
relation proof IDs are explicit technical IDs, not invented physical identities or
extra registry rows. Baseline sealing does not activate runtime stock; final
ordinary-document publication activates it. Conversion itself emits zero stock
changes. Asset bytes are checked in the retained package; target asset-byte
publication and independent original-source truth certification are not implemented
by the database reconciler and are not claimed by its verified result. Masters currently fit one bounded atomic chunk (max 500 occurrences);
larger dependency-aware master partitioning fails closed rather than splitting a
hall/warehouse dependency cycle. Key chunks are bounded at 100; a document aggregate
is indivisible (max 500 rows), never truncated. Existing-baseline adoption remains
separate and is never inferred from an old source label.

Exit codes: 0 successful bounded operation; 1 closed validation/execution failure;
2 invalid offline arguments/report output; 3 unavailable command. Successful offline
validation is neither source truth, DB import completion nor cutover readiness.

## One authoritative schema

`packages/application/src/unified-import-contract.ts` exports `TABLE_SCHEMAS`,
`WORK_PACKAGES`, the shared version and the typed SHA256 declaration pin.
`contract-schema` prints these exact runtime-frozen declarations; do not maintain a
second copied field specification. `schema_contract` pins baseline commit, the
existing `requestHash` typed SHA256 of version/work-package/field declarations, and
contract version. This digest is not a claim that uncommitted source has a Git ID.

The manifest is a closed object containing:

- `format_version`, `stage` (`CLEANED` or `READY`), `package_kind` (`REAL` or `SYNTHETIC`),
  `source_namespace`, `schema_contract`, `enum_mapping_version`, `decimal_scale=2`,
  `quantity_unit=PIECE`, `snapshot_mode=CURRENT_EFFECTIVE`;
- `identity_registry` (`relative_path`, `bytes`, `sha256`, `row_count`);
- `files`: one pin per supported ordinary target, including empty files; each pin
  additionally has `table` and the fixed `work_package`;
- `work_packages`: exactly packages 1–13 in order, each with its own version;
- `source_files`: original-source **inventory metadata**, not raw source bytes;
- `reports`: pinned `DECISIONS`, `EXCEPTIONS`, `RECONCILIATION` reports; optional
  `CUTOFF_ALIGNMENT`; each has role, encoding (`JSON` or `JSONL`) and complete file pin;
- `assets`: original `file_ref`, package-relative path, bytes, SHA256 and MIME for
  any retained product image. Image byte sizes and file signatures are checked;
- `inventory_source` and `document_cutoff_alignment`, as demonstrated by the
  deterministic synthetic fixture. Real source kind is `NEW_AFTERNOON_SNAPSHOT`;
  synthetic fixtures use `SYNTHETIC_NEW_SNAPSHOT`, never an actual-file claim.

The source inventory binds raw source identities that are independently verified
and privately retained by the authorized local cleaner. The receiver does not open
raw sources or certify that declared original export/cutoff facts are true. Missing
real afternoon-file/cutoff/alignment evidence remains a cutover blocker. Inventory
coverage is **EXPLICIT_KEYS**: absent keys remain unknown, not implicit zero.

Each ordinary row is exactly `{source_key,fields,source_refs}`; each source reference
is exactly `{file_sha256,sheet,row}`. The source digest must be in `source_files`.
All S fields must appear, using explicit null only where the shared schema permits.
CLEANED excludes generated fields; READY includes the declared generated fields
and never accepts database-generated columns such as `current_line_no`.
Money and bigint quantities are exact strings; int32 fields are JSON integers.
READY money has two decimal places. No rounding, source-fact rewriting or fabricated
actors/timestamps/accounts occur. Null pricing/gift/discount/snapshot facts remain
null, not 0/false/today. RETURN and EXCHANGE accept any nonzero signed quantity;
SALE requires positive quantity. All settlements, including refunds/zero rows and
16+ rows, retain their own identities and positions. Header/line economics and
approved settlement totals are checked without silently making them balance.

The fixed numbering is: 1 decisions, 2 original-file inventory, 3 products,
4 SKU/dimensions/barcodes, 5 halls/warehouses, 6 staff,
7 customers/suppliers/payments, 8 transfer headers, 9 transfer lines,
10 sales headers, 11 sales lines, 12 all settlements, 13 new inventory snapshot.

## Identity, decisions and reports

Registry rows carry entity type, namespace, canonical source key, target ID, aliases,
identity basis, and source references. Preserve verified existing target IDs. New
IDs reuse existing `stableImportId("entity", namespace, TYPE, canonicalKey)`;
this is the repository's typed SHA256 encoding, **not UUIDv5**. Names, file names,
row order and this batch do not allocate identities. Aliases cannot duplicate or
rebind target rows. Composite relations do not gain fake single-column IDs.
The six retained barcode configurations preserve all existing IDs/descriptions.
Size code is not globally deduplicated; product size-group membership is checked.

Decisions use `{format_version,package_kind,source_namespace,rules}`. Each rule is
`{code,scope,evidence_sha256}`. Required approved decisions are `NO_MAIN_UNIT`,
`DEFAULT_FIT_A`, `PRESERVE_EXISTING_SIZE_MAPPING`. Their original evidence must be
pinned. Default A applies **only** to the already-approved missing-fit scope;
it never replaces a known fit or resolves a new alias conflict. This validator
checks frozen package facts and does not perform local real-data cleaning/defaulting.

Reconciliation uses `{format_version,package_kind,source_namespace,tables}`. Every
table has `{source_rows,retained_rows,rejected_rows}`; source equals retained plus
rejected, retained equals the actual hashed file row count, and rejected rows block
complete-package acceptance. No 3-row settlement truncation is permitted.

Exception JSONL uses the already-shared closed fields:
`entity_type,source_key,field,code,observed_value,expected_rule,source_refs,severity,proposed_action`.
`INFO_PRESERVED_UNKNOWN` is preserved without inventing facts. `BLOCK_REFERENCE`,
`BLOCK_SCHEMA`, `BLOCK_POSTING`, `BLOCK_CUTOVER` remain visible blockers.
Credential keys/values are prohibited in all standard data and reports and are not
echoed. Authentication accounts require an independent authorized security flow;
passwords, password hashes, tokens, sessions and connection strings are not inputs.

## Synthetic validation

`tests/fixtures/unified-import/synthetic-package.ts` deterministically builds a
complete synthetic example and a byte-pinned 1-pixel image asset. It contains no
user business data, no actual newly received file and no real authorization.
Generate it only into a scratch destination:

```sh
node --input-type=module -e \
 'import {writeSyntheticPackage} from "./tests/fixtures/unified-import/synthetic-package.ts"; await writeSyntheticPackage("/tmp/erp-unified-synthetic-example")'
node tools/unified-import/cli.mjs validate --package /tmp/erp-unified-synthetic-example \
  --offline --allow-synthetic --report /tmp/erp-unified-synthetic-report
node --test tests/unified-import-package.test.ts
```

`--allow-synthetic` is mandatory and never makes the fixture import eligible.
The package reader rejects symlinks, traversal, undeclared files, duplicate JSON
keys, BOM/CRLF/invalid UTF8 and malformed Unicode. Bounds: manifest 2 MiB,
individual standard files 64 MiB, images 8 MiB, total bytes 256 MiB; directory scan
4096 entries/depth 16; JSON structural depth 64. Oversize packages fail closed
rather than silently dropping rows; streaming/partitioning requires a later
explicit contract update.

## Versioned change log

V1 is the first offline implementation against aa10 source plus the approved
ordinary-table unified plan: unified field/precision/identity contract, standard
reports/assets, package integrity and semantic preflight, synthetic fixtures, and
explicitly unimplemented database commands. It does not alter historical 417/200
oracle identities or introduce new history business tables. Full formal workflows,
schema rollout and isolated PostgreSQL integration remain separate pending work.

## Reviewed source44 continuity for an already initialized plan

A code-only alias successor changes the actual catalog fingerprint. **Never**
rewrite/re-hash the committed original plan, regenerate its INIT or operation keys,
pretend inspection returns the old catalog, or use a new empty DB to skip recovery.

For the one explicitly reviewed source44 transition, `resume`, `status`,
`verify` and `receipt-check` accept `--reviewed-successor PRIVATE_CONTROL_FILE`.
`--target-proof` STILL means the original source43/357 plan identity. The separate
control file carries actual current target identity, the original plan/manifest
hashes, original INIT/failed-request fingerprints and preserved absence evidence,
plus the exact three predecessor definitions/code metadata. It is technical
execution admission, not a second ordinary-package schema. Initialization commands
do not accept this option; `apply` with this option explicitly rejects with
SUCCESSOR_RESUME_REQUIRED so committed work is always read back/skipped, not resent.

The only accepted source is the byte-pinned
`0027_standard_import_category_alias_successor.sql` (886e63d9...). Its reviewed
routine set is exactly `assert_standard_import_operation(uuid)`,
`validate_baseline_source_commit()` and
`assert_document_conversion_batch(import_batch,jsonb,text,boolean)`. Each exact
old/new body, old definition and non-body catalog attribute hash is frozen in code.
No caller `reviewed:true`, extra routine or arbitrary source hash can authorize it.

The finite public-catalog SELECT runs in READ COMMITTED with the SAME fixed local
search_path as the existing inspector. It checks the actual current catalog, and
also computes a counterfactual predecessor catalog by substituting ONLY the three
captured old definitions as inert JSON text. The counterfactual must equal the
original357 fingerprint; all observed new bodies/OIDs and unchanged non-prosrc
attributes must match the reviewed pins. Other routine/owner/ACL/RLS/constraint/
policy changes fail closed. No captured text is ever executed; no DDL/grant is
performed by this importer. `inspectTarget()` continues returning the actual NEW
catalog, and subsequent operations require exact equality to that admitted catalog.

The failed request must equal the canonical FIRST MASTER request of the original
program, not any caller-selected compiled phase. Before any write, original-key status locks must confirm the unchanged committed
INIT request/hash/checkpoint and inspect the original failed step. An exact original
COMMITTED step is read back/skipped (including later UNKNOWN recovery); ABSENT keeps
its null evidence and allows only the same original request/key. A new private
report directory can retain new acknowledgements while all original failed evidence
remains immutable. Use the parent-only metadata builder and reviewed installation
receipt; never copy the new catalog into the original plan proof.

### 已提交前缀后的 source45 同计划恢复（有界技术证明）

`STANDARD45_FRESH_SETTLEMENT_IDENTITY_FIX` 仅为经过审查的 source43→45 四例程集合：原 source44 三个别名修复保持不变，另加新标准导入同事务且完整受保护行意图的结算身份修复。原 source43 target proof、计划摘要、初始化及请求键不改写；原 source44 proof 保留。当前目录必须精确匹配新证明，替换且仅替换四个旧函数定义后的反事实目录必须精确等于原 source43 目录。函数 OID、全部非函数体属性、owner/ACL/search_path 等不变；CLI 同时核对 source44 和 source45 的固定源文件摘要。

该45证明必须额外携带按原顺序的四项 `committed_prefix`（MASTER、KEYS、BASELINE_SEAL、DOCUMENT_STAGE），每项绑定原请求摘要及**完整八字段原回执**摘要。执行前通过原键状态锁依次核对 INIT、全部已提交前缀、原首个 SALES DOCUMENT 请求，再重查真实目录；任一步缺失、未提交或回执变化均拒绝。只允许显式 `resume`，已提交操作仅回读不重发，失败文档仍使用原键。不提供任意函数列表、任意阶段屏障、force 参数、新 INIT 或重建空库捷径。

这不是45实际运行成功声明，也不是生产 LOGIN 能力。仍仅限已授权隔离合成目标；REAL 执行/回读拒绝。

### 六步已提交后的 source46 最终发布恢复

`STANDARD46_PUBLISH_VERIFY_DISAMBIGUATION` 仅扩展为**明确六个**审查例程：保留44三例程和45身份修复，再加入 `standard_import_command(jsonb,text,text)` 的发布列名消歧，以及 `standard_import_verify(jsonb,text)` 的局部状态变量消歧。不是任意列表；五函数或未知函数集合均拒绝。CLI 同时核对44、45、46源文件摘要；旧44/45 descriptor、证明及原43计划仍保留。

该证明须核对 INIT 和原六步（前四步＋SALES/TRANSFER完整聚合）的原请求及完整回执；失败屏障仅为原程序 index6 的最终 DOCUMENTS publish。所有已提交步只回读，最终发布仍使用原键；若原最终发布后来已提交，亦只回读不重发。真实新目录必须精确匹配新证明，六旧函数定义的反事实目录仍必须精确回到原43目录357，其余属性不变。不以这些源/模拟传输测试冒充实际发布、全量原生对账或生产LOGIN验收。

### 发布后的 source47 仅核验证明

`STANDARD47_POST_PUBLICATION_VERIFY_ONLY` 使用独立闭合格式 `STANDARD_IMPORT_POST_PUBLICATION_SUCCESSOR_V1`：原43计划及44–46证明不改，固定七个审查函数（46六函数＋仅对无 HISTORY_REVISION 的语句集提前返回的历史分派器）。真实当前目录须精确匹配新证明；仅替换七旧定义的反事实目录仍须精确为原357，OID及全部非函数体属性不变。

此证明不携带“失败/缺失后重试”含义。INIT完整原回执及全部七步请求、完整八字段原回执必须逐一通过原键状态锁核对，最终发布也必须精确COMMITTED；ABSENT一律拒绝。CLI仅允许 `verify`、`receipt-check`、`status`；共享execute/resume API也在任何客户端调用前拒绝这个只读admission。不得用它初始化、apply、resume、重发导入或覆盖后续合法业务变更。全量native verify仍通过既有有限API验证普通业务审计重放/当前库存，不要求已导入单据永远停在原版本。

仅适用于当前隔离合成 SET ROLE 证明。46在其早先目录的实际导入/verify/54表重复一致证据仍保留；47当前核验和普通生命周期结果须另以实际记录证明，不推断生产、可移植安装器或独立LOGIN能力。

## V2：离线计划／程序编译（已提交阶段；后续客户端接线见下节）

清洗数据格式仍为唯一的 `UNIFIED_STANDARD_PACKAGE_V1`。新执行计划为 `UNIFIED_STANDARD_EXECUTION_PLAN_V2`，显式调用：

```sh
node tools/unified-import/cli.mjs plan --offline --execution-plan-version V2 \
  --package <standard-v1-directory> --manifest-sha256 <externally-pinned-sha256> \
  --current-admin-file <owner-0600-public-initialization-identity.json> \
  --report <new-directory-outside-package> --allow-synthetic
```

`--allow-synthetic` 仅用于明确合成包；真实包仍必须符合已选择注册身份/截止时间，且真实数据只在用户本地主控读取。可选 `--target-proof` 仍为技术元数据：未绑定目标的离线草案会标明 `target_bound:false`，以后绑定目标须重新生成新的计划，不能假装沿用旧请求键。不要向离线命令提供密码、凭据哈希、session或连接配置。

四字段初始化身份恰为 `{staff_id,account_id,login_name,staff_name}`，是非秘密技术控制，不是包内历史人员证明。它与执行模式、编译器版本、分块上限、源事实及分块布局一起绑定新V2摘要。源STAFF目标ID与技术初始化STAFF冲突会拒绝；任何非NULL历史 `user_account` 引用仍拒绝，不会别名为新管理员或清空原值。

报告独占写入 `execution-plan.json`、`execution-program.json`、`master-chunk-plan.json`，不修改包、不覆盖旧报告。新编译器确实消费已审查的V2依赖调度器：保留原生/源记录ID，合法hall/default-warehouse对同块，所有MASTER块后才编译100键块、BASELINE seal、DOCUMENT_STAGE、完整单据聚合及最终publish。每MASTER请求不超过500，单据聚合仍不超过500，保留所有结算；总cursor/sequence经过int32精确界限检查。

无环身份：先从原源计划求仅含source_record_id的布局，不使用那次临时操作ID；把布局及新控制信息纳入最终V2计划hash，再以最终hash重跑同一个调度器并核对布局完全一致，生成真正V2 chunk keys。最终chunk/program摘要是可重算衍生产物，不反过来喂入自身计划hash。共享机械materializer仍负责同一行封套、库存键、普通单据及发布请求；没有第二套业务映射。

**离线命令输出仍为 `OFFLINE_V2_NOT_DATABASE`，不是可执行大包授权。** 原离线阶段的数据库分支为 `V2_EXECUTION_NOT_IMPLEMENTED`；下节新增有条件SQL49客户端取代这一分支，但未安装49的V1服务器总MASTER及每表上限仍为500，也不会接受新INIT闭合 `execution_contract`。不得手工绕过、安装SQL、改角色或把纯编译成功说成导入成功。没有V2 PG、本地REAL、可移植安装、媒体发布或生产验收声明。包的64MiB单文件/256MiB合计限制不变，10k合成编译不是无限流式规模承诺。

不指定版本的V1入口/default、原V1计划及请求键保持不变，44–47原恢复/只读证明仍走旧V1编译器，不自动升级为V2。

## 新阶段：有条件的 SQL49 V2 执行客户端（代码已接线，未做PG验收）

`--execution-plan-version V2` 的 initialize/resume-initialize/apply/resume/status/receipt-check/verify 现有实际有限API处理分支，不再统一NOT_IMPLEMENTED；但必须额外提供 `--source49-target-proof <owner-0600-proof.json>` 和原私有connection/auth输入。缺少证明即 `SOURCE49_TARGET_PROFILE_UNVERIFIED`，没有强制/已安装布尔开关。

49证明是独立闭合 `STANDARD_IMPORT_SOURCE49_TARGET_PROOF_V1`：绑定固定48个源文件（完整base47+49，排除未批准48ACL）、49command新体7874ce…、原47command451708…旧定义、全部非正文属性/OID不变；实际有限目录观察必须得到当前49目录与反事实原47目录28c9…精确匹配。旧47证明/目录门不放宽、不改名冒充49。此阶段仍限定原已知base47物理cohort/现有受控连接；新的birth、端口、可移植base47安装器/注册是独立未完成gate。目前49未安装、没有合法新目标证明，不能称有实际大包数据库支持。

V2执行admission是绑定客户端/计划/角色的opaque内存对象：IMPORT须由真实当前session读回原INIT COMMITTED，INITIALIZE是独立受保护角色和私有scrypt参数；源包不含密码/session/actor授权。每一步仍核对真实当前目录/role、原canonical请求及精确原sequence/cursor。UNKNOWN由原finiteclient隔离连接，停止后续调用；新客户端通过原键状态锁恢复，导入步骤COMMITTED只回读不重发，ABSENT仅复用同请求/键。初始化延续V1例外：受保护initializer即使读回COMMITTED，仍以同原请求及私有参数调用initialize，让服务器比较私有凭据指纹；公共status不能证明凭据相等。所有canonical请求在INIT前检查现有8MiB wire上限。

普通源字段/调度/请求键由已冻结V2编译器产生，没有第二业务模型；native verify复用V1的同一纯source/key/document coverage检查，并调用真实有限native/audit/stock verifier，不以receipt-only替代。合法后续普通业务版本可验证，不重导覆盖。request先独占写journal，COMMIT ACK后写完整8字段receipt；ACK后journal失败明确报告已ACK但日志未完整，不假报全流程成功。

源码处理分支存在不等于SQL49已安装或engine已验证；SET ROLE不等于独立LOGIN，更不等于生产授权。source48ACL/HBA/角色变更、portable installer、REAL、媒体发布和部署均未由这些分支完成。提取共享purecoverage helper会改变application源码hash；旧AUTH04/其他源码pin必须另行显式复核，不可自动更新或复用。

49门还要求**受控实时查询**得到原base47补充目录SHA `338dbf9ca3f427fce5fbeaeb7ab0beae9a397e026925257ff403a34fc6a7c710`（全部trigger定义/启用/延迟状态、column ACL、FORCE RLS、policy mode）；不是只数227个trigger，也不是让调用者报hash。原inspector/counter不含这些字段，可能看不见48ACL/trigger，故仅旧catalog相同不足以接纳。补充门在admission和每个操作的current边界都重查，隐藏变更不得复用先前opaque能力；旧47观察器仍保持原样。

V2 CLI将canonical计划的精确operation/sequence/cursor绑定传入finite adapter，在实际COMMIT前验证写回复；不匹配先ROLLBACK。若自定义trusted client已经返回ACK后才发现异常，明确报告 `COMMITTED_ACKNOWLEDGED_REPLY_INVALID` 及原operation，不伪称回滚、不自动重试。V1未提供该私有绑定时保持原解码与请求路径。

### Numeric FIT declaration successor (source-only)

The unqualified `contract-schema` command still exports the original V1 declaration and hash. `contract-schema --profile numeric-fit-v1` explicitly exports a second declaration hash accepting the six confirmed numeric FIT codes alongside retained uppercase legacy source codes. The original baseline commit identifies the underlying schema baseline, not a claim that this additive declaration existed in that commit. Old receivers must not be assumed to recognize the successor hash. Profile validation is offline only; PostgreSQL successor installation, target catalog admission, and end-to-end import are not yet validated. The previously frozen atomic-package candidate is pinned to a prior source scope and must not be used as proof for this successor.

## Large-file streaming preflight (offline, no business writes)

For large ordinary-document JSONL packages (including 273,948 transfer lines):

```sh
node --max-old-space-size=128 tools/unified-import/cli.mjs stream-preflight \
  --package /standard-package --manifest-sha256 FROZEN_MANIFEST_SHA256 \
  --report /new-private-report-directory
```

This uses the existing standard table declarations and exact field predicate.
Input files are read in 64 KiB chunks with a 1 MiB row cap; identities, references,
row uniqueness and document positions are held in a private on-disk SQLite index
(Node's built-in SQLite), not unbounded JavaScript Maps. The cache is 4 MiB;
there are hard limits of 8 GiB input, 5 million records and 100,000 errors.
Reserve additional disk space for the scratch index: it can be larger than the
input (the measured 504 MB workload initially produced a 1.087 GB index).
Reports and index contain
private source identities and must not be shared as public logs. Each issue names
standard file, one-based JSONL line and field, without echoing source values.
A report directory must be new and outside the package tree (resolved parent paths
are checked, including symlink parents); interrupted runs remain incomplete and are never
resumed or overwritten. This command never connects to PostgreSQL.

`complete_package_validation: true` means the full **offline standard-package**
check ran: manifest/profile/value declarations, source references and registry ID
algorithm/aliases/materialization, all typed fields and foreign references, all
pinned bytes/counts, assets/signatures, decision/exception/reconciliation reports,
cutoff and explicit stock-key coverage, natural/composite keys, ordinary-document
amounts/settlements and exact largest-remainder discount allocation. These checks
reuse the standard field predicates and are regression-compared with the existing
validator. `checks_passed` is true only with zero issues. SYNTHETIC packages require
an explicit `--allow-synthetic`; REAL is not an execution permission.

`import_eligible` remains false: no live target state, RLS, permissions, source truth
beyond supplied evidence, or database execution is proven. The completed summary
binds the input manifest SHA, declaration profile, source namespace and the final
**closed** SQLite index SHA/size. An importer must recheck these bytes and obtain
its normal live admission; it cannot treat this scratch index as authority.

Manifests and individual JSON reports have a 2 MiB cap; each asset has an 8 MiB
actual-read cap. The directory walk allows at most 4096 entries and depth 16.
Exceeding any bound fails closed rather than silently skipping validation.
The index includes private normalized fields/source references, not just keys;
keep the entire report directory private. No source package file is modified.
Existing `validate` behavior is unchanged and retains its aggregate memory bounds.

### Bounded request preparation (offline only)

`stream-prepare` runs package preflight, builds a disk-backed dependency graph and
consumes the bounded master, inventory, and document request cursors. It emits
counts and a plan digest, but does **not** install schema, connect to PostgreSQL,
write business data, authorize a target, or execute the import. A complete and
reviewed database host and real transaction tests remain necessary.

```sh
node --max-old-space-size=128 tools/unified-import/cli.mjs stream-prepare \
  --package /path/to/standard-package --report /path/to/new-private-report \
  --manifest-sha256 MANIFEST_SHA256 --target /path/to/target.json \
  --admin /path/to/admin-identity.json --registration /path/to/registration.json \
  --coalesce
```

For synthetic packages only, add `--allow-synthetic`. `--coalesce` selects a
separate, hash-bound request profile that groups complete small documents,
splits large documents and byte-bounds master chunks without splitting atomic
hall/default-warehouse components; old compiler requests remain unchanged. Keep the report and
its SQLite index in a private directory without concurrent writers. The current
SQLite path-to-open identity boundary is not a substitute for verified host
admission. Counts or mock results do not verify database commit, rollback,
idempotency, production permissions, or deployment. Real PostgreSQL acceptance
and source/target authorization must be performed separately.

The report/index and private temporary dependency graph may contain source rows.
Keep them accessible only to the authorized operator. Normal completion or a
handled failure removes the temporary graph; after a process crash the operator
should inspect and remove abandoned `standard-master-graph-*` scratch directories
without touching the original package or database. `ROLLED_BACK` is safe to retry
only after rollback is acknowledged. An `UNKNOWN` commit outcome must be checked
against the original batch before any retry. This preparation command never
restores a database backup or cleans unrelated business data.

For a new cleaned REAL package, local Codex can determine its stable document
batch before creating rows using `source-registration --declaration FILE`, where
FILE contains only `source_namespace`, `source_files` and `cutoff_at`. For a
finished READY manifest, `source-registration --manifest FILE --manifest-sha256
SHA` recomputes the same declaration and batch ID. The package's document
headers must use that ID. The identity calculation sorts file pins and converts
equivalent cutoff offsets to the same UTC microsecond instant; the original
manifest values are not rewritten. The declaration binds the stated file pins and time;
it is not independent verification of the historical files, nor permission to
write to a target. The older fixed historical registration remains accepted.

### Whole-package import entry (PostgreSQL acceptance not run)

The operator-controlled `stream-import` entry is wired to the single-transaction
coordinator and a separate post-commit verifier. **It has not passed real
PostgreSQL acceptance testing and must not be treated as deployed or production
ready.** Run the success, injected-failure, publish-failure and idempotent-replay
suite on an authorized isolated synthetic PostgreSQL target before rollout.

Use `node tools/unified-import/cli.mjs stream-import --help` for the exact
arguments. Installation must have produced the fixed, root-owned local
installation record; callers cannot supply their own catalog hash as approval.
The operator must ensure no concurrent DDL or permission changes during the
entire catalog-check/import window and explicitly pass
`--ack-exclusive-ddl-window`; the flag is an acknowledgement, not an automatic
lock or proof. The connection configuration and scrypt hash are supplied in
private files (mode 0600 or stricter), never as command-line secrets. Source
package/report directories must remain private with no concurrent writers.

Without `--inspect-only`, exit 0 means commit (or exact committed replay),
post-commit verification and cleanup succeeded. For `--inspect-only`, exit 0 means
`COMMITTED_RECEIPT_FOUND` or `ABSENT` with successful cleanup; neither state is a
current-data verification result. Exit 1 means preparation rejected, rollback
acknowledged, or `INSPECT_FAILED`. Exit 2 means the outcome is unknown and the
original batch must be checked before retry. Exit 3 means commit was acknowledged
but verification or cleanup needs attention, or inspection succeeded but cleanup needs attention.
The JSON state remains authoritative, especially after an acknowledged commit.
No command restores a whole-database backup.
If the process exits without a valid JSON result (including a broken output pipe
or abrupt termination), treat the outcome as unknown. Inspect the original batch
and its committed receipt before retrying; never assume failure means rollback.
For the large standard package, pass `--coalesce` consistently to both
`stream-prepare` and `stream-import`. The option selects a different bound plan
hash and batches adjacent documents; do not switch profiles when retrying an
already committed batch.

For an unknown prior outcome, rerun the same command and original package/profile
with `--inspect-only`. It checks the exact original initialization identity and
returns `COMMITTED_RECEIPT_FOUND`, `ABSENT`, `INSPECT_FAILED`, or `UNKNOWN`; it
only rolls back its inspection transaction and never applies a batch. `ABSENT`
is not an automatic retry. A found receipt is not a substitute for the separate
current-data verification result.
