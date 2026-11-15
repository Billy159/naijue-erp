# service29 DERIVE_ROOT114:41 根因与最小源码后继

**根因已确定：production prefix155 编译漏掉已存在的 SQL39 十函数模型转换。** 它将 SQL39 之前的 compact154 模型直接交给只接受 SQL39 之后154（或已派生155）的 derive 链，导致 ROOT114 L41 找不到 expected。不是超时、UID、C读取或真实数据库异常。

实际失败依据为主控提供的 start29 READBACK-02，SHA `2a13502f16249a9012cc7e57287a8ea5b532917f1f31ecbf28da3ac23026bb35`，ERR_ASSERTION / DERIVE_ROOT114:41:10；本次另完成必要的纯离线真实保留输入核对。未连接PG/服务器，未调用 genuine source/target/catalog 工厂，无UID/clock mock、业务演练或生产数据操作。未改物化703、旧D1候选、SQL、T45或服务器文件。

## 条件为何必不满足

准确根为 `outputs/T45/revisions/20261116-r3-service25-root03-source-local-01/source/scripts/release/unified-install`，不是其旁边另一路父原件。

1. `fresh35-batched161-upgrade-v1.mjs`（8f53…）L49–51先编译 compact154，再独立调用 production prefix155。
2. `fresh35-combined-catalog-v1.mjs`（原 f35d…）L358–366在 `buildFresh35ProductionPrefix155Catalog` 直接把 compact154 的 prior 传给 `derivePerformance155`，漏掉原SQL39十函数的离线变换。
3. `performance155/parents/20261115-r3-root114-final-combination-local-01/derive155.mjs`（16cc349d…）L12加载三个固定父候选；L37–41要求routine数量、规范化签名和完整routine行匹配。其 PARENT154-CAPTURE 中10个SQL39函数的 bodySHA，**10/10等于固定01-ten-routines.sql的afterSha256，0/10等于beforeSha256**。另两个父候选均155条，不能匹配未转换的154条。
4. 同一个catalog的原synthetic路径L281–316原本先精确应用十函数转换，再走后续155；production新路径遗漏的是这个组合步骤。不能删ROOT114断言、扩成任意154、换错父证据，或在真实库预先偷偷执行第一层来绕过源码错误。

示例：`assert_document_migration(uuid)` 的SQL39前body为 `0bd06d8d4d0163c5772233b72af9048c802387052aa18aa57ae21020b950130a`，固定PARENT154中为SQL39后 `508188784710a0bebaa7cf2d32e188f20ab82918e67a34b681d7b9d44951f5f4`。其余9项逐项结果见 OFFLINE-RESULT.json。

正确组合：**compact154 → 固定SQL39十函数离线转换（仍154） → 原ROOT114及后继derive链（155/114） → 原prefix guard/capture → 原DB05/161**。这仅在源码中推导期望模型；真实13事务仍按原顺序执行，SQL字节和提交/读回规则不变。

## 已准备的两文件后继

本目录 `source/` 只含必要增量，需叠加到原703；不是完整物化源，也未部署。

| 相对source路径 | 原SHA | 后继SHA |
|---|---|---|
| scripts/release/unified-install/fresh35-combined-catalog-v1.mjs | f35d9088e43b1fd78293e985f61d7924ed2e2da437a54047b3dc85fbd8ddaa48 | a49048834d6050d7e759733d7a3c7ec3f1726b6fabf0baa6512954e0cda75048 |
| scripts/release/unified-install/fresh35-sql39-catalog-delta.mjs | 新增 | 0fd734488724fa0f62906693f6a8d7f7211d534fb8145db12e99894ef7743084 |

从原synthetic编译器提取同一纯十函数转换，保留全部before/after/唯一anchor/数量/154条件。synthetic原V1目标守卫不变。production先读原固定SQL39（1f3deac1…，与第一层SQL同字节）、应用共享转换，再调用原derive。helper不接连接、不读取时钟、不生成token、不写业务数据；原模型和Map不被修改。没有改derive父函数或固定capture。

PINS.json SHA `782b2e507aac5de9bda86a691fafcfc5ec3cd92ce38965e9bc050de93c634969`；原catalog差分 DELTA.patch SHA `3360efc3f0a3d0051f763728f2408a6b520cb50dd8c92aced6256966d7bb363c`。新增helper正文在source目录，PINS明确列它为新增。

## 必要离线验证及边界

使用工程原Node24.21.0执行 `offline-input-regression.mjs`，仅读取实际保留 PARENT154/FINAL155 capture 与固定第一层SQL。先从保留SQL39后capture逐项逆转原10条edit，每项都恢复并核中原beforeSha256；这是**真实离线证据重建的SQL39前输入**，不是读取了live私有WeakMap或伪称本次genuine predecessor已存盘。

- 未修组合调用真实原ROOT114 derive，复现 ERR_ASSERTION，位置仍为 **41:10**。
- 新共享转换恢复的154模型与固定PARENT154完全相等；输入模型/definitions/bodies没有被修改，非routine类别不变。
- 接原完整derive父链后，155模型全部类别按既有canonical-row合同与固定FINAL155一致；全部155个定义及函数体逐字一致。原生capture数组排序与派生器保留/追加的顺序不同，比较类别内容时按现有derive合同排序，不伪称整个原始JSON字节/hash相等。
- 使用生产两个真实角色名的映射再次核对，155模型类别与同映射固定证据一致。没有改变业务身份、金额、库存、ACL语义或固定SQL。
- 两个后继模块 `node --check` 均通过；OFFLINE-RESULT.json SHA `b57c0ac5054b3d696348ec10e9428f7e73c21606bab3be9e37b252c95c76b7ad`。

没有重跑旧SQL、161模型或D3已验范围；本次不称genuine compile/native/PG/安装/REAL PASS。首次离线验证曾因直接比较native capture数组顺序而拒绝，已按原derive canonical-row语义修正断言后通过；未因此改模型或放宽ROOT114断言。

## 交接闭包

旧703和旧候选保留。后继catalog引入一个显式相对import，现有source importClosure会纳入新helper，并更新catalog自身pin；T45后续仅按此精确两文件delta完成新源码闭包及物化。**新完整sourceSetSha256尚未计算/物化，不得继续标703或沿用旧program授权**；descriptor/program/outer/九字段和必要operational引用须绑定实际新源，由原T45/主控/QB职责收口。D1未执行服务器写入或重物化。此前真实业务、DB05安装和REAL仍NOT_STARTED。
