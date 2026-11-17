# ROOT07 单项 SOURCE-only 登记、原锁 CAS 与 Main 签发入口

已完成独立源码，尚未登记、签发或执行。它只允许 `t45-r3-batched-root07-source-delta-20261117-01` 沿现有材化机制工作，不签角色、不创建C/epoch、不启动PG，不借用211或后置artifact准入846，不要求业务writer完成；相反，要求writer在两个grant仍从未提交。

依赖均固定：Main f5f7源码身份决定；D1 SOURCE8bd24与QB lineage review bfe6；T45 materializer SOURCE919c10d32c1ed59cea733a96fcfbaa206e17e471fe76cdb9ab59160661e7588d、入口666ad五成员；desc c0b18、rows74de、host36f5、原installer6c7653。词法3690/澄清4a、lineage bfe6、APP2351均不重审，本批原QB只需新registration及材化必要增量。

## 接线

`ACTUAL38-DISPATCHER.py` 是Main已实际注册的e46源文件。`patch_dispatcher.py` 仅保留完整101旧键并追加ROOT07成102，三个原guard继续引用同一完整列表；只增一个adapter和execute分支。其余原函数AST不变，旧normal helper3b/normal policy51da及历史36/37路径均不改。

独立 `r3_root07_source_admission.py` / `root07-source-only-20261117-01.json` 为该source job供准入。策略只有一个精确job、五个真实静态bundle pin、一个Main实际有限材化authority SHA和已复核source review。原freeze自动生成的bundle-manifest.json也被明确纳入冻结文件集合；materializer authority仍为独立叶，严格绑定原manifest、请求args及原materializer.validate。

SOURCE策略单独限制30分钟以内且不得超原grant，登记许可15分钟以内；不消耗下一normal角色的5100秒预算。旧normal策略仅作为原始来源绑定，未将其旧角色有效期当成新的SOURCE窗口或延长旧角色。

`STATIC-INPUTS.json` 从实际38 typed回执提取17个安全文件pin和5份私域快照的可见属性。准确前驱为e46/3b/51da、38safe6f386、restoree2f、safe receipt ce985及ROOT06实际marker73ec；旧36/37路径不改名。快照只做lstat，既不读body也不算digest。新的九字段身份由T45 fresh读取后进入登记和source策略；执行前再核同一九字段身份。ce985仅作为已记录的安全收据摘要说明，不读取该私域文件正文。

实际SOURCE准入前，必须重新核38真实停止/精确还原、当前原数据目录身份和无postmaster.pid、38容器停止及原当前proof未变、writer两个grant无请求/作业/终端。脚本不因自然过期就认可还原。原source review、scope、五静态叶及有限authority全部精确绑定，不能凭本源码资料假称key空位或SOURCE材化成功。

## 原锁登记与失败边界

`register_cas.py` 使用原共享锁 `/root/.../grant-5cc58239751e4e2a/execution.lock`，精确原device/inode与九字段身份不改。原CAS的need/sha/now/pack/identity/read/sync/put八个函数AST逐字复用；保护父级、非阻塞原锁、旧文件身份复核、module→policy→dispatcher发布、pending原子替换、fsync、旧dispatcher/normal policy/identities留痕和UNKNOWN不自动重放沿原机制。

旧normal helper/policy只读保留。新module和新source-policy均使用不存在的新路径；实际CAS前后校验17个basis和5份stat身份，最终只原子替换dispatcher。新module、CAS和dispatcher均小于原131072上限，未扩大限制。失败审计可能含部分已发布文件，必须读原audit确定结果，不自动重试、补造成功或删除历史。

`original-cas-root07-carrier.UNISSUED.py` 复用原stdin carrier，仅改变source登记入口、source SHA和准确成功状态；AUTH/时间仍是未填占位，D1没有构造正向许可。

## T45 / Main 实际消费顺序

1. 原QB本次联合限定报告必须绑定本目录最终SOURCE-PINS SHA与materializer919c，并引用已通过bfe6。建议报告保留字段 `sourcePinsSha256`、`materializerSourcePinsSha256`、`lineageReviewSha256`；sourceOnly=true、findings=[]、state以SOURCE_PASS_ROOT07_开头。没有真实报告时issuer拒绝。
2. T45沿现有只读载体加载此精确CAS和module，调用 `read_registration_basis.read_basis`；它在原锁下核真实17pin/5stat、原38停止/还原、无活动operation、ROOT07及writer两个grant无占位、登记stage/audit/module/policy/pending均不存在。只有实际执行才会返回fresh checkedAtUTC和九字段身份；本交付无该正向回执。
3. Main在自身Chat显式调用 `issue_source_registration.issue(review_file,review_pin,basis_file,basis_pin,output_directory)`。它先校验最后真实报告、materializer五叶、bfe6、Mainf5f7及fresh basis内容，最后才获取一次实际clock并验证fresh年龄/原grant余量，签单项source材化和登记许可。此处不会签roles-authorization，不创建service/epoch。
4. T45按原受控stdin carrier执行一次登记，读回准确audit结果及新dispatcher/module/source-policy SHA。UNKNOWN只读原结果，不重放。
5. T45用同次签出的materialize-authorization.json按原方式提交唯一ROOT07 source job。它实际材化后，才能把root/public/terminal/marker三个真实摘要交Main/T45 consumer。必须在下一normal role起钟之前完成。

源码中的入口/目录只是Main已选择的拟执行身份；actual新key空位、停止basis、有限许可、登记结果和ROOT07完成marker均未生成或冒称。新source-only登记不恢复任何已用角色或旧prepare/catalog/input/materialize key。

## 有限本机检查

`check_source.py` 已运行：实际e46原101键与新102完整保留、三个guard、除execute增一分支外原函数不改、八CAS原函数AST相同、17实际安全pins/5私域stat分离、原freeze manifest与source准入文件集合兼容、materializer919c五成员字节匹配、issuer校验报告/basis后才clock、全部.py语法及131072限制通过。仅pure patcher渲染未注册模板，不构造source策略、authority、future marker或C；没有调用issuer、basis reader、源admit或服务器。

仍未验证：新registration本次原QB限定审、真实fresh basis、Main实际有限签发、服务器CAS/回读、ROOT07材化和后续native PG完整35/161校验。STAGED和发布限制保持，真实数据完整导入未完成。
