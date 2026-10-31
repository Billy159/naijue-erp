# Historical sales-detail plan — retained coverage record

## Purpose and evidence boundary

2026-10-31 用户授权整理已实现的旧TODO，保留历史追溯，不以删待验项凑全绿。本记录迁移 `tests/history-sales-detail-plan.test.ts:46–51` 中13个旧占位标题；所有对应实际测试仍保留。该文件原有5个契约测试原样保留；真实PG验收TODO仍保留，旧“Mac only”措辞仅改为 authorized isolated synthetic PostgreSQL，不放宽隔离、授权和合成数据门槛。旧标题不是当前实现状态判断。

源码快照：`recovery/ui-combined-source-0201`。本轮既有执行日志：`recovery/ui-responsibility-standard-native-0206/standard-combined.log`（任务工作区证据路径，不是repo内文件），退出状态 `standard-combined.exit = 0`；3421 total / 3406 PASS / 0 FAIL / 1 SKIP / 14 TODO。下列行号均绑定此快照和此日志，不声称已执行整理后的回归。

**合成/纯函数/SQL协议测试已经执行，不等于真实PG、真实业务源或当前上线版本验收。** 未访问真实业务数据；标题中“actual SQL”表示实现生成并发送SQL，其协议测试仍以替身响应，不证明SQL引擎解析、数据库约束、隔离和持久性。

## The 13 historical checklist items and actual coverage

### 1. pure SALES_LINE mapper with full input recomputation

- 实现：`packages/application/src/import-v3-history-sales-detail.ts:59–140`。
- 真正测试：`tests/import-v3-history-sales-detail.test.ts:46` — `sales-detail actual mapper: whole prepared source/typed/provenance/unused approvals are rederived at SQL boundary`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1866`。
- 证据层级：合成输入/纯映射及SQL边界重算。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 2. pure SETTLEMENT mapper with separate original-method binding

- 实现：`packages/application/src/import-v3-history-settlement.ts:50–98`。
- 真正测试：`tests/history-settlement.test.ts:32` — `historical account and independent original method/name snapshots never copy the account's current method`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1696`。
- 证据层级：合成输入/纯映射。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 3. independently pinned sales-detail exact reader and full source coverage

- 实现：`scripts/import-v2/authorized-sales-detail-reader.mjs:38–125`。
- 真正测试：`scripts/import-v2/authorized-sales-detail-reader.test.mjs:134` — `SALES_LINE reader authenticates all32 approved cells, original raw snapshots and canonical aliases before independent native binding`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1114`。
- 证据层级：合成封装源/独立reader授权。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 4. whole 32-cell approval closure without blanket tolerance

- 实现：`scripts/import-v2/authorized-sales-detail-reader.mjs:100,143`。
- 真正测试：`tests/history-settlement.test.ts:51` — `whole32 exact-cell amount correction succeeds only for exact file/sheet/row/source/field/raw/candidate`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1699`。
- 证据层级：合成金额cell闭包；并参见第3项all32 reader。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 5. actual SQL same-transaction source+sales-line INSERT

- 实现：`adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts:63–69,114–122`。
- 真正测试：`tests/history-sales-detail-staging-postgres-protocol.test.ts:49` — `sales-detail pg protocol: actual source+typed INSERT/readback in one transaction, no native/stock/progress/publication writes`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1677`。
- 证据层级：SQL协议替身，不是引擎执行。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 6. typed payment native-source directory and distinct existing-target/creation authority

- 实现：`adapters/postgres/migrations/0017_native_payment_import.sql:9–29; packages/application/src/native-payment-import.ts:44–96; adapters/postgres/src/native-payment-import.ts:26–99`。
- 真正测试：`tests/native-payment-import-postgres-protocol.test.ts:38` — `old target without creation proof refuses; exact operation replay never overwrites current maintenance`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:2472`。
- 证据层级：迁移源码+SQL协议替身；另有native payment creation原子绑定测试。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 7. actual SQL settlement INSERT refuses absent typed payment binding

- 实现：`adapters/postgres/src/import-v3-history-settlement-staging-store.ts:89–100`。
- 真正测试：`tests/history-settlement-postgres-protocol.test.ts:28` — `settlement source and typed row stage/replay together with stable native locks before source checks; no live/native/stock writes`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1688`。
- 证据层级：SQL协议替身；测试体missingBinding断言在34行。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 8. exact source/typed-row/binding replay and partial/orphan rejection

- 实现：`adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts:72–85; adapters/postgres/src/import-v3-history-settlement-staging-store.ts:68–76`。
- 真正测试：`tests/history-sales-detail-staging-postgres-protocol.test.ts:72` — `sales-detail pg protocol: source-only, typed-only, changed proof or alternate target/key collision fail closed`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1681`。
- 证据层级：SQL协议替身。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 9. maintenance-after-replay without native overwrite

