# OPT02 snapshot admission prototype — TEST ONLY

仅本目录3叶；未改production reader/旧host/DDL/GRANT，未运行PG。不能把pure/SQL文本/模型当实际执行计划、库存值、ordinary权限或≥30%收益。

## 最小候选及原逻辑边界

原 `product-management-query-reader.ts:45–74` 已先在同RR READ ONLY快照核唯一publication、原 `decodeImportCheckpoint`、guards、全matched SKU/全native WH coverage；但 `98–148` 每identity调用 `inventory_key_admission` 又重复批次/断点/完成检查。原 admission 与 `native_creation_operation_valid` 都是INVOCER，不是definer。

候选仅针对两条additional-warehouse/sku proof SQL：保原uncovered范围、ordinal/1000-batch、shape/scope表达式与first_issue排序；用MATERIALIZED维度/witness/关系集 + **原**native creation helper替重复key function。最后用LEFT JOIN+GROUP BY ordinal而非对MATERIALIZED结果逐key相关扫描，避免新O(N²)CTEScan。不新增enabled/hall许可规则，不碰stock sum/money/page/order。

原count/category检查仍在readList:190–195、资格前；原page/fits/stock:196–226在资格后。`runPrototypeSnapshot`只是该资格段的callback测试镜像，**不负责/不替代**原authenticate/authorize、issuer.assertReady、count/category、RR/READ ONLY事务、物理fence/budget/release。`runtime26Present`只是纯流程presence输入，不是capability/权限；返回stockValue:null、authority:NONE、actualSnapshotProved:false。实际接线只能由原reader同query闭包供给，不能把这个测试入口当新可信reader。

无跨请求缓存；每次flow重读publication。缺失/未知只拒绝或保持NULL，绝不产生数值零。源SQL须7021ca…/migration23须18ad09…；生产未来只用静态已审SQL，不引入运行时读源码/hash。

## 已有纯验证与限制

- 全scope/四组合retained/season flags、全部filter绑定；全仓证明不受page/空匹配缩小。
- publication/断点/guards/缺失重复/错误类别与首错、query错误、取消/迟到、完整page金额数量/排序/unknown≠zero。
- 独立关系模型24个WH×SKU逐项与原源模型一致，含缺hall/组/关系/未认可source/缺失；模型不是SQL执行。
- 用真实paired-v2 compiler→active alias4构造的339/4140向量核新statement直接SELECT +原native helper whole-row依赖，未发现新cell/EXEC需要。仅source闭包，不是实际ACL观察。
- 首轮12P1F为测试误把原first_issue LIMIT1也当分页截断；旧log/source保留，修正只针对matched/uncovered范围并仍严保原first_issue尾部。后来增加集合join与空集/count/category边界，最终结果见外部manifest。
- 未PG parse/execute、未原function↔候选实际差分、未实际plan/循环/buffers、未测窄回退/宽≥30%；全部PENDING。多坏数据同时导致SQL异常时，当前旧set-based本来也可后续异常抢先返回denial；候选实际异常优先级仍须差分，不能凭模型宣称完整等价。

## 下一最小production范围（须主控另登记）

仅 `adapters/postgres/src/product-management-query-reader.ts:98–148` 两条SQL的决策CTE/聚合；保45–74 publication/decode/guard/coverage顺序、原witness与所有异常检查，保185–226身份/runtimeassert/count/category/page/fits/stock。不改原0023，不需新DB函数/迁移；若实测另需新函数，只能新migration并另审issuer/ACL。

## 实际采样接口（不是当前执行许可）

`createPrototypeSources({readerSourceText,admissionSourceText})`→固定bundle；`prototypeStatements(bundle,{retainedDelete,seasonArray})`→8个固定只读SQL。输入原statement参数，不接受任意SQL：

- publication `[COMPLETE_SCOPE_DECISION]`；guards `[]`。
- coverage `[all,authorizedProductIds,productIds,categoryIds,years,seasonIds,supplierIds,fitIds,thicknesses,shapeCodes,batchId]`。
- warehouses `[batchId,witnessSkuId,'CUTOFF_MEMBER'|'POST_CUTOFF_CREATED',operationId|null]`；skus `[上述10过滤值,batchId,witnessWarehouseId]`；三个witness查询原参数不变。

先保真实原reader baseline（同101固定data/原native role/同genuine issuer；仅一次issue，不能二次issue rawPool）。peer的bounded metrics在host物理实际发送处记录**exact SQL hash+synthetic binds hash/tag/ID/dispatch-end**，不换pool/lease或metadata/hash。Full API/service elapsed、原SQL wall、issuer/admin fence/sourcepin成本分别列，不静默扣成本报收益。

EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON)只在单独PLANS阶段、同原普通身份/真实RR READ ONLY/samebindings、每send原fence/20min budget；不能夹到timing里。资格component原/候选对照不冒整API已优化，完整API after必须等上述最小production diff获批/实际执行。同source/data每场景first+repeat1+repeat2原始记录，不称P95或已清PG/OS冷缓存。

actual plans必须核publication/checkpoint公共段不再N次、维度CTE/HashJoin的Rows/Loops、Shared/Temp读写、原native helper仍逐identity的剩余成本；不能靠query次数或MATERIALIZED字样判通过。完整API/API权限、真实SQL差分/plan与性能尚未测。

## v2 必须保留的缺口记录

v1（bd88…）候选SQL **BLOCKED**：regex String.replace replacementString把SQL中的$1/$11当作捕获替换，生成嵌套SELECT的非法aggregate。此前17pure不足以证明SQL可执行；旧source/SQL/log不覆盖。v2仅回调replacement修复，并加全部8固定SQL bind-token多重集及完整aggregate源字面精确比较；先v1实际2RED再新版本GREEN。仍未PG parse/execute。

权限等价另待论证：108cell检查只证新查询需求均在当前exact339内，**不证明所有旧角色失败边界保持**。移走原key function同时去掉其EXEC/import_batch整行SELECT依赖；当前真实339与fullcanonical已含这些权限，可以限定真实差分，但生产改动仍BLOCKED_PERMISSION_EQUIVALENCE_PENDING。倾向在有additional维度的同RR原顺序首key+原witness实际保留一次原function语义调用，并将原decision纳原首错聚合，而非空ACL探针/遇false提前throw；这需要另审最小接缝，当前v2未偷偷加入调用或GRANT。
