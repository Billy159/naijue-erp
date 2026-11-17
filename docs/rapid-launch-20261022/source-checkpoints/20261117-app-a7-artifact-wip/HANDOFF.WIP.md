# 新APP固定制品接线草稿

本目录只含D1独立轻源码WIP。旧source02 SOURCE846及QB7ecc范围、旧APP d728、T45接收器/策略对与APP-owner目录全部保留。normal39 b96d/d72c冻结交付不改。没有最终T45新receiver SOURCE/pins，故没有本目录SOURCE-PINS、有效profile、注册载体或预览dispatcher；三个生产入口均以WIP_PENDING=True在读取运行输入前拒绝。

来源名称依据：主控 `outputs/主控/20261117-r3-app-a7-fixed-artifact-source-selection-01/DECISION.json`，SHA b749f98a5477cae8b693c9362b0f209adf62915c31340872a0491768c088de3d，仅SOURCE选择，不是有限授权或实际不存在证明。APP候选实际 metadata 为a7bab2eec252e63b2ede61d2392cbd1f1bbb9728 / tree bba4ce31d4a4bc72b29ff170b8836f7d18d4a8f5 / parent d728f3749cc8cf504fec6c51720562c5774b72c0。

仍然只有四个固定任务位置：APP install/restore 使用主控SOURCE选定的 `t45-r3-final33-a7bab2-artifact-policy-{install,restore}-20261117-01`；private install/restore 仍为 `t45-r3-final33-recovery-artifact-policy-{install,restore}-20261117-01`。新APP artifactKey为 `r3-final33-ordinary161-a7bab2ee-20261117-01`，target在原grant的artifacts/该key。四键尚未得到实际receiver逐项对齐和fresh现场不存在证明，不表示可提交。

## 两份scope的最小真实增量

| 位置 | APP真实增量 | private变化 |
| --- | --- | --- |
| FIXED-SCOPE archiveSha256 | 14f34→13b8de7b328e791782bf39a99bf071df01cc05e768ea763418b4a785b6b99cc1 | 无，244bba744ce2f737bc3d5419ee6ba4179abbd15173b1d532d800fff231e39d4d |
| archiveBytes | 7687919→7690353 | 无，40960 |
| sourceSetSha256 | 649988→57a302e1c06f420fb281084133a71ad8de3473dc86c59148b7efdb7642103abf | 不新增；继续manifestSha256 7ebdac、fragmentIndex=1、fragmentOffset=0 |
| artifactKey / targetDirectory | 按主控b749的新a7命名 | 无 |
| reception_scope KEY/TARGET/INSTALL/RESTORE | 按同一b749更新 | 无 |
| FIXED-SCOPE/FIELDS/PROFILE摘要 | 必须由T45最终新scope实际字节产生，现在None | 原固定值保留 |
| pins()的READY/PACK metadata | READY 1905B，18e666855c5784503ee23142d0abbbebb4ad3d187b997fe456b1f860293ef87b；PACK 584B，ed0fbf97e004c8409af5335a62853159e7c6a18464d4538909767e08c3491377 | 不新增APP metadata |

原两种scope schema继续分离。commit/tree/parent/releaseManifest b74bf6fe9b215638552702f5879679cc9779e8a816b696dceb8e8adf0810b7a6仅作tuple证据，不增添到接收器字段。APP `root_policy.py` 通过 `reception_scope.pins()` 消费新READY/PACK，不需要重写接收平台；通用receiver原954342是否保持、root_policy原bc90是否保持，以T45最终SOURCE实际字节为准，本目录不给它们填假新pin。private两job、scope、helper及三成员元数据沿source02精确保留，不重新读取或哈希私有payload，也不重新读/哈希/构建/解包任何tar。

## D1已准备的最小实现

`FIXED-PROFILES.WIP.json` 中APP候选scope值与四个SOURCE任务名已绑定b749；APP接收器/策略代码pin、FIXED-SCOPE新pin与最终receiver SOURCE/review继续None。`r3_two_fixed_artifact_admission.py` 仅更新独立PROFILES及加入前置WIP拒绝；writer VERIFIED、native/readback CLOSED、同C停止、exactRESTORE和八证据读回的原方法AST全部不变。

`patch_dispatcher.py` 保持原完整前缀追加四键、三guard与其他函数/execute去单branch后AST检查；唯一必要接线是新artifact adapter先调用现有 `normal39_continuation(core,prior,cfg)`，再包装FixedArtifactAdmission，使其消费实际当前39策略，而非r3_continuity工厂保留的旧38策略。没有修改既有normal39 adapter或module。WIP gate禁止渲染，未使用假未来SHA或四键fixture生成正向预览。

`issue_profile.py` 保留18参数显式时间API，无新增时钟。实际未来baseline检查改为读未来dispatcher的NORMAL39_POLICY_SHA256/NORMAL39_MODULE_SHA256，再与实际baseline的active normal policy/helper逐项比对；不能拿旧R3_ORIGINAL02_ABSENT常量误当活跃39。b749仅用于SOURCE tuple选择校验；不补未来writer/STOP/RESTORE。PAIR、PAIR_SHA、PAIR_REVIEW、PAIR_REVIEW_SHA均None，未调用producer。

主控报告实际CAS dispatcher eabf10a911740fc864165ff9d5e66f0e654edc755b31299924755f91aa050206只在草稿中标注为已观察normal39登记历史，不能用作future postwriter基线。actual current service、postwriter dispatcher/helper/policy、四键absence、八证据pin、角色/授权/时间均仍需真实取得，不填正向fixture。实际writer VERIFIED + 同C STOP + exactRESTORE + fresh postwriter root基线全部保留为必需。

本轮43项AST/metadata检查仅核新增差异、WIP先拒绝、原闭包方法未变、private未变、原API和接线位置。0server/PG/native/clock/issuer/receiver/patcher调用；0归档payload读取/重哈/构建/解包；未派T45或新QA。检查不构成SOURCE闭包通过、服务器READY、APP/PUBLISH、STAGED展示或正式业务验收。主控在合适节点取得T45最终新receiver SOURCE与两份scope实际pins后，D1只补确切配对增量。
