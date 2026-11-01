# current_revision 精确选择（纯函数 / 无 I/O）

已纳入 native-cleaning 的独立纯函数，未接提取器/writer。用途是一批已证明完整来源cohort中的原revision精确选择与结构对账，不是原body清洗、历史权限或转换成功证明。

## 复用核对及来源

现有 `scripts/import-v3/` 对 `current_revision/currentRevision/active_effect_revision` 全目录源码检索没有等价选取小件。`prepare-native-bindings.mjs:255–259,292–304` 的 `prepareFullSourceBindings26` 接收调用者已准备的 `documents`，交 `buildHistoryTypedClosureExpected26`；后者是新版typed/provenance闭包，不负责旧 runtime指针JOIN。不能把它当作此选择器，也不复制其安装/命令/权限框架。

旧来源（全部只读；完整旧程序的配对仍是主控声明）：
- 新规则包 `SOURCE-EXCERPTS.json`，command.js:136–143，原整文件声明SHA `2c7a9da7d0a90a5878ae37d944b79b5c7abe52f3f4fdf6290cf094a975cbf9f8`：`JOIN revision r ON r.document_id=d.id AND r.revision=d.current_revision`。本小件没有锁/DB，不能冒它的FOR UPDATE事务行为或原NOT_FOUND错误兼容。
- 原 `旧库字段目录.csv` 第60/69–70行：document.id=uuid NOT NULL；current_revision、version=integer NOT NULL；第68行active_effect_revision=nullable integer。第539–544行：revision.document_id=uuid、revision=integer、original_imported=boolean、body=jsonb均NOT NULL，actor_id可空。
- 原 `旧库约束目录.csv` 第33行document PK(id)，第74行revision FK(document_id)→document(id)，第75行revision PK(document_id,revision)。CHECK表达式语义UNVERIFIED；没有证据便不擅加revision>0、连续性或version=current_revision。

输入/复用检查的准确SHA见SOURCE-MANIFEST；没有访问业务行、数据库或第三方指令。

## 接口及可合入路径建议

当前文件位于 `scripts/import-v3/native-cleaning/current-revision.mjs` + `current-revision.d.mts`，测试 `tests/native-cleaning-current-revision.test.ts`。本阶段仅无I/O选择模型，没有生产运行接线。

```ts
type PgInt32Input = number | string; // 经运行时严格核验；不是任意number/string
interface SourceDocumentPointer {
  readonly id: string; // 原uuid::text的lowercase canonical表示，非新ID
  readonly current_revision: PgInt32Input;
  // 原version/active_effect_revision/其他字段留在原数组，不读、不改。
}
interface SourceRevisionPointer {
  readonly document_id: string;
  readonly revision: PgInt32Input;
  readonly original_imported: boolean; // 搬运原标志≠新历史授权
  readonly body: unknown; // 原值不递归读/解析/复制/重序列化
}
interface CurrentSelection {
  readonly documentIndex: number; readonly revisionIndex: number; // 0-based
  readonly documentId: string; readonly currentRevision: number;
  readonly originalImported: boolean;
}
declare function selectCurrentRevisionPointers(input: {
  readonly documents: readonly SourceDocumentPointer[];
  readonly revisions: readonly SourceRevisionPointer[];
}): {
  readonly selected: readonly CurrentSelection[];
  readonly counts: {readonly documents:number; readonly revisions:number;
    readonly selected:number; readonly unselectedRevisions:number};
};
```

调用者用 `revisions[selected.revisionIndex]` 取回同一来源的原行（body、actor、时间均仍在原数组）。本模块只返回索引/源ID/计数；原body或header不在输出中。**源ID仍敏感**：结果是RAM内部接口，不应原样写公共日志。raw JSONB文本和所有未选历史必须独立保全，本选择结果绝非删除未选revision的指令。

