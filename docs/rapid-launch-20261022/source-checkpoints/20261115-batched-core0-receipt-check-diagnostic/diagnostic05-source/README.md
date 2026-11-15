# 05：CORE 第 0 项首错诊断（仅准备，未执行）

04 实际安装及 161 函数读回已通过，随后 CORE ordinal0 STEP 返回 23514，原场景断言覆盖了错误消息。04 许可已终态消费。05 独立准备，不使用旧许可；等待 QB 对准确差分窄核及主控新的单次决定。当前 PG/fixture 编译/导入/场景执行均为 0。

## 窄范围与准确输入

新独占三元：/tmp/d3-core0-diag-20261115-05、demo_8877_d3_core0_diag_20261115_05、Unix socket 55495。01–04 和已有失败 roots 保留不动，不重启旧实例。

安装仍为原 base35+精确12层+真实155读回，再安装 D1 DB-INSTALL-FIX-03/PINS 5ad8de721794d1135554b01fb2481e530c74b4398b035e320d00fad8c620431a、SQL 07dc375787429ea70ed86c038aec1b3d2fbda38925bc4a97785bf68d834979ef。真实 161 期望仍显式取旧 DB02 未变原模型，未复制/伪造 FIX03 完整模型。原函数、输入、角色、base/catalog 和 D3 kernel 字节均不改，HOST/genuine 不参与。

core-step0-diagnostic.mjs 先核实际 161，经原 compileFixture 的当前 162 行 pipeline 生成原 plan；仅取首个原 CORE descriptor 和 ordinal0 请求，核 CORE.first/last=0 及原 operation_id 端点。连接原受限 controller，核原权限 flags 全 false；BEGIN 后调用真实 createBatchedStreamSqlKernel.lockAndInspect，要求新实例 ABSENT，再调用原 applyStep。原适配器在真实 STEP 前 SET LOCAL ROLE INITIALIZER，传原 identity/descriptor/ordinal0/INITIALIZE/request 和原私参，均不导出。

没有 kernel.complete、COMMIT、MASTER/HISTORY、后续 batch、提交故障注入或六场景入口。STEP 若成功，记录 stepAck=true，并实际核 ROLLBACK ACK，随后停止；这仅是 STEP_ACK+ROLLBACK，不代表提交、业务导入或六场景成功。首错即结束该探针；无论成功或失败，已开始事务均尝试确认 ROLLBACK。原 SQL 错误在 query catch 当场保存，rollbackFailure 另存，不被之后的应用异常覆盖。角色/inspect 等先失败则按实际 queryKind 报告，不冒充 STEP。

## 首错安全字段

CORE-STEP0-DIAGNOSTIC.json 整份上限 4096 字节，Python 保存前再次核上限。firstFailure 仅白名单字段：phase、ordinal、queryKind、SQLSTATE、首 message、messageRedacted、constraint/table/column、最多 3 个可识别 PL/pgSQL 函数行帧。CORE STEP 真实错误标为 phase CORE、ordinal0、queryKind STEP；不再使用 HALF_GROUP 预设标签或随后的 AssertionError 代替原数据库错误。

message 最多 1024 UTF-8 字节，原请求/identity/descriptor 叶子字符串及原私参命中会替换，单/双引号值替换；SQL 关键词、参数占位符、换行或私参格式可疑消息直接留 null 并标记已过滤。正常固定消息原文保留。constraint/table/column 仅接受最多128字符ASCII标识符。where 只选取严格识别的函数签名/行号/操作标签，最多3帧；原 where 不输出。DETAIL/HINT/SQL/query/internalQuery/参数/行数据/通用 stderr/凭据均不复制，不建通用日志平台。无法获取的字段为 null，不补造。

原 03 固定安装首错诊断和 04 的安装调用完全复用；本次仅新增 CORE 错误投影。若前置安装先失败，依原阶段和安装诊断停止，未走到 CORE 就保持未测。

## 资源与收尾复用

04 的所有 runner 函数及 02 起的 finally 逐字一致；只替换运行入口、目标三元和结果判定。170秒工作/180秒总时限、statement40000/response42000、allocated scratch3GiB/512MiB余量/50ms采样、日志和安全回执合计2MiB/最终16KiB预留保持。正常 SIGINT、失败 SIGQUIT，从不 SIGKILL postmaster；实际 stop/wait/reap、所有失败保留本次新根。只有 STEP_ACK、ROLLBACK、最终停机/回收及全部资源条件都确认成功，才删除本次独占新根。

## 新增检查及依赖

check-error-fields-memory.mjs 仅导入纯过滤函数，内存检查字段白名单、准确 CORE/0/STEP、过滤 DETAIL/SQL/context、3帧限制、私参及引号值过滤、SQL/换行消息省略、元数据标识符、UTF8界限和不将 ERR_ASSERTION当SQLSTATE。已通过，无 PG/harness/fixture 调用。新探针只做 Node --check，runner 只做 Python AST 解析，不执行启动链。未重跑旧测试。

INPUT-PINS 654条：04的647条外部摘要原样复用；5条自身原运行依赖重定位，移除原scenario，加入本次probe/filter2条，共7条自身运行依赖。不重哈希/重审旧外部闭包。INSTALL-BINDING.json 保留原FIX03安装/DB02模型区分；DELTA-04-TO-05.diff 包含 runner/TARGET/安装清单和两份新运行文件的准确差分。执行前原启动代码仍核固定输入；当前未执行。

## 待 QB05 和主控新一次决定的唯一命令（不执行）

```sh
python3 '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D3/20261115-r3-batched-pg-local-05/run-local.py' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/e5c5a762-cleaning-intake-20261102/complete-source-20261103-typecheck-20261104-01/actual-pg-browser-20261104-01/vendor-input/pgsql/bin' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/node_modules'
```
