# 真实账号及必要资料先行初始化：写合同补充 v14（待确认）

本单只解决真实账号初始化被“必须一次冻结全量导入”挡住的问题。建议沿同一个导入批次，先在一个事务中建立已确认的49个账号，以及它们真实引用的115条基础资料；之后有完整来源证明时，再一次性绑定真正的全量来源并继续原导入流程。0新增表或列，但新增两种导入动作、既有审计/回执JSON及状态转换，因此按原任务书提交确认，尚未实施。

## 首次只提交哪些数据

49个原账号及对应员工49、营业厅22、仓库22、当前客户22。115条主体均来自原已核资料，关系是递归完整闭包；不按名称猜配、不重编号、不重复询问已批准的45原关系＋4明确人员计划。43名员工有所属厅，原6名无厅继续为空。仓库仍单厅。

原普通资料总数628，首批115之外的513条（厅21、仓31、当前客户239、供应商222）不冒称已导入。字典344条不属于首事务，后续按原准确来源和授权办理；独立历史客户2、条码方案6、历史厅归属及产品/规格/库存/资金/历史单据不混入本次账号初始化。未导入不等于真实为空。

首次账号/主体/来源证据、22个真实仓库记账资格记录及唯一审计回执同一事务提交或回滚，不先写半套账号。账号原角色、启停、任职、厅及凭据兼容保持，不能把“49个账号建成”当“49个账号都允许登录”。登录使用已有旧密码兼容路径，不重置密码、不强制启用。凭据不进入本确认单、Git、来源证明或公开回执。

## 初始化后实际开放的范围

只接原登录/会话、已经独立批准的本人改密，以及原管理员/仓管有权读取的本批22厅、22仓和相关名称；精确成员在总数、分页、详情前生效，不扩大为所有同厅仓库，更不把22称作完整43/53。营业员不会因此获得全组织资料权限。

全局dataReady/businessReady仍为false；产品、库存、销货、调拨、历史、资金及新增业务写能力按原完整条件保持不可用。未初始化字典明确显示未接入，不能返回空0假装完整数据。首批可用范围在原页面/宿主中接线，不新建应用或替代Demo功能。

## 两种新增写入动作及持久变化

1. `IMPORT_CORE_STAGE`：在同一个原导入批次创建上述主体。独立的CORE来源摘要只代表这一批真实输入，不冒充尚未知的全量MAIN摘要。原批次未来全量`history_payload_hash/history_expected_counts`保留NULL，完整校验标记false、STAGED、完成时间NULL；已有checkpoint记录真实仓库入账结果，`expected:{}`在这个明确分支中表示全量尚未绑定，不能当作全量预期0。
2. `IMPORT_BIND_FULL_SOURCE`：同一批次、原锁和原请求键规则下，只在完整真实来源已独立获准、原CORE证据匹配、没有已冻结完整来源/发布及不相容业务导入时，原子填写真正全量摘要/历史计数/库存预期及闭包证明。只能成功绑定一次；同键同内容读取原回执，换键二次绑定或更换内容冲突。原全量导入分支继续保持原规则。

CORE审计新增闭合对象：`schemaVersion/phase/coreSourceDigest/coreCounts/coreSourceMembers/authority/checkpoint/fullBinding/fullFrozen`；其中`fullBinding:null/fullFrozen:false`永久保留首次事实。CORE专用回执在原字段之外新增`phase/coreSourceDigest/coreCounts`。新完整绑定审计记录`phase=FULL_SOURCE_BOUND_V1/fullFrozen=true/fullBinding`，其对象包含准确的`authorizedPayloadHash/historyExpectedCounts/inventoryExpectedCounts/sourceClosurePins/coreReceiptId/coreSourceDigest/coreMaintenanceBinding`。生效的“已完整冻结”由唯一已提交绑定回执判定，不新增全局flag或回写原CORE审计。

成员主体是原sourceRowId/entity/sourceKey/nativeId四元组；49账号安全投影复用原七键`id/staff_id/login_enabled/auth_version/version/created_at/updated_at`，不增加密码或登录名。完整8项既有授权事实、原批次/来源/执行时刻和操作绑定逐项保留。完整字段类型、NULL/闭合对象和函数差异见[配套完整方案](WRITE-CONTRACT-SUPPLEMENT-v14-CORE-INITIALIZATION.json)。

## 后续导入、维护和失败恢复

后续始终使用原49/115身份、来源、出生证明、STAGE时刻、请求键和回执，不重跑账号初始化，不用未来全量摘要重写旧证明。后续绑定不更新账号密码、登录状态、认证版本、账号版本或会话；用户正常改密继续原CAS及会话撤销路径，这条路径本来没有普通主档维护审计，不能强求不存在的回执。

