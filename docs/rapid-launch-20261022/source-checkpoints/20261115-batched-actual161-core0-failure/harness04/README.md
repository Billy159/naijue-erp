# 04：修订安装后恢复原 162 行六场景（仅准备）

当前未执行、无 ATTEMPT。等待 QB 对准确 04 runner 差分窄核，以及主控新的单次运行决定。FIX03 的源差分前置已由主控通知 QB scoped SOURCE DELTA PASS；该结论不等于 04 已运行或 161/六场景通过。

03 实际首错为旧 DB02 第 3126 行 REVOKE 附近语法错误，SQLSTATE 42601、psql exit3。01/02/03 原件、结论及两个已保留的失败根不改、不重启；03 单次许可已终态消费，不能用于 04。

## 准确来源与最小差分

04 沿 02 完整安装及六场景链，加入 03 已核的固定安装首错诊断。新三元为 /tmp/d3-batched-core-20261115-04、demo_8877_d3_batched_20261115_04、Unix socket 55494。角色、base35、12 层、155 前驱读回、PG/Node 二进制和传输库不变。

安装文件明确为 D1 DB-INSTALL-FIX-03/source-slices.sql，SHA256 07dc375787429ea70ed86c038aec1b3d2fbda38925bc4a97785bf68d834979ef；FIX03/PINS.json SHA256 5ad8de721794d1135554b01fb2481e530c74b4398b035e320d00fad8c620431a。它相对父 DB02 仅在第 3124 行末多一个分号。父 DB-CANDIDATE-02/PINS.json 仍单独绑定 4589d0816e3ab24317a47263ac4c45a23fc13ee9b3bfd6795080affa6bcc6531。

TARGET.candidate02 明确保留旧 DB02 目录，catalog-fixture.mjs 和 scenario.mjs 从这里读取原 EXPECTED161-MODEL.json；原 EXPECTED161-DEFINITIONS/BODIES 也仍按旧输入摘要保留。TARGET.installFix03 仅指安装修订目录；没有假定 FIX03 存在完整模型，也没有将旧模型复制成修订模型。INSTALL-BINDING.json 记录这两个来源。HOST/genuine 载体不进入本次依赖或场景。

base-install.sql、catalog-fixture.mjs 和 scenario.mjs 与 02 字节完全相同。03 的 run/安装诊断逻辑复用；诊断函数仅更换唯一允许 SQL 路径及描述范围标签，解析/过滤/4KiB 界限逻辑不变。02 的 finally 逐字一致，guardian 全部沿用。DELTA-02-TO-04.diff 和 DELTA-03-TO-04.diff 精确给出 runner、TARGET、安装清单差分；从 03 新增恢复的 scenario.mjs 是 02 原字节。

## 原六场景范围

1. 真实读取 161 函数及 35 表库存，逐项核 body/definition/owner/ACL；期望来自旧 DB02。
2. CORE 与多个前缀实际提交；HISTORY 半组 COMMIT 被拒并回滚，新连接原锁 inspect 核前缀/失败组状态。
3. 原组真实提交后在 pg.Client 已收到 ACK 与协调器之间抑制回复，协调器 UNKNOWN/discard；新连接查到 COMMITTED。它不是网络断包测试。
4. 原错误 descriptor/input、privileged foreign actor、兄弟前驱和 source_key 重放拒绝；actor 仍是原 privileged foreign session，不扩称同权限第二 controller。
5. 同一原键恢复，跳过成功前缀和 HISTORY，仅 FINALIZE；原 receipt/key 和 HISTORY 单一 xmin/无重复事实保持原合同。
6. 原新连接 reconcileWholePackage/verify_v2 与确认 ROLLBACK，核原数量/金额/库存/单据关系，FINALIZE 后才发布最终 receipt。

以上是原 scenario.mjs 六项，不增加用例、不更改原请求/输入语义。162 行原 smoke-base、manifest d0ec7f649304d9f0e069f1e9d0f527e72c1d4bd4cff85f9cfc26c156377e254e 保持。当前没有编译/导入 fixture；无真实数据、全量、productionHost、genuine 或服务器动作，businessReady 不由本结果改写。

## 限额、诊断及失败收尾

工作 170 秒/总计 180 秒，statement 40000ms/response 42000ms，allocated scratch 3 GiB、512 MiB 提前停机余量、50ms 采样；日志和安全回执合计 2 MiB、最终回执预留 16 KiB。Unix-only、空 PG 注入环境和本根空 pgpass、原受限角色和权限不变。

只对固定 FIX03 安装 psql 使用 VERBOSITY verbose、ON_ERROR_STOP，-c SET ROLE 后 -f 原 SQL。DB02-INSTALL-DIAGNOSTIC.json 文件名为延续诊断协议，实际 sourceSqlPath/SHA 指 FIX03；整个最多 4096 字节，保存真实退出码、首个 SQLSTATE/消息/源文件行号及可识别栈帧/LOCATION，不导出 SQL 回显、LINE/QUERY、SQL statement 文本、通用 stderr、私参或凭据。未知则 null，不猜；如尚未到收集点或超时，不伪造诊断。新增摘要计入原总限额。

第一安装或场景失败即结束该链，不重试、不接新场景。正常 SIGINT，失败 SIGQUIT，postmaster 从不 SIGKILL，实际 wait/reap 和 pid 文件核验；所有失败保留本次新根。只有全部成功且停机/回收、资源条件确认，才删除该独占新根。RESULT、CLEANUP 和实际进程 exit 共同判断终态。

## 静态依赖复用

INPUT-PINS 共 653：03 的 645 条外部摘要原样复用，5 条自身运行依赖重定位，恢复 1 条 02 原 scenario，新增 FIX03 PINS 和 SQL 两条。没有重哈希/重审旧 650 外部闭包或重跑旧测试。运行前原启动代码仍核固定输入；当前未运行。

本次只做 Python AST 解析、finally/guardian/原六场景和诊断逻辑静态等价及来源绑定检查，详见 STATIC-CHECKS.json。03 的定向内存诊断检查与旧语法/模块解析成果按不变范围复用，不重跑。实际 161 函数数量及六场景仍未验证。

## 等新一次决定的准确命令（当前不执行）

```sh
python3 '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D3/20261115-r3-batched-pg-local-04/run-local.py' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/e5c5a762-cleaning-intake-20261102/complete-source-20261103-typecheck-20261104-01/actual-pg-browser-20261104-01/vendor-input/pgsql/bin' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node' '/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/node_modules'
```
