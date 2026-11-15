# service28 genuine compile 失败：源码只读诊断

结论：**尚不能定位原始功能根因；已定位 caller 丢失错误类别和位置的具体缺陷。** 精确源码未见可证明的 export/import、返回形状、WeakMap 身份或普通/升级 target 混用错误。不据此宣布编译通过，也不能把 fallback 推断成 TypeError、文件权限或 SQL 缺陷。最小下一步是仅由 T45 caller 有限分类原异常及其受控源位置，无需为观测改 D1/重物化703。

本次0服务器/PG/工厂/issuer调用，无 mock、样本、演练或旧测试，无运行源码修改；只读正常调用链及必要小文件指纹。未复现原异常，静态检查不能代替实际错误或修复验证。27/28均已停稳、28认证已恢复等运行状态沿主控本次委托，不冒称本报告重新核了现场。

## 绑定证据

- 真实 start READBACK：`outputs/T45/revisions/20261116-r3-service28-registration-actual-01/start/READBACK-01.json`，SHA `5b895400397af84db93229b95b3d5b1e70d7147ec2c0b8d2cf408a70b3ec6683`。
- 已有失败的安全投影：`outputs/T45/revisions/20261116-r3-service28-stored-failure-projection-local-01/SAFE-FAILURE-PROJECTION.json`，SHA `c88a629c0a4fa55976c905ba20ca45d32885e1bed8e44300cfd72bfdf6b296db`。源码加载完成30778.963ms、TARGET_END30983.956ms、COMPILE_BEGIN30984.048ms；没有 COMPILE_END。stdout190B只余 UNKNOWN/PREFLIGHT_REFUSED/sqlstate=null。
- 实际 caller（下文 R）：`outputs/T45/revisions/20261116-r3-service28-registration-actual-01/start/bundle/batched161-run.mjs`，SHA `ebe67655c91d5cbc1cd9196192bde3c7ed0b3541113c66ac87ed127a06a2112f`。
- 物化源副本根（下文 S）：`outputs/T45/revisions/20261116-r3-service25-root03-source-local-01/source/scripts/release/unified-install`。本次仅逐件核正常链6个小模块，不计算703整树：installer `8f53a4ad3c135a81774e960656fb6012630e0921e571ad99ce6f8fc320101b9f`；target `5329f80c652f86405c7c43193dba2c043d9bd0e3bdf47c6950162528d9eccd22`；record `b411833ec42648645a25d187fb089554e304649e94190de38a36d70725a46e2a`；source `c393b5608d0dc95294e77fbf94cd6b393ee43dee41aaa75167215ae96b98741c`；catalog `f35d9088e43b1fd78293e985f61d7924ed2e2da437a54047b3dc85fbd8ddaa48`；performance155/derive155.mjs `9f0f3e9b4d78db937c42087891c89393ea76955e955bd654851fe5f0270f6649`。前三项也对应 D1 CANDIDATE-03，catalog 对应 CANDIDATE-01。源行以下按这些实际文件。

## 正常链与合同核对

| 编译段 | 准确源位置及正常合同 | 能证明 / 不能证明 |
|---|---|---|
| caller→compile | R 的 COMPILE_BEGIN 后直接 `up.compileFresh35Batched161Upgrade({source,target,paths,currentServiceSha256,backupAdminValidUntil})` | 调用名与参数对应 S/installer L39。IMPORT_END 已发生；静态 named-import 缺失、derive顶层输入读取失败通常会先阻止 IMPORT_END，不能拿它们解释本次已越过的导入段 |
| current升级 target | installer L40 → target L338–342，取私有upgrade Map数据，检查窗口，调用 record.assertFresh35RootUpgradeRecordCurrent，**返回 t descriptor** | 返回值不是 void/token；L41–46 消费 t 的 format/purpose/C/时间/proposal/physical 对应工厂 L325–329。TARGET_END 后还成功调用了 describe(target)，不存在已证实的返回形状错配 |
| record/source/C复读 | record L121–124 校验原保护记录、source、同一C身份；source L144–148复读固定 pins；installer L47–48另读固定 `/run/naijue-rewrite/current-production-service.json` | root路径/读取守卫使用原函数，未绕入非root普通reader；C与同原记录/epoch精确匹配。此前 target 成功不证明稍后每次读都成功，原生IO异常仍未知；不凭静态源码补现场权限/存在性 |
| 历史 metadataTarget | target L295–300由 genuine 保护envelope重建 productionTarget，进入普通 targets Map和 reconstructed WeakSet；L325–329另建upgrade target Map；installer L44–51从 bound 取原metadataTarget给catalog | catalog从未收到独立upgrade token；metadataTarget保留原历史proposal/ordinary/epoch，仅编译历史模型。不能为“修复”替成新普通目标、强造token或刷新旧窗 |
| predecessor154 | installer L49 → catalog L257–264 compact → L224–254 admin154 → L161–219 base152 | 每层用同模块catalogs WeakMap：base设置source/target/model/definitions/bodies；上层保留target并替换到相应source；返回真实token并取同Map数据。原model/functions由 source.resolveFresh35ReferenceInputPaths L25–41给明确modelPath/functionsPath；无证明的路径参数缺失 |
| base直接调用 | catalog L161–218涉及 pinned基准、schema段解析、body替换、角色映射、生成guard/observation；target L68–79对production的bootstrap网络读取返回null | 不会因历史metadata窗而走synthetic bootstrap文件/当前窗校验。parseFresh35DumpSections返回含name/type/text的数组，guardSql只生成文本，不执行SQL。map中缺数据、JSON或带键的语义断言失败仍需原错误区分，未将模型重新验收 |
| prefix155 | installer L50 → catalog L358–378再建compact，读固定prefix输入，调用 derivePerformance155(prior,roleNames) | S/performance155/derive155 L27–50逐层派生，父链为party-audit-key→party-set-scalar→root114；各正常返回model/definitions/bodies，顶层保留input额外字段。catalog解构这三项匹配。父链内部strict assertions失败可产生混合文本/ERR_ASSERTION，不会保留在现有fallback中 |
| successor161 | installer L51 → catalog L462–493 | 要求predecessor的source/target与传入对象相同、compact V2、production。这些对象来自同一compile/同一模块Map；正常链未clone token。固定模型/defs/bodies是JSON输入而非调用者可供对象；本次不重验原161模型 |
| manifest/原SQL/program | installer L52–65 | `sql/NN-...`先检查后slice(4)，与本机已物化prefix155的平铺文件名相符；SQL/manifest固定hash和13层逻辑未变。最终d为纯JSON描述并以program私有Map封装，正常shape与caller一致。此段是否到达没有回执，不能说本次已执行这些读取或校验 |

