Source03 仅为准确失败后的独立后继源码；本轮0签发/时钟/服务器stage/CAS/容器/PG/提交。主控明确的新诊断键为 `t45-r3-core0-durable-readonly-20261117-02`。原writer和诊断01均已消费，保留FAILED，绝不重放。

实际原因与本次修复：诊断01的真实安全投影 be9c9c6c… 显示 worker main235 在 FIXED_ISOLATED_ROOT_ENTRY_REQUIRED 拒绝；已登记dispatcher45914的Python启动参数仅-s。Source03只为新键02在dispatcher选择 `/usr/bin/python3 -I -S`，其余Python旧作业仍-s，非Python入口不变。worker原隔离校验不删、不弱化，inside也仍-I/-S。只有这项入口修复及必要新身份/pin链变化，不全局调整旧执行器。

Root底座是实际45914/旧诊断01 module0fb/政策b1。原108键、三处guard、旧诊断01工厂/module/policy/分支、ROOT07、normal38/39、原writer及全部原函数保留；新键02加入保护列表至109。原函数只允许execute中的新键分支和该键argv选择变化，新增独立factory不覆盖原factory。

独立材料：

- public新module `r3_core0_durable_readonly_02.py` / class DurableReadonly02Continuation / 独立factory durable_core0_02_continuation。
- 私密policy `r3-05-write-continuity/core0-durable-readonly-20261117-02.json`；模板新policyPin=None，实际签发前不能运行。旧01 policy和module保留。
- Root ENTRY `/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-core0-durable-registration-source-20261117-02/register_exact.py`，独立AUDIT同前缀registration-cas-20261117-02，PENDING为.core0-durable02-dispatcher.pending。
- Main私密目录 `outputs/主控/20261117-r3-core0-durable-readonly-window-02`。原7参API不变；先完整校两份真实basis/hash/身份和全部静态材料，再Main唯一stamp并检查两份age<=120s。CAS300秒/phase900秒，不延旧窗口，不在runtime自签。
- 三固定程序材料加实际历史证据 `bundle/prior-diagnostic01-failure.json` 共4静态成员；真实host authority为第5成员。原08954client/42943loader/原parser+collector+request constructor+main复用，CLI固定prepare/run，不收任意key/path/SQL/role/DSN。

历史证据绑定：原诊断01 FAILED终态8e8af939…/exit1、执行worker b65d7c50… 作为Root PRESERVE不可改事实加入fresh/CAS核验；已实际取得的be9安全投影逐字保留并绑定为静态bundle证据，worker核验其requestKey/ValueError/entry guard。本例没有cleanup回执，程序不要求它存在；当前C零匹配不能证明历史未创建，历史容器状态保持UNKNOWN，不构造fixture。Root01登记和失败材料不覆盖/删除。

完全复用的范围：固定SQL1e1ece61…（BEGIN RR READ ONLY /一个SELECT/ROLLBACK）、原R3 PGDATA66304:13502421/uidgid61035/mode0700、SID7706545564479176741/OID16393/PG170011、35counts/3prosrc before cc11/508188/8e490和old626；原image6de/readonly事务/挂载/原父FLOCK和service lock/权限/28GiB/300=210+90预算均不变。0角色/口令或业务权限修改。PGDATA仍须RW用于实际单用户启动/关闭/control/WAL/hint，0业务DML不是0物理文件写。新CID/StartedAt仅真实create后验证，未来None。新SQL三函数升级/新writer/APP不在本范围。

本次仅增加新键实际argv选择和worker flags合同的本地定向证据，以及old108/三guards/原函数/pin派生检查；不重跑固定SQL和旧58/45范围。没有Root、PG或容器正例fixture。本地Python flags验证不能冒充真实Root入口、单用户查询或cleanup通过。

后续静态通道/argv/原诊断键只读observer会在取未来fresh前准备完成。先由Main交同QB窄审，准确PASS后才允许真实fresh；两份成功报告优先立即回实际绝对path/SHA/checkedAt，Main沿7参一次签发，再单独授权CAS和新02一次诊断。UNKNOWN只按原AUDIT/02原键读取，不自行重放或续窗。Root08 WIP待本次诊断实际根，不与它并行覆盖。
