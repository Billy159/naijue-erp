# settlement24 current-wire SOURCE 交付

状态：`SOURCE_READY_FOR_MAIN_SINGLE_NARROW_QB_REVIEW`。独立候选目录中的实际文件已核验，数据库未连接、未升级，不能据此解除 PUBLISH 限制。

## 修复结果

实际失败输入与批准原件字节一致。旧 SQL 将 24 单例外绑定到旧 raw `4b7181e4…`，因此在六参数 command 的 INIT 第 491 行拒绝当前批准 raw `b9782656…`。本次以 ROOT07 的 387 文件清单 `74de5cbf…`、host `36f5e49c…` 为底座，新增精确例外：raw、namespace、manifest 必须同时匹配下列批准批次；旧 25/27 和旧 raw 的 24/26 行为保留。

- raw SHA256：`b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05`
- namespace：`naijue:tplus:20261102`
- manifest SHA256：`7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679`
- 单据 / 结算记录：24 / 26；既有来源、原始字节哈希、证据使用、身份、金额及逐项集合核对保留。

3 个函数的 body / definition 变化详见 `ROUTINE-CHANGES.json`。仅改变六参数 `standard_whole_package_command_v2`、`assert_document_migration`、`standard_whole_package_verify_v2`；INIT、PUBLISH、迁移与最终读回均覆盖。其他 158 个函数、35 表 / 351 列 / 114 索引、owner / security / search_path / ACL 逐项保持。五参数旧 command、0035 / 0027 / 0028、旧 COMMAND 快照和旧单函数 catalog 断言原样保留。

## 新源码闭包

`operation/` 含 392 文件：387 个旧文件中仅 source / catalog / host 三个模块变化，另加三份快照、一个 PINS 和一个升级 SQL。新 catalog 位于旧 command catalog 之后，沿用原 source pins 和递归核对。host 两处当前 batched catalog 路径接入新 catalog。未触及前端、共享合同、T45 文件或 APP 产物。

| 项目 | SHA256 |
| --- | --- |
| source rows | `3b8b77e94e5799ad399b97767d48e2b25f7f972b64d957e9666a89bf73d6f69e` |
| compactZero sourceSet | `ac85caa5b8edc5768ffb8bd0f0668b0b9778b3c4be05c5498bbcd5ce45b1bbc3` |
| successor catalog sourceSet | `a5f721749c1c7e59ce532ea6a287a310b2604ccbc77e0f1f2f0d831c5a2f8f6e` |
| successor catalogSpec | `aefbfd2ea3425a7cf6f9ad7bd22f8f98d4a946d7a90cc0f3c75ea539fdea4f17` |
| successor model | `ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9` |
| new PINS | `faaa57ae44e67f9d70f43913db121aadc1ed98d64e9a6049f65244a2bf543c19` |
| upgrade SQL | `daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184` |
| guard SQL | `a977e4924e4eb90a2c38aaeefeb8cec168a5e370d3a855d16ac3f20b5fa09e58` |
| observation SQL | `17e83addc12c413a150dc72d8ae45cea60a328c37725a6a7441c7a1acbd415bc` |

元数据只使用真实 2026-11-10 target 收据及其历史 startsAt；目标摘要 `fe0b2fe5…`。当前时钟调用 0、native 入口 0、PG 连接 0。未构造未来 C / epoch / 角色 / 有限授权。新 model 与旧 `626c5604…` 不同；旧 source-lineage 不能证明新 SQL 已安装。

## 验证与边界

`CHECK-RESULT.json`：91 项新增分支 SOURCE 检查通过。直接提取生成 SQL 中实际判定表达式，检查批准元数据、旧分支、错误 raw / namespace / manifest、缺失 namespace / manifest、错误单据和结算数量、缺失证据使用；核对三个函数可逆精确替换及整个模型仅三组 hash 改变，另核 Node24 三个模块语法。`DERIVED-METADATA.json` 记录原有 catalog 链与新 source/catalog/guard/observation 的实际纯元数据派生。

SQL 未经 PostgreSQL 解析或执行；未声称真实 PG、完整业务输入读回、事务或重放测试通过。本次没有重跑 sealed18，没有读取大体积初始化载荷、重建旧归档或编译测量。

升级 SQL 仅提供未来受控应用所需的源码：在单事务中以 exact before body / definition 和实际 owner 校验，进行唯一锚点替换，再核对 exact after hash 与 pg_proc 其余元数据。没有业务 DML、schema/role/ACL 变更；本次没有执行。执行准入、目标绑定和真实前后读回仍由主控安排、T45 实施。

## APP 与后续

本次改变 native35 源码闭包。APP a7 及其 native / release / archive 仍为旧候选，不得冒充包含本次改动；D1 未重建 APP，也未修改 T45 配对材料。主控根据新源码 pins 协调必要的 native 闭包和真实三函数升级。

主控可对本冻结目录安排一次窄范围 QB 审查；D1 不自行派发 QB/T45。运行恢复仍需实际 durable DB 证据；原失败 writer key 不重放、不盲目换 key，不修改 businessOperationId。完整真实导入仍未完成，STAGED 隐藏及发布限制保留。

交付位于既有仓库分支 `codex/t07-foundation`，根 HEAD `deedf387b1bf3605c1a0a005ef35cdef825579a0`；本次交付是独立 outputs 候选，未提交、未推送、未部署。根工作区既有大量 WIP 未修改或归属到本次交付。
