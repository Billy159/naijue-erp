仅静态接线 SOURCE，不是可执行包；无新服务/许可/物化/PG调用。原业务writer与INIT/输入不变。

准确二层身份
- outerPreparationAttemptKey = t45-r3-final33-plan-prepare-20261116-02，仅新外层请求/终态/原锁登记。
- nativeLogicalPreparationKey = t45-r3-final33-plan-prepare-20261116-01，只作为既有native preparationScope.requestKey，绝不再次提交旧外层key。
- plan = /var/lib/naijue-erp/fresh35-production/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-02/batched-plan.sqlite。
- 新外层authority增加preparationIdentityMapping闭合四字段，见identity_pair.MAPPING；preparationRequestKey仍01，requestKey为02。native authority闭合schema不增加映射字段，仅binding.preparationScope保持01+新02路径。原校验器严格原样。

只读证明（限源码，未作PG验收）
1. r3-service20-retained-import.mjs runFinalR3Prepare03传prepareOnly:true，写入work回调直接抛FINAL_R3_PREPARATION_WRITER_REFUSED；准备器只读源索引并在本机写plan/initializer，无运行SQL步骤的调用。
2. whole-host-session.mjs:123-165目录guard事务BEGIN REPEATABLE READ READ ONLY及ROLLBACK；withVerifiedFresh35AdmissionV1只核同一真实session/target并发出内存token，无SQL。
3. fresh35-host-session.mjs:1109-1139准备只建fresh35FinalPreparationQueryGuard，inspectRoot用BEGIN READ COMMITTED READ ONLY / SET LOCAL ROLE importer / 精确inspect / ROLLBACK。batched-stream-cli-state.mjs:174-182按序精确拒绝其余SQL、写入步骤、COMMIT。whole-host-session.mjs:279在prepareOnly返回，不能调用work。
4. 0027_standard_batched_import_v1.sql:1853-1984的inspect公开入口/内核只有身份核验、SELECT、transaction advisory locks和返回，没有INSERT/UPDATE/DELETE/动态执行。cutoff_import_lock为pg_advisory_xact_lock；standard_import_identity的ROLE_IMPORTER分支只核角色并return NULL，未进入会话登录分支。事务锁/本地文件是已解释的效果，不是业务表写入。
5. 旧UNKNOWN不倒标PASS。下一真实原库、同源business identity的CORE inspect必须实际返回ABSENT：内核先检查root_operation即INIT receipt；缺席时同时要求两个import_batch身份缺席，再返回ABSENT。存在COMMITTED根、任一批次或不匹配身份即拒绝；只读核验失败/UNKNOWN也拒绝writer。不以旧“文件不存在”替代当前库检查。

继续前的真实证据
原09a5 FAILED/d8ff/ba016及安全90e1、stop02ee、restore47f79继续保全；无旧plan/initializer只作为历史，下一原锁下重新核其仍无、02新目录/key双grant未用、无活动作业，原输入02/ROOT06不变。旧空目录不清理。新有限角色/服务由主控另定，不继承或延长旧许可。原780=650+130/写入3000及完整余量不缩。

catalog469复用
保留原catalog key、root/public/completion/commit、历史C35不改。新服务必须由既有native verifyFresh35InstalledV1/runWholeSession只读目录路径核现值9f459/cf27/626c；真实hostVerification绑定新C/epoch，不能当作catalog重新执行。T45 applied_catalog_successor和D1 verified_catalog_update需把historical service与current service明确分离，同时保留全部commit/原目录capture/hash/roleRestore/cleanup约束。不得伪造新catalog成功回执；writer继续等新aux真COMPLETED。

必要差异归属
- D1独立root_aux_pair.py：接在原frozen manifest/authority/原锁/live-service/历史guard之后，精确只接受02外层+01逻辑+02路径。root policy仅prepare jobId及审核后的必要host/runner pins更新，writer业务key不变；未提供注册/CAS/整包。
- D1 issuer_aux_pair.py：静态pair_scope/check_native_projection，显式区分二层；不自行发clock/权限，不把mapping写入native闭合JSON；原native validator仍要运行。新完整issuer装配须等T45精确host/collector源码与新现场证据。
- T45 host/runner：PREPARE外层分支判断用02，native调用参数preparationRequestKey和expectedBinding.scope用01，plan独立02；native_result.requestKey/inputSha256仍绑02外层。writer original_prepared消费新02真实根/public/native回执和同一plan，不读旧失败01。既有原native source不改。
- T45 collector/public schema：实现已过135dde的可选闭合failureDiagnostic投影，并保留二层mapping；旧历史结果仍原样。runner仅使用已过acee诊断候选的新增信息，不改成功/事务/cleanup语义。

新增native scope是否兼容：buildFinalR3PreparationBinding只固定scope.requestKey为01，batchPlanPath仅要求绝对规范路径，不固定旧01目录；650/130/780与closed native authorization字段均原样。因此明确01逻辑+02路径可符合现行校验器结构，不需修改native常量/371源码，也不需要新物化。此为结构结论，不冒充新授权已签发或受保护token/实际会话已获得。
