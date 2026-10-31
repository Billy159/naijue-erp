# 主控校验清单与回传字段（不含执行 SQL）

## 先回传元数据，不先改真实业务库

1. 当前真实服务入口/候选入口分别绑定的 commit、build ID、配置profile、format、patchLevel、artifact文件hash及部署状态。先确认旧系统是否使用同一数据库/schema；不能假设。
2. 新目标的 database、database_oid、database_owner、current_user、session_user、server_version_num、server_addr、server_port、postmaster_start、replication_role，以及认证方式和逻辑/集群隔离范围。普通runtime必须明确为真实新认证LOGIN；管理员SET ROLE不能替代。
3. migration_versions完整数组 + 每个migration的文件hash及数据库登记证据；当前完整schema结构元数据。V6所需关系、列、约束、索引、触发器、函数和角色/ACL全部核对，不能只计数。
4. **“缺4函数/3体不匹配”的逐项清单**：schema、完整函数signature（含identity arguments）、missing/mismatch、actual body_sha256、expected body_sha256、actual definition_sha256、expected definition_sha256、expected来源文件/行/commit、owner、language、volatility、security_definer、config/search_path、ACL。未知保持null，不填猜测；不能用实际值覆盖expected后宣称通过。
5. ACL差异逐项：database/schema/object kind/object name/column名及attnum/privilege；expected/actual effective权限；直接grant、PUBLIC、继承membership分别列出；grantor、grantee、grantable、owner；角色login/superuser/inherit/create_db/create_role/replication/bypass_rls与membership；sequence权限与函数EXECUTE亦包括。分别列missing、unexpected、owner/授予链不一致，禁止仅给总数。
6. 同时给出constraints（定义、validated、deferrable、initially_deferred、FK目标/动作）、triggers（定义、enabled、routine、WHEN/transition-table）、indexes（定义、valid/ready/unique/predicate）的实际expected差异。函数体合格不能替代这些项目。
7. V6 `source_routines_match`、`complete_write_xmin_acl_match`及真实catalog_sha256；V7再加 `recorded_live_balance_contract_match` 与新format/patchLevel。完整catalog review必须独立审核并绑定实际源/目标。

字段源：`adapters/postgres/src/native-import-accounting-capability.ts:204–265`（manifest字段、身份、函数body/definition、ACL、触发器约束索引、roles/memberships）；`:594–642`（V6 xmin证明）；`:645`起（V7）。不要回传凭据、密码hash、真实业务行或个人资料。

## 同意隔离演练后，主控才可执行的关卡

- [ ] 固定经双方确认的源码commit和51文件hash；补充完整应用/构建/候选准备器hash，不把本材料的局部字节一致当完整工程验收。
- [ ] 明确新空白合成DB；若共享Unix集群，记录全局roles/HBA/ident/资源风险，不叫“全新集群”。若需要全新集群，则另审固定Unix profile，不放宽0030任意路径。
- [ ] 备份/恢复验证、连接身份、controller/lease/close/dispose及清理职责和授权窗口齐备。权限没有自动TTL，旧授权不延用。
- [ ] 基于actual↔expected差异制定完整V6目标专属安装/ACL方案，保持前身与后置guard；尤其v22旧目标绑定必须新审，不删保护，不改审核hash凑通过。
- [ ] 从原迁移到完整V6在隔离目标演练；证明所有135函数及结构/ACL到位、V6真实普通账号观测和独立审核通过。现有V5→V6 renderer只能在已证明V5上使用。
- [ ] 在同目标/同角色形态的rollback-only rehearsal或等价真实独立审核中建立V7 before/after catalog pins，未知继续REFUSE。未获执行授权前不做此步骤。
- [ ] 独立审核V7候选准备器与原DDL；只应用批准增量，验证137函数、新列/约束/触发器与4ACL单元，无越权扩展、原数据未回填。
- [ ] 使用普通runtime LOGIN新认证连接重新观测V7 canonical catalog；独立签审issuer review。管理员SET ROLE的before/after hash不能复制为issuer hash；源码SHA也不等于DB canonical hash。
- [ ] 新应用候选用确切V7 review启动，未齐失败关闭；验证登录/会话/读接口及相关正常写/退审/回放路径、原键幂等、金额数量精度、历史未知值不补零；保留引擎回执、清理和连接池关闭证据。纯测试/模拟不算PG通过。
- [ ] 最后另行批准正式迁移与切换；线上真实数据升级、生产备份和停写窗口另审，不能把新库演练成功自动推广为生产授权。

三类hash与窗口依据：`recovery/v7-preparation-successor-prep-0018/README.md`“严格区分三个hash/两种有限授权”；Unix边界依据 `recovery/v7-unix-target-extension-prep-0030/README.md`。

## 应用兼容与回滚边界

- V6旧exact135审核不能用于已升级到V7的137函数目标；反过来新非CORE V7入口不能指向只具V6的库。先做实际入口兼容矩阵，再部署。
- 事务提交前失败应整体rollback并回读；成功提交后的应用回退不等于数据库回退。不能假设旧V6应用可接受V7对象或catalog。
- 一旦新列已有业务事实，禁止为了回退直接drop列/触发器/函数或补造历史；需要恢复策略、停写窗口、事实保存/对账与单独批准。旧数据的NULL保持未知，不回填0。
- 生产仍旧入口、私有候选仍V1或仅迁移1..26时，**结论应为“前置未齐，禁止切换”**，而不是“V7 SQL装不上所以改hash”。

## 可直接交给主控的一段要求

请先做只读差异核对，不升级真实业务库、不改权限或正式服务。以双方确认源码基线和本材料SOURCE-PINS为依据，回传完整V6的函数/结构/ACL actual↔expected差异，特别是缺4函数及3体不匹配的精确签名、body/definition hash和来源。migration1–26不等于完整V6，prepare-runtime26-v6只支持已合格V5到V6的16个读取权限单元。先制定新目标专属、可回滚的完整V6隔离准备方案，独立审核普通runtime的真实catalog，再接V7原DDL和两列4ACL单元；保持所有失败关闭与精确目标guard，不修改expected hash凑通过。GitHub先统一独立准备分支供复核，不覆盖发布分支或触发部署。线上迁移和入口切换另行提交具体影响、备份、回退及授权申请。
