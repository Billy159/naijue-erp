# 给主控：完整 V6 前置 → V7 配套材料（只读源审查，非执行包）

## 先说结论

- **需要交付 V6 前置，不是另装一个叫 V6 的软件包。** migration 1–26、完整 HV2 函数/约束/触发器、普通 runtime 最小 ACL、真实 canonical catalog 独立审核共同组成 V6。migration 数字仍为26，不能用它证明 V6 完整。
- `prepare-runtime26-v6.mjs` **仅 V5→V6**，给 `history_revision` 15用户列及 xmin 增加 SELECT；不创建前身函数、不修复函数体、不恢复完整写权限（该文件11、21–26、33–45行）。它要求原 V5 已真实合格。
- 本材料定位源码依赖与待核对项，**不是从零安装器、不是生产 SQL、没有授权**。没有生成可执行 SQL，也没执行工程模块、测试、build、数据库、权限、网络。
- 主控截图由 root 转述：新库已有1–26，缺4前身函数、3函数体不匹配，写权限未齐；截图没有7项签名。**不能把下面源码声明当成实际缺失的7项，不能修改 expected hash 凑过审核。** SOURCE598 私有V1候选及旧正常入口也不能代替新V6/V7证据。
- 可以先把经确认的统一源码基线发布到**独立准备分支**供双方复核；不覆盖发布分支，不触发部署。GitHub 推送、DB升级、部署是三个独立动作。当前远端仍最初版仅来自用户陈述，本次未查网络或推送。

## 证据与范围

源码只读根：`recovery/ui-combined-source-0201`（待新负责人整体验证）；对照稳定根：`recovery/staff-admission-worktree-2334`，root给定基线 `6a85f14b1b3b18f0c72f40d36d9bbece448f9140`。

`SOURCE-PINS.json` 记录26个 migration、18个 patch、7个合同/代码文件的实际文件 SHA256；这 **51文件在两个根逐字节相同**。这不证明整个combined工程一致、可构建或可发布。`PATCH-DECLARATION-INDEX.json` 是逐patch对象声明与行号索引（非完整解析）。全文短路径均相对源码根。

### 1. 源码依赖顺序（不是一键执行顺序）

|阶段|源码/精确定位|结果与注意|
|---|---|---|
|原migration|`adapters/postgres/migrations/0001*`…`0026*`，完整文件hash见pins|先确认实际迁移字节/对象，不仅查registry。|
|v8 bootstrap|`patches/0026-v8-bootstrap-field-provenance.sql:1–7`（patches均在adapters/postgres下）|历史单函数前身；最终完整v14再次替换同函数。因此它是历史依赖材料，不宣称新库必须机械执行每个中间版本。|
|v9 publication|`0026-v9-empty-history-publication-dispatch.sql:1–7`|替换guard_successor_publication26；原migration26:698是旧定义。|
|v10 creation|`0026-v10-native-creation-trigger-record-scope.sql:1–7`|替换guard_native_creation_identity；原migration23:37是旧定义。|
|v11 specification|`0026-v11-document-specification-save.sql:1–4`|2替换、1新函数、1deferred trigger，具体声明见索引。metadata基础122函数见capability:403–405的前身计数。|
|完整v14|`0026-v14-core-initialization.sql:1–2,11–31`|基于v11，不装v12/v13；改receipt/audit约束、增加assert_core_initialization_v14并替换闭包函数；123函数。|
|v15 category + v16 history|`0026-category-reorder-undo.sql:1–4`; `0026-history-revision-current-base.sql:1–7,145–196`|可v14→v15→v16，也允许已证实v16-from-v14再v15；终点必须v16-from-v15/130函数。v16增加responsible_staff_id/FK、历史数值约束、触发器与6函数，不能只复制函数体。capability:418–430,484–485。|
|v19|`0026-v19-barcode-scheme-initialization.sql:1–7`; capability:498–506|只接完整v16-from-v15；新增barcode helper，131函数。|
|v20|`0026-v20-history-insert-source-identity.sql:1–7`; capability:508–511|替换guard_history_insert，保持131函数。|
|v22|`0026-v22-staged-prefix-bind.sql:1–24`; capability:513–516|替换assert_core_initialization_v14；**原文件绑定历史DB/OID/角色/postmaster及两列UPDATE前置，不可直接用于新库，更不可删guard强行装。** 需新目标特定、独立审核的准备方案。|
|HV2 B07|`0026-history-responsible-null-successor.sql:1–7`; capability:518–522|nullable responsible单体修正。|
|HV2 B14|`0026-category-depth-successor.sql:1–7,25–69`; capability:524–528|新增category锁/最终深度校验函数与触发器，133函数。|
|HV2 P04|`0026-history-revision-set-guards-successor.sql:1–11,177,209,238–278`; capability:529–535|替换3体，新增2个statement set guard及触发器，135函数。|
|完整V6 ACL+review|capability:585–642；prepare-runtime26-v6:33–45|23表xmin读取合同、所有用户列/函数/角色/序列的完整最小ACL、完整catalog审核，不是只补23项。|

