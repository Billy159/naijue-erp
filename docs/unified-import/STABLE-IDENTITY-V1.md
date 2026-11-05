# 标准包永久身份合同 V1

适用于当前后继源码，复用 `UNIFIED_STANDARD_PACKAGE_V1`、现有中央 identity registry、现有字段和 ID 算法。不新增业务表、列或业务类型，不迁移既有键或猜测历史 UUID。普通预检和流式预检均调用同一身份验证器；这不是数据库安装通过证明。

## 生成工具与输入

模块：`packages/application/src/unified-import-stable-identity.ts`。使用工程指定 Node，直接导入：

- `createSkuImportIdentity({source_namespace, dimensions:{product,color,fit,size}, enabled, source_refs})` 返回 `{identity,fields}`。四个 dimension 必须是同一 namespace 中已经核定的完整中央注册表项，不能传显示名称。字段键依次对应 PRODUCT/COLOR/FIT/SIZE。
- `createDocumentImportIdentity({source_namespace,entity_type,basis,original_id,source_refs})` 返回中央注册表项；entity_type 仅 SALES_HEADER/TRANSFER_HEADER。
- `createLineImportIdentity({source_namespace,entity_type,header,basis,original_id,source_refs})` 返回中央注册表项；entity_type 为 SALES_LINE/TRANSFER_LINE/SALES_SETTLEMENT。SALES_LINE 与 SALES_SETTLEMENT 的 header 必须是同一 namespace 的 SALES_HEADER，TRANSFER_LINE 对应 TRANSFER_HEADER。

`basis` 为 `ORIGINAL_ID` 或 `PERSISTED_LEDGER_ID`。前者是来源系统真实永久编号；后者是本地主控在缺少真实永久编号时一次性分配并永久保存的 UUID。它是派生技术身份，不是声称发现原系统 UUID。

### 没有原 SKU 编号

四维元组按照商品、颜色、版型、尺码的**中央 canonical_source_key**精确拼装。尺码应先按已确认来源体系和尺码组解析；历史 910 与新裤组 910 不能因码相同合并。前导零、大小写和 Unicode 原字符保持，不 trim、不转数字、不改写编码。

输出 `fields` 使用现有 9 字段：id、product_id、color_id、fit_id、size_id、sku_code、enabled、version、created_operation_id。目标 UUID 为技术编号；sku_code=`NJIMP1-`+完整 UUID（43字符，不截断），不冒充原码。原码继续留在原字典和来源定位中。数据库 sku_code 为 text UNIQUE；普通/流式已有自然键重复校验继续生效，目标/技术码冲突必须拒绝，不能覆盖。

`enabled` 必须显式 boolean。未知、缺失或 null 报 `SKU_ACTIVATION_FACT_REQUIRED`，不能默认 true。131 个四维候选只是数量背景，不构成启用依据；本地主控需给每个候选绑定已确认启停事实或明确列为待核。已有 SKU 编号、ID 和键继续使用已有注册项，不用本工具重新编号。

### 单据及重复明细

原单号、日期、类型等继续填原字段，它们不因技术 ID 改写。单号如果并非来源系统内唯一且永久，不单独充当 ORIGINAL_ID。应使用来源系统真实永久单据号，或持久映射账本 UUID。

销货明细的父单外键为 sales_id，调拨明细为 transfer_id，必须等于对应父单注册项 target_id。每条明细的键包含父单 canonical_source_key、basis 和永久明细 ID。没有原明细 ID 时，为每个**来源明细发生项**一次性登记独立 ledger UUID；完全相同的重复业务行也必须有不同 UUID。禁止按商品/金额/内容去重，禁止每次重排重新编号。行号是展示/来源定位，不是永久身份。

如果只有两个完全一样的行，而新版来源无法判断哪条对应旧版哪条，不能算法猜配。具体缺口是该父单下逐条明细的永久发生项映射。保留最早一份来源定位与映射账本，由本地可靠来源键或已核映射接续；若无法接续，明确阻断该单的增量，不改变其他可确定记录。

### 销货结算发生项（SALES_SETTLEMENT）

使用同一个 `createLineImportIdentity`，每条结算发生项分别登记；输出的 `canonical_source_key` 写入 `sales_settlement.source_key`，`target_id` 写入 `fields.id`，`fields.sales_id` 必须等于该 SALES_HEADER 注册项的 `target_id`。helper 只返回身份注册项，不生成结算业务字段，不自动分配或保存发生项账本。

