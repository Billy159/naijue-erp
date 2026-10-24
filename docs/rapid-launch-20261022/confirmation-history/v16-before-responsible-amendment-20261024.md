# v16：历史单据头与未审核单据展示创建者——一次完整确认

状态：待本次明确确认，仅依赖本变更的写入分支等待；全站界面迁入、已批准数值修订、LIVE 日期与调出/调入仓接线继续。功能需求已明确，本单只确认新增持久字段、约束和依赖写合同，不再次询问是否需要可编辑。

## A. 历史单据头（沿原 B07）

不新增表、列。原 revise 接口八键保持兼容，新增可省略的非空 header：

| 输入 | 适用单据 | 类型、空值与保留规则 |
|---|---|---|
| businessDate | 销货、调拨 | 有效 YYYY-MM-DD；不接收空值；省略保留当前日期，包括原未知 |
| fromWarehouseId / toWarehouseId | 调拨 | 真实仓库 UUID；最终两仓不同；不接收空值；省略保留有效值 |
| createdByStaffId | 销货、调拨 | 真实员工 UUID，作为展示创建者；不是操作账号；省略保留原未知/未绑定/已绑定 |

只允许未审核历史单据修改头字段；审核、作废状态不因此开放。沿既有事务校验当前权限及真实引用，后端不信前端组装的身份。展示创建者与真实审计操作人、原始创建来源、创建厅及创建时间分开。

持久差异为既有 revision.before_facts / after_facts 增加明确 createdBy 状态和员工 ID；有效日期/两仓/人员取最新合法修订，筛选、分页总数及权限使用相同有效值。旧数值修订缺人员时只回退原始真实绑定，不能默认当前操作人；后续仅改数量也保留此前人员更正。旧记录不回填，旧八键请求不注入默认键，不改变原键重放。

复用受控修订与有效投影。未审核改头和数量仍不记库存；已批准的审核历史数值修订继续只记新旧库存效果差，金额单改零库存、调拨守恒、不重复过账切换基线，原头行不覆盖。

## B. LIVE 未审核单据展示创建者

现有头表没有可复用的独立展示创建者列或当前头 JSON；审计只有不可变操作差分，不能充当可编辑头字段。最小物理改动共 **0 新表、2 新列、2 外键**：

| 表.列 | 类型 | 可空/默认 | 约束与历史处理 |
|---|---|---|---|
| sales_header.display_created_by_staff_id | uuid | NULL，无操作人默认 | 引用 staff(id)，ON UPDATE/DELETE NO ACTION；旧行不回填 |
| transfer_header.display_created_by_staff_id | uuid | NULL，无操作人默认 | 同上 |

NULL 继续按原真实创建账号对应员工显示。原 createdByAccountId、真实操作人、原始创建厅/角色/时间/来源都不改含义。新增/已保存未审核单通过原 SAVE 的可选 createdByStaffId 选择真实员工；省略保留现有覆盖值，显式 NULL/空串不作清空；已有非空覆盖不能退回 NULL。弃审后的下一次未审核 SAVE 可修改；审核、弃审、作废动作本身只保留，已审核/作废不可直接修改。

沿原 SAVE 与当前记录权限，不另新增本人、本厅、在职、启用或可登录条件，也不让选择的展示人员成为审计操作人或改变可见范围。原候选范围、真实员工引用、版本冲突、原键幂等、提交未知恢复继续生效。仅改展示创建者不改变库存或金额，不新增原因必填。

销货稀疏审计仅变化时记录 header.displayCreatedByStaffId 前后值；调拨头审计补同一 nullable 键。旧审计不重写。读回明确展示人员与真实审计账号，原真实创建账号筛选不换义。

## C. SQL、约束、权限与消费者的准确边界

HREV 采用当前 v14/v15 的有限后继，不能直接安装旧未落库 v12；仅补原 numeric 有效修订所需的已列函数、约束/触发器、当前元数据及有限 HISTORY_REVISION purpose。旧 CORE helper、v15 分类排序及无关函数保持。新增检查保留原 CORE/分类分支，源头行只读/锁定，不授全表写权限，不新增角色、通用代理或 SECURITY DEFINER 绕行。