`capability` 指 `adapters/postgres/src/native-import-accounting-capability.ts`。上述“新函数数目”是源码profile计数，不是目标库的缺失数量。

**不能混装的旁支/历史repair：** v12不是完整v14依赖（v14:2）；两个v14 repair文件:1–6明确只用于旧QA前身，未安装R1用完整v14；`0026-history-effective-value-disambiguation.sql:1–3` / capability:487–491是v21-from-v16-v14旁支，不是full-v22→V6顺序。

**打包清单不等于安装清单：** `config/release-contract.json:8–57`没有列v8/v10；`scripts/release/manifest.mjs:45–46`明确packaging不执行patch。不得仅按打包列表重建新库。

### 2. 最小 ACL 的可证明范围与缺口

- V6精确xmin表列表在capability:594–600，共23张；检查要求runtime SELECT、无table SELECT、owner作为grantor、不可grantable、无PUBLIC（:615–629）。
- V5→V6唯一增加 `history_revision` 的15用户列SELECT及xmin SELECT；列名在prepare-runtime26-v6:11，精确列集/无INSERT/UPDATE/REFERENCES检查在:38。它不增加历史写入授权。
- 前置角色/owner/no membership、schema USAGE而非CREATE、无表级权限约束在该renderer:37–39；系统列范围在:32。完整用户列/序列/函数ACL必须由catalog的实际独立审核证明。
- `scripts/release/provision-database.py:35`明确仅SCHEMA19且未授业务表权限；旧 `r1-acl-account-metadata.py:19–28`绑定历史schema19与旧目标，**不是完整V6列级权限恢复方案**。本次没有找到/证明一个可通用的新库完整V6最小ACL安装器，绝不把旧ACL、历史716计数或GRANT ALL当方案。
- 需主控交付完整object/column/action/expected/actual矩阵并审核差异后，另制受保护目标专属准备方案；不能从“完整写权限未齐”猜要授什么。

### 3. V7 在什么基础上增加什么

`0026-live-ledger-balance-pairs.sql:1–4,27–40,41–113`：已有完整V6之上，inventory_ledger新增quantity_before/quantity_after、CHECK、2函数、2触发器；不回填、不UPDATE原数据、不默认补零、不替换原135函数、不自行GRANT。capability:645–654确立137函数新profile。

候选准备器：`recovery/v7-preparation-successor-prep-0018`；Unix兼容候选：`recovery/v7-unix-target-extension-prep-0030`（优先审查其02-implementation/scripts/release/prepare-runtime26-v7.mjs，仍非已安装）。候选只加两列SELECT+INSERT的4权限单元；不能恢复完整V6。0030 README:Unix闭合指定目标profile，不是任意Unix路径/见NULL放行。

root提供的证据层级：`recovery/v7-pure-native-0126` UNIX纯测试14 PASS；本代理没有复跑/核验该目录，**不代表普通PG/V7真实引擎通过**。

应用合同：`config/release-contract.json:67–78` V6/V7是不同format/patchLevel/observation；`apps/api/src/postgres-read-api.ts:605`要求V7 observation的入口不能仅换V6审核。需主控确认具体部署入口和build引用，不能假设旧入口兼容。
