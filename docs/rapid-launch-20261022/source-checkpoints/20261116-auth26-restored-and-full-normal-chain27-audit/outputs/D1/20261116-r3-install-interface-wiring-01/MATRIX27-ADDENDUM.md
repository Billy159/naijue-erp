# 27 安装接口增量结论

结论：**SCOPED SOURCE INCREMENTAL PASS**。准确 27 冻结包相对原 26 矩阵的安装段差分对应，未发现新增的安装调用、字段或路径冲突。此结论只覆盖下表实际源，不表示 27 已签发、启动、安装、导入或业务验收通过。

原 [MATRIX.md](/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/D1/20261116-r3-install-interface-wiring-01/MATRIX.md) / EVIDENCE.json 保持原字节，作为 26 基线。本补充将安装段版本绑定推进至 27；原列出的现场证据缺口继续保留。主控最终登记、签发及只读描述入口的配对仍由原 owner 收口；writer 与启动失败/恢复修复由 QB 沿既有分工审查，本次未重复审。

- 27 根目录：`outputs/T45/revisions/20261116-r3-full-normal-chain27-local-01`。
- PHASES27.UNISSUED.json：`494be6fee14f1062c817a2311c9b96dcdf75467433a9d4579f1aed205f398afe`。
- OPERATIONAL-DELTA27.json：`84f44fa87cac72678273f997234dcf049232b6dd87970945358e9dcc99cf1052`。
- 保留原 install key `t45-r3-batched-install-20261115-01`、OP/source7033、原保护安装记录、原 capture 路径与业务批次；没有改名重试或放宽授权。

| 原矩阵段 | 27 实际变化与对应消费者 | 本次核对及结论 |
|---|---|---|
| boot/start/install caller | start/bundle 与 install/bundle 的 batched161-run.mjs 均为 `adb0a63cb3d681d8702a737185648b9afbe9738ac9721dde55ecc92beada7ad1`；只将固定 current-service key 的尾号 26 改为 27 | 与原 f69e 全字节差分仅此一行。PHASES 两处 runner pin 与 start 主脚本 L577 的复制 pin 相同。27 boot 实际复制尚未发生，不冒称已有 boot 字节证据 |
| target/compile/授权/13ACK/catalog/RESET/close | caller 其余字节不变；D1 源、SQL、模型和九字段接口沿既有结论复用 | 未重新遍历 source7033、运行 D1 factory、SQL、模型或原生连接。此次 caller 差分没有修改接口参数、outer 深相等校验或完成状态消费 |
| host → apply/custody | install/bundle/batched_install_host.py 的 START 为 start27；private_admin 读 `t45-r3-ordinary27-auth-apply-20261116-01` 的原回执及 `HOST/state/native-services/ordinary27-auth-20261116-01/<admin>.json` | 与 apply 原生产配置的 requestKey/CUSTODY 对应；原回执 SHA、COMPLETED/0、有限到期、root0400、固定连接字段校验不变。只读源码，不读私密内容 |
| host → policy/投影 | host 读 `direct27-batched-real.json`；新私密父目录 `HOST/state/batched-install27-private`，KEY/scratch 仍由原 producer 独占新建；host hash `3346cc684a5fdda483f00329a165908fcd3bada123aca122e49b4f6f661bef37` | 相对26仅 START/apply/custody/policy/privateprojection 和 PINS 更新；其余字节相同。authority leaf 随 START 落 BOOT27，仍沿原 authority mount，九字段 fixed protectedDestination 不变 |
| transport → current C/子进程 | install/bundle/private_transport.py 的 START、`fresh35-current-production-service-v2-service-27.json`、子进程 `STATE/batched-install27-private/KEY` 与 host 对应；hash `8bb5a667b9a107d20c21d3c6e8bd3e2c0fc5692c49017fe27ea5c27a1548f895` | 相对26仅三处代际替换；保护 C hash/service/container/epoch/lease、700秒 child/80秒收尾、FIFO、root、reap 与清理逻辑原字节不变 |
| 依赖及清单 | 安装5件 actual SHA 与 PHASES27 完全一致；host 内4项 PINS 与实际依赖一致；support helper 的 main/proof/readonly 三 pin 指向准确 start27 源 | helper 仅三 pin 改动；carrier 字节未变。本次不重审 helper 业务行为、writer、启动失败和恢复逻辑 |
| 描述 → 主控 issuer | 旧 `describe-install26-readonly.py` 仍固定 PHASES26/C26/BOOT26；在本次27冻结目录尚无对应27描述 wrapper | **未闭合，owner=T45/主控既有 final pairing**。须提供并使用准确27描述入口及相应主控 issuer；不得直接沿用26。已回报两位 owner，不执行签发/描述调用、不增加演练门槛 |

本次通过本机字节差分、少量指纹与 Python 静态语法/常量解析核对上述路径；未导入或运行这些 operational 模块。具体文件与断言见 EVIDENCE27.json。

边界：0 服务器动作、0 PG 连接、0 issuer/root factory 调用、无 UID/时钟模拟、无运行源码修改。现场 capture absent、真实 C27/epoch/admin、13 ACK、catalog、RESET、close/reap、授权移除和外层停库/认证恢复仍只认实际回执。