- 实现：`adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts:100–110`。
- 真正测试：`tests/history-sales-detail-staging-postgres-protocol.test.ts:58` — `sales-detail pg protocol: complete exact replay survives dependency maintenance; does not reauthorize current values or overwrite`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1678`。
- 证据层级：SQL协议替身。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 10. same-batch header/alias/canonical import scope proof

- 实现：`adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts:87–88,142–178`。
- 真正测试：`tests/history-sales-detail-binding-resolver-postgres-protocol.test.ts:72` — `sales-detail resolver returns exact selected same-batch header and old-to-canonical SKU proof through a read-only snapshot`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1646`。
- 证据层级：只读resolver SQL协议替身。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 11. whole-chunk rollback and no stock/progress/publication effects

- 实现：`adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts:63–69,90–122`。
- 真正测试：`tests/history-sales-detail-staging-postgres-protocol.test.ts:78` — `sales-detail pg protocol: row failure rolls back whole bounded chunk; source insert cannot be mistaken for typed success`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1682`。
- 证据层级：SQL协议替身；无额外写入断言另见第5项。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 12. unknown-COMMIT both actual outcomes without rollback or retry

- 实现：`adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts:63–69`。
- 真正测试：`tests/history-sales-detail-staging-postgres-protocol.test.ts:88` — `sales-detail pg protocol: lost COMMIT ack preserves original uncertain error for both outcomes; discard, no rollback/retry`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1684`。
- 证据层级：SQL协议故障注入；applied=false/true，不是引擎断网证明。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

### 13. independent publication field/lineage verifier before opening capability

- 实现：`adapters/postgres/src/history-typed-publication.ts:17–62`。
- 真正测试：`tests/history-typed-publication.test.ts:25` — `same-client publication requires exact manifest, full descriptors/deep readback and observed counts; it never writes FINAL itself`。
- 已执行通过证据：`recovery/ui-responsibility-standard-native-0206/standard-combined.log:1757`。
- 证据层级：SQL协议替身；实际深校验函数/trigger仍需真实PG验收。
- 边界：相关源码/测试已存在并在本轮运行，完整真实PG/部署验收不由此关闭。

## Retained real PostgreSQL TODO (item 14)

原条目为 `real PostgreSQL schema/guard/isolation acceptance on authorized Mac only`。现在保留为 `NOT RUN / ACCEPTANCE PENDING: real PostgreSQL schema/guard/isolation acceptance on authorized isolated synthetic PostgreSQL`。

专用真实PG测试源码已存在，如 `tests/integration/history-sales-detail.integration.ts:36`、`tests/integration/history-settlement.integration.ts:11`、`tests/integration/history-publication19.integration.ts:64`。本次标准日志没有这些真实PG用例的对应执行通过证据，故不能关闭验收项；也不据此断言过去从未运行过。必须有明确授权的隔离合成PG目标、对应schema/guards/隔离与事务验收结果，并绑定被测版本及环境。此次整理不执行PG、不修改集成测试、不改变其安全门槛，不给任意目标访问授权。

## Retained P03 skip (unchanged behavior)

`tests/integration/history-query-slo.integration.test.ts:23` 的 `P03 real isolated PostgreSQL baseline/difference/EXPLAIN/SLO` 保持原样。既有日志1596行记录skip原因：`Requires C-approved fresh isolated non-owner target and T45 supplied client/fixture/query inputs; no implicit database access`。

需要获批新隔离非owner目标，以及T45明确提供的client、baseline/candidate query、fixtures/规模和decode输入。该文件6–21行已有只读RR事务、结果对比、3轮计时、EXPLAIN ANALYZE BUFFERS和2000ms判定驱动，但skip本身是空占位，不表示驱动已运行。不得通过移除skip或填入空PASS宣称性能验收完成。

## Expected count change, not a new execution result

仅此整理、其余用例不变：3421 → **3408 total**，3406 → **3406 PASS**，0 FAIL不变，1 SKIP不变，14 → **1 TODO**。仅减少13个旧空TODO；没有增加PASS，没有删除真正执行的测试。单独计划文件预期由19 total / 5 PASS / 14 TODO变成6 total / 5 PASS / 1 TODO。后续其他真实新增测试另计；必须以root实际回归日志作为最终结果。
