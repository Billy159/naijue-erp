# v20：原生记账审核时间文本兼容确认

状态：待用户确认。仅下面的新格式准入等待；历史编辑验证、页面与其他后端工作继续。

## 实际问题

真实只读检查133耗时0.521秒：53个仓库项的结构、来源类型和身份形状均通过，审核时间全为三位毫秒文本，因此被当前仅允许六位微秒文本的MAIN输入校验拒绝。原创建程序使用 `new Date().toISOString()`，导出保留原JSON，并非导出截断。原SQL凭证要求原JSON精确相等，CORE承接还要求完整项哈希相等；将原文补零会破坏这些绑定，不采用。

## 本次只申请一个变化

原生记账项 `nativeRecord.reviewedAt` 在原有六位UTC格式之外，增加接受严格三位UTC毫秒格式。例如示意 `.123Z` 保留原文，已有 `.123456Z` 也保留全部六位。仍校验真实日历日期，不接受零小数、1/2/4/5/7及更多位、时区偏移、无效日期、空值或其他类型。

不补零、不截断、不使用当前时间替代、不改原创建凭证或来源文件。不新增表、字段、索引或SQL变更。原JSON精确凭证、CORE22完整项哈希、SKU已准备指纹、数据库时间比较、权限、版本、原请求键、事务及回滚均保持。

## 准确修改边界与验证

生产只改 `packages/application/src/native-import-record-accounting.ts` 的 `isCanonicalNativeRecordReviewTime` 一处，其唯一调用仍为原生记账项审核时间校验；不放宽其他全局日期合同。

原owner D1修改，必要定向检查仅 `tests/native-import-record-accounting.test.ts`、`scripts/import-v3/prepare-native-bindings.test.mjs` 及 `tests/native-import-record-accounting-postgres-protocol.test.ts` 的受影响项：三位/六位保原文与精确瞬时、非法格式拒绝、原JSON/CORE绑定不变。QB沿原路由复核新增范围，T45再用原53仓库及必要SKU小证据验证；通过后才能制作真正的新来源准备后继，不重放132或133。

源码、数据库和MAIN执行目前均未因本单改变。确认仅放行这项三位/六位文本准入，不授权改变审核事实或其他业务规则。
