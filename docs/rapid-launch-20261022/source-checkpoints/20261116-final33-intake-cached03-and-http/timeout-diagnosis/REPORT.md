# 收件超时：只读诊断

结论：057a 这一轮支持 **40秒“未收到新的已验证落盘ACK”先触发，随后15秒独立status查询也超时**；不是600秒上传总预算用完。009还有一个独立问题：finalize的15秒查询超时后，原键只读观察已是READY，客户端仍重新抛出超时，未把这条真实READY计入complete。这两个问题不能统称“上传600秒超时”。

## 准确时限与证据

| 时限 | 实际消费 | 已有事实 |
| --- | --- | --- |
| 40秒 | batch_protocol.py:16；batch_transport.py:22–48，idle只有合法progress回调成功才更新；batch_remote.py:17–26另作输入FD空闲上限 | 011本机最后ACK2文件时间2214.830839，receive失败观察记录2269.843074，相差55.012秒，吻合40秒idle加15秒status。授权本机launch记录2101.581，到该失败仅168.262秒；上传时钟在launch/install之后启动，远不到600秒。分支没有单独monotonic日志，因此这是时序与代码结合的归因，不冒称旧日志已直接记录IDLE分支。 |
| 15秒 | Transfer.query:58–61；status:76–77指定independent=True，finalize:134–145则沿默认共享ControlMaster | 009 finalize timeout记录的observed.status是READY、完整2MiB和原inode，结果仍抛出；011 receive失败时的独立观察是UNKNOWN_NO_REPLAY。query timeout不证明远端操作失败。 |
| 600秒 | batch_protocol.py:112–148，所有原片共用一次start_batch_clock；client:payload_parts循环不为每片重置；remote也锁同一uploadEndsAt | 前两组完整RESULT用时284.600/245.012秒，32个ACK跨度171.236/147.890秒，最大已见本机ACK间隔14.644/23.274秒。057a前18个ACK跨度75.429秒。600不是这次瓶颈，也不是每片600。 |

本机ACK只是已收到的确认下界，不是实际断点。057a的011本机仅2个ACK=512KiB；原RESULT准确只读原键已确认1MiB、nextSegment=5，012仍ABSENT。011远端自身fileIdentity的mtime从ACK2到后来确认的1MiB相差65.573秒，说明停滞期/确认丢失后仍可能有原接收过程推进；本机杀ssh子进程不等于已证明远端停止。不得回放ACK3或按512KiB重新发。精确断点、process/inode检查与恢复由主控/T45现有通道处理，本轮不执行。

前两组root install/withdraw各<0.5秒，无证据把问题归到root发布/撤销慢。ControlMaster=auto/Persist60已用于receive与finalize，不能再把“加连接复用”当修复；independent status按既有独立观察路径保留。网络RTT、丢包、磁盘fsync耗时没有独立计量，不推断某个物理环节已确诊。

## 代码判断

1. **已确认的分类缺陷**：batch_transport.py把hard到期、idle到期、select空返回全部报TOTAL_OR_DURABLE_PROGRESS_TIMEOUT，且wait阶段同名。不能从错误字符串区分600与40。
2. **已确认的结果消费缺陷**：batch_client.py:129–145在finalize异常后调用observe_failure，后者记录同原键status后返回None，finalize无条件raise。009真实READY被记录但不被消费。没有理由重放finalize；应按真实原键读回裁决。
3. **未发现具体parser/FD缺陷证据**：本地原stream代码验证拆行/粘行三个JSON ACK均完整消费。os.write使用返回字节数推进offset；stdout非阻塞os.read后循环逐行处理；远端send显式flush，chunk用原始FD，借给旧receiver的是独立BytesIO，原stdin在finally恢复。stderr为DEVNULL，不存在这一处stderr管道堵满。ACK不足可由远端写后尚未完成snapshot/send或链路响应延迟解释，不能直接判“缓冲吞ACK”。
4. 每个ACK前确实包括256KiB段读取、原inode排他锁、整段摘要、fsync、前缀读回、consumer进程检查与再次status，再经SSH返回。40不是“40秒没发字节”，活跃传输也可触发。只依据此次超过40秒确认空档，可判40对当前环境过紧；90秒只能是保守候选值，不保证已修复物理延迟。
5. **日志问题**：Transfer.observe_failure:132、main/finalize异常流以及transport的str(error)会把TimeoutExpired转换成含argv的文本，可能携带内联上下文。诊断与后继必须只记录类型、阶段、限时、已发/已确认数量和安全错误码，不打印或复制原TimeoutExpired argv。本报告和本地探针均未输出它。

