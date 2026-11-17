# Normal39 / outer05 根侧源码交付

本目录是本地 SOURCE 交付，不是注册、运行、数据库或正式业务验收。绑定主控 DECISION 247e9972441b302fbd6d6399b978792e08a9a834c24b33f7565588c933ed9a4b；只接受 T45 最终 consumer02：SOURCE dd4a1ba183163c8a4c2e2a85f2dce52124530da945987da63976d21534b488da、INTERFACE 0aadc5be5ccda5551924779bb5998fc0e30e3a21ea554817ce6d428fed43fb63、PHASES da36a2529a471d3b43cfb4ac7a8a45ab35c2c30387c3249788ed834af592928f。旧 consumer01 973b 不得签发或运行。

实际当前 dispatcher69 / 原 normal38 helper3b7e 与 policy51da / 已完成 ROOT07 adapter76f8 与 policyb87f 全部保留。新模块独立包裹原 normal38 factory；102 项前缀原样，仅追加 apply39、start39、prepare05、stop39、restore39 五项，形成107；writer 的既有业务键不变，但六项均优先进入新 normal39 admit，不能落回旧正常链。三处 guard、旧 ROOT07 adapter 和其他旧函数均保持 AST 不变。安装32、INPUT02、ROOT06、ROOT07、catalog35、失败01–04只作不可重放历史。

新历史检查读取实际38五阶段 typed 结果及 ROOT07 完成回执；失败04仍为 native/connection UNKNOWN，进程已回收不改写为原生连接 CLOSED。五份38私域认证快照仅核 stat 九字段，不读取内容或摘要。历史检查不要求共享 PGDATA 继续停库，不读取旧 /run current 指针；当前DATA停库只约束新注册、apply/start以及失败/未启动的恢复安全分支。新prepare/writer仍要求实际当前39服务证明、同一C/epoch、原安装与catalog35历史以及 ROOT07 来源绑定；本地未产生任何未来证明。

外层 prepare05、原生 logical01、既有 writer、plan05 在主控247、consumer02 interface/PHASES、根侧 witness 及 identity_pair 中逐项一致；函数 API `runFinalR3Prepare03` 不改名。ROOT07 operatorReady 为84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065。旧 witness 中 ROOT06 的 sourceSet/rows/materializationMode 与旧 INPUT02/install/catalog 字段继续表示历史，不能据此重放；当前来源通过 `sourceLineage`、`root07Materialization`、`operatorReadySha256` 明确绑定。

`issue_registration.issue` 保持7参数：review_file, review_pin, basis_file, basis_pin, output_directory, consumer_review_file, consumer_review_pin。必须先核本目录SOURCE全部文件、真实两份联合复核报告、主控247、consumer02全部bundle及fresh basis，之后才由主控作唯一时钟读取并签发实际有限授权。`issue_phase.issue` 保持8参数：phase, rules_file, rules_pin, registration_directory, evidence_path, evidence_pin, predecessor_path, predecessor_pin。D1未调用任一issuer。当前源码中的 WIP_PENDING=False 仅表示文件已完成待复核，不代表存在许可。

QB联合报告约定：CONSUMER-RESULT 的 state 以 SOURCE_PASS_NORMAL39_ 起始，sourceOnly=true、findings=[]，sourcePinsSha256=consumer02、interfaceSha256=0aad；根 RESULT 的 state 以 SOURCE_PASS_NORMAL39_ 起始，sourceOnly=true、findings=[]，sourcePinsSha256=本目录SOURCE、rulesSha256=本目录SIX、consumerSourcePinsSha256=consumer02、consumerReviewSha256=实际CONSUMER-RESULT文件哈希。源码不预写虚构报告。

`read_registration_basis.read_basis` 仅供主控/T45在实际服务器一次fresh basis调用。33项安全路径中32项来自已观察实际证据；retained-ack38的dfb22f预期值来自T45已验证实际ACK对象与原序列化，原观察没有保留原始字节哈希，故明确 rawSHAAlreadyObserved=false。该项必须在同一fresh39读回中实际验证；未读回不能把推导值当作已观察事实。reader还核五份stat-only、原锁、停库、未提交和无活跃作业；失配保持拒绝。D1没有执行reader。

`register_cas.py` 和未签发原CAS载体保持原共享锁、快照、发布顺序与 UNKNOWN/不自动重放协议；策略只包含六阶段，apply/restore绑定同一新39角色授权摘要且拒绝复用9419。旧38授权、已完成SOURCE授权均不续期。所有动态时间、角色许可、C/epoch、current39证明与实际请求均留待主控在真实前置满足后产生。

本地104项有限静态检查完成，包含字节、AST、最终consumer映射、来源与历史绑定、原7/8参数API和单文件131072B上限。仅执行纯dispatcher渲染与AST/字节比较；没有执行issuer、reader、CAS、服务、PG、native、时钟或未来正向fixture。T45 producer六处作用域证据8e36及53runtime复用独立consumer复核，旧已通过项未重验。主控统一接收QB同一联合turn的根侧增量结论后决定后续动作。真实数据完整导入仍未完成；本交付不解除PUBLISH限制，不暴露STAGED，不修改前端或共享合同。