LIVE 增量只涉及两列、两外键及四个现有函数的必要扩展：reject_unimplemented_cutoff_write、validate_sales_settlement、keep_transfer_header_provenance、transfer_header_audit_values。原版本、事务、回执及结算检查保留；无必要不改其他 guard。完整函数/约束/权限逐项、注册 owner 及消费者清单见下方与配套 JSON，实施后由原 owner 交固定源码，再按受影响范围独立验证。

## HREV SQL 后继逐项

```json
{
  "pathDecision": "C registers one current-base successor path during implementation; proposed adapters/postgres/patches/0026-history-revision-current-base.sql is a path candidate only, not created or allocated here. Old0026-v12-history-numeric-revision.sql remains reference/uninstalled, not an apply target.",
  "preconditions": "One exact current v14 OR v15 predecessor identity/OID/version1..26/full canonical+routine/constraint ACL binding chosen by C, not opportunistic mixed OR/partial install. Current base routine count123/124 and preserved CORE5ca... required.",
  "newFunctions": [
    "history_numeric_current_facts",
    "history_numeric_money",
    "guard_history_numeric_ledger",
    "validate_history_numeric_revision_commit",
    "validate_history_numeric_receipt_commit",
    "validate_history_numeric_balance_commit"
  ],
  "replacedFunctions": [
    "history_revision_not_enabled",
    "history_effective_writes_closed",
    "validate_sparse_balance_commit"
  ],
  "newBodyPins": "TBD from final authored successor bytes; old v12 hashes are not accepted as final current/header proof.",
  "changedChecks": [
    "operation_receipt.receipt_target_kind",
    "audit_change.audit_object_kind",
    "operation_receipt.receipt_action_by_kind",
    "audit_change.audit_action_by_kind",
    "operation_receipt.receipt_result_by_kind",
    "inventory_ledger.ledger_event_kind",
    "inventory_ledger.ledger_closed_source"
  ],
  "newUniqueConstraints": [
    {
      "name": "history_sales_operation_endpoint",
      "on": "inventory_ledger(operation_id,source_history_sales_line_id,endpoint)"
    },
    {
      "name": "history_transfer_operation_endpoint",
      "on": "inventory_ledger(operation_id,source_history_transfer_line_id,endpoint)"
    }
  ],
  "newTriggers": [
    {
      "name": "history_numeric_ledger_guard",
      "table": "inventory_ledger",
      "when": "BEFORE INSERT",
      "function": "guard_history_numeric_ledger()"
    },
    {
      "name": "history_numeric_revision_commit",
      "table": "history_revision",
      "when": "AFTER INSERT DEFERRABLE INITIALLY DEFERRED",
      "function": "validate_history_numeric_revision_commit()"
    },
    {
      "name": "history_numeric_receipt_commit",
      "table": "operation_receipt",
      "when": "AFTER INSERT DEFERRABLE INITIALLY DEFERRED",
      "function": "validate_history_numeric_receipt_commit()"
    },
    {
      "name": "history_numeric_balance_commit",
      "table": "inventory_balance",
      "when": "AFTER INSERT OR UPDATE DEFERRABLE INITIALLY DEFERRED",
      "function": "validate_history_numeric_balance_commit()"
    }
  ],
  "numericMeaning": "Closed HISTORY_SALES/HISTORY_TRANSFER target+HISTORY_REVISE action and exact7-key receipt; HISTORY_REVISION ledger event only with one correct historical revision/line/endpoint, no source_import/native document refs or reverses; append-only source/revision/ledger/audit/receipt and exact effective/CAS/stock closure retained. Each changed check keeps the current v14 CORE or v15 category ELSE branch intact, not old preCORE expressions.",
  "headerChangesInsideSameFunctions": {
    "history_numeric_current_facts": "Resolve exact latest effective JSON date/endpoints/person and legacy original-person fallback. Must match D1 current() and D3 effective reader semantics.",
    "history_revision_not_enabled": "Preserve original numeric validator; admit only confirmed finite header JSON differences under DRAFT+excluded basis and current+proposed role/reference checks. Real actor/reason/original operation provenance remain separate.",
    "history_effective_writes_closed": "Keep same source/header/line IDs, version/revision CAS, exact current-XID revision and no DELETE. Existing head stores only version/revision and original sales totals; after_facts carries new approved header data.",
    "validate_history_numeric_revision_commit": "Validate resulting effective head/current facts including createdBy, exact one audit/receipt and0 DRAFT effects; numeric approved deltas unchanged.",
    "otherNumericLedgerReceiptBalance": "Keep exact historical source/admitted-key/true-table-alias heap xmin/revision/receipt/delta/conservation checks; header path cannot create stock changes or bypass these checks."
  },
  "sparseDispatch": "Only a narrow HISTORY target/action+actual current-XID revision dispatch is inserted into current validate_sparse_balance_commit; retain the original baseline and native SALES/TRANSFER paths byte-for-byte otherwise. Existing native/baseline ledger triggers have appropriate WHEN/scope and are not broadened; their receipt/balance/reversal guards remain attached.",
  "knownSourceCorrection": "Old reference:223 totals subtraction must use (NEW.after_facts->'totals')-ARRAY[...] rather than extracting with an ungrouped subtraction operand. Preserve relation-alias xmin reads; never reintroduce ROWTYPE.xmin/cmin/ctid as heap witnesses. No database/parser/engine PASS claimed."
}
```

