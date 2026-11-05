# 主控交接：基础操作必须真接线，不能交付只读预览

## 先区分两个入口

**默认 preview 不是可用业务系统。** `apps/web/demo-replica/frontend/runtime-bootstrap.ts:6–13` 明确使用合成 preview transport、`approved-synthetic`，客户供应商配置为 `parties:{readOnly:true}`，且没有 `maintenance` 写开关。员工/收款页面虽能显示，保存能力没有配对，因而禁用/显示未接入是该入口的源码行为，不等于账号权限不足。`runtime-preview-transport.ts:6–14` 也明确仅限 SYNTHETIC、不得作生产 fallback。**这不能反推用户截图的实际 host/provider；本轮未读取该部署配置。**

正式交付须用原 `build-production-host.mjs` → `frontend/production-bootstrap.ts` → `mountNormalReplica` 正常入口，配真实同源 HTTPS、公配置、真实会话和原后端 provider。不能把 preview URL 当已交付系统，不能只改按钮 `disabled` 或把 `readOnly` 改 false。

## 每项前后端必须成对

下面都是已有原服务，不需要另造“新增”假接口。公共字段仅控制 UI，**不是服务授权**；私有配置还须通过原 runtime/issuer/permission admission。源码：`apps/web/src/production-host/configuration.ts`、`runtime/settings/feature.tsx:42–89`、`apps/api/src/production-provider-composition.ts:123–192`、`postgres-read-api.ts:591–735`。

| 基础操作 | 正常 host 公共 routes 字段 | 原 HTTP → service → PG provider / 私有选择 | 当前身份门槛 |
|---|---|---|---|
| 客户新增/编辑 | `parties:{readOnly:false}` | `/customers` 原读/命令/回执；`createPartyMaintenanceService` → `PostgresPartyUnitOfWork`；`partyMaintenance:true`，原 approved KH allocator | ADMIN / WAREHOUSE；SALESPERSON 不得维护 |
| 供应商新增/编辑 | 同一 `parties:{readOnly:false}`；独立供应商身份，不合并客户 | `/suppliers` 同一原服务的独立 family；同一 `partyMaintenance:true`，原独立 GYS allocator | ADMIN / WAREHOUSE |
| 员工及关联登录账号 | `staffSettings:true` **且** `maintenance.staffSettings:true` | `/staff`；`createStaffMaintenanceService` → `PostgresStaffMaintenanceUnitOfWork`；`staffMaintenance:true` | **ADMIN only**；关联账号同员工事务，非第二条日常账号流程 |
| 收款方式/资金账户 | `paymentSettings:true` **且** `maintenance.paymentSettings:true` | `/payment/methods`、`/payment/accounts`；`createPaymentMaintenanceService` → `PostgresPaymentMaintenanceUnitOfWork`；`paymentMaintenance:true` | ADMIN / WAREHOUSE；账户须真实方式/完整营业厅引用 |
| 营业厅新增/编辑 | `storeSettings:{allowedTabs:['stores','warehouses'],initialTab:'stores',allowHallDirectoryRead:true}` **且** `maintenance.storeSettings:true` | `/organization/halls`；`createOrganizationMaintenanceService` → `PostgresOrganizationMaintenanceUnitOfWork`；`organizationMaintenance:true` | ADMIN / WAREHOUSE |
| 仓库新增/编辑 | 同一 `storeSettings` 必须包含 `warehouses` 标签及同一写开关 | `/organization/warehouses`；同一原组织服务/provider；`organizationMaintenance:true`；单一真实所属厅 | ADMIN / WAREHOUSE |

还必须保留：

