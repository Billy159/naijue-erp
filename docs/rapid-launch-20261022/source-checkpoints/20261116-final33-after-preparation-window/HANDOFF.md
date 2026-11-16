# 已完成准备后的新有限窗口：源码候选

状态 SOURCE_CANDIDATE_UNISSUED_AFTER_PREPARATION。只在本 D1 目录形成候选；未调用 registration/phase issuer、未运行现场reader、未签权限、未连接服务器/PG、未造fixture。T45唯一服务器owner；当前live源码和两个成功步骤均未改动或重放。

## 交付和最小差异

- `register_cas.py`：沿原 input02 成功的三文件CAS（module → policy → dispatcher）、原 execution.lock 和未知即读原audit的机制。新的独立ENTRY=`r3-direct33-after-preparation-registration-source-20261116-01`、AUDIT=`r3-direct33-after-preparation-registration-cas-20261116-01`。现存171条基线＝原163条，更新live dispatcher97830e4e…和policy0d18b5…，再加原a48 helper、已完成CAS02 result以及两个成功terminal/root result/目标marker共8条；历史163之外没有删除任何记录。
- `r3_direct33_after_preparation.py`：a48f6fdb… helper逐字复制，仅用新的P模块文件名，不改885行helper正文、9原键、实际C、native、original writer或任何时限。
- `admin_exec.AFTER-PREPARATION-UNREGISTERED.py`：原模板只改一次helper加载文件名。policy SHA仍是单一None占位，实际发行时由外部root签入的sourcePins/rawpolicy SHA生成，不预填旧或未来绝对许可。
- `read_registration_basis.py`：独立只读新鲜basis reader。171条实际pin/身份、原锁、PG停、无artifact staging policy、双grant剩余键无提交、无active operation；两个成功步骤只核原回执与marker，不要求其不存在、不重新执行。输出明确`alreadyCompletedCandidateKeys`两项与`remainingCandidateKeys`七项，`presentCandidateKeys=[]`只表示没有不允许的新提交。
- `issue_registration.py`：复用主控原动态main发行器，时间只在实际调用时取now；父policy=now+180分钟，roles apply/controller/backup/restore依旧30/120/122/150分钟，原CAS15分钟。核实际grant覆盖完整3h，CAS/consumer再核真实grant；不延已apply凭据。75个静态pin出现项及9规则精确保持；仅apply/restore各加同一个动态roles SHA。规则/完整source复核、fresh basis及两项成功引用齐全才发行，不提前生成定时roles/policy文件。
- `issue_phase.py`：顶层只允许`apply,start,catalog_update,prepare,writer,stop,restore`；input_materialize/materialize明确拒绝。apply仅消费本次registration已生成的同份有限host/roles许可，不重发过期许可；其余11个start/actualC/目录/native/prepare/writer生成及验证函数AST与原文件相同。只把本机输出目录改为`20261116-r3-direct-service33-<phase>-after-preparation-window-01`避免覆盖历史，实际9业务key一个不换。
- `NINE-PHASES.UNISSUED.json`：完整原9规则留作依赖读取；materializationAlreadyCompleted和inputMaterializationAlreadyCompleted均true，带两份真实完成readback路径/SHA/具体事实；原来源/历史安装与5100门槛保留。没有任何角色/PG或业务完成声明。

`assemble_candidate.py`仅本机可复现组装，不是现场执行入口。候选源与原依赖pin见SOURCE-PINS.json；LOCAL-CHECKS.json只报告本轮窄范围检查。根主控issuer目录和T45目录未写入。

## 两个已完成事实的准确谓词

INPUT02实际只读回执aefdacd6…：COMPLETED/0/phaseStarted=true；terminal b959313c…，根/公开terminal必须字节相等；root result556cb0e3…、public796bdede…分别校验SHA后**JSON对象相等**，目标`materialization-receipt.json`与root result逐字相同。目标身份66304/13665604、root:61035、0750来自实际JSON，不猜。

ROOT06实际只读回执edf63f60…：COMPLETED/0/phaseStarted=true；terminal13cdb833…根公开terminal逐字相等；root result和operator marker73ec88d3…、public0bd916e2…分别校验后**JSON对象相等**。387/371+16、sourceSet d20f9f89…、sourceRows078f2c00…及完整实际metadata对象与已完成回执一致。source-root/operation为实际root:root/0755，未知inode不填。两结果对象的序列化SHA不同是已知事实，未错误要求其字节相等。

CAS和独立reader共用逐字相同的completed_preparation/quiet谓词；reader不写盘、不执行PG或任何授权。允许本grant两个已完成键存在；本grant其余7键及前grant全9键的worker/control job、request/json/tmp和public terminal仍须真实absent，且operations空、PG停。任一不符停原键，不能将unknown当absent或换新writer。

## 原主控/QB/T45接续

1. 原QB只核这次新增接缝，复用既验75静态源。复核结果约定`state=SOURCE_PASS_AFTER_PREPARATION_WINDOW_ONLY, sourceOnly=true, findings=[], rulesSha256=<本候选NINE文件SHA>, files={<8个发行/运行文件名>:{sha256:...}}`；files必须覆盖CAS/helper/template/carrier/reader/两个issuer/NINE，可额外列本交付文档。不能因源码检查写成现场运行PASS。
2. T45经原受控通道运行这份独立freshbasis reader，仍0PG；由主控保存原始输出及SHA。读到差异或其他owner改变live状态即停，不能盲刷171基线或悄换版本。
3. 主控在真正准备执行时调用：`issue_registration.issue(rule_file,rules_pin,review_file,review_pin,basis_file,basis_pin,output_directory)`，输出目录为原`outputs/主控/`下新的未存在子目录。它才生成真实时间、roles/host/policy、CAS授权/envelope、已绑定carrier和ISSUED报告。本轮未调用，目录里没有这些已发行产物。实际source registration必须由原T45固定carrier执行并读回，失败/未知保留原audit、不重放。
4. 后续调用`issue_phase.issue(phase,rules_file,rules_pin,registration_directory,evidence_path,evidence_pin,predecessor_path,predecessor_pin)`，仍用原真实证据参数与私域通道，顺序apply→start→update→prepare→原writer→stop/restore。两完成物化phase顶层直接拒绝。apply只取本registration的同一许可；start保留完整5100工作预算，不缩300/780/3000或时限守卫。没有真实start/actualC/opaque/prepare/native结果就不能签对应下一步。

公开源中出现的实际历史摘要只是绑定事实；不包含凭据、口令、业务原始记录或新服务器授权。正式PGDATA、库/SID/OID、前端和共享合同未改变。

## 已做/未做

完成8个Python文件compile、a48 helper逐字相等、75静态规则与旧**实际**policy的纯结构谓词检查、两个**实际**完成JSON的纯值谓词、CAS/reader 171基线和成功/quiet函数一致、carrier source/template配对，以及11个start/C/native函数AST复用核对。未运行完整测试，未造反例/成功fixture，未执行reader/registration/phase发行器、CAS、网络或PG。实际freshbasis、发行、CAS、新角色许可、PG/start/prepare/writer/stop/restore仍由主控与T45按现场结果推进，均不记通过。