- `source_namespace` 固定，父单使用 `canonical_source_key`，不是显示单号、父单 target UUID 或文件坐标。父单必须同 namespace、类型为 SALES_HEADER；若其 `identity_basis=STABLE_IMPORT_ID_V1`，helper 校验父单 target_id 的派生算法；若为 `EXISTING_VERIFIED`，保留已核 target_id，不重新编号。子项键仍基于父单 source key，普通/流式预检再校验实际 `sales_id` 绑定。
- 有来源系统真实永久结算编号才用 `basis=ORIGINAL_ID`。没有时，由本地组包侧为每个**结算发生项**一次分配并持久保存 UUID，以 `basis=PERSISTED_LEDGER_ID`、`original_id=该 occurrence_id` 调用。该 UUID 是本地发生项映射，不是原系统 ID，也不是 helper 派生的 `target_id`；helper 只验证 UUID 形态，不能证明真实来源、历史对应关系或账本已持久化。
- 金额、收退款方向、账户、日期及内容相同也不能合并发生项。重排、重组完整包或更新 `source_refs` 时携带原 occurrence_id，不按新行号重新分配；无法证明新旧发生项对应关系时阻断该单的歧义增量，不猜配。已有结算注册项及已核 target_id 继续复用，不能再调用生成器覆盖旧 ID。
- `source_refs` 仍须提供有效、非空的 `{file_sha256,sheet,row}` 数组，但只用于证据定位。它不进入结算永久键或 target_id，也不独立证明发生项身份。稳定重组及合成预检通过不代表真实资料已核、已成功 PostgreSQL 导入或可任意 upsert。

## 精确算法

固定 `source_namespace` 表示同一原始数据集身份，不随清洗第43版/44版、文件名、文件哈希或排序变化。不同来源系统/独立账套用不同固定 namespace。

canonical_source_key 是 `naijue:source-identity:v1:` 加 JavaScript `JSON.stringify` 的精确数组，无额外空白：

- SKU: `["SKU", productKey, colorKey, fitKey, sizeKey]`
- Header: `["SALES_HEADER"或"TRANSFER_HEADER", basis, original_id]`
- Line: `["SALES_LINE"或"TRANSFER_LINE", headerKey, basis, original_id]`
- Settlement: `["SALES_SETTLEMENT", salesHeaderKey, basis, original_id]`

target_id 继续现有 `registryTargetId(namespace,entityType,canonical_source_key)`，即 `stableImportId("entity",...)`。它使用工程现有 typed canonical request hash，不是任意 JSON 字符串 SHA256，也不是 UUIDv5；必须调用工程导出函数，不能自行替换算法。取现有哈希前32个十六进制字符，按8-4-4-4-12分组。

注册项仍只有 entity_type、source_namespace、canonical_source_key、target_id、aliases、identity_basis、source_refs。新派生项 identity_basis=`STABLE_IMPORT_ID_V1`。source_refs 仍为 `{file_sha256,sheet,row}` 数组，只用于证据定位，不进入永久 ID。不得把本次文件哈希放进 namespace/original_id 冒充稳定身份。

## 重试、重排与后续增量

相同身份的键和 ID 不随业务内容、来源坐标或文件哈希改变；修改金额不会换 ID。新规格/新明细使用新的稳定元组/发生项 ID。源字段更新、生命周期和现有版本检查仍受原导入器约束，**稳定 ID 不代表已实现任意批次 upsert/增量写入**。重新生成的完整包应重用账本；包身份/计划变更不等于可以绕过原批次防重或更新约束。

预检仅对保留前缀做新增结构和跨表约束，既有不带前缀 source key 原样按原合同处理。结构不匹配报 STABLE_SOURCE_KEY_INVALID；entity不一致报 STABLE_IDENTITY_ENTITY_MISMATCH；找不到精确维度/父单报 STABLE_IDENTITY_REFERENCE_MISSING；字段 UUID 与解析结果不一致报 STABLE_IDENTITY_REFERENCE_MISMATCH。

## 合成样例及验证

精确字段、技术UUID及重复发生项样例：`stable-identity-v1.examples.json`（纯合成身份片段，不是完整可导入包）。可执行样例与131种四维合成覆盖：`tests/unified-import-stable-identity.test.ts`。完整标准包组装到普通/流式预检样例：`tests/unified-import-stable-identity-preflight.test.mjs`。两条入口的缺失维度测试在接线前均错误接受（RED），接线后拒绝（GREEN）。测试只用合成资料与本地临时 SQLite 预检索引，无 PostgreSQL 写入。

命令：

```
node --test tests/unified-import-stable-identity.test.ts tests/unified-import-stable-identity-preflight.test.mjs tests/unified-import-numeric-fit-profile.test.mjs tests/unified-import-stable-identity-doc.test.mjs
```