- **保存后读回使用相同 native 数据。** 对应原 `createOrganizationMaintenanceReadHttpPlugin` / `PostgresOrganizationMaintenanceReadUnitOfWork`，以及当前客户供应商 native read provider 必须配对。不能写入新记录后仍用 CORE-only 初始成员列表，造成“保存了看不到/重开读不到”。原配对见 `postgres-read-api.ts:670–691,707–735`。权限依据原当前账号/员工/厅和事务内复核，不从前端徽标或公开 role 字段推断。
- 员工初始密码/重置密码须原真实 gated Scrypt、密码策略和稳定私有 credential-request key/tag，加原 STAFF CREATE/read permission admission。缺凭据能力时，原服务拒绝带密码创建 `ACCOUNT_CREDENTIALS_NOT_READY`，无账号员工仍是独立受支持分支；不能伪造成功、通用放权或把合成32字节测试 key 带生产。见 `production-main.ts:44–49`、`production-credential-key.ts`、`postgres-read-api.ts:628–631,679–686`。
- 原 runtime26 review、`PRODUCT_MAINTENANCE` / `CURRENT_CUSTOMER_READ_WRITE` 等 admission、原 PG 事务/CAS/审计/回执必须保留。是否启用业务单据 `documentCommands` 与这些基础资料 opt-in 分开；不要为了基础设置泛化单据或账号权限。
- 没有原 provider/真实授权时继续 fail closed，并准确报“未接入/不可保存”；不能把前端显示可点击当作完成。

## 默认出库仓的正确顺序

1. **先保存营业厅**，暂不选默认仓；新厅没有实际 id，字段禁用和“先创建营业厅及其仓库，再设置默认出库仓”说明应保留。
2. 新建仓库，选择刚保存的真实营业厅并保存。
3. 重开该厅，默认仓目录按它的实际 hallId 读取正常仓库；选择本厅仓库后按当前 version 保存。
4. 返回列表、重新打开，并刷新后再开，确认真实引用和选中值仍在。

这是原 `runtime/settings/store-form.tsx`、`src/settings/stores/maintenance-http-client.ts` 和 `adapters/postgres/src/organization-maintenance-store.ts` 的引用规则。跨厅默认仓、移动/停用仍被有效默认引用的仓库等保护不能为了下拉框可用而绕过。

## 本轮已验证什么；不能拿什么去生产

根实际0144使用**原正常 production bootstrap/React 页面及原 HTTP/service**，在隔离合成会话+事务内存 UoW 上完成：客户/供应商/员工/收款方式新增→保存→列表→新读详情重开→编辑→重开；厅→仓→默认仓保存/新读重开/硬刷新。**11 原命令、11 回执，全部 API200，无未知重试、foreign/page error，浏览器正常关闭、service exit0。** 也验证脏弹窗取消无多余“继续填写/放弃本次填写”。

证据：`recovery/settings-react-native-0144/browser/result.json`；11张截图同目录。主控可复核01取消、03员工、08默认仓可选、09重开选中。根另实见前台窗口与 translation popup；此弹出未被掩饰，也未声称修复。

**0144 公配置、合成 `/auth/session`、合成身份、测试 key、内存 UoW 和浏览器 bridge 全是验收宿主，严禁直接作生产配置/provider。** 它证明原正常 UI/service 基础操作可配对，不证明真实 PG/schema/ACL/issuer、真实登录/容量、重启持久性或用户当前部署已经可用。交主控时应交“正常入口+明确前后端配对+实际验收清单”，而不是再发只读 preview。

### 单列未测项：操作记录 HTTP

普通 Feature 有“操作记录”入口，原源码也有 `createSettingsAuditHttpPlugin` / `PostgresSettingsAuditUnitOfWork`。**0144 最小合成宿主没有挂此 HTTP reader，未点击、未验收，不可宣称可用。** 事务 snapshot 内有 audit 不是 HTTP/UI 验收替代。主控正式接线须另行配对并验收；本轮不补假日志接口。

**正式目标验收门槛：** 确认正在访问的是绑定实际资产/配置的正常入口；每项用获准真实会话走新增→保存→列表→新读详情重开（含账号凭据与厅仓依赖），确认同模型持久化和正确拒绝/未知提交保护。未取得目标配置/数据库/授权证据时不得报真实部署已修好。本交接只写独立 prep 文档，未改冻结 source/host，也未新增执行。
