# DB02 安装首错诊断 03（仅准备，未执行）

02 的实际终态仍为 STOPPED：155 函数及 35 表前驱匹配，安装原 DB02 时 psql 退出 3；原 SQLSTATE/错误文本没有导出，161 未读回、162 行场景执行 0。02 证据与 /tmp/d3-batched-core-20261115-01 失败根保持原状，旧许可已消费。

03 仅按主控新派工准备安装诊断，不使用旧许可。等待 QB 窄核及主控新一次决定；本目录没有 ATTEMPT 或执行结果，数据库执行 0、场景执行 0、服务器动作 0。

## 最小改动

沿用同一 base-install.sql、精确 12 层安装、真实 155 读回和原 DB-CANDIDATE-02/sql/source-slices.sql 字节。DB02 PINS 仍为 4589d0816e3ab24317a47263ac4c45a23fc13ee9b3bfd6795080affa6bcc6531，SQL SHA256 仍为 fd3d3edf05dbde10a26015858757d7985791202b0022500688504f68f64f86a4。D1 正在定位/准备的修订不会混入 03。

新身份固定为 /tmp/d3-install-diag-20261115-03、demo_8877_d3_install_diag_20261115_03、Unix socket 55493；旧根不复用。角色、base、12 层、PG/Node 二进制及依赖未改。

仅 DB02 安装 psql 使用 VERBOSITY=verbose，并改为同一 psql 会话依次 -c SET ROLE、-f 原 SQL 文件，以获得原文件行号。ON_ERROR_STOP 保持开启，原 SQL 不复制重写、不加分号、不修语义。其他安装输出不导出。DB02 安装失败即终止本链；若成功，只记录安装完成并正常停机，不核 161、不编译或导入 fixture、不跑 scenario、不验证 productionHost。

DB02-INSTALL-DIAGNOSTIC.json 仅在该固定安装子进程已退出且到达收集点时产生，整个文件最多 4096 字节：原 SQL 路径/SHA256、真实退出码、首个 ERROR/FATAL/PANIC 的 SQLSTATE/消息、原文件行号、可识别的 PL/pgSQL 栈帧和 server location。消息最多 1500 UTF-8 字节；上下文只留栈帧，不保留 SQL statement 文本。LINE/QUERY、SQL 回显、第二条错误、通用 stderr、bootstrap/私参/连接参数均不导出。无法解析时明确 firstError=null、diagnosticParsed=false，不猜 SQLSTATE；超时或先前安装失败可能尚无 DB02 诊断，依 FAILURE/CLEANUP 事实报告，不伪造首错。

守护和 02 finally 的全部内容逐字一致：工作 170 秒/总计 180 秒、allocated scratch 3 GiB、日志及回执合计 2 MiB；正常 SIGINT、失败 SIGQUIT，不 SIGKILL postmaster，实际停机/reap 确认，任何失败保留新根。新增摘要仍计入原日志/回执总限额。成功清理只可删本次独占新建的 03 根。

## 已完成的局部检查

check-diagnostic-memory.py 仅提取新诊断函数 AST，在内存中替换 save，检查首错/行号、跳过 SQL 回显和第二错误、UTF-8/4KiB 界限、未知错误不造 SQLSTATE、成功不造错误、拒绝其他源文件。同时确认原 finally 字节一致、场景入口已去除。它不启动子进程/PG，不执行 harness，不重跑旧测试。

INPUT-PINS.json 沿用 02 的 645 条外部摘要，重定位 5 条自身运行依赖，移除 03 不使用的自身 scenario 和 builder 两条。共 650 条；没有重审/重哈希旧 652 项。catalog-fixture.mjs/base-install.sql 原字节复用。运行前仍须核当前固定输入摘要；当前未运行此启动链。

INSTALL-DIAGNOSTIC-DELTA-03.diff 精确包含 runner、TARGET 和安装清单变化；PINS.json 绑定新准备件。旧 01/02 的结论、源码与输出不改。

## 待新许可的唯一命令（当前不执行）

```sh
python3 '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D3/20261115-r3-batched-pg-local-03/run-local.py' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/e5c5a762-cleaning-intake-20261102/complete-source-20261103-typecheck-20261104-01/actual-pg-browser-20261104-01/vendor-input/pgsql/bin' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/node_modules'
```