初始轮18项、后续25项是此前命令的历史结果，不包含后续结算覆盖和文档示例测试；当前验证边界见本文末尾。未运行全量、typecheck、build、真实 PostgreSQL、浏览器。安装执行及真实资料仍待本地 Codex 验证。

## 可直接执行的生成与校验示例

在仓库根目录执行下面命令。它只读随包的合成 JSON、调用真实生成函数并输出摘要，不写库、不创建账号、不生成真实清洗事实。`sku_generator_input` 是完整函数入参，不是新标准包表；输出 `identity` 放入已有 registry，`fields` 与相同 source_key/source_refs 组成 sku 记录。注册维度记录必须也存在于标准包或既有目标的已核映射中。

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createSkuImportIdentity,createLineImportIdentity,createDocumentImportIdentity,parseStableSourceKey,validateStableIdentityBinding} from './packages/application/src/unified-import-stable-identity.ts';
import {registryTargetId} from './packages/application/src/unified-import-contract.ts';
const e=JSON.parse(fs.readFileSync('docs/unified-import/stable-identity-v1.examples.json','utf8'));
const sku=createSkuImportIdentity(e.sku_generator_input);
assert.deepEqual(sku.identity,e.sku_registry);
assert.deepEqual(sku.fields,e.sku_record.fields);
assert.throws(()=>createSkuImportIdentity(e.unknown_activation_input),/SKU_ACTIVATION_FACT_REQUIRED/);
const lines=e.sales_line_generator_inputs.map(createLineImportIdentity);
assert.deepEqual(lines.map(r=>r.target_id),e.sales_line_registry.map(r=>r.target_id));
assert.equal(new Set(lines.map(r=>r.target_id)).size,2);
assert.deepEqual([...e.sales_line_generator_inputs].reverse().map(createLineImportIdentity).map(r=>r.target_id),lines.map(r=>r.target_id).reverse());
const transfer=e.transfer_identity_example;
assert.deepEqual(createDocumentImportIdentity(transfer.header_generator_input),transfer.header_registry);
assert.deepEqual(createLineImportIdentity(transfer.line_generator_input),transfer.line_registry);
// 两个结算 UUID 仅为固定合成发生项，不据此分配真实资料 ID。
const header=e.sales_header_registry;
const settlementInputs=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'].map(original_id=>({
 source_namespace:e.source_namespace,entity_type:'SALES_SETTLEMENT',header,
 basis:'PERSISTED_LEDGER_ID',original_id,source_refs:header.source_refs
}));
const settlements=settlementInputs.map(createLineImportIdentity);
assert.equal(new Set(settlements.map(r=>r.target_id)).size,2);
for(const [i,row] of settlements.entries()){
 assert.deepEqual(parseStableSourceKey(row.canonical_source_key),{entity_type:'SALES_SETTLEMENT',parts:[header.canonical_source_key,'PERSISTED_LEDGER_ID',settlementInputs[i].original_id]});
 assert.deepEqual(validateStableIdentityBinding(row,{sales_id:header.target_id},()=>header),[]);
}
const rebuilt=[...settlementInputs].reverse().map(input=>createLineImportIdentity({...input,source_refs:[{file_sha256:'b'.repeat(64),sheet:'SYNTHETIC-reexport',row:99}]}));
assert.deepEqual(rebuilt.map(r=>[r.canonical_source_key,r.target_id]),settlements.map(r=>[r.canonical_source_key,r.target_id]).reverse());
assert.throws(()=>createLineImportIdentity({...settlementInputs[0],header:transfer.header_registry}),/PARENT_ENTITY_MISMATCH/);
assert.throws(()=>createLineImportIdentity({...settlementInputs[0],source_namespace:'SYNTHETIC:another-dataset'}),/PARENT_ENTITY_MISMATCH/);
assert.throws(()=>createLineImportIdentity({...settlementInputs[0],original_id:'row-99'}),/PERSISTENT_LEDGER_UUID_REQUIRED/);
// 131 项是纯合成覆盖，不代表用户的 131 项真实候选已接受。
const inputs=Array.from({length:131},(_,i)=>{
 const input=structuredClone(e.sku_generator_input);
 const product=input.dimensions.product;
 product.canonical_source_key=`SYNTHETIC-PRODUCT-${i}`;
 product.target_id=registryTargetId(input.source_namespace,'PRODUCT',product.canonical_source_key);
 return input;
});
const generated=inputs.map(createSkuImportIdentity);
assert.equal(new Set(generated.map(r=>r.identity.target_id)).size,131);
assert.deepEqual([...inputs].reverse().map(createSkuImportIdentity).map(r=>r.identity.target_id),generated.map(r=>r.identity.target_id).reverse());
console.log(JSON.stringify({synthetic_skus:131,duplicate_occurrences:2,settlement_occurrences:2,settlement_rebuild:'stable',unknown_activation:'rejected',transfer_identity:'matched'}));
JS
```

真实 131 项的输入生成顺序：

1. 从本地主控已有已核结果读取每项商品、颜色、版型、尺码的完整 registry 项，不使用上面循环制造真实商品/尺码；同一维度需复用同一项。
2. 检查四项 namespace、entity_type、canonical_source_key、target_id。如维度缺少永久身份或原码对应有歧义，把具体候选和缺失维度列入待核，不用显示名称代替。
3. 读取每项已有启停依据，转换为明确 boolean；不能用 `Boolean(value)`、`value ?? true` 或“历史存在”推导启用。`null` 的合成样例明确抛错，未产生可接收 SKU。
4. 调用 helper，把 identity 注册项和 SKU 记录纳入现有组包路径；用所有引用处的同一 target_id，不另用本地随机 UUID。已有目标 SKU 必须消费已核映射，不能重新生成覆盖。
5. 保留原业务、金额、库存及启停证据；在现有 TABLE_SCHEMAS 下组装完整记录，并重新生成原包的清单、哈希、对账和计划。本文片段不能绕过完整预检直接当最终包提交。

## 永久发生项账本的本地接续协议

JSON 的 `local_occurrence_ledger_example` 是建议的**本地组包侧账本样例**，不是服务端新增字段、表或可自动证明业务身份的材料。`matching_basis` 中的 SYNTHETIC 值仅说明本例测试固定，不能复制为真实资料的匹配依据。

- 首次：仅缺原明细永久 ID 的发生项需要一次分配 UUID。两条业务字段完全相同的记录保留两行账本、两个 occurrence_id。将 UUID 和父单 canonical_source_key 持久保存后再组包；UUID 不从行号、内容或文件哈希计算。
- 重试：直接重用账本 occurrence_id。最新 source_refs 可以变化，first_seen_source_ref 仅保存初次定位；两者都不是独自用于新版自动匹配的永久业务键。
- 重排：移动明细时同时携带已建立的 occurrence_id。若输入重新导出且没有可核关联，不按“第一个相同行”强配。
- 增量：可证明是新增发生项才分配新 UUID；已有项复用旧 UUID。例：原单有两条完全相同明细，新导出只剩一条且无删除记录/永久明细号，缺口是“保留的是哪个 occurrence_id”，应阻断该单的歧义更新，不能任意留下第一条。
- 不改变原单类型、正负、重复行、优惠或收退款。账本只解决技术身份，未解决的真实业务选择仍单独列明。

算法的准确调用输入为 `requestHash(["naijue-cutoff-v1","entity",namespace,entityType,canonical_source_key])`，复用 `request-hash.ts` 的 typed canonical 编码后截取32个十六进制字符并分组；不要以普通 JSON hash 替代。既有导出 `registryTargetId` 是本地主控的推荐入口。

## 证据版本边界

后续独立复核覆盖追加后，此前三文件针对性命令为 **25 项通过、退出码 0**（此前18项为早期结果）。覆盖普通/流式错误维度 UUID、错误销货/调拨父单、合法调拨及引号/分隔符/Unicode 维度键。只反映合成预检与相关测试，不代表 PostgreSQL 或浏览器通过。A 独占文件的阶段哈希不包含并行修改中的 contract/stream 接入文件；最终完整源码、接入文件和文档哈希必须在集成冻结后统一生成。

SALES_SETTLEMENT 后续实现与离线阶段记录见 `evidence/settlement-permanent-identity-20261104/RESULT.md`，其26项主测和20项回归采用该记录各自列出的命令，不与上述历史25项混计。当前既有测试另覆盖持久发生项 UUID、同内容结算不合并、重排/来源定位变更不换身份、错父单/缺父单/重复身份拒绝、已核 target_id 保留，以及普通/流式请求一致、重放 record_id 和 SQLite 事实回读。`tests/unified-import-stable-identity-doc.test.mjs` 直接执行本文合成示例；本次仅同步文档和该文档测试，不改变 helper、业务行为或既有 ID。

2026-11-04 文档同步复核：执行上列四文件命令，**32 项通过、退出码 0**。实际运行时为 Node **24.22.1**，不是工程固定的24.21.0；该结果仅是当前云副本的离线定向检查，不是固定运行时或干净安装验收。

上述结算证据仅为源码、合成 helper/预检、离线请求与 SQLite 检查。它不是实际 PostgreSQL 执行、原生销货 API 回读、真实发生项映射或真实清洗资料的独立证明；既有阶段哈希不能替代当前整包冻结身份。
