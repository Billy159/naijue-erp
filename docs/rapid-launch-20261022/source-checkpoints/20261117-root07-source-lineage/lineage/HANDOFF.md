# ROOT07 一叶 SOURCE 继任与严格目录来源配对

已实现原算法的真实多层源摘要派生和最小宿主配对。采用真实历史 catalog35 + 实际 ROOT07 材化 marker + 静态来源映射；后续 PREPARE 原有同一物理连接完整 catalog 校验保持。没有独立 PG metadata 作业、DDL 或新的“catalog 已运行成功”收据。

本输出只承接已通过的词法候选：D1 SOURCE17ff / SOURCE-PINS4999，QB RESULT `3690724c13a05698afbdf640ad72fb2a2eed62aa8469b87e4addbcef237a3549` 和必须同读的澄清 `4a048b02e446b841ac791c3d6334d6200498fb1bcfcee999f8a19c995e6ade9c`。该既有代码验收不重跑。本批新来源合同另待原QB窄审。

## 真实摘要与物料

- Main SOURCE身份决定 `f5f7e4c6c2a5fbec2e61624f5d8d74e2e6e8c7ee3440a7a174761c4860e1b197` 选择 ROOT07 新key与独立目录，但未签有限执行许可或证明key空位。
- 387个真实原路径逐项保留，唯一变化 `tools/unified-import/fresh35-host-session.mjs`：0a10/105820B → `36f5e49c10a4e7541ed6a77cc377030b7ff343b7bd462ab2001a41040488d368`/105724B。其余386叶原字节，源/目录模块、SQL、模型、body/definition输入均不改。
- 新source-rows SHA `74de5cbfd7315fbfa28be3f42087cb187709b16a0685dcca3a24ae1e66c3813e`；source-description SHA `c0b18a897fa32f956f0c8d2950b2631c3be1a8debb517fc53f67097e84d3f7b9`。描述沿用现有 T45_R3_EXACT_FROZEN_SOURCE_DELTA_V1，精确前驱 ROOT06 73ec/rows078f/source d20，installerRunner 原6c7653…不变。T45消费原物料机制，继承数正确为386。

| 层 | 新的实际源元数据摘要 |
|---|---|
| combined | cec20f538bacbf980c0afe86187cece90f46725c34de947a4b131e285efbd6ce |
| admin154 | 54dcc1647790df63df1c6d7d377d5bdc881f07638a90db6cff936005068c209e |
| compactZero / operator | f9a7f170360185a2993b2e4e6d5fb3d1eb1767bcc325d71b72b2723c16faae7e |
| batched command sourceSet | db127efd32e1953fa550e56bd715b6ea334cc9d7e141217c4da8151bcd8c7803 |
| catalog descriptor，历史真实安装metadataTarget | 344ccd895e1e65dedf0fdae5be71e291a6226ba5c21d9c0f4276b2be5490f362 |

`derive_metadata.mjs` 直接调用冻结原多层 loader/catalog 算法。输入是20261110真实 creationFacts.target（文件d663dd…，target SHA fe0b…）和真实38 START6206输出；传入真实历史startsAt作纯 binding-only 元数据，不构造未来C/epoch或执行能力。先精确重现 ROOT06 d20 / catalog cf27 / **现场9f4595**，然后对一叶新源派生。旧05609只是旧本地fixture计算值，不是catalog35现场证据。

344ccd 是由真实历史安装metadataTarget派生的静态目录描述，不是未来C的升级program/authority或执行结果。未来实际 START/PREPARE 的 service/current epoch/lease/binding 仍由既有严格loader实际决定并核对；本批不制作未来正向fixture。

`metadata/` 保存原、新的三层源结构、三层catalog完整描述及原算法观察SQL。`check_lineage.mjs` 独立按原属性顺序重算combined/admin/compact源结构摘要、batched pins与command review链及catalog descriptor摘要，不以末层284pins散列代替多层算法。三层catalog除 sourceSet/observationSql/catalogSpec 三字段外逐字段相等；最终 model626c与guardSQL原字节相等；观察SQL仅来源tag变化。

## 最小严格接线

`SOURCE-CATALOG-LINEAGE.json` SHA `eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0` 只证明静态来源继任，显式 nativeCatalogRuntimeProven=false。

`source_lineage.py` 校验实际新marker/原ROOT06及旧catalog35精确pins，不连PG、不读clock。`final33_host.SOURCE-CANDIDATE.py` 与 `FINAL33-HOST-NOT-APPLIED.patch` 基于T45 ReferenceError WIP a33dcc…：

1. 保留原catalog35函数的每条root/public、service、完成/commit/readback、保护capture及摘要guard，仅改名为 historical_applied_catalog_successor。原来将历史回执与新expectedBinding相等比较，改为与精确旧 cf27/9f/626c 比较。
2. 新包装先执行全部历史校验，再验证已复核静态来源proof和实际ROOT07 root/public/marker。不能缺一、不能用ROOT06 marker代替ROOT07。
3. current expectedBinding 单独精确要求 db127/344ccd/626c；实际当前service/current epoch/transactionMode等原守卫继续保留。安装32原历史校验完全不改。
4. 新authority只增加闭合 sourceLineage 引用，含固定proof SHA及**待真实ROOT07完成后**取得的terminal/result/public三个摘要。示例接口里的这三值均为null，不能执行。
5. 所有PG原生准备、事务、完整35/161校验、结果/cleanup/失败边界保持。静态来源proof或材化完成不能替代live PG、CLOSED或业务成功。

宿主marker中的 sourceRoot 是Main指定 `/srv/.../state/installed-real-operation-batched-root07-20261117-01/operation`，不是容器 `/var/lib/...` 路径。原ROOT06本地下载为pretty投影，检查用原材化pack规则重新编码后精确匹配既有root SHA73ec，仅作为真实旧输入的拒绝检查，不制作未来marker。

新增bundle叶只有 `source_lineage.py` 和命名为 `source-catalog-lineage.json` 的静态proof，均在387源码树之外。T45唯一owner将消费候选差分，完成其三份runner/root07路径、host、marker reader及直接/传递pins同版本闭包；D1没有改T45目录。代表host仍有旧38 phase身份，只作源码差分，不能执行或重放旧38。新phase/实际许可/注册由Main和T45配对。

## 实测与未测

已执行原算法纯元数据派生；原真实身份校准、所有新摘要、同模型/guard/观察tag差异检查通过。`check_successor.py` 验证29个无关宿主函数AST完全不变，旧历史函数除期望值来源外所有guard保持，当前校验仅增闭合sourceLineage及新源pins；真实ROOT06输入被拒作ROOT07。未构造未来ROOT07或C的正向运行fixture。

有一次本地探测误选带当前有效期检查的 fresh35Admin154ControllerCatalogSql，其内部读取Date.now一次并拒绝。已改为原纯 fresh35CombinedCatalogSql，未绕过守卫。详见LOCAL-ATTEMPTS.json；成功派生路径clock=0，不把整个工作回合冒称0clock。

未做服务器动作、有限签发、native准备、PG连接或全业务批次编译。ROOT07尚未实际材化，新normal角色时钟未启动，真实数据导入未完成。原sealed18 run2不重跑，STAGED/发布限制保持。未选用的独立PG metadata程序草稿仅保全在held-not-selected，不进入交付运行清单。

下一步先由原QB核本批来源合同，T45配对最终物料carrier；Main按真实停库/精确恢复证据完成SOURCE-only单项登记/许可，ROOT07实际材化应发生在下一normal role起钟之前。不能用未实际运行的静态资料替代许可、空位或成功回执。
