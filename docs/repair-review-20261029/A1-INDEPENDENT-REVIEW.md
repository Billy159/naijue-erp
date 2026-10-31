# A1 健康和就绪发布合同 独立只读复审

复审时间 2026年10月29日 23时12分 UTC。针对原《奈爵 ERP 修复后架构与缺陷复查报告》A1，独立阅读当前部署与boot消费者、现有测试及既有原生回执。没有修改发布源码、hash pin、配置或审查票据，没有执行测试、部署入口、Docker、服务、数据库、生产或远端操作。本文是代码审查意见，**不是生产放行、pin更新批准或真实部署验收**。

## 结论

**当前A1的health与ready合同修正成立，未在本次限定复审中发现新增fail-open；原HOST_READY不兼容在源码层已修。旧pin拒绝新脚本仍有效且应保留。** 可进入另行授权的离线补测及隔离发布恢复验收；不能据4组离线测试或此文直接上线。

实际A1变更提交为`7a5e42ef`；所查业务HEAD为`1e946511855fb092c30d32370bd7e89af651e798`。A1修改部署helper和测试/说明，没有修改boot helper。boot当前字节与A1提交父版本完全相同。

## 实际文件身份

| 文件 | SHA256 |
| --- | --- |
| `scripts/release/deploy-candidate.py` | `86b54e6ab4ac840b673fa73e32330d2b10bd0a046b1cb3aaa7642304db930725` |
| `scripts/release/boot-entry.py` | `3193efbb1446aaa147c7f81b58b32be684e4492dc2514ba277fe37ef713623ca` |

其余输入、原报告和既有回执的路径与hash见同目录`INPUT-SHA256.json`。上述是所读源文件字节，不是服务器安装状态或批准签名。

## 合同及消费者逐项核对

1. **存活身份不冒充就绪**。`deploy-candidate.py:1784-1808`先请求`/healthz`，要求200、HOST_ALIVE、databaseChecked严格false以及精确sourceCommit/buildId；成功才对同一host/port发起新的`/readyz`，要求200/READY。仅收到HOST_READY、错误身份或NOT_READY均不成功，没有上一成功缓存，也不只改字符串冒充ready。
2. **边界有约束但不要混淆超时类型**。Node每响应按字节计数上限4096；JSON错误、HTTP非200、请求/响应错误、3秒socket超时退出失败。Docker执行本身10秒上界；最多15次Refused重试，每次等待1秒。`TimeoutExpired`等非Refused不继续假成功，由上层失败流程处理。独立loopback `:1811-1831`用固定127.0.0.1:18080、5秒socket I/O timeout，读取4097并要求不超4096、dict/身份及READY，finally关闭连接。未发现异常转换为成功或绕过ready分支。此5秒不是明确的整请求绝对deadline，见下文边界。
3. **stage**。`:2032`先直接app健康和就绪，再创建并启动私有stage-web；`:2036`经该代理再检查一遍。通过后才写`CANDIDATE_STAGED_HEALTH_ONLY_NOT_BUSINESS`回执，仍明确businessAcceptance:false。失败由`:2154-2170`仅尝试停止本操作标签的精确新容器并保留失败/未知状态，不恢复数据库。
4. **activate**。`:2092-2095`先验业务接受、写边界、精确stage产物及container fingerprint，并在停旧入口前经stage代理复查新鲜health/ready。启动新public-web后，`:2108-2109`再经public代理及独立host-loopback复查。通过仍只是`ENTRY_ACTIVATED_INTERNAL_HEALTH_ONLY_PENDING_PUBLIC_READBACK`；公网HTTPS、boot持久化和业务验收不被伪造为完成。
5. **boot arm与boot-start**。`boot-entry.py:560`在安装boot owner前经public代理调用同一已核helper的health；`:710`在启动入口前直连app，`:717`启动精确public-web后经代理再查。没有遗留内联HOST_READY消费者。host `production-application-host.ts:154,161-178`在draining时readyz为503，healthz仍只证明存活，符合该分离合同。
6. **代理不是成功伪造者**。`nginx_configuration():275-286`指向固定app，关闭proxy cache、next_upstream、redirect，原样转发上游响应；本次没有发现将NOT_READY正文/状态改成成功的代码。

## 旧pin拒绝机制

`boot-entry.py:29-35`当前4个允许值为：

- 基础：`a03a8bd34f68b2df1589a4c057a4bb8315368205b0842fc4856bb2aa882fad5a`
- exact26-r1：`3e9a642f82a5355b797135fc13e5012b502e8b0bd08fbd6481e1f93b82de596d`
- capacity：`cb3c146b29d0becc50485d57891d774884905110eb635c99610d50d5a94e23da`
- full：`a2c149cd7543b82c76b249c975d01d6961d22a3fd0bb2ec26b3797e077bbe578`