输入是同一个来源快照、完整选定cohort的两张逻辑集合：不是任意分页片段、抽样或只给一页headers却给全库revision。完整范围/快照/原rowcount/digest必须由来源提取合同另证，本纯函数无法从漏传的数组证明真正数据全集。拒绝缺失、重复和所给cohort内orphan，不能静默过滤/删行；不据这些纯负例认定真实库已有缺陷。

- 数字表示仅精确[-2147483648,2147483647]整数，拒NaN/Infinity/fraction/JS负零；字符串仅规范十进制（无+、前导零、指数、空白、小数点、-0），BigInt验证int32后才能转Number。两种提取编码相同数值视作同一revision，故2与'2'重复会拒。源header原字段保持原来的number/string，不被规范化覆盖。
- 不擅加>0；接受0、负数、int32两端仅表示可做原指针对账，不表示这些值是已通过原业务约束的revision。
- body必须有自有data字段且不是undefined；JSON null原样合法。**本函数不能从JS null分辨SQL NULL和JSON null**，NOT NULL来源/提取证明是上游前置；不把缺字段/undefined补null，更不补0。不会访问body子树，避免新一次JSON数值精度丢失/秘密日志。
- 普通对象/密集数组的已知metadata字段做own-data检查，不按名称/近似ID匹配；上下文为上游已约束大小的输入，不是Proxy/循环对象通用安全验证器，也不解析body全schema。
- 非选中的其它原revision只计数，不改、不删。结果顺序仅headers输入顺序，非旧app列表/分页/时间排序合同。
- 不读version、active_effect_revision或MAX(revision)；不生成任何身份、source binding、CURRENT_DISPLAY_ONLY投影、审核回执或capability。

## 真实测试顺序与命令

先写16个测试，再写明确标注的初始错误MAX候选并保留 `INITIAL-MAX-CANDIDATE.mjs.txt`：`attempt01-initial-MAX-RED.log` **4P/12F、exit1**。随后实现精确JOIN/PK/FK拒绝，`attempt02-exact-selection-GREEN.log` **16P/0F、135.7ms**。初始MAX只是本次开发的错误候选，**不是旧app代码或已发现的旧app缺陷**。

```bash
node --test tests/native-cleaning-current-revision.test.ts
```

涵盖：current≠MAX/version/effect；复合键精确JOIN；number/string匹配与重复；缺失/duplicate/orphan拒绝；无>0臆测；JSON null/缺body；不递归读body；冻结非变异；不泄源值的错误code。无SQL/PG/旧副本/生产/恢复/权限/写库/性能采样。

## 原v1合入建议（由主控处理，不在此更改）

`native-cleaning/source-effective-values.mjs` + 同名.d.mts可承载4个已冻结导出：
- `productMembership({sourceRows,overlayRows})` → `{id,branch:'SOURCE'|'OVERLAY_ONLY'}[]`，仅membership。
- `minimumPriceText({profile,overlay,sourcePayload})` → `string|null`，仅明确string/null域与原COALESCE；不是price规范化器。
- `mergeProductMasterRecord({base,overlay})` → overlay metadata＋浅合并body，base已按原category/fit规则构造。
- `replaceBusinessMasterRecord({base,maintained})` → kind/id/body/version/sourceFacts整替换语义，专用fund/party投影须先完成。

以上接口没有单位/币种/ID crosswalk，**不可与通用JSON三层merge、默认零/管理员或直接writer授权混用**。实际标量可另走主控已own的exact-scalars，但须先给明确来源规则；本小件不选它的单位/比例/币种策略。

## 主树集成补充

集成测试先记录缺模块失败，再加入同字节模块与类型声明。新增末尾 LF/CR/CRLF 回归覆盖；精确 Node 24.21 原实现已经全部拒绝这些输入，未改正则、不把假想风险标成修复。默认 tests/*.test.ts 会自动包含本单元。旧模型中的初始 MAX 错误候选仅是开发负例，绝不是旧应用缺陷或曾用 MAX 的证据。
