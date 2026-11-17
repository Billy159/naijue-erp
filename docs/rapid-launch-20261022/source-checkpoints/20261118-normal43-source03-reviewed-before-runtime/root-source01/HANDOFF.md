NORMAL43 Root/Main 源码接续，只有 apply → start → writer → stop → restore；不执行 prepare05、SQL 升级、源码物化或 APP 构建。实现位于本独立D1目录，T45消费者/前端/共享合同/既有冻结源码均未修改。此交付不能作为服务器执行或业务开放授权。

Main SOURCE-SCOPE89f397及 ROLE-TIMING-ADDENDUM6ac3 是具体来源。实际Root127/dispatcher3a3c原件保留，仅追加五新key至132，全部旧函数/旧keys/三guard和失败证据保持。新writer外层key为 t45-r3-batched-real-after42-execute-20261118-01，原失败writer绝不重放；原业务operation/request/batch/manifest/11:40 cutoff保持，不自动RESUME。FIRST_WRITE仍必须经原same-client inspectRoot为ABSENT，COMMITTED/未知停交Main。

消费者冻结SOURCE ad4290c28a84f32eac3029ac2b077ccd51e772551295760643772f5df8d0315e / INTERFACE6555bbe1e0a89a5f9eb572c6c956d3b1e9ef178d3ffd3dc2089db8050e7991cc / PHASES43 28b4d7eab540bdc0ccae33e520ad75564471eafd2c998906649c59eb25eb7d3f。实际阶段目录指独立 NORMAL43-EXECUTION-CONSUMER-01（executionInterface82c339da122c7977ce7b66bb4d1f58cd015b6b3d2952d250f9f63ad6c01389dc），Main7同时核原冻结文件与执行bundle准确字节；不得向冻结SOURCE写动态AUTH。QB消费者/Root联合/本地适配程序的真实回执分别处理，不互相代替。

真实前驱为成功Start42/C90bf/proofe789 →成功Stop42/8b89/7669/guardian1b3f →成功Restore42/7f10/ca965/c6dd/safeaeb681，owner总安全RESULTc34f已核。旧41关闭和rollback02仍保留自己的历史字段，未把新prior42错误代回旧41 guard。Root08 marker5bb仍如实保持物化时SQL未安装的历史含义；实际Upgrade42 d6e9/edde/completion5e6f及COMMIT/canonical after a5f+aef+ada是独立升级证据，旧catalog35/626历史不改。

原prepare05成功回执4709、terminal2f7a/resulta686/native552b、44910steps/SQLite/initializer/preparedBinding和旧executionBinding完整保留。Root/Main分别核原两种binding的准确历史witness；本轮expectedBinding只能采用真实新C/epoch的四叶描述，除了currentC/epoch/三目录字段外原业务字段不变，preparedBindingSha256必须等原native typed-hash witness。没有用普通JSON摘要冒充native类型编码。当前源C/epoch/finite authorities/clock均为空，不构造未来正向AUTH或服务fixture。

18份旧39/40/41/42认证快照只比较完整stat9，不读取其body或digest。原prepare05目录、batched-plan.sqlite和original-initializer.json另行metadata保护，owner61035/目录0700/文件0600；initializer长度51225175来自原已核scope。原计划的业务语义仍由既有native persisted-program逐项验证，stat不代替语义。

ACK42 rawSHA此前未实测，SOURCE中的previousRetainedAckSha256保留None。唯一futurefresh核proofe789/ACK实际对象和work/outer相差35000，读回真实ACK rawSHA及stat9；Main7将其填入ISSUED.predecessorBindings，Main8 start采用已签issuedBindings。原plan3项和ACK独立4项纳入原CAS oldIdentities并前后snapshot；不为补ACK或plan单独开现场读操作。fresh输出historicalPlanCustody仅plan3项，planAndAckCustodyStat9为4项。

