# Source44 Root/Main 后继交付

本目录仅本机 SOURCE。Main scope2ee1、双历史说明a2f9、ordinary-access补充bac3
均绑定在 ACTUAL-HISTORY / FIVE witness 的实际来源引用中。本轮不含服务器
fresh、时钟、AUTH、CAS、Node模块运行、PostgreSQL、容器或 job 提交。

## 准确闭包与 owner

- D1：本目录 Root/Main/CAS/fresh/channel。真实旧 dispatcher 为132/e321，
  从冻结118e未签模板加实际43 policy9f2重建，字节与实际CAS回执一致；只新增
  Main指定的44五 key，候选137。旧132、旧loader/functions及三处guards保留。
- T45 frozen：`NORMAL44-FULL-DATA-CONTINUATION-SOURCE-01`，SOURCE
  `400ba4ebd1a622875ab6c2ebf6508f4b3d5d542ae12de433833c254f5f018ef5`；
  interface `aabab11c159d5917a759750a93d337080b4ab54c507326b5552ba7a354f4dece`；
  phases `b739f20a3c0d95b87b98ef34d950bc452be4427687589d8bb386b18865511032`。
- EXEC：`NORMAL44-EXECUTION-CONSUMER-01`，interface
  `54b93a038626a6492f8d3155c6b7483ea01dbc8c94be92f2a2d50d1695c20309`；
  bundles与frozen consumer一致，未签AUTH。
- Static：`NORMAL44-STATIC-ADAPTER-SOURCE-01`，SOURCE
  `a7a4ab6d64d2f753e3bf114213fb3c92cc23e6b51ffff7519551f42fdbdc5807`。
- QB已完成consumer/static差分：CONSUMER-FINAL-RESULT `860d26a7a525357574f9be27068db8a26b5fae14a4c275799196fd97e09f2251`。
  本Root/Main尚需QB新增差分；不能将consumer通过当作Root或实际运行通过。

上述T45目录均在
`outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01`。
配对未来RootPrep为 `NORMAL44-ROOT-EXECUTION-PREPARATION-01`，server stage为
`r3-normal44-registration-source-20261118-01`，CAS ENTRY指向同一stage的
`register_cas.py`。本轮没有调用 prepare_local/stage_and_read/register_once。

## 双历史与原计划

consumer priorService / previousStartBindings / FixedScope 保留真实42成功
Start→preservation Stop→Restore及SQL42后的ada/a5f/aef；Main8仍照准确42
接口。Root另强验43 FAILED2、typed incomplete09ee、原failed-start-cleanup2f5a、
process5f690、proof67c/ACK20457、Restore5a333/34f5及安全原值恢复；不要求
不存在的Stop43 PASS或成功四leaf。历史C2762f只验证真实proof绑定的birth、
name、image、operation及Running false/PID0，不猜它的ExitCode。恢复ownC616f
的Exit0则绑定既有真实回执。43 writer未签发提交必须保持；旧失败不重放。

新增43五条auth快照只保留stat9，连同此前18条共23条；不读其原件/密码/verifier
或摘要。prepare05 SQLite、raw initializer、44910步、原prepared/execution binding、
业务IDs/11:40 cutoff全部复用。Main7七参数、Main8八参数、writer E/P、原真实
stored四leaf校验保持；prepare不是新增phase。APP289、SQL42、sealed18 run2
不重编/重跑，不改前端或shared合同。

## 新 ordinary-access future fresh

`DESCRIBE-ACCESS-PATHS.json`固定454项（文件及祖先目录）：Root08 391个
非私密源码叶、reference INDEX+九输入、Node、现有固定dependency挂载的根及
三个metadata叶、原43安装record/proof对应投影。新44三个文件的显式0710/0440
权限已由consumer源码审查；此时未创建，不能伪称已实际读取。

Root08的`runtime/baseline-scope-input-pins.json`保持root0400、明确排除。准确
源码中的唯一读取点为Python `launch-fresh35-isolated-v1.py:1202` 的launcher
分支；describe选中JS调用链不执行该Python入口。source loader可读取launcher
源码用于source pins，不等于执行它或打开这个私密输入。

原STATE真实整体bind内包含Root08/operation，所以检查从STATE根FD开始，
保留其下Root08真实祖先。DEPLOY源是20261109-r1/deploy；依赖源DEPS父payload
0700在容器没有出现，不能拿host绝对路径的61035访问失败误判。固定映射把
DEPS挂在旧517 operation/node_modules，未虚构Root08 alias。

未来reader由root只打开真实bind根FD，再启动固定 `/usr/bin/python3 -I -S`
UID/GID61035、empty groups子进程；用dir_fd的真实kernel access、只读open和
fstat，不读取文件内容。检查目录X（reference递归需要R+X）、文件R、Node
R+X；输出安全stat9/访问结果，失败给具体映射和路径，禁止chmod/chown。
原43 record/proof投影只证明既有输入和对应投影父权限，不冒充新44的live proof。

若失败，fresh仍保存可审查的 `ordinaryDescribeAccess` 事实；Main7在唯一
`time.time_ns()`之前拒绝，不签AUTH、不CAS、不消耗Start44。成功状态也明确为
`PASS_MAPPED_EXISTING_INPUT_ACCESS_ONLY_NAMESPACE_UNVERIFIED`：不证明live
namespace/image外层虚拟祖先、ELF实际执行、全部writer输入或角色实际认证。
这些边界不能通过host同名目录、未来fixture、改时间或新容器假补。本轮该
access函数完全未运行；只有源码和内嵌child语法检查。

## 选中import与权限边界

`DESCRIBE-STATIC-IMPORTS.json`逐leaf匹配Root08准确sourceRows：入口静态runtime
图92个模块，加describe实际六个candidate-loader根后99个。剔除TypeScript
`import type`和全type named clauses后，无裸pg或其他third-party runtime import。
不是对所有潜在动态分支的Node运行证明。

`bounded-pool.ts`的裸Pool-from-pg不在选中图。whole-host的dynamic pg或固定
Linux driver在physical host函数内；combined-lifecycle的dynamic pg和
pg/package.json在runFresh35CombinedInstall内；describe均不调用。真正后续
writer固定Linux driver指旧517/node_modules，匹配既有DEPS bind。因此本轮
没有已证实的describe依赖解析缺口，不新增alias/mount。描述只重建目录信息，
不调用verifyPersistedProgram；不能把它说成已验证原SQLite/initializer全体。

## 本机验证与剩余事项

DELTA-CHECKS仅检查本次132→137的dispatcher差分、typed43事实、consumer闭包、
新fresh权限检查接线、Main接口/时限及Python语法，包含内嵌普通child的语法。
没有运行Root工厂、reader/access函数、Node、PG或未来正向fixture。既验SQL、
plan、APP、旧PG测试直接复用。worker300/300/3000/120/300、parent5100、CAS600、
service4200、角色offset4000/4120/hard4900、28GiB边界不变。

QB只复核本Root/Main新增差分及与准确consumer/static配对；之后仍需Main
具体runtime决定才能由T45唯一owner执行。真实整批导入未完成；STAGED不可见，
发布限制没有解除。本目录交付不构成服务器、PG、发布或业务验收PASS。
