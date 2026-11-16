# start34 COMPILE_END 后源码冲突与最小修复

本目录是D1独立源码后继，不改T45冻结源、ROOT06、前端、共享合同或数据库。没有新时钟、35号键、root登记或运行许可，没有native/PG/target/cap/身份样例实例化，没有重跑数据编译或演练。

## 实际证据与归因边界

T45实际start34 `ACTUAL-START34-RESULT.json` SHA `09a37c519d0ca0433191977dd9d1f2466ceb0337d7763b284e1a03c19b1afd8d`：FAILED2/45.367秒，十阶段到COMPILE_END，SOURCE_LOAD347→31035ms，TARGET_END31232ms，COMPILE_END34666ms；之后Error/DB05_COMMAND_PREFLIGHT_REFUSED，systemCode/guardCode/sqlstate均null，非超时。真实C a309、ACK773a、clean4183以及原DATA保留；catalog/PREPARE/writer没有提交。

原apply外01漏CLI参数是另一项已证原因，已经由apply02修正，不能混作本次原因。start34实际唯一authority参数正确。T45后续原restore34真实COMPLETED，typed SHA `1dab92bb68f7a6051205fec4de10e476a9ba018a7f4fffcaadb933c604d62703`，已由本机回读确认COMPLETED0/PG pid absent/ops空；私域认证快照不读取。

确定性源码缺陷：根入口main要求uid=euid=0才允许进入，已有IMPORT_BEGIN证明该前置通过。COMPILE_END之后调用链是：

`batched161-run.mjs compile` → `api.describeFresh35FinalPreparationBinding` → `fresh35-host-session.mjs readFresh35BatchedContextInputs` → `fresh35-combined-record-v1.mjs loadFresh35CombinedRecordEnvelope`。

最后函数的第一句明确要求uid/euid非0，失败码是 `FRESH35_COMBINED_RECORD_ORDINARY_RUNTIME_REQUIRED`。因此root预检一旦进入这条后段路径必被拒绝。之前TARGET成功走的是专用root metadata工厂 `loadFresh35Installed154UpgradeTargetV1`，不代表普通loader可供root使用。

这里**确认的是当前实现必然存在的身份合同冲突**。实际本次最早抛出的原始message没有保留，不能把上述码冒称为实际已捕获异常。既有mask不包含该码，且其Error/null/null投影与本次相容；动态晚期import或此前输入绑定若先失败，现有十段trace不能单独排除。实际first error message仍UNKNOWN。此区别保持，不以修复源码代替运行通过。

## COMPILE_END 后逐段核对

1. 原entry protected bytes/hash与动态entry/helper导入：保留原行为。错误文件/原始目标/身份形状的显式DB05 guard若触发会有各自白名单safeCode；本次generic并未直接记录这些码。Node导入异常仍受原catch处理，未扩大错误采集范围。
2. 原始目标d18 protected read、finalIdentity的admin/provision两键、publicTarget与helper.finalBatchBinding：原代码不改。绑定的target/admin来自同一实参，实际helper的manifest、7项sourceOptions及REGISTRATION与原纯函数预期逐值/实际requestHash对齐。没有构造人员、target或provision测试对象；真实producer本来已验证admin4个字符串/provision2个字符串的形状。
3. inputBinding生成后，原代码重新进入ordinary host读取、并再次装载/编译相同来源与目录。在root下首先遇到上述loader拒绝。这段是本次更换的接缝。
4. 修后先调用现有 `targets.assertFresh35Installed154UpgradeTargetCurrent(target)`。target是本次COMPILE_END之前真实root工厂产生并持有的原对象，未重建、伪造或从DTO造品牌。现有API保留root UID/真实target WeakMap/当前窗口/同源关联检查，并复核原安装记录身份、源码、当前C字节及同代身份。没有新增factory、放宽guard或取消复核。
5. 然后直接调用原entry早已导出的 `api.buildFinalR3PreparationBinding`。使用同一publicTarget/inputBinding、同一已验服务C和epoch、刚刚实际编译的after目录三项摘要，以及原native固定dbcandidate摘要dc08。五字段evidence与原普通host生成内容一致；新接缝仅复用其最终纯builder，不复制native机制，也不发行authority。
6. 最后的liveFacts、descriptor、payload、main返回、JSON.stringify、stdout与catch完全不改。builder返回的是freeze/structuredClone的publicTarget、inputBinding哈希、当前C/epoch、五个标量evidence和两个preparationScope字段。路径、请求key、哈希及epoch均沿原来源；不引入SQL/目标对象/cap、BigInt或引用环到返回对象。结构静态核过，真实完整describe/序列化仍未运行。

## 最小实现与适配

仅一个runtime叶：`source/batched161-run.mjs`，精确基于T45最终9dde中的 `start/bundle/batched161-run.mjs` SHA `820ad6f54f8ac06bceff6a5fd4903d73fe6fed033ac286e4b2bf8d0d93ce1e66`。差异见ENTRY.patch。删除后段helper.finalHostOptions/ordinary describe调用，改为上述现有root target复核和现有纯builder。

不需要ROOT06 native增量、任何新导出、新物化或新源目录：原1075B/a36f entry已导出buildFinalR3PreparationBinding；真实root target/current API也已存在于ROOT06。普通host/factory、组合记录loader、helper final33-run、原Root06 d20/078f与73ec历史materialization marker都保持原样。真正ordinary PREPARE/WRITER路径仍走原非root接口，不能把本次root修复扩大到它们。

T45接入时只消费该leaf变化，更新最终entry→collector RUNNER_SHA→host依赖/PINS及同代配对。候选保留原START34用于精确差异，**不得实际重跑已失败34**；后继实际任务号及source闭包由主控/T45另行明确适配，本目录不产生35或执行窗口。原参数形状、单authority SHA、预算300/780/3000/5100、观察10段、捕获上界和全部native权限/交易规则不改。

## 已做的窄检查与未测

命令：工程Node24.21执行本目录check_postcompile.mjs，以及 `node --check source/batched161-run.mjs`。结果见LOCAL-CHECKS.json。仅AST及真实静态注册/来源常量的原requestHash运算：root前置与ordinary实际guard表达式冲突、ordinary guard对0拒绝/对61035允许、原前10阶段前缀与其他所有函数/catch/返回不改、现有root复核关联、真实源常量匹配、原纯builder导出及固定evidence摘要一致。没有调用真实ordinary loader、root target API、catalog编译或builder来构造假target/cap/许可。

候选尚未经过真实root runtime、完整describe或数据库验证；不记运行/发布/导入PASS。旧ordinary guard保持原字节，纯谓词检查不能冒称实际ordinary native运行测试。

为证明源码身份冲突，无需再从失败boot取值或另开服务器诊断窗。已有原request producer/trace及固定源码足够；实际被mask抹去的first message无法靠读取现存stdout239B/固定stage stderr708B恢复。若主控要求进一步绑定实际first error，只能把“未保留”继续列UNKNOWN，不能从当前generic反填该码。修复的必要性不依赖追加宽观测或重试启动。
