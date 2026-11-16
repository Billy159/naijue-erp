# genuine preflight：最小观测候选

状态 SOURCE_ONLY_OBSERVABILITY_CANDIDATE_NOT_EXECUTED。这是下一必要正常链的观测接缝，**不是根因修复、原184B拒绝复现或现场PASS**。只交付 `source/batched161-run.mjs` 一个runtime叶及ENTRY.diff，不修改T45 normal/restore源、877807、9f16或任何现行授权；未开34、新钟、服务器、PG或原native入口。

## 准确底座和改动

准确底座为start33实际boot runner19921B/SHA6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4。新叶23714B/SHA10a0664fc27e70521be2be828d79884f9f1a90451de06ade72e56cb8288d4d6d。原REQUEST/START/OPERATOR、所有pin、成功descriptor/payload/liveFacts、guard顺序、opaque工厂、角色/权限/SQL/退出/cleanup均保留。原main/runUpdate/ownerGuard/readInput/文件读取函数逐字相同；compile只插入固定观测调用，剥离后AST与原函数完全相同，外层success try及failure exit2也相同。

新增阶段只通过既有stderr载体：

```text
T45_DESCRIBE_STAGE {"stage":"<固定枚举>","elapsedMilliseconds":<单调非负整数>}
```

只在describe=true发射，update路径不发射。没有把stage塞进stdout或另建日志协议；原process parser以已有describeTrace/lastReachedStage字段读回，lastReachedStage只能是这十个值之一或null。

| 阶段对 | 准确覆盖 |
| --- | --- |
| IMPORT_BEGIN / IMPORT_END | 五个直接模块Promise.all；C的首次文件读取/绑定在此之前，若更早失败仍是空trace。 |
| TRUST_BEGIN / TRUST_END | 原node路径和OPERATOR全树trust断言。TRUST_END至SOURCE_LOAD_BEGIN之间仍是原reviewed input/SQL封套检查。 |
| SOURCE_LOAD_BEGIN / SOURCE_LOAD_END | 原reference解析与真实compact-zero source loader。 |
| TARGET_BEGIN / TARGET_END | 原protected installed154 target factory及metadataTarget/descriptor提取。 |
| COMPILE_BEGIN / COMPILE_END | 原base/batched/successor catalog及descriptor/program摘要计算。COMPILE_END之后仍可能在原entry/helper/原始target文件/最终准备绑定处失败；完整十段trace不代表成功。 |

阶段elapsed仅满足既有parser字段，没有新增性能门槛/时间预算或延长原150/300等时限。观测不替代任何验证，失败仍UNKNOWN/exit2/NOT_OPENED/automaticReplay=false。

## 封闭失败字段

外层原失败五字段保留；仅追加errorType、systemCode、guardCode三个已被现有parser支持的字段。不添加sourceFrame、sourceModuleKey/line/column，不读取/解析stack。

- errorType完全等于原parser八值：Error/TypeError/ReferenceError/SyntaxError/RangeError/AssertionError/AggregateError/OTHER。
- systemCode完全等于原parser十一值：ERR_ASSERTION/ERR_INVALID_ARG_TYPE/ERR_INVALID_ARG_VALUE/ENOENT/EACCES/EPERM/ENOTDIR/ELOOP/EMFILE/ENFILE/OTHER；不存在返回null，未知字符串只返回OTHER。ERR_MODULE_NOT_FOUND等未在此旧parser名单中，当前只返回OTHER，不透出原字符串。
- guardCode只允许原parser既有两值：FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS、FRESH35_COMBINED_CURRENT_SOURCE_CHANGED。实际源码的冒号后缀（关系名/路径等）完全丢弃；其余guard均null。不是宽前缀通传。
- safeCode也由本准确底座所有28个literal need guard + 固定PREFLIGHT fallback组成29值闭合表，保留这些现存合法码；未知DB05前缀异常也回落generic，避免原宽regex传出任意全大写异常文本。此处只收窄外层preflight输出，不改原runUpdate内部处理/回滚/清理正文。

只读data descriptor取得name/code/message；不调用getter或Proxy trap，也不把原异常文本、路径、栈、SQL参数、管理员/凭据值序列化。message仅作有限成员查找/闭合guard归一化，返回值永远是上面的固定值。没有guardCode扩展或parser协议扩展。

## 已验证的最小seam

`check_observability.mjs`只隔离候选中真实观测函数/常量来检查输出；不求值任何原入口main，不替身root/source/target/catalog或SQL工厂。使用普通JS Error/TypeError、getter/proxy及非真实敏感sentinel检查脱敏，不构造native target/cap/数据库fixture。

已过：Node24语法；原非compile函数逐字+AST不变；compile移除阶段调用后的AST不变；外层成功返回与失败exit2不变；旧真实7ac捕获回复五字段兼容；29 safeCode正好等于准确源码guard集合+fallback；八组错误输入无getter触发/无sentinel外泄。Node检查只发真实固定stage行，随后由**未改动**的T45 parser（start_owned_describe.py/1c8521a2…）实际解析：四枚举集合完全相同、十段有序/单调、每个trace前缀最后阶段正确、四个公开failure字段完整接受。

CHECKS.json/PARSER-CHECKS.json/STAGE-PARSER.log保存有限结论。没有新成功业务DTO/driver/生产target，没有再跑全preflight、native、PG或fixture。成功协议通过源码等价验证，没有实际成功descriptor样例，不能称实际成功场景已运行。

## T45最终组装责任与未测范围

本候选保留START33，**不能因此重跑已终态33**，也不是34或部署授权。T45在主控以后明确的必要正常候选里配对这一个entry增量：

1. 更新原start_owned_describe.py的RUNNER_SHA至该最终entry实际pin（当前候选10a0664f…），parser逻辑无需改变；正常host对entry和collector的静态pin同步为最终字节。
2. 原ROOT06/input02完成证据不重放、不改历史marker。本叶是boot observer增量，不把ROOT06 marker中历史installer runner6c7653伪写成新值。若未来正常链还需变更请求键/实际C/作用域，只能由原owner按新明确委托配对，不由D1猜值。
3. 在**新正常候选的原组装入口**加入最终实际字节的跨文件断言：restore consumer.CURRENT_SOURCE == SHA(final normal_service05_after08.py)；CURRENT_PROOF_SOURCE == SHA(final proof.py)；start规则及许可normalServiceSha256/proofSourceSha256也等于这对最终pin。不能用旧31c3或defd代新host，不能只更新这一个entry漏配恢复consumer。本轮不改已冻结恢复source。
4. 原QB只核新观测/接线差异，主控决定下一必要正常链；不能因为本机logger检查通过就发运行/业务权限或标根因修复。

新的既存挂载取证66d4927c…/97dcc8ad…仍把底层原因保留UNKNOWN，本候选不把ROOT06/node_modules host ENOENT、旧deps uid1000或父STATE RW推作已证根因。它只为下一必要链保存之前缺失的有限观察。