## 有限 ACL 与写入语义

```json
{
  "qualification": "Requirements only, not a claim that current157 R1 lacks them. C147 ACL is historical and CORE-specific rights subsequently changed; C must capture/diff only the final relevant current execution ACL after source freeze. No D1 ACL edits.",
  "schema": "Existing CONNECT/naijue_erp USAGE only, no CREATE/owner membership/SET ROLE/superuser/BYPASSRLS or GRANT ALL.",
  "mutationColumns": {
    "history_revision": {
      "INSERT": "id document_kind sales_id transfer_id from_version to_version actor_account_id request_key reason changed_at before_facts after_facts stock_effect_basis stock_effect_evidence operation_id",
      "UPDATE": null
    },
    "history_sales_effective": {
      "INSERT": "header_id version revision_id gross_amount order_discount net_due",
      "UPDATE": "version revision_id gross_amount order_discount net_due"
    },
    "history_transfer_effective": {
      "INSERT": "header_id version revision_id",
      "UPDATE": "version revision_id"
    },
    "history_sales_line_effective": {
      "INSERT": "line_id revision_id quantity deal_price line_amount allocated_discount",
      "UPDATE": "revision_id quantity deal_price line_amount allocated_discount"
    },
    "history_transfer_line_effective": {
      "INSERT": "line_id revision_id quantity",
      "UPDATE": "revision_id quantity"
    },
    "history_sales_settlement_effective": {
      "INSERT": "settlement_id revision_id amount",
      "UPDATE": "revision_id amount"
    },
    "audit_change": {
      "INSERT": "id operation_id actor_account_id object_type object_id action old_version new_version before_values after_values occurred_at",
      "UPDATE": null
    },
    "operation_receipt": {
      "INSERT": "id actor_account_id request_key request_hash action target_type target_id status result_data completed_at",
      "UPDATE": null
    },
    "inventory_ledger": {
      "INSERT": "id operation_id event_kind warehouse_id sku_id quantity_delta source_history_revision_id source_history_sales_line_id source_history_transfer_line_id endpoint source_document_version reverses_entry_id source_import_batch_id business_date posted_at",
      "UPDATE": null
    },
    "inventory_balance": {
      "INSERT": "warehouse_id sku_id quantity version last_operation_id updated_at",
      "UPDATE": "quantity version last_operation_id updated_at"
    }
  },
  "mutationMeaning": "Inventory writes only for proven approved numeric delta, not DRAFT headers or money. Effective heads/lines/settlements are controlled projection writes, not source mutation; identity keys immutable. No DELETE/TRUNCATE anywhere. No UPDATE of immutable revision/audit/receipt/ledger/source rows as a business operation.",
  "selectAndLockOnly": [
    {
      "relations": [
        "history_sales_header",
        "history_transfer_header",
        "history_sales_line",
        "history_transfer_line",
        "history_sales_settlement"
      ],
      "read": "Original full/used logical facts needed for published before-state and numeric rows; headers SELECT * / to_jsonb require full logical row.",
      "lock": "One protected id-column UPDATE privilege only for original FOR UPDATE/FOR SHARE. Never grant source business_date/warehouse/creator changes; enabled original immutable triggers must continue to reject actual source UPDATE/DELETE."
    },
    {
      "relations": [
        "import_batch",
        "import_history_closure_manifest",
        "import_history_document_manifest",
        "import_record",
        "import_record_accounting_claim",
        "operation_receipt",
        "audit_change",
        "history_revision"
      ],
      "read": "Published FINAL and exact source/receipt/audit/revision chain columns; source store/helper use original FOR SHARE/UPDATE.",
      "lock": "Reconcile existing CORE batch.checkpoint and carry lock rights first. Missing immutable relation locks need only one protected key column UPDATE (id, batch_id or import_record_id as appropriate), not broad table UPDATE; retain immutable guards."
    },
    {
      "relations": [
        "user_account",
        "staff",
        "hall",
        "warehouse"
      ],
      "read": "Current eligible actor/role/hall and old/new endpoint/selected creator reference facts, original typed source person binding via import_header_native_reference.",
      "lock": "Reuse existing protected-column locks where present; validate same current proposed references under original policy; no unrelated staff/account CRUD or credentials read added."
    },
    {
      "relations": [
        "history_sales_effective",
        "history_transfer_effective",
        "history_sales_line_effective",
        "history_transfer_line_effective",
        "history_sales_settlement_effective"
      ],
      "read": "Full required current projection and revision pointer; UPSERT SELECT/CAS fields.",
      "lock": "Actual listed UPDATE fields satisfy projection row locks, no source update."
    },
    {
      "relations": [
        "inventory_balance",
        "inventory_ledger",
        "sku",
        "product",
        "color",
        "fit",
        "size_group_member",
        "import_header_native_reference"
      ],
      "read": "Original admitted-key/publication/retained source/physical tuple and balance proof only.",
      "lock": "Existing admitted-zero path uses original finite locks/keys. Do not grant product/SKU catalogue writes merely for history revisions; any strictly necessary lock-column privilege is tied to existing immutable/maintenance guards and actual source query, not general maintenance."
    }
  ],
  "helperExecute": [
    {
      "signature": "naijue_erp.history_numeric_current_facts(text,uuid)",
      "need": "Exact runtime EXECUTE for invoker guard subcalls; keep PUBLIC revoked."
    },
    {
      "signature": "naijue_erp.history_numeric_money(jsonb,boolean)",
      "need": "Exact runtime EXECUTE for invoker numeric validation; keep PUBLIC revoked."
    }
  ],
  "newTriggerFunctions": "The other4 new routines are private trigger functions attached by C. No blanket direct-runtime EXECUTE or PUBLIC grant proposed; actual trigger/callee rights validated in final role/catalog proof. Existing key/admission/helper function EXECUTE reused, current CORE private helper grant retained.",
  "sequences": "No new sequence or sequence mutation; original supplied UUIDs retained.",
  "approvalScope": "These finite numeric mutation/guard/ACL needs implement the already approved C01 numeric semantics. New header command.createdBy facts/DRAFT date/endpoints/reference/visibility semantics are exactly the single D3 candidate and still need one user confirmation. Do not demand reapproval of the existing numeric feature."
}
```