Main7原接口仍为 issue_registration.issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin)。Main8原接口仍为 issue_phase.issue(phase,rules_file,rules_pin,registration_directory,evidence_path=None,evidence_pin=None,predecessor_path=None,predecessor_pin=None)。两者运行前都核准确源闭包；Main7须真实joint SOURCE PASS、准确consumer QA及唯一真实fresh才取时钟。

Main8 的 E=evidence、P=predecessor 固定如下，不能互换：

| phase | E | P |
| --- | --- | --- |
| apply | None | None |
| start | 本轮实际apply回执，含terminal/result/rootPins | None |
| writer | 精确{apply,start,operatorReadySha256,executionDescription,planCustody} | 原完整 RESULT-PREPARE05.json，SHA4709f62e62f604200ed17e4be751d823fd521589ce1cf4451cb686a963f1fb46 |
| stop | 本轮settled stop-basis，含currentBatchTerminals与currentWriterSettled或currentWriterUnsubmitted | 本轮真实start回执 |
| restore | 本轮stop回执；或原合同typed failed-start cleanup /未提交start证据 | 本轮真实start，或确无start时None |

writer的executionDescription为精确{descriptor,liveFacts,payload,process,outputs}，四叶每项{leaf,bytes,sha256,text}与实际Start43所留四叶逐项对应，内容对象再与descriptor/facts等核；不重新运行Node describe。descriptor格式FRESH35_FINAL_R3_EXECUTION_DESCRIPTION_V1，绑定新writer、新C/epoch、原native552b/原preparedHash和aftera5f+aef+ada。planCustody精确等Main7登记manifest.planCustodyStat9，不能自行拼造。旧install32、catalog35和input02从冻结历史引用复用，不能把Start当安装或prepare回执。native执行授权仍用原require_execute_authority及host.validate。

所有实际stage/读取/登记仍由T45原唯一通道：prepare_channel.prepare_local()只准备本地 NORMAL43-ROOT-EXECUTION-PREPARATION-01；stage_and_read(review_file,review_pin)在Main具体scope后进行；唯一实际fresh落点为该目录 fresh/ACTUAL-BASIS-BASIS.json，JSON根即basis；Main7签发后T45 register_once(registration_directory)唯一CAS。模板精确DURABLE-READONLY-EXECUTION-PREPARATION-02/STAGE-ROOT-SOURCE.py SHA3cecf232aa5ed6949ffe6256643058daf38d83baa87d720878adca7b70934622。Rootprepare_local是否已做，以T45本地准备回执为准，D1没有调用。

期限按Main6ac3：未来t0起controller4000s/admin4120s/hardrestore4900s，apply900/CAS600/parent5100/serviceMax4200、worker300/300/3000/120/300保持。start完整链guard仍3540s，必须严格在t0+460s以前签；不是要求复制proof.scope静态默认3600。纯相对算术已核 earliestWork4165>admin4120、controller/admin间隔120、hard4900<parent5100；work=proof.sharedLease/ACK/result，outer=startAuthority lease，差35000不变。没有延长任何当前或旧票据，没有调用clock。

源码自检仅本次127→132、原/新凭证分离、真实42闭合、原计划/ACK stat保护、Main7/8及五phase/clone/lease/模板/参数差分。HISTORY-BRIDGE-CHECKS只用真实旧安全回执：接受原prepare05，拒将Start当prepare，拒将旧execution当新after目录；没有未来正fixture。旧SQL、sealed18run2真实PG10/10、H01/历史规模和APP289均直接复用，未重跑。

原diag02证明的只是固定业务scope0，31条既有管理记录仍保留，不把全库当空、不删除重建或覆盖。各仓库存守恒、历史人员/时间可空、前端必填及2958条异常商品级条码排除，全部沿批准原输入与原导入合同消费。真实整批导入尚未完成，STAGED不暴露，发布限制不解除。当前0server/fresh/clock/issuer/CAS/PG/writer/Node/build/APP部署，新数据库测试仍由主控协调。
