# Ordinary41 三函数维护 consumer：仅源码准备

本目录是已接受 Source40-02（7db507149e2c6c6187e033839dcc7faffa54f331cb7c0fdd828d6ede6872df16）的独立后继。五个准确新键、各阶段脚本、静态成员、字节数、固定范围与预算见 INTERFACE.UNISSUED.json / PHASES41.UNISSUED.json。顺序仍为 Apply → Start → 三函数升级 → 保留停库 → 精确恢复原认证；不含新 writer。D1 独占根端，T45 唯一服务器 owner；本次没有服务器、PG、签发、取签发时钟、CAS 或角色动作。

## 此次差异

Start40 已 FAILED2，阶段 PREPARE_R3_MOUNTS，FileExistsError；createAttempted=false / cid=null，四项现场资源 absent。Restore40 已 COMPLETED0，原两角色 verifier 与期限实际精确恢复，非自然到期；自身恢复容器已停止、PID0。两份原协议结果与元数据引用见 CLOSED40-FACTS.json。没有成功 C40、epoch40 或 genuine descriptor。原40全部终态键与未提交 upgrade40/stop40 均不重放。

归因局限：实际 private log 为0字节，未保留 exception.filename 或 frame。提交源码仍指向已存在的39证明目录，首次排他 mkdir 与现场元数据相符，因此为高可信的有界归因，不能冒充运行时捕获了准确异常文件名。

仅把本次证明目录改为 authority/r3-service-41-worker-proof、本次捕获改为 ordinary41-auth-capture-20261117-01，并更新五键、当前服务名、policy、INNER 路径及必要依赖指纹。不删除39证明/40捕获/任何旧目录，不用 exist_ok，不放宽权限或目录排他创建。prepare_successor41.py 只渲染上述静态成员，不签发、不生成运行事实。

apply/start/restore 仍通过原 prior_preserved38.py 叶调用历史检查；该叶现为 prior_closed40.py 的准确副本：先逐字复用 successful39_history.py，再核实际40失败及恢复原协议收据、5份私有文件的六项已知元数据和 Restore40 自身已停容器。私有 original/finite 认证内容不读取、不计算摘要。未补造过去的mtime/ctime；未来 fresh 可采真实完整stat9。该层不要求当下 DATA 仍停止，因后续41服务可能在运行；原阶段自己的状态校验继续保留。

最后成功普通服务仍为39：binding() 与 validate() 返回原 service/closureKind/bindings 三字段 API，不以失败40替代。39 ACK 已在 normal40 fresh 实际读回并匹配 d035，准确证据5e121与检查时间见 retainedAck39ActualObservation；早期 PRIOR39-STATIC-METADATA.json 中仅推导的历史说明逐字保留，未来 fresh 仍须核当时真实状态。

## 未改的执行语义

角色算法、原账号和隔离、捕获/变更/精确恢复、runtime密码及成员关系不变。原服务容量、容器/PID、失败前容器与 owned-C 清理、保留停库和结果未知时原键查询机制不变。不能因 child 回收就称提交已回滚，自然到期不算认证恢复。

native 只改 REQUEST / START / INNER 三个静态身份。SQL daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184、driver、CHILD、事务内before/after、COMMIT ACK、提交后独立READ ONLY及 UNKNOWN/清理规则保留。H01 原 predicate 不变：历史 installed35 cf27/9f/626 与当前 compiled-before 6ef/实际target spec/626 分开；after 才是 ada8。未来真实 spec 不硬填旧值，原 native 在读取配置和连接前重编译并严比 descriptor。

## 准入与事实边界

根底座为实际115键 dispatcher0864546416726e3290f571f86344bf0f7288c54e80e3fce86fd2426d7f38edff；五新键与其不相交。由D1准备115→120、保留旧115/三guard/全部旧失败键，原Main完成同QB准确配对窄审、未来fresh与有限签发。这里不重复实现根。policy为 direct41-batched-real.json / T45_R3_NORMAL41_BATCHED_REAL_V1，原五字段，parent5100/CAS600、各阶段300/300/780/120/300秒、28GiB底线。原Main注册7参数/phase8参数接口与原CLI execute接口保留。

未来C、epoch、临时角色认证值/期限、authority/window和实际descriptor全部未产生。新键静态未占用不代表现场已核未用。原 Root08 marker5bb及terminal e884仅证明代码物化，SQLUpgradePerformed=false/importReady=false；SQL仍旧626。原失败writer/diag02、Main b07恢复裁决、五类身份运维记录、APP/备份/sdc/业务输入不变。

check_source.py 仅运行本次 check_delta41.py：35项新增路径、五键、已闭合40/最后成功39接口、派生依赖、Python受影响语法、native反向逐字及H01谓词不变检查；DELTA41-CHECK-RESULT.json 是本次结果。复制的 CHECK-RESULT/C01/PHASES40/ACTUAL110 及 evidence 都是历史原件，不能标为本次运行。未重跑旧61/18/11/Root82/32/SQL91/H01/Node24、角色/native/PG，旧获审Node24语法仅复用其未变语法形态，不冒充真实运行。

SOURCE-PINS.json 绑定本目录文件，READY.json 绑定最终SOURCE和接口；二者仅源码准备交付，不是QB通过、注册、实际运行、SQL升级或业务验收。下一步由主控合并D1根端配对审查，再分别给出实际执行指令；本轮不得自行进入服务器步骤。