## D1 消费者和 owner

```json
[
  {
    "owner": "D1",
    "path": "adapters/postgres/src/history-revision-store.ts",
    "functions": "source/current/authorize/revise/forRuntime26"
  },
  {
    "owner": "D1",
    "path": "adapters/postgres/src/native-import-accounting-capability.ts",
    "functions": "exact successor metadata probes/createNativeRuntime26Issuer/finite HISTORY purpose checks/category view inheritance"
  },
  {
    "owner": "D1",
    "path": "adapters/postgres/src/inventory-posting-balances.ts",
    "functions": "reuse original borrowed createPostgresHistoryRevisionPosting; no rewrite planned"
  },
  {
    "owner": "D1",
    "path": "apps/api/src/postgres-read-api.ts / production-provider-composition.ts",
    "functions": "source301/QB236 accepted explicit B07 factory and original auth/composer reuse; no new routes"
  },
  {
    "owner": "D3",
    "path": "CONTINUATION-DELIVERY.json#historyB07HeaderContractCandidate.D3Consumers",
    "functions": "D3 owns contracts/parser/planner/HTTP/effective list-detail-filter-count-permission consumers; not edited by D1"
  }
]
```

## LIVE 完整存储、审计及消费者

```json
{
  "scope": "LIVE sales/return/exchange share sales_header; LIVE transfers use transfer_header. Same user requirement, same single C confirmation as HISTORY candidate; not a separate feature question.",
  "verifiedExistingStorage": {
    "salesHeader": "22 existing columns, including true created_by_account_id/created_hall_id/created_at; no independent display creator or head JSON column.",
    "transferHeader": "18 existing columns including true created_by_account_id/created_hall_id/created_role/created_at; no independent display creator or head JSON column.",
    "existingJSON": "sales_line.snapshot is SKU presentation only. audit_change before_values/after_values are immutable operation diffs; operation_receipt.result_data is version/status/ledger result. There is no existing LIVE latest-effective-header projection that can persist and read a separate creator without a new contract.",
    "JSONAssessment": "Existing audit JSON can record the change but is not an existing authoritative current header field. Using it instead would require a new audit-fold read/closure model across list/detail and recovery, not a field-only reuse. Choose two nullable native header references, retaining audit JSON for actual before/after evidence."
  },
  "minimalPhysicalDifference": {
    "newTables": 0,
    "newColumns": [
      {
        "table": "naijue_erp.sales_header",
        "column": "display_created_by_staff_id",
        "type": "uuid",
        "nullable": true,
        "default": "NULL/no identity default",
        "meaning": "Optional display-person override only; NULL means use existing true creator account→staff display.",
        "foreignKey": {
          "nameCandidate": "sales_display_creator_staff_fk",
          "references": "naijue_erp.staff(id)",
          "onUpdate": "NO ACTION",
          "onDelete": "NO ACTION"
        }
      },
      {
        "table": "naijue_erp.transfer_header",
        "column": "display_created_by_staff_id",
        "type": "uuid",
        "nullable": true,
        "default": "NULL/no identity default",
        "meaning": "Same override semantics for LIVE transfers.",
        "foreignKey": {
          "nameCandidate": "transfer_display_creator_staff_fk",
          "references": "naijue_erp.staff(id)",
          "onUpdate": "NO ACTION",
          "onDelete": "NO ACTION"
        }
      }
    ],
    "newSequences": 0,
    "newNotNullUniqueIndexes": 0,
    "backfill": "No UPDATE/backfill of old rows. Newly added columns remain NULL for every existing document; old creator account/hall/role/time, staff data, audit, receipt and source facts stay byte/meaning unchanged.",
    "originalMigrations": "Immutable; C registers/applies one explicit additive current-base successor after the unified confirmation. No DDL executed here."
  },
  "closedWriteDifference": {
    "routes": [
      "POST /sales/commands",
      "POST /transfers/commands"
    ],
    "action": "Original SAVE only, never a new endpoint or action.",
    "input": [
      "SAVE draft.header.createdByStaffId?: native staff UUID",
      "SAVE proposal.createdByStaffId?: native staff UUID"
    ],
    "inputRules": "Same staff-person meaning as HISTORY header.createdByStaffId. Explicit UUID must identify a real staff row. No explicit NULL/empty-string clearing; omitted keeps previous stored override, including NULL on old rows. Do not inject a new null/default/undefined key into old submitted command or original request hash.",
    "newDraft": "First SAVE may carry an explicit display staff; omitted stores NULL and display remains true creator. Actual created_by_account_id always authenticated original creator, not selected staff/account.",
    "savedDraft": "Only actual locked previous DRAFT and resulting DRAFT may change this override. After normal UNAPPROVE, a later DRAFT SAVE may edit it. APPROVE/UNAPPROVE/VOID carry the same stored value and accept no new creator payload; APPROVED/VOID editing refuses.",
    "internalValue": "Document/store field displayCreatedByStaffId:staffUUID|null is the nullable override. It is distinct from the command staff selection and from true createdByAccountId.",
    "stockAndMoney": "Creator-only SAVE changes no quantities, economics, settlements, ledger or balance. Retain original complete draft/proposal validation and SKU identity; no implicit creation of new business identity.",
    "permission": "Existing document SAVE/edit permission and original current actor/revocation/hall/warehouse rules apply unchanged. Validate UUID/existing staff reference and preserve existing approved candidate/reference scope only. No new role, active/employment/login/own-person/own-hall requirement or candidate endpoint is added. Chosen staff is not a new actor and does not gain authority.",
    "sameTransaction": "Read current override/lock selected staff on original command transaction, validate expectedVersion, persist header under original CAS, append original audit/receipt and commit/rollback as one unit. Same-key/same-body returns original receipt after original current permission check; changed staff with same key conflicts; unknown COMMIT retains original-key recovery."
  },
  "readAndIdentityDifference": {
    "effectiveDisplay": "When override is NULL, resolve creator staff/name through original created_by_account_id→user_account.staff_id→staff. When nonNULL use that existing staff ID/name. Use explicit NULL-vs-present logic, not a silent fallback if a nonNULL FK is corrupt. Current native name display follows existing LIVE behavior; no new historical name snapshot.",
    "readDTO": "Expose resolved createdByStaffId for the existing employee selector. Existing transfer createdByName becomes the explicitly chosen displayed creator label; sales list/detail receives matching createdByName. True createdByAccountId remains the unchanged creation identity. Raw nullable override remains an internal document/storage value; no employee may supply it as an actor field.",
    "queries": "Same authorized list/detail/count snapshot and normal joins; add only one staff lookup/left join by display reference as needed. Existing true createdByAccountId filter retains its real-identity meaning; no new search/filter API required in this proposal.",
    "permissions": "Never derive document visibility or createdHall/createdRole from selected display staff. True creator identity, source-created-hall exception and original current/proposed document scope remain unchanged.",
    "operationHistory": "Audit actor fields/names always use real audit_change.actor_account_id and operation receipt actor. Header display-person selection cannot rename the actor in operation history or change original created_at/approved actor/time."
  },
  "auditBeforeAfter": {
    "newEvidenceKey": "header.displayCreatedByStaffId = stored nullable override, not real actor or source key.",
    "sales": "Extend SalesAuditValues and salesChangeEvidence.headerFields with the override; sparse before/after includes it only on actual change (or original new-document after rules). A changed old NULL/new staff UUID is recorded as exactly those native values; unchanged header fields remain sparse.",
    "transfer": "Extend existing full TransferAuditValues.header and transfer_header_audit_values(source_row) with displayCreatedByStaffId UUID|null. New audits follow this complete key shape, old stored7-key headers stay untouched. Existing validate_transfer_header_commit uses OLD/NEW helper values for exact before/after and original version; body can remain unchanged if helper expansion suffices.",
    "realActor": "Same SAVE actor_account_id/reason convention and original version increment. No new mandatory LIVE reason/approval or extra business permission. No new audit event/action, no rewrite of old audit/receipt JSON."
  },
  "finiteSQLFunctionImpacts": [
    {
      "signature": "naijue_erp.reject_unimplemented_cutoff_write()",
      "difference": "Keep all original CUTOFF_HISTORY rejection. For LIVE sales_header INSERT/UPDATE, enforce the new display reference can change only on new DRAFT or DRAFT→DRAFT; all other actual creation facts/actor rules unchanged. Also reject stored nonNULL display override→NULL: clear/reset semantics are not approved; omitted input must preserve it. INSERT NULL and existing NULL→NULL remain valid."
    },
    {
      "signature": "naijue_erp.validate_sales_settlement()",
      "difference": "Reuse existing sales_header_settlement_consistency DEFERRABLE trigger branch: when the new override is actually inserted/changed, compare OLD/NEW field with same current SAVE audit/receipt/version before/after. Retain original settlement count/equality logic and other trigger table branches. No new trigger/helper required."
    },
    {
      "signature": "naijue_erp.keep_transfer_header_provenance()",
      "difference": "Add override to protected non-DRAFT change check; retain immutable true creator account/hall/role/time and old status/provenance rules exactly. Also reject stored nonNULL display override→NULL: clear/reset semantics are not approved; omitted input must preserve it. INSERT NULL and existing NULL→NULL remain valid."
    },
    {
      "signature": "naijue_erp.transfer_header_audit_values(naijue_erp.transfer_header)",
      "difference": "Add the one nullable display override key to existing closed complete header audit projection; source actor/creation fields unchanged."
    }
  ],
  "preservedExistingSQL": "validate_sales_commit, validate_transfer_header_commit, guard_runtime_document_number, original source/stock/settlement/actor/audit/receipt and immutable creation checks remain attached and retain bodies unless a concrete necessary dependency is found during authorized implementation. Four replaced existing routines add no routine count; no new platform-wide permission mechanism.",
  "issuerAndAcl": "Combined current-base successor includes exact two columns/two FKs and four LIVE function body differences in its canonical/source manifest, preserving current CORE true-heap and v15 category pins. Reuse the existing native SAVE capability/route authorization, not HISTORY_REVISION for LIVE. For an already authorized column-scoped document writer, add only SELECT/INSERT/UPDATE of the new column where required by the original saved command; existing table SELECT covers the new column. No GRANT ALL, extra staff CRUD, REFERENCES/DDL rights to runtime, owner bypass or READ-as-write.",
  "consumerFiles": [
    {
      "path": "packages/domain/src/documents.ts",
      "scope": "Internal SalesHeaderRow/Transfer-related nullable display value and draft intent shape; shared unregistered leaf requires C allocation before edit."
    },
    {
      "path": "packages/application/src/ports.ts / transfer-ports.ts",
      "scope": "Original LIVE draft/command/store/audit types, no actor replacement."
    },
    {
      "path": "packages/application/src/native-sales-preparation.ts / native-transfer-preparation.ts",
      "scope": "Optional staff intent in SAVE and prepare-existing parsing; preserve omission through normalized proposal and draft without changing old request digest."
    },
    {
      "path": "apps/api/src/input.ts / transfer-input.ts",
      "scope": "Exact optional createdByStaffId in original SAVE variants only; reject real actor/createdByAccountId spoofing."
    },
    {
      "path": "packages/application/src/sales-service.ts / transfer-service.ts",
      "scope": "DRAFT-only intent + original authority/CAS, preserve override on omitted input and nonSAVE operations."
    },
    {
      "path": "packages/application/src/sales-change-evidence.ts",
      "scope": "New sparse header field; currently unregistered leaf requires C allocation, no edits here."
    },
    {
      "path": "adapters/postgres/src/sales-unit-of-work.ts / transfer-unit-of-work.ts",
      "scope": "Load/persist nullable override in original bound transaction, lock/validate selected staff, retain original true creation-fact checks."
    },
    {
      "path": "adapters/postgres/src/sales-query-reader.ts / transfer-query-reader.ts and matching query ports",
      "scope": "Consistent effective display ID/name for normal list/detail snapshots; original permission and true-identity filters unchanged."
    },
    {
      "path": "C-registered current-base additive SQL and existing issuer metadata probes",
      "scope": "Two nullable FK columns/four routine replacements in the one confirmed combined delta, not old migration edits."
    },
    {
      "path": "F1 existing document headers/employee selection/API serialization",
      "scope": "Use resolved staff ID/name, submit optional intent only, keep actor hidden/server-authoritative; original date/warehouse SAVE wiring proceeds now."
    }
  ],
  "validationAfterApproval": "Only new affected SAVE/display tests: new and saved DRAFT, omitted legacy payload preserving old override/hash, nonexistent/forged staff and actor refusal under original scopes, non-DRAFT refusal, before-after/version/replay/rollback/unknown outcome, unchanged stock/amounts and true creation identity/visibility. Reuse old numeric/301/QB236 evidence; C only actual DB/build/release.",
  "notDone": "Candidate only. No columns/functions/input/types/grants or new write branch implemented or tested in this preparation."
}
```