首批可见范围不额外授予主档维护。如果另有原授权维护更改了115条主体，后续完整绑定须采用真实主档审计/回执和版本链，精确冻结当前主体投影，匹配数据库实际闭包；出生来源证明仍原样保留。完整冻结后再变化要明确报告受影响冲突，不能悄悄重算全量摘要或二次绑定，也不能回滚员工合法变更。

首事务失败全部回滚；后继绑定失败保留已成功的CORE。提交结果未知时沿同一目标读回原操作/原键，不能换键重提、重造身份、DROP或用旧快照覆盖。实际执行仍由原服务器/数据库唯一owner，沿有效保全及恢复约定；首笔真实业务之后的回退必须保护新账和回执。冻结Demo及旧正式应用不作写入目标。

## 22条真实仓库记录与后续全量接续的精确规则

原D1核实：现有仓库记账claim及延迟触发器不能直接接受“22条已入账却仍seq0”，也不能把新CORE动作伪装成CHUNK。首次必须在同一个原事务内：真实插入零批次seq0/cursor0/counts0/expected{} → 原callback建115主体/49账号/22真实WAREHOUSE记录 → 原accountant写本操作22个真实claim，checkpoint_sequence=1 → 一次CAS到seq1/cursor22/counts={WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0}/expected{}。

唯一CORE审计使用old_version=1/new_version=2、before为真实零checkpoint、after为本单闭合CORE对象及最终checkpoint；唯一回执seq1/cursor22/ledger=[]。原全局审计版本必须递增的CHECK保持，不能用oldNULL/new2或额外伪version1审计应付。两个延迟INSERT/UPDATE事件要共同核验同一新生批次、同事务、唯一CORE审计回执和22真实claim，不能跳过INSERT校验。

后续完整绑定另进一版（首次seq1→2，若另有真正记账操作则取实际CAS），cursor/counts不变、0新claim，仅将expected{}和未来全量NULL元数据一次换成真实完整值。BEFORE层只核明确结构及转换；原deferred层在提交前核最终真实来源、actor、审计回执，不能要求尚未生成的回执提前出现在BEFORE INSERT。裸NULL批次仍不得提交。

真正全量MAIN必须回读原22个claim/record/operation/seq1身份，把它们作为已完成进度；只对剩余31个仓库产生新claim，完整仓库来源仍是53，其他来源照原完整合同。不能重喂53个新claim、清零进度、忽略冲突或删除原记录。普通PARTIES/CATALOGUE暂存本来没有IMPORT数据库命令回执，单独获准的阶段核其真实不可变来源证据及外部阶段回执，不造不存在的记录。

单一增量补丁拟为`adapters/postgres/patches/0026-v14-core-initialization.sql`：精确修改原动作/结果约束、`guard_import_batch/guard_history_publication/validate_import_batch_commit/validate_import_operation`、三个accounting guard、原bootstrap和typed闭包有限维护绑定；新私有helper如确有必要按原角色验证EXECUTE。原迁移字节、全局审计递增CHECK、claim主键及正序号、完整发布守恒和唯一FINAL、全局typed精确一致性不放宽。不自动安装另处未就绪的v12/v13。

## 原owner实施及最小验证

原D3改现有source host/coordinator/bootstrap/party source的有限CORE分支；原D1改现有import store/accounting/typed source proof、明确SQL guard和现有宿主精确成员读取；原F1/F3接现有页面能力。现有`guard_history_publication`禁止首STAGE空全量证明及后续改动，须新增准确CORE例外；创建账号guard仍限定首次同事务49/45＋4，后续不能绕过原来源和权限。旧迁移及旧完整分支不重写，不借READ用途取得写权限。精确新增补丁与叶子由C按原所有权登记后实施。

必要验证只补本合同：同事务49/115及22记账记录、变更成员/摘要/动作/请求内容拒绝、真实账号/当前角色登录和22成员读取、未授权页拒绝、同键重放和失败回滚、合法本人改密后续接不覆盖、一次全量绑定和二次绑定拒绝。已有generic239/QB200及原身份核验直接复用，编译/health/合成预览不代替真实数据库结果。

当前状态：完整候选方案，未批准、未实施、未执行数据库。原D1准确guard影响核对已完成并补入本单；确认后也须按原独立验收和实际批次条件执行，不自动切正式网址。仅本新初始化分支等待，页面迁移、接口修复、240候选验收和其他已批准工作继续。
