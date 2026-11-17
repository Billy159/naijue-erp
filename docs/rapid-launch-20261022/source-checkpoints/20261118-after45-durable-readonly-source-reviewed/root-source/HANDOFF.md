# After45 原业务根只读观察：Root144 配套

源码已绑定T45 consumer SOURCEabc2bf91751c475befb10477e7e03473e9bbfc7b2b1dbbf0c7f3945ec76fe941/interface845fed13bd6ffa29a6d5add33717cb02584eb71db8fe5fd906e8321911be69c3，以及consumer-only review be4fdbc63443a38f5543cad841f332bf231ab80b1122b614796300403c4658f1。尚未观察数据库，未签发/注册/执行，不以本次源码通过判断业务提交或授权FIRST_WRITE/RESUME。

实际143/f7d3→144，只加 t45-r3-original-businessroot-durable-after45-readonly-20261118-01。原143任务和三处保护、旧41/45历史路径逐项继承；新增唯一factory/模块/policy和该新key精确-I/-S例外。旧diagnostic02的-I/-S和其他原argv保持，原已消费作业不重放。CAS结构继承110个历史pin和31份auth snapshot stat9，仅已知实际143模块/政策、实际恢复终态/结果/cleanup新增；新MODULE/POLICY/AUDIT/PENDING与全部历史保护集合互斥，无全局路径替换。

新模块 r3_after45_businessroot_durable_readonly.py，政策 after45-businessroot-durable-readonly-20261118-01.json。沿成功durable02的唯一固定bundle/请求/AUTH/900s准入；本次3静态文件+唯一动态hostAUTH。原认证恢复只消费已实际完成的安全回执、oldhard=false和own helper当前停止状态，不重做离线认证技术验收或读原认证正文。Root并不读取SQL结果、改变角色或判定数据库业务状态。

Main7保持 issue_registration.issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin)。必须准确联合QB、Main具体决定、所有源码、真实fresh≤120秒及原grant预算后，才取唯一新clock；window900秒/CAS180秒/worker300秒。原AUTH/SQL42/44910不改；scope8ea720与typed补充ce5fc5都逐SHA绑定，marker afa9、batchedPlan3fbb不混用，expected descriptor未知不造值。

Main决定路径 outputs/主控/20261118-r3-after45-businessroot-durable-decision-01/DECISION.json；state AUTHORIZE_EXACT_AFTER45_BUSINESSROOT_DURABLE_WINDOW_AFTER_REVIEW，准确jobId/sourcePinsSha256/reviewSha256，maximumWindowSeconds900/readOnlyObservationOnly=true/roleChangesAuthorized=false/businessWritesAuthorized=false。

发行输出目录强制与冻结CLI一致：outputs/主控/20261118-r3-after45-durable-readonly-window-01。直接生成 host-authorization.json / registered-policy.json / registration-authorization.json / registration-packet.json / ISSUED.json；ISSUED.requestKey、authoritySha256、policySha256齐全（jobId亦保留）。registered-policy.json与packet.policy使用同一policy_raw原bytes；服务端政策仍安装至scope指定basename。无需人工补文件。实际发行后T45按原CLI prepare把唯一动态AUTH写入其bundle，并以实际票据校集合/原构造器；prepare输出私存，不输出完整AUTH/args。Main只返回safe metadata。

T45原通道：prepare_channel.prepare_local→stage_and_read(review_file,review_pin)→Main7→register_once(registration_directory)，均是不同具体授权步骤，本文件不触发它们。RootPrep AFTER45-BUSINESSROOT-DURABLE-ROOT-EXECUTION-PREPARATION-01；stage r3-after45-businessroot-durable-registration-source-20261118-01。仅新一次观察，不role/apply/login/SQL升级/导入/备份/APP/公开入口动作。

DELTA-CHECKS17项：实际143重建、单key/单branch+精确新argv、原函数/守卫保留、历史集合与新增目标互斥、31stat-only、消费者3原件、实际恢复安全字段生产predicate、Main唯一clock等必要差分；INTERFACE-CHECKS16项对真实producer/consumer AST核政策文件名/同字节/metadata/requestKey/7参数/AUTH字段/window/sourceDir/单SHA参数/3+1集合与注册通道。所有源码syntax检查，无未来AUTH正例、issuer/CLI prepare/state/remote/factory/Node/PG执行。SQL仅按T45与QB必要源码复核，尚未真实PG运行；旧已验机制复用，不重验认证/SQL42。

原业务UNKNOWN、oldhardfalse及所有可能已写数据保持。只读观察不等PGDATA完全零物理写；原单用户启动/关闭control/WAL/hint物理写可能，业务DML/DDL及角色变化禁止。实际query/ROLLBACK/clean control和own helper关闭仍须后续T45实证。
