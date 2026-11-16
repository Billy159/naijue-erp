# start33 genuine preflight：只读诊断

结论：底层根因仍未知，未复现原184B拒绝，未做源码修复。当前证据不足以选择具体FS/import/target/catalog/最终绑定throw点。没有新fixture/cap/伪target，未调用原native入口、root target/catalog factory或PG；未读管理员原始值。恢复877807与T459f16源码保持冻结。

## 真实输入/版本

- 失败typed `RUNTIME-WINDOW-SUCCESSOR-01/ACTUAL-START-FAILED-01.json`，SHA9e2a0abb672daff71941282dd43f7683e92b31c29401dc8d45c5b6d54115a202。start33首次FAILED2/47.956秒，非150秒超时；原PGDATA13502421 clean stop已有b225/c30与实际C6e80。无update/prepare/writer或业务写。
- 已存边界 `AUTH-RESTORE33-SUCCESSOR-01/ACTUAL-GENUINE-BOUNDARY-01.json`，SHA7ac887b601bac7632f46b259f0fe6ca40d70e149c8f0945ac2068bc578c0eeb7。原请求728B/362fff…只提供键型；actual admin/provision值未读取。C四绑定断言、finalIdentity形状已由原保存字节核真。
- 实际执行boot `batched161-run.mjs`＝19921B/6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4；五个直接OPERATOR模块的本机字节与真实边界元数据SHA/bytes全部相同。ROOT06实际387文件/371继承+16变化，sourceSet d20f9f89…。
- stdout184B/83a1d8fd…只有UNKNOWN、DB05_COMMAND_PREFLIGHT_REFUSED、NOT_OPENED、automaticReplay=false；原始error/type/stack未保存。入口269–273把所有非DB05前缀错误压成此泛码。此版本没有T45_DESCRIBE_STAGE emitter；空trace/lastStage=null不指示失败在import之前。argv/env只有固定bridge源码重建，不能声称已取得当时快照。

## 三个按实际执行顺序的可证伪假设

1. **入口/文件/import/trust边界失败**（main:251–260，compile:54–84）。预测：若只是常规root/argv/env/受控入口/C绑定/显式pin或SQL封套guard拒绝，应产生对应DB05_COMMAND_<固定码>，而不是当前generic；若是底层ENOENT/EACCES/模块链接或UNTRUSTED_ROOT_INSTALL_PATH等非DB05错误，则会被压成generic。

   排除/缩小：真实保存C四项吻合；五模块字节/export存在。本机Node24.21.0使用同`--no-global-search-paths`成功导入这五个真实模块。17个显式入口guard的源码错误码都满足最外层原正则，正常throw不会转成观察到的generic，详见STATIC-BOUNDARY-CHECKS.json。不能据此排除FS系统错误、strict JSON parse/TypeError、执行命名空间中的受保护文件状态或其它模块内部错误；也没有把源码重建argv当实际快照。

2. **reference/source内容或加载契约失败**（compile:85–87）。预测：若准确d20源码及其九个固定reference输入本身存在决定性的pin/解析/源码闭包冲突，相同真实loader和实际冻结输入会在本机同一阶段拒绝。

   本机实测：真实`resolveFresh35ReferenceInputPaths` + `loadFresh35CompactZeroSource`通过，返回FRESH35_COMPACT_ZERO_SOURCE_V2、sourceSet=`d20f9f89091f7a0c1006fdadf0c5fecc7711dc7398d8e2cf0471789c2f9ea898`、有效currentSourcePins=284。物理交付387文件和有效pin284是不同范围，不据差值认定缺失。没有执行native/root admission、制作fixture或绕过权限。本机文件内容可兼容已证；服务器命名空间、元数据/瞬时变化尚未证。

