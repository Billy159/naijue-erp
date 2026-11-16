# 完整HTTP底座的 ordinary161 / formal generation 接线

以 ef807b39b5ac8c483e9350dc72108d57716bf291 完整应用源码为底座；原归档 7fb9323db5270951c66fe6bf8b62f95d3ba2520bdbc1fc66cd6035e85cf0f018 与 source-manifest 全部文件摘要已实际核对。原 D2 定位 REPORT 88aee449…已读取。只写本目录；T45候选02、旧D1冻结6叶、共享源码、前端和release-contract.json无改动。未构建、打包或连接服务器/PG。

## 交付内容

work/ 是完整应用工作副本，source/ 是相对 ef807 的必要覆盖/新增闭包。PINS.json 将新实现与复用的已冻结161依赖分开列出。部署时不能只替一个host：源加载器要求完整284件 native source pins，另保留应用原文件与声明、运行owner接缝。旧 SQL36/38 文件及其历史回执没有改写；新增目录依赖中的SQL/JSON都是已冻结的模型/后继源码，只用于目录编译，不作为新迁移执行。

新实现集中在四件：

- fresh35-host-session.mjs：保留真实第6参，formal generation 走原ef807完整loader（函数体逐字保留，仅重命名），旧工具import C独立分支继续存在。formal的服务格式、owner/PG tuple、backup/restoration、SQL36/38摘要、netns、容器/namespace/物理身份和generation.bind均保留。原ordinaryWindow对formal未设capacity到期的行为、assertFresh35OrdinaryLeaseV2第四参assertOperational也逐字保留。owner CLOSED须在物理SQL之前拒绝。
- 同host普通目录在formal分支执行CompactZero base→Batched→CommandSuccessor，硬核161与模型626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811。安装历史/SQL36/38消费原baseCatalog；真实ordinary SQL与validator、state.catalog、opaque cap使用新的完整161目录，不向上重写历史。
- fresh35-combined-catalog-v1.mjs：新161 ordinary observation报告当前catalog descriptor的sourceSet，而非根sourceSet（两者在Batched后不同）；否则既有完整validator会拒绝。本改动只针对CommandSuccessor目录，旧普通分支不改。所有routine body/definition、35表、70类型和lineage仍核，未缩成子集。
- fresh35-host-session.d.mts保留原第6参/第四参声明并增加metadata导出；scripts/release/manifest.mjs的原223 compact闭包仍支持，同时准确接受带固定COMMAND-SUCCESSOR-PINS的284件本次闭包。没有扩大native路径白名单、修改发布合同或自动加入迁移。

复用依赖来自D1已冻结新161物料。原ef807 bounded-pool.ts、authentication/ports.ts、runtime27-command-issuer.ts保留原字节，避免丢掉generation.assertOperational的真实业务/登录lease接线。production-main.ts、production-provider-composition.ts、postgres-read-api.ts和production-generation.ts均保留原字节；销货历史read projection使用已交D1跨提交证明解码实现。原operator six叶不原地改动。

## T45准确入口与字段

原CLI不变：node backend/production-main.js --exact35 <canonical私域runtime文件>。runtime中的productionGeneration、capacityLaunch及既有NAIJUE_CURRENT_PRODUCTION_SERVICE_SHA256 / ADMIN154_SUCCESSOR / ADMIN154_PARENT_SOURCE / ADMIN154_PARENT_CATALOG_SPEC / COMPACT_ZERO_SUCCESSOR环境仍从真实生成、owner及恢复记录提供。

原production-main→provider→read-api仍调用：

```text
admitFresh35CompactZeroOrdinaryPoolV2(pool,connection,
 {sha256,capacityExpiresAt}, parentPins, successorSha256, generation)
```

第6参generation不能省略或造JSON代替：原ProductionGeneration的admin154RecordSha256/record38Sha256要匹配父记录，bind接收真实owner{linuxBootId,pid,startTicks}、postgres{containerId,startedAt,postmasterStart}、checkedAt和原C文件身份的assertProofCurrent回调。loader消费FRESH35_PRODUCTION_GENERATION_V1；当前普通NORMAL33 proof、appStarted:false不能当成它。generation由原createProductionGeneration与owner-live/容量通道创建，恢复也必须采用相同真实恢复目标的owner/PG/backup/restoration关系。

