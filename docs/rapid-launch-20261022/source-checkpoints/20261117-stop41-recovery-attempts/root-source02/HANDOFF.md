Source02 仅修本层 finishing seam：Recovery.admit 对本层stop/restore返回 stop41-recovery-stop / stop41-recovery-restore，显式 finish 只为这两标签返回None；裸stop/restore及其它旧阶段继续 prior.finish。Source01 3b9e/031保留为不放行历史。原21检查复用，本次只核finish与派生pins、独立PREPARATION-02/source-02入口。

Root121 单次恢复停库 SOURCE。未 stage/fresh/issuer/clock/CAS/server/PG/signal，不代表现存 C41 已停止或原认证已恢复。

原120根2b8e、模块c478、政策5bdd全部保留，仅追加固定 t45-r3-ordinary41-preserve-stop-recovery-20261117-01 到121；原三处保护及全部旧函数不改。唯一消费者是T45 NORMAL41-RECOVERY-STOP-SOURCE-01：Source e1f1b00c94d263dbce4a280d0c7a6fad9e5b34c8e516806f599cc381993e0de0，interface011950babe938a49d2272f496656975f360fd4c93e5fd03d55771e46f49a56fd，consumerQB e9d821e14f4ee584d3c4dc830bcf427b9e721c335e657c159c28e416ead41d09；bundle两叶8a5a/2448、120s、normal05-stop-input.json。不修改旧Stop41或其失败证据。

CAS/fresh 使用原登记锁和原前后快照，不要求或伪造PG停止。唯一替代准入是精确现存 C41/cbf6459、epoch13:42:13.196867、proofc31/原出生/ACK/实际Start成功，以及原Stop41 d7e54 FAILED2/35e73 PINNED_MODULE_DIFFERS。复用原Normal41.current_service进行实际出生和当前PID检查；同时要求六个指定旧操作的实际终态、新恢复键全域缺席、没有其它active operation。只登记这一个已知C41的安全关闭，不放开其它运行中登记。原120的所有保护文件、原41政策和模块、Start回执、六份终态都纳入PRESERVE。角色快照沿原stat9，内容不读。

恢复Stop规则只有一个，政策保持原五字段且唯一stop。expiry≤min(签发+240s,原work1794926342048,原restore1794926977752)，并在签发前确保120s作业和35s原关闭余量。不存在新角色、服务、SQL、业务writer或时限延期。注册有限权≤180s，不新签任何角色。

原通道：prepare_channel.prepare_local→stage_and_read(review_file,review_pin)由T45先实际stage与locked readonly fresh；Main issue_recovery.issue(review_file,review_pin,basis_file,basis_pin,output_directory,consumer_review_file,consumer_review_pin)保七参数，仅产生停止授权与CAS包；T45 prepare_channel.register_once(registration_directory)。随后T45沿原单任务client运行新恢复键，唯一args=[实际停止authoritySHA]。Main返回authoritySha256、registrationSha256、policySha256和原角色未重签标志。实际执行前先核最小余量，窗口不足拒绝，不换键或延长。

新恢复成功后原Restore41仍用原aadc规则/原登记/原roles0980/原41快照。必要的Main八参数桥是 issue_restore.issue(phase,rules_file,rules_pin,registration_directory,evidence_path=None,evidence_pin=None,predecessor_path=None,predecessor_pin=None)，只允许restore，evidence=真实恢复Stop读回、predecessor=真实Start41读回，rules仍旧FIVE6460，注册目录仍原41。仅在内存中把原restore helper验证的stop jobId改为精确恢复键，证据本身不改，原恢复算法与输出保留。另记RECOVERY-STOP-RESTORE-BINDING，不改原ISSUED/sourcePin aadc。

Root121对原Restore41仅追加精确新Stop COMPLETED0+root/public terminal一致、generic实际结果同C/epoch/proof、实际cleanup及原DATA已停的闭合分支；不称旧Stop成功。原恢复consumer generic分支不变。新恢复Stop政策过工作截止后，构造函数不以当前时钟拒绝原Restore：其frozen使用原41政策，authority仍受原恢复hard1794926977752和原300s headroom限制，均不扩大。

联合QB固定 outputs/QB/20261117-r3-normal41-stop-recovery-joint-review-01/FIX-RESULT.json；要求sourceOnly/findings[]/rootPairReviewComplete=true、sourcePinsSha256=本最终SOURCE、consumerSourcePinsSha256=e1f1及consumerReviewSha256=e9d。新恢复七参数issuer和八参数restore只在Main实际调用时用真实时钟；本次未调用。21项仅根单键/精确C/两恢复缝/原锁CAS和静态接口检查，消费者/旧SQL/APP等不重跑。