## D3 接口与有效投影消费者

```json
[
  {
    "file": "packages/application/src/history-revision-contracts.ts",
    "functionsOrTypes": "HistoryRevisionCommand/HistoryRevisionCurrent; new finite HeaderChange type, reuse existing ImportedHistoryPerson shape."
  },
  {
    "file": "packages/application/src/history-revision-service.ts",
    "functionsOrTypes": "parseHistoryRevisionCommand: optionalheader/kind/finite values; planHistoryRevision:DRAFT-only head diff, actual before/after person, no-op/version and zero draft stock; execute:existing trusted grant/receipt."
  },
  {
    "file": "apps/api/src/history-revision-http.ts",
    "functionsOrTypes": "createHistoryRevisionHttpPlugin same routes/auth/Origin/error mapping; change only if needed, no second endpoint or new privilege path."
  },
  {
    "file": "adapters/postgres/src/imported-history-query-reader.ts",
    "functionsOrTypes": "headerColumns/from/filter/permission conditions/header and readList/readDetail consume exact latest valid revision.after_facts for effective date/endpoints/person; older numeric missing person uses original source. No partial display-only overlay."
  },
  {
    "file": "packages/application/src/imported-history-query-ports.ts / imported-history-query-validation.ts",
    "functionsOrTypes": "Reuse existing read DTO keys and person states; no new read field required. Only change if needed for existing effective permission validation."
  },
  {
    "file": "tests/history-revision.test.ts / apps/api/src/history-revision-http.test.ts / tests/imported-history-query.test.ts",
    "functionsOrTypes": "New affected cases only: draft head save/preserveNULL+UNKNOWN/forgedactor or foreignref refusal/approved-header refusal/legacy8key/effective read-filter-count/creator correction surviving later numeric save."
  }
]
```

## 验证、发布与回退

批准后才实施新增字段/SQL/写合同；仅在已登记隔离环境验证头字段前后值、旧未知保留、权限/无效引用、原键重放、版本冲突、回滚、库存差额/零效果、有效筛选与读回。模拟/类型检查不代表真实 PostgreSQL 通过。C 唯一实施数据库与发布，原 QF/QF2/QB 复用同版本有效证据，只补受影响范围。正式批次仍满足备份和数据条件；回退应用不删除新增列、不回灌旧库覆盖新账，原始来源、修订、审计及失败现场保留。

配套 [完整机器清单](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/docs/rapid-launch-20261022/WRITE-CONTRACT-SUPPLEMENT-v16-HISTORY-HEAD-LIVE-CREATOR.json)；当前尚未执行本补充任何 DDL/写入。