3. **真实root target→catalog→最终准备绑定内部拒绝**（compile:88–118）。预测：若是固定模型core、entry字节、命令SQL封套、静态登记/审批flag/祖先pin不一致，相应实际字节比较应失败；若仍是protected target/current envelope或catalog转换中间状态错误，必须取得那个分支的有限guard/type或阶段观测，不能用假target推进工厂。

   本机纯实际谓词通过：固定reviewed input849288…与SQL摘要、单DO封套正则；entry1075B/a36f2a…；七项sourceOptions、四项registration及四项祖先pin；helper同一实际target/admin参数同步传递；原model2469…与core2e2a…的routines/constraints/indexes/triggers/relations/columnAcls/schema/tableNames/owner九项deep equality。BASE_MODEL_CORE_DIFFERS不是这些准确本机冻结字节上的已复现缺陷。没有构造root protected target或catalog token，所以这不是整个catalog/目标工厂通过；没有读取原始管理员值来伪造最终绑定。

## 本机反馈的准确限界

SOURCE-MATCH.json、SOURCE-LOAD-BOUNDARY.json、BASE-CORE-PREDICATE.json、STATIC-BOUNDARY-CHECKS.json保存有限结果。下面这条真实纯source调用已经执行通过；不是原184B错误的红/绿回归，也不等同原运行环境复现：

```js
const root = resolve('outputs/D1/20261116-r3-final-source-prepare-01/work');
const ref = resolve('outputs/T45/revisions/20261115-r3-batched-carrier-prep-local-01/materials/reference-inputs');
const api = await import(pathToFileURL(root + '/scripts/release/unified-install/fresh35-combined-source-v1.mjs'));
const paths = await api.resolveFresh35ReferenceInputPaths(ref);
const source = await api.loadFresh35CompactZeroSource(root, paths);
api.describeFresh35CombinedSource(source); // 只描述真实source factory产物，不发执行cap
```

命令使用工程Node24.21.0、`--no-global-search-paths --input-type=module`；没有运行batched161-run main或任何副作用factory。source loader局部绿色只排除相同字节的确定性加载冲突。正确的整个失败seam还缺现场protected root对象/命名空间与丢失的catch原因，当前不能宣布根因已证或已修。

## 最窄后续缺口，交C决定

恢复实际完成前不追加现场动作。恢复后若只读既存metadata有必要，优先仅核已保存boot/readonly-mount-plan.json、normal-service-create-attempt.json中与OPERATOR ROOT06、SERVICE投影和reference目录有关的source→target/readonly映射，与原已保留carrier mount证明配对；不输出全docker argv/env、原请求身份值或认证正文。当前7ac的五模块metadata来自host `/srv/...`路径，不能自动证明执行命名空间内`/var/lib/...`每个路径及ancestor都满足同一个trust判定。还可对**已知固定code路径**只返回首个uid/mode/symlink/缺失异常项的固定代号，避免全树重复扫描/全量hash。

但**原始异常/type/stage没有保存，不能要求T45从不存在的旧文件恢复它**。即便上述metadata无差，也不能精确排除late factory分支。若下一次必要正常候选被C明确授权，最窄新观测应限于：lastStage固定枚举、errorType有限枚举、systemCode有限白名单、已知项目guardCode及固定sourceModuleKey+line/column；无原error.message/stack/path/SQL参数/管理员值。阶段边界只围绕SERVICE/IMPORT/TRUST/REVIEWED_SQL/REFERENCE/SOURCE/TARGET/BASE/BATCHED/SUCCESSOR/FINAL_BINDING这些现有await；不能将这种观测增量称作根因修复，也不能因此擅开34、重跑原start33或扩权限。

## 新正常候选的版本配对要求

本轮没有正常start源码变化，故未改已冻结恢复源或旧组装。以后任何新正常start源发生变化，必须由T45在既有新候选组装时同时断言：恢复consumer的字面量CURRENT_SOURCE等于最终start主文件实际SHA；CURRENT_PROOF_SOURCE等于最终proof主文件SHA；新start规则/许可的normalServiceSha256和proofSourceSha256与同一最终pin一致。以最终字节计算，不借旧31c3/defd或回填旧source；新候选才加此断言，原失败/修复/恢复证据全部保留。