新只读metadata API（同一最终native35运行root）为：

```text
describeFresh35Ordinary161Source(sourceRoot,referenceDirectory)
```

它读取原受保护安装记录重建target，实际加载完整闭包并返回{source,catalog}。不传本机target fixture，不连接PG，不生成cap，不调用generation.bind，不写权威。T45可在最终root上用其实际返回sourceSet、catalogSpec/model/routineCount配对新包与启动/恢复计划。真实C/currentService仍由正式入口消费，不用此metadata伪造。

入场成功后 describeFresh35OrdinaryAdmissionV2(cap).ordinaryCatalog 给出本次真实验证所用目录描述。compactZeroSuccessor仍带旧recordSha，运行source/spec另报当前目录，历史receipt不重标。cap仅在原WeakMap及同pool成立，runtime27 issuer仍检查原current admission/lease；不得将JSON metadata当cap。owner关闭、C替换、source/ref变化、PG tuple不符照旧拒绝。

## 本轮验证与边界

- 完整production-main入口 tsconfig.launch-api.json --noEmit 严格类型检查通过。无生产构建。
- 从原生命周期模型提取实际host实现执行一个受影响formal-generation场景，通过；覆盖第6参bind原tuple、owner CLOSED在SQL前拒绝、capacity截止不误撤销formal owner及C替换撤销。仅测试模型替换了C/OS/catalog I/O，无法在真实模块发cap；不称现场权限通过。新目录builder另用真实源码/目录构造函数验证，未在模型中假装161通过。旧normal05/post-backup09已验项未重跑。
- 实际加载本轮source closure并运行Compact→Batched→CommandSuccessor，模型仍161/626c5604…；普通observation包含本次派生catalog的sourceSet。真正release native35Closure元数据consumer也已执行通过284件，未运行build/pack。COMPILED-SOURCE.json中的物理字段/时间只是本机编译fixture，不是现场C/owner或恢复证明。
- 原formal loader函数体、lineage函数体、owner-sensitive lease函数体、ordinaryWindow及四个入口/服务文件可逐字对照。无模型或角色/ACL放宽。

原formal loader还保留原R3的固定database/workspace，以及受保护安装物理身份和PGDATA device/inode=66304/13502421。新generation允许新owner/container/epoch，不自动授权另一PGDATA或独立数据库。若独立恢复的真实tuple/目录/安装目标不同，当前原分支会准确拒绝；须先由T45提供恢复目标及受保护记录映射，不能将本候选记为已支持任意独立恢复或静默放宽该guard。

真实C、环境、父pins、runtime、owner/恢复receipt由T45稍后提供，现场普通HTTP启动/独立恢复、Linux依赖、最终归档/READY及对应角色行为仍NOT_RUN。T45唯一集成与服务器owner；现有QB只核本次新增差分。当前交付不能把appStarted:false变成已上线。


## 交付证据勘误（产品源码保持冻结）

保留文件清单中的 provider 准确路径为 `apps/api/src/production-provider-composition.ts`，不是不存在的 postgres-provider.ts；与 ef807 原字节一致，PINS 已修正该名称。78件产品 source 的原SHA、4件实现/74件复用依赖与原SOURCE PASS不变。

`GENERATION-TEST.log` 是此前在 work/tests 跑过的模型证据。交付的 `checks/formal-generation-model.test.mjs` 现把相对源码引用准确指向 `../work/`；本次只验证这个测试载体路径。从本交付目录运行：

```sh
/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-runtime-20261022/node-v24.21.0-darwin-arm64/bin/node --test --test-name-pattern='formal generation admits the exact' checks/formal-generation-model.test.mjs
```

本次路径验证日志为 `CHECKS-PATH-TEST.log`。它仍是模拟OS/C/catalog的受影响单项检查，不是新PG、完整应用或现场验收；不覆盖或重标旧证据。