## 唯一建议：保持串行，修正超时含义与READY读回

建议只采用以下一组增量，现行7pin本轮不修改：

- batch_protocol.py的STALL_SECONDS由40候选调整为90；同一值作用于client durable-idle和remote input-idle。仍使用原共享600 hard deadline、原uploadEndsAt、同原片/段/授权/时间窗；仅原合法落盘ACK续idle，不能用本机write/心跳续时。
- batch_transport.py在三个到期点先比较monotonic与hard/idle，区分UPLOAD_TOTAL_DEADLINE与DURABLE_PROGRESS_IDLE_TIMEOUT，保留实际阶段、elapsed、lastAckAge、已发offset/确认段数。select早返若两截止均未到只继续剩余等待，不能无条件误报超时。stderr/FD/行长约束不取消。
- **不直接把全局QUERY_SECONDS由15改40**。它同时进入CLOSEOUT_RESERVE_SECONDS=180+4×QUERY_SECONDS；现cached publish还硬核1040秒预算、MAX_WINDOW=1080。全局改40会联动需要1140秒的最坏组合，违反本次不扩窗。先保留15秒查询与原closeout预算，修结果消费：finalize超时时，用原有独立15秒status只读一次；只有完整原键READY且archiveBytes/sha、manifest/原artifact身份、同inode与原binding/authority配对全通过，才按“查询超时但原键已确认READY”记录并计入complete。未知、partial、占用或不一致仍UNKNOWN，不能转PASS、不能重发finalize/receive。现009的已有读回即支持这种修正，不必另开更长查询窗口。
- 保留root原“全部READY或授权到期并无receiver使用”才撤销的规则，以及same-inode/原prefix/原process guard。失败后的长等待可能是client:closeout等待授权到期，并非持续上传或新的600秒重试。不要为缩短画面等待移除这些条件。
- TimeoutExpired安全分类写入原evidence通道，避免str(error)泄露命令。只改获准的新版本并重新配对7pin/cache/权威，不热改在途已签版本。

## 为什么暂不并行4原片

不同原片有独立target/inode、段序与本机lock，原consumer guard按完整目标路径及FD识别，原则上不必互相抢同一文件；所以不能断言“任何并行都不安全”。但当前client显式串行，ACTIVE_TRANSFER/共享ControlMaster、子进程失败回收、同一个600时钟和root撤销条件未做并行验证；一个超时ssh对应的远端写者尚可能继续，直接扩大四个会放大未知断点和占用收口。前两组已在600内完成，尚无并行必要性证据。本轮建议不并行、不增平台。

## 一次本机局部验证与未验边界

local-transport-probe.py直接编译读取现行transport和Transfer类原代码，以本机假的clock/selector/pipe/query替代I/O，没有SSH、socket、网络、PG或原片读取：

- idle先到40秒与hard先到2秒均产生同一旧错误字符串，确认分类混同；
- 拆行/粘行3个JSON ACK全被消费，未复现parser丢ACK；
- finalize查询超时而status返回匹配READY时，真实方法仍抛TimeoutExpired，确认结果消费问题。

从仓库根运行 `python3 outputs/D1/20261116-r3-input-timeout-diagnosis-01/local-transport-probe.py`，输出在LOCAL-PROBE.log。这是原缺陷的局部模型诊断，不是新方案验证。若主控采用，必要后继仅在新副本对同一探针验证两个错误码可区分、READY读回可被严格消费、UNKNOWN仍拒绝，再做一次拆/粘行检查；不重跑PG、全量传输或已验两组。真实链路延迟根因及90秒候选效果仍未验证。

证据与7源码摘要见EVIDENCE.json；本轮0server/PG/build/网络演练/7pin修改。T45唯一客户端集成，主控决定是否采用并交现有QB窄核。
