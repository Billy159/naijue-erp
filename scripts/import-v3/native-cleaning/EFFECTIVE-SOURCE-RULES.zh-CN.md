# 旧源有效值规则：无 I/O 纯选择层

这不是旧库兼容读取层，也不是转换执行器。只在一次性清洗准备时，对已验证的普通 JSON 事实进行窄范围选择；不访问数据库、生成 target ID、写库、授予权限、激活库存或判定真实数据合规。完整转换、真实映射及新版业务验收尚未完成。

## 四个接口、三个规则组

- `productMembership({sourceRows, overlayRows})`：按原精确 ID 选择 source / overlay-only 成员。同 ID source 优先，deleted overlay 遮蔽；profile 不能生成商品。重复 ID、未类型化 deleted 拒绝。结果顺序仅是输入顺序，不声称原 SQL/UI 排序。不是商品属性合并器。
- `minimumPriceText({profile, overlay, sourcePayload})`：profile/overlay 的 own-key 明确 null 清除下层；缺键才回落。source 层则是 `COALESCE(source.minimumPrice, source.source.最低售价)`，source 直接 null 仍下落。空字符串、四位金额和大十进制字符串原样保留；不舍入、不假定单位。仅接受已抽取为 string/null 的价格事实；原 JSON numeric/bool/object 先拒绝，不默认 0 或偷偷转字符串。以后 extractor 必须保留 key-presence 与 JSONB 精确文本，不能先经 JS Number 丢精度。
- `mergeProductMasterRecord({base, overlay})`：仅复现旧商品 master 在 source/static row 已构造后的 body 浅合并。缺键保留 base，null/false/嵌套对象整体替换；不补 kind 特有默认值。
- `replaceBusinessMasterRecord({base, maintained})`：仅复现旧业务 master 已完成专属资金/party 投影后的整条维护记录替换。不把 source 缺键补回，不猜双角色或厅关系。

## 精确性和限制

ID 保持原文，不 trim、大小写折叠、UUID cast、按名称合并。输入不修改，输出与输入不共享可变 body/sourceFacts。`__proto__` 是惰性自有数据键，不提升为原型。函数拒绝部分非 JSON 结构，但它们不是通用恶意 JavaScript 对象安全解析器：调用域必须是已验证、非循环、有限大小的普通 JSON 值；Proxy、循环、恶意公开参数 getter、极深/极大对象不在本层安全保证内。底层 finite number 只是原值复制，不能当历史数字文本精度证明；数量/金额转换须交由同目录 exact-scalars，且必须提供明确单位/符号/NULL/证据规则。

没有实现统一 enabled 合并：catalog overlay-only 与 saleReferences 的 enabled 分支不同。没有实现 CURRENT_DISPLAY_ONLY 来源授权、库存 formal baseline/activation、员工登录/权限、尺码身份 crosswalk、原子提交、幂等发布或生产执行。任何展示默认零都不是库存源事实零。

## 来源与验证

`effective-source-rules.provenance.json` 给主控包和选摘 SHA。收到 22 个旧文件索引、22 个选摘；完整旧文件/实际部署配对仍由主控声明，不能由片段独立重算。本模型首次冻结时六卡未执行；之后主控已给 01/02/04/05/06 完成回执，03 仍 UNKNOWN。01 的 2941 source + 15 overlay-only = 2956 只是该恢复来源的候选集合，不能当最终有效、可售或成功转换商品总数。源码规则与根形状/计数检查都不是全部旧数据已经合规。

`tests/native-cleaning-effective-source-rules.test.ts` 随原 `tests/*.test.ts` 默认入口执行；原独立模型 15 项和额外独立 20 项审查通过。主树集成先记录缺模块失败，再引入本文件验证；不把这次集成顺序冒充原模型的测试先行历史。错误统一 merge 模型是后加 negative control，不是旧应用缺陷。与页面/生产 reader 无运行接线。

## 成员选择不遍历无关业务 body

`productMembership` 现在仅按密集数组slot读取自有数据型 `id` / `deleted`，不会递归遍历或复制unused body/价格/图像等字段；此改动不表示body已验证。其余最低价/两种master接口字节不变。用冻结对象、不可遍历body、必需metadata getter、重复ID/错误deleted等反例验证。它减少模型中的不必要处理，不是已测数据库/浏览器性能收益。
