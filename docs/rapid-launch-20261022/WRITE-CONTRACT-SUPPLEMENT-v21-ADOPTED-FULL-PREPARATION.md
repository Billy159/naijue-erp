# v21：采用固定完整来源准备产物

状态：待用户确认；四个预留文件未实施。此项仅影响新的来源证据消费分支，历史正常会话、商品只读预检与其他已批准工作继续。

## 本次只确认什么

允许在闭包暂存（CLOSURE）和导入发布（IMPORT_PUBLISH）的来源授权点，采用主控明确固定的 148 完整准备产物，替代再次从同一批 11 组来源重新计算完整 expected。provider 的闭包步骤与两个授权点共同消费同一份完整 EXPECTED，不各算一遍。

这是写入前**来源证明依据**的变化，依用户“依赖写合同变化先确认”提交；不是新增数据库写权限，不自动批准导入、发布或正式切换。不加表、字段、索引，不改持久 JSON、业务动作、约束或普通单据保存。

## 事实与固定输入

- 148 作业已经实际成功，退出码 0，耗时 4367.170767 秒；原运行单元已停止。未连接数据库、签发执行授权、执行 MAIN／PUBLISH 或切换应用。
- 来源准备基线：`3d99a4ab783c9ee566c20d1c23b85fee19b6b4c2`。11 组来源，14999 SKU，38303 库存基线，原已批准 24 仓零基线口径保留。
- DATA：316960 字节，SHA-256 `7d34bcf788003963696d203140072ea8ab4dba81c10bf4b1046c482aa65b0219`。
- EXPECTED：25987624 字节，SHA-256 `4c8ba7a200a84b59c9795b52351045fc231c0cd76cd9c312ede51c2826a2343a`；包含全部 42561 单据文档，不能只取摘要或根。
- DATA 的业务请求摘要是 `1acb9ed93d8e29aebd8f62b8cfbfbd26481aecb62dad370993d9754e6219b1e8`，与文件 SHA 不同，不混用。
- 原 109 条命令＝BIND＋107 ACCOUNT＋PUBLISH，全部原键、原命令体保留，按真实回执／审计／claim 链选未提交后缀，不从头重放。
- 输出 MANIFEST 已由原 T45 149 只读取得：同一 148 输出目录下 `MANIFEST.json`，39111 字节，SHA-256 `4645f3703d2888861257406e4824306a6ec919e324e4328eaddf94ccec464e12`。149 实际退出码 0，耗时 0.067839 秒，仅核大小及指纹，未解析正文；内容逐字段绑定仍是实施后的必验条件。输出清单不得与旧来源的 sourceManifestRef 混为一谈。

## 准入与保持项

1. 原主控外部执行授权必须显式采用 `adopted-full-preparation26`，准确绑定 148 成功回执、原准备 INPUT、输出 MANIFEST、DATA、EXPECTED 和 109 命令引用。禁止调用者直接提供 expected 对象、PASS 标记或旧部分结果。
2. DATA 的完整结构、请求摘要、CORE 回执／摘要、批次、命名空间、selection／cutoff、11 组来源 pins、数量和库存计划须与 BIND／PUBLISH／固定执行输入一致。DATA 是已核清单，不能冒充 raw contributors 重造原始来源。
3. EXPECTED 继续经过原完整 stage-input 捕获校验，核所有根及全部单据文档；任一文档、来源、版本、批次、授权或命令不符就拒绝。
4. 原 79 个非代码来源引用及其成员范围逐项匹配；其余来源推导 reader／helper／mapper／codec／runtime pins 保持原准备基线。只允许原 bindRealData 已定义的五处 payloadHash 接线变化，不通用删除字段后比较。
5. 新执行候选与 148 来源准备版本分别登记。仅这次已审的 provider／host 消费接缝允许成为明确后继：原基线模块、当前模块的实际字节／SHA、固定候选和 QB 审核身份都须由主控准确绑定。不能将整个 provider 从校验中排除，也不能声称任意未来代码与 148 同版。物理搬运如有变化须另有准确映射，不能忽略路径字段。
6. **数据库实际闭包核验原样保留**：真实成员、全部根、逐单文档、数量金额、库存守恒仍由原 PostgreSQL store 检查；普通行暂存的 source／native authorizer、父项、原键恢复、权限、事务与回滚不减。不改 SQL 或 store。
7. 仅对 EXPECTED 使用专属读取器：准确字节／SHA、原 stage 64 MiB 上限、regular/private/O_NOFOLLOW 与稳定 stat 校验。其他小文件原 4 MiB 上限不变。不得建隐性缓存、假结果或自动重算回退。

## 精确实施边界

- `scripts/import-v3/production-source-provider26.mjs`：`openProductionSourceAuthority26`、`createOriginalProductionSources26.preflight/steps`、原 authority 授权接缝；增加明确固定产物证据读取，CLOSURE 步骤返回完整已捕获 EXPECTED。
- `scripts/import-v3/production-source-host.mjs`：`captureNativeSourceSession26`、`openImportHost26` 预激活接缝、`authorizeClosure` 与 `authorizeNativeCommand` 的 IMPORT_PUBLISH 分支；核整个 EXPECTED／同一 plan，保留原 Pool 激活顺序与实际数据库验证。
- 以上各自的 `.test.mjs`：仅新增消费差异的有限测试。四文件唯一实施 owner 为原 D3，主控维护接续记录；其他共享文件不并发修改。

原默认分支保留。确认后先源码实施与有限检查，沿原 QB 一次增量审核；固定实际候选及授权后由原 T45 执行。错 pin／来源／代码／批次／某文档／命令／旧 partial 必须拒绝，未准入不得激活数据库。有限样例通过不代替真实入库和性能证据。

## 不包含在本次确认内

不修改原业务资料、冻结 Demo、旧编号、SKU、条码、数量金额或来源身份；不重跑 148；不绕过权限、原运维锁、实际数据库校验、备份恢复或原分批发布条件。未完成真实记账和发布仍如实记未完成。

## 审阅依据

原 D3 候选报告 `SOURCE148-SNAPSHOT-CONSUMPTION-CONTRACT.CANDIDATE.json`（13717 字节，SHA-256 `3a35353d3ebe500e913745d73db4a35c95835332e70e86d718f0141ff864a1d8`）；原 T45 148 完成回执及原 107 ACCOUNT 逐项引用沿既有目录保留。敏感配置、真实原件及大产物正文不进入 Git。
