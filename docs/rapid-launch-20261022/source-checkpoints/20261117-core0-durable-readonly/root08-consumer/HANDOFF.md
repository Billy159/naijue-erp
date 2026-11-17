# Root08 SOURCE-only 物化 consumer

本目录只交付本地源码准备，不代表 Root08 已在服务器就位。`bundle/materialize-batched-source.py`、固定 `bundle/source-profile.json`、392 行源码清单及八份 delta asset 已形成具体交付；未修改冻结 Source768、Root07、T45 durable WIP、前端或共享合同。

## 固定范围

- 唯一目标 key：`t45-r3-batched-root08-source-delta-20261117-01`。
- 唯一新目录：`/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root08-20261117-01/operation`；目录已存在时拒绝执行，不覆盖 Root07 或 Data。
- 父实际 Root07：387 文件 / rows `74de5cbf…` / operator sourceSet `f9a7f170…` / marker `84599588…`。
- 新源码：392 文件 / rows `3b8b77e9…` / compact sourceSet `ac85caa5…`；只替换 source、catalog、host 三叶，增加 SQL / 三快照 / PINS 五资产，其余 384 继承父证明，不重新深 hash。
- Source768、Main3b 决定和 QB976 窄复核报告绑定在固定 profile 中。新模型 `ada8f334…` 不同于现库旧模型 `626c5604…`；旧 lineage 不证明新三函数已安装。

父 worker `666adbbb…` 是固定 Root07 实现，不能直接靠新 profile 字节复用。新 worker 保留其 `need/trusted_parents/read/write/pack/encode/validate` 七个 helper 字节，只改新目录、八叶差异、实际 closed39 前提及 SOURCE marker 含义。`ROOT07-TO-ROOT08.patch` 可直接审查差异。

## consumer 行为与保护

未来受控执行时，先核 externally supplied finite authority、worker/profile digest、父真实 marker 和父 rows。三叶核 exact before SHA，五新增路径须在父树不存在；八份新资产逐一核 bytes/hash。384 个不变文件只从 root 保护的旧目录复制并核长度，沿用既有父证明。保留 28 GiB 余量及 300 秒固定物化预算。

当前原 writer 已 FAILED，不能沿用 workerNeverSubmitted。worker 消费真实 writer root terminal/result（native CLOSED 及四项 cleanup）、STOP39 与精确 RESTORE39 root receipts；历史本机接受证据 `dbd5 / 0fd9 / 35fa / b8b2` 固定在 profile 中。执行前后只读列出两 grant 的活动 operation unit，除本 job 自身外须为空；Data 原 identity 和 postmaster.pid 缺失继续核对。

DATA、原件输入树、原 initializer、计划文件、原 admin custody、失败 native 结果和 original39 五份恢复快照只记录执行前后 stat9，相等才写完成 marker；不读取这些业务/认证原体。源码复制不改变 Data。未知 durable 继续记为 UNKNOWN，不要求或伪造“历史零业务写入”。marker 中 databaseWrites=0 仅指本源码物化动作。

旧 `6c7653ba…` catalog35 runner 只从 Root07 读取、核 pin 并复制为继承代码文件；绝不执行或导入。worker 唯一外部命令是只读 systemctl unit 列表，没有 Node describe、PG/SQL、容器、服务启动、issuer、reader 或 CAS 调用。

未来完成 marker 的状态为 `SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED`，明确 SQLUpgradePerformed=false、importReady=false、oldLineageProvesNewSQLInstalled=false、businessDurableState=UNKNOWN。本交付没有生成实际 Root08 marker。

## 验证与下一步

`CHECK-RESULT.json` 39 项本地窄检查通过：八叶 hash/长度、新旧 rows 元数据、固定 key/path、实际 profile pin、旧七个 helper 字节复用、错误 key/path/count/重复/缺失/越界/旧 pin/额外叶拒绝及 Python 语法。只在独立 AST 命名空间执行两个纯差异函数；未 import worker、执行 main 或建立未来正向授权样例。没有运行复制作业、服务器、PG、Node、issuer、clock，也未重验 sealed18。

实际来源补充 `V/WRITER39-REFERENCE-SOURCE-METADATA-READONLY-01/ACTUAL-REFERENCE-SOURCE-METADATA.json`（SHA `77137b5d…`）已由 T45/Main提供：26 条结算 / 148 个 source refs、manifest raw7eb 及来源引用关系实测，未做完整语义/金额/身份/持久状态验证。此为后续可复用事实，不改 Source768、旧检查或本次 server=0 边界。

Main/T45 后续在 durable 工作完成并取得真实当前 basis 后，才具体化 Root08 单 key 的 root admission/注册以及必要有限物化授权。本目录 `ROOT-REGISTRATION-INTERFACE.json` 仅描述接口，没有 dispatcher digest、CAS 操作或注册完成声明；不把旧 eab 当未来 root。原 writer 不重放、不盲换 key、不改 businessOperationId。真实三函数升级、APP/native 后继闭包与导入恢复仍另由 Main/T45 处理。