当前deploy的`86b54e…`不等于其中任何一个。`load_plan():267-276`先按hash-bound部署计划选择允许pin，要求deploymentTool声明等于该pin，再由`reference():94-99`核真实bytes hash，最后直接compile/exec这一份已核bytes，而不是重新按路径import。因此：

- 用新deploy hash声明：在`REVIEWED_DEPLOYMENT_HELPER_REQUIRED`拒绝；
- 用旧pin声明、路径却提供新bytes：在`REFERENCE_HASH_CHANGED`拒绝；
- 真正提供旧已核helper：属于旧helper身份，不是新A1获批；对当前ALIVE响应的旧不兼容也不会被新代码暗中回退绕过。

`main():787`先load_plan，之后才可能执行部署动作。没有发现新helperhash未经该门禁便进入arm/boot的路径。本次没有改pin、生成假独立审查JSON或把此Markdown当成允许值来源。

## 失败恢复及部署风险边界

- `activate():2125-2137`失败时保留错误，先读取精确旧web状态；只在确认旧入口已停且`restore_old_entry`守卫通过时恢复旧web。不重放未知Docker启动/停止，不做DB restore。
- **不能承诺任何失败都会自动回退旧入口**。exact26-full的`full_write_boundary(...restore_old=True):1892-1926`要求已关闭全部写入口、零in-flight、零新业务写、drain后快照、old兼容性，以及包含候选app在内的所有精确writer确实已停止且restart=no。候选app仍运行、新写或结果未知时会拒绝恢复。此时失败状态需要operator；这保护数据，但可能留下入口不可用或需人工关闭检查。应在隔离恢复演练覆盖，不把它误报成自动回滚成功。
- `boot_start():718-728`在启动后health失败时只读取精确新web的结果并尝试一次安全停止；不反复启动、不自动启用旧入口，无法确认则置requiresEntryInspection。该保守行为符合不猜未知结果的要求。
- health/ready是两个顺序观察，不是永久健康保证或一份原子业务接受；READY之后仍可能drain。不能删去已存在的write-boundary、候选接受、backup、runtime/capacity及外部HTTPS回读要求。
- **可复核的健壮性边界**：loopback的Python HTTPConnection只配置socket I/O timeout，没有与Node侧Docker.run同等的明确整体wall-clock截止。响应持续慢速送字节时，不能仅据timeout=5宣称总耗时不超过5秒。本次未重现慢滴流，不将其升级为已发生部署故障；隔离故障验收应覆盖该情况，并由owner明确整个activate执行预算。此点不改变ALIVE/READY兼容性已修及失败不返回成功的结论。

## 既有测试能证明和不能证明什么

已有`report-batch1/a1-green.log`为4组实际原生离线测试通过、exit0。测试AST只提取实际`health`/`loopback_health`，在Node vm中的封闭HTTP double运行嵌入probe；检查直连/代理、身份、非200、NOT_READY、坏JSON、超大响应、错误/timeout、新鲜复查、消费者调用数量及loopback关闭连接。原RED保留。此次仅阅读，没有重跑。

该测试**不证明**Docker、真实HTTP socket行为、真实draining交错、完整消费者副作用顺序、生产代理、备份恢复、系统启动或任何业务PG链路。消费者调用数量断言本身不证明调用位置；本复审另外逐行核对了上述顺序。

另发现现有`test_capacity_launch_wiring.py:190-192,581-582`仍要求当前deploy hash等于旧capacity pin。按本次真实字节比较，这两个相等表达式不满足；**未执行这些测试，不将它们伪报为已运行FAIL或全release测试通过**。它们应在独立批准新的helper身份后同步治理；不能为了让测试绿而提前更新pin。

## 后续建议与停止条件

1. 由发布owner按正式流程独立确认准确helper bytes、适用runtime/plan、backup/write-boundary和目标后，才考虑新pin及相应测试。本文不替代该授权。
2. 授权隔离环境补真实health/ready、错误身份、NOT_READY/draining、代理及loopback、旧pin拒绝、启动后失败/未知结果和恢复守卫演练。保留旧失败，不在生产做实验。
3. 通过后仍须具体影响、备份、回退与生产切换确认；当前用户的“修复所有报告问题”及临时PG授权，不自动授权本次生产部署。

未发现可复用的同版独立A1复审；既有A1.md是实现说明和测试边界，已复用其回执而未重复执行。工程要求引用的`/Users/billy/Desktop/Workspace/agents.md`及同级接手control文件在本云端路径不存在，普通ENOENT；没有尝试Mac或权限绕过。
