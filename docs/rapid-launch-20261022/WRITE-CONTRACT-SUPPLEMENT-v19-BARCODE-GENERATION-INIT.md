# 条码保存与六方案初始化：SOURCE575 纠正版技术确认单

**APPROVED_WITH_CORRECTION：依据主控直接人类回复 `call_fcbc01113b4d42bea015ddd58a1d5513`，系统货号手工必填、无空分配；整组规格、新增颜色补完整规格及条码；其余批准内容继续。旧分配器、额外内部身份及强制改旧手工值的建议撤回，未实施。**

## 已明确执行的业务规则，不再重复询问

系统货号由人手工填写，空白阻止保存，不使用技术ID、款号代填。按 v17：所选颜色 × 所选版型 × 实际尺码组全部成员，只补缺少的真实SKU组合。例如已有黑色、增加白色，保存补齐白色 × 所选版型 × 全组尺码；不设计逐个M/L再XL开规格的流程。

新增加组合保存时，按2026真实规则自动补其缺少的新主码；原SKU、主码、兼容码、停用项不批改、不重编、不恢复。2026当前、其余五方案历史，新建默认2026及兼容旧码准确SKU补录保持。

## 最终 Demo 证据与字段结论

冻结 `frontend/index.html:17` 的加载顺序为 product-catalog → barcode-2026 → product-master → product-current。最终 `product-current.js:95` 的“系统货号 *”输入直接写 `barcodeItemCode`；`product-master.js:56/63` 将该值作为系统货号并在保存前检查非空；`product-current.js:205/212` 方案说明把 goods 段直接标为“系统货号7位”。

因此，最终 Demo 没有已核实的另一套独立内部七位编号。正式工程现有 `systemItemCode`／`product.system_item_code` 对应该手填字段即可；**不新增条码货号字段、不新增分配器、表、列、序列、索引。** 早期 `allocateItemCode` 回退不能作为当前空表单自动分配依据：最终必填验证已在保存前阻止空值。

真实2026算法仍为 `5 + 真实SKU版型码1位 + 手填系统货号7位 + 颜色码3位 + 尺码码3位`。代码必须来自实际字典，不能截断、补位、猜码。

Demo 对非空但不是七位数字的手工值，与空值处理不同：`product-catalog.js:43` 中条码健康检查不通过时仍保存资料，并给“条码资料尚未完整，补齐后再次保存”的说明。不得用此前 `ERP-X9` 例子将原本可保存的手工资料一概拒绝，也不得自动替换其值。无法生成的新码保持缺失，明确反馈原因，不伪造生成成功。

## 剩余最小技术增量：原保存内补新组合的码

复用原 `POST /api/products/v2/commands`、CREATE／EDIT、手填 systemItemCode、v17 skuSelection 全组补齐及原 barcodes。保存自动处理本次新增真实SKU组合，不增第二套生成API，不新增“仅新商品出生可生成”的门槛，也不再把手工生成意图开关当活跃方案。

后端以 previous／next SKU真实ID差集确定新增组合，读取同事务的实际方案及fit/color/size编码，仅补新增组合尚无主码的部分；不对旧SKU批量填空码。保留全局原码唯一（含停用绑定）、每SKU最多一个启用MAIN和原身份约束。原productFacts／rootDelta／完整SKU及条码行、原审计和UOW已能承载，D1已确认零新增生成审计标记、零生成审计结构守卫改动。

新增主码和原SKU保存仍在原权限／原键／版本检查、审计预备→rootCAS→SKU／条码→回执→COMMIT事务内。有效码冲突整次回滚，不换码或新键自动重试；取消／读取不写，同键重放返回原结果，未知提交先查原键。原STAGED／PUBLISH及真实SKU生成准入不变。

保存结果和详情继续使用原合同，不新增提示字段：F2按原详情的真实SKU与barcodes核实本次新规格有无MAIN；非空手工货号或字典码不符合实际2026规则时保存资料、明确提示条码未生成的原因，原值不变，不伪造成功。不以此再增加审批障碍。

## 六方案初始化：沿已核实的唯一动作

原CORE已提交，新增唯一 `IMPORT_INITIALIZE_BARCODE_SCHEMES`，仍是原IMPORT目标，在同batch、BARCODE写入前，核原不可变CORE回执／审计／出生准入、当前binding、实际授权账号和目标。

首次方案表全空才原子写入已批准exact6 UUID／七字段快照：2026CURRENT、其余5HISTORICAL。原actor＋原key＋同hash＋配对COMMITTED audit/receipt＋整个exact6一致才可重放；异key、partial、missing、extra、drift拒绝，不补缺或更新。

原IMPORT结果六字段 `{operationId,batchId,sequence,cursor,status,ledgerEntryIds:[]}` 保持；seq只加1，cursor/counts/expected不变，零claim／ledger／余额效应，不授MAIN/PUBLISH。

D1精确数据库增量：`receipt_action_by_kind`、`audit_action_by_kind`两CHECK加入唯一动作；`validate_import_batch_commit`、`validate_import_accounting_checkpoint_commit`、`validate_import_operation`三函数加窄分支＋一个exact6／COREbirth／currentbinding／zero claim-ledger校验。`guard_import_batch`、原claim守卫及`assert_core_initialization_v14` creation/final模式不变；不伪装空CHUNK，无新表列。

D2原商品叶负责生成实现；F2原表单负责必填、完整组合及读回反馈；D3六方案叶独占；D1原IMPORT闭集／精确补丁／元数据能力；C统一合同与整合，T45唯一实际执行。既有兼容码保存和已过定向检查独立继续，不重跑。当前新生成／初始化写分支尚未实施，实际源码和数据库均未修改。

本单已按人类纠正获批；尚未实施，待C登记准确原owner文件即推进。最终Demo字段证据不要求新增内部七位身份或表列。