未找到可由以上正常链必然推出的 TypeError/ReferenceError 或身份桥错误。若错误在链接后的动态调用、原生IO或依赖数据校验中发生，现有“COMPILE_BEGIN”粒度无法给出具体落点。

## 已证实：外catch把不同异常合并成同一fallback

R L155–157只允许 `/^[A-Z][A-Z0-9_]{0,159}$/` 的 **完整 message** 原样保留，其余全部改为 BATCHED_INSTALL_PREFLIGHT_REFUSED；仅将5位大写/数字code作为sqlstate输出。没有保留error.name或受控调用位置。

- TypeError、ReferenceError、JSON SyntaxError、Node原生IO消息一般不匹配完整大写格式；Error/AssertionError也可能不匹配。不能由fallback反向确定类别。
- 原生 `ENOENT`、`EACCES` 各6字符，`ERR_INVALID_ARG_TYPE`、`ERR_ASSERTION`也不是5位，被现有sqlstate过滤丢掉；sqlstate=null不等于没有原生error.code。
- **主动校验拒绝也会被隐藏**：catalog L168的 `FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS:<key>`、source L146的 `FRESH35_COMBINED_CURRENT_SOURCE_CHANGED:<path>` 带冒号，均落fallback。由此不能排除精确源/模型条件拒绝，也不能直接认定原生异常。
- 相反，正常抛出的、长度合规的纯大写窗口/C/品牌守卫错误原本会保留其safeCode。因此不应仅因这次失败就放宽这些守卫。

## 最小观测修复建议：仅T45 caller，不改703

唯一缺失的诊断输入是：**本次compile抛出的原异常类别、有限code，以及它最内层的受控源位置（或原生IO逻辑输入位置）**。既有190B输出没有保留该信息，无法事后恢复。

在 R 的现有外catch保留原失败状态/exit2/connectionCleanup/automaticReplay，并额外输出一个有界diagnostic对象：

1. `stage` 仍为有限阶段枚举，保留最后 COMPILE_BEGIN；`errorKind` 仅允许 Error、TypeError、ReferenceError、SyntaxError、RangeError、AssertionError、AggregateError、OTHER。映射原name，禁止输出未列出的原文字。
2. 独立 `nativeCode` 白名单覆盖 ERR_ASSERTION、ERR_INVALID_ARG_TYPE、ERR_INVALID_ARG_VALUE、ENOENT、EACCES、EPERM、ENOTDIR、ELOOP、EMFILE、ENFILE、OTHER；与sqlstate分开，不输出自由原code。不要输出assert actual/expected或自由message。
3. **只解析、不输出 raw stack**：只接受精确OP内已知模块路径，将最内受控frame映射为固定逻辑枚举（UPGRADE、TARGET、RECORD、SOURCE、CATALOG、DERIVE155及其3父层、SCHEMA_PARSER、CONTRACT_PARSER）和整数line/column。保留最多少量受控frame；不输出绝对路径、其余stack或message。这样可定位到703原文件内某行而不修改它。
4. 某些fs异常没有用户态frame。此时允许 `syscall` 的有限枚举与**已知输入路径精确比对后的逻辑枚举**，例如 CURRENT_C、PROTECTED_RECORD、REFERENCE_MODEL、REFERENCE_FUNCTIONS、INSTALL_ORDER、PREFIX_INPUT、DB05_SQL、CURRENT_SOURCE_PIN、UNMAPPED；不输出原path。仍不能映射就诚实保留UNKNOWN，不猜位置。

由T45按自身caller闭包更新准确start/install runner及复制pin，主控/QB按既定owner做必要同版配对即可；不能猴补ESM导出/Map、替换genuine工厂、把错误吞成成功，或为诊断改SQL/数据库/源闭包。无需为了增加观测先重物化703。下一次实际获准的正常调用若失败，可在原失败回执中得到上述有限分类；本报告没有请求或启动新时钟/重复演练。

若源位置最终证明D1/derive功能错误，再依据那个具体行和原异常给最小修复；当前没有足够证据修改D1，也不把“未发现必然源码错误”记为运行PASS。业务、DB05安装和REAL仍为NOT_STARTED。
