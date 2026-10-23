# v6：初始化账号来源证明的标准封装修复确认单

状态：待用户明确确认；仅相关初始化分支等待。不是部署授权重问。

实际依据：C67 在新隔离 QA（erp_qa_rapid26_native_20261023_01，OID 1032586）首个 STAGE 事务失败，C68 只读回查原批次、请求回执及相关业务记录均为空。精确错误为 `invalid versioned field provenance`，原 `guard_history_insert()` 第22行。现有通用守卫要求每个字段都有来源封装，初始化证明的旧生产方、TypeScript及SQL读取方却要求裸七键对象，两者互斥。不能仅换合成输入或重复执行解决。

## 需要确认的唯一格式差异

沿用 `import_source_row.field_provenance`（jsonb NOT NULL），不新增表、列、索引，不改SQL类型、可空、默认值或来源枚举。

旧路径 `field_provenance.fields.bootstrap_accounts` 直接存原七键证明；改为现有标准字段来源对象：

| 键 | 类型及要求 | 本生产方取值 |
|---|---|---|
| origin | 现有来源枚举，必填、无新增默认 | MIGRATION_DERIVED；这是构造的身份/授权来源证明，不冒原始表格单元格 |
| reason | 现有来源说明文本，必填 | 明确说明由原员工、账号及已批准身份链接证据构造；合成QA明确写虚构合成验证 |
| raw | 非空 JSON 对象，必填 | 原七键证明对象逐值原样放入，不重建、删键或归一化 |
| evidence_ref | 现有派生来源要求的非空证据引用，必填 | 原证明 authority.bootstrap_execution_review_sha256；只是证据引用，不产生执行权限 |

原七键 `version / profile / binding / authority / expected_counts / staff / accounts` 全部移至 `.bootstrap_accounts.raw` 下；内部字段、类型、NULL、49个账号/45条直接身份/4条已批身份链接均保持原样。原来源行身份、raw_fields、normalized_fields、文件/行哈希不变。字段来源、准备对象和闭包包含此封装的指纹按新内容重新计算，不能沿用 C67 旧指纹冒新版本。

## 实施和保留条件

- D2 原合成生产程序只增加这一层标准封装，原57行输入文件及原请求键不改；真实49人导入生产方不能因此记为完成。
- D1 TypeScript 先用已有通用字段来源校验，再在 raw 中执行原封闭七键完整校验；仅 STAFF/EXACT26 原范围可用。
- D1 SQL 仅让 `assert_native_bootstrap_accounts` 从 raw 取原证明；原通用0011/0016守卫不动，原首STAGE、同批次/同事务、49/45/4、账号/员工对应、审计和回执全部仍强制。
- 不增加旧裸对象容错，不跳过守卫，不补造历史审计，不自动改写或回填既有来源记录。C68 的空库事实只适用于此次新隔离QA，不推及旧QA或正式库。
- 已安装0026迁移历史保留；沿既有 EXACT26 后继补丁路线单独固定 v8 一个函数修复，不冒新迁移27，不覆盖旧失败回执。同步原唯一 issuer 的准确函数体指纹和受控版本标签，权限、角色、schema/search_path和目的不扩大。

## 唯一文件归属

D1：`packages/application/src/import-v3-history-header-native-reference.ts`（C补精确登记）、独立 `adapters/postgres/patches/0026-v8-bootstrap-field-provenance.sql` 中的上述单函数补丁（原0026迁移文件保持原样）、`adapters/postgres/src/native-import-accounting-capability.ts` 的对应指纹/标签，以及原D1定向纯检查。

D2：原控制目录 `reports/backend/rapid-launch-20261022/D2/actual-stage-add-read-v1/synthetic-baseline26-v1.mjs`，其他生产方不借此扩大。

D1准备、C唯一实际执行：开发目录 `adapters/postgres/patches/0026-v8-bootstrap-field-provenance.sql` 的固定副本，仅批准后创建/复核/执行；不跨owner修改。

## 必要验证与回退

批准后先固定源码、采用原路独立定向验收；仅检查标准封装保留原七键，裸七键、错误封装、内层身份/凭据混入仍拒绝。原数值/账号检查直接复用，不重后台全套。

C在已登记新隔离QA保留旧函数/ACL/指纹后，原受控事务安装单函数补丁，实际读回函数和权限、更新本次目录身份并由原QB验证受影响差异。随后明确新job、沿原业务请求键执行已修订的STAGE；C67/C68保留且不重放。失败保留首个错误及提交状态，不换键绕过。

未执行任何初始化写入时，可受控恢复旧函数及匹配源码/指纹（恢复后旧格式仍有原缺陷）；产生新来源记录后不能仅回退函数而丢弃新事实，需保留记录和回执，按原版本配套恢复/前向修复方案处理。此确认不授权清数据、自动回填、正式库测试写入、真实49人导入或公网业务切换。

只有实际基线发布、原生商品CREATE及真实回执/读回完成，才推进原H06；源码、封装检查、health或空库元数据均不代表该业务通过。

确认范围：仅批准上述标准封装、原读写消费接缝及一函数后继补丁；不改变账号、权限或业务规则。其余开发、UI迁移、验收和部署准备持续。

施工细节补充：原0011/0016及已成功0026迁移文件均不修改；全新安装仍先原1..26、再应用同一显式补丁。完整嵌套类型、字段及分阶段回退见原D1 [详细确认补充](/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/backend/rapid-launch-20261022/D1/BOOTSTRAP-PROVENANCE-C67-CONFIRMATION-v1.json)。此为同一窄格式修复的具体施工说明，不增加权限或业务范围。
