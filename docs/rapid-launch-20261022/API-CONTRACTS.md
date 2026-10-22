# 接口合同 v1：现有字段接口已冻结

冻结来源：B00当前源码清单，见EXISTING-API-MATRIX.json；源码基准8211285。仅冻结当前实际存在的接口/DTO，不代表生产验收或批准新字段。

外部统一同源/api，叶插件路径保持原值；服务端核实会话、Origin/CSRF与实际角色，前端不传schema证明。已有DTO精确源码以矩阵dtoSources为准，不能擅自扩宽字段、分页和金额单位。

- AUTH四路和LIVE单据SAVE/APPROVE/UNAPPROVE/VOID既有合同保留；prepare-create不是CREATE命令。
- 保存/读取内部金额minor-unit整数文本，商品/导入历史SQL金额为元的十进制文本，禁止互相当作同一单位；数量和计数保持整数文本。
- 现有receipt返回operationId、单据ID、version、status、ledgerEntryIds；实际单号由保存后detail读取，不猜测或生成前端单号。
- party-maintenance与party-read的重叠GET由D1唯一总装配选择；D2叶插件不跨界总装配。
- HISTORY与LIVE明确分开；imported-history四POST仅已发布真实基线可读，schema19限定证据不等于真实输入已导入。
- 新维护/六页签/历史修订接口等待D2/D3建议汇入本合同；涉及未批准字段的写语义仍关闭。

B01生产宿主配置冻结：公网Origin=https://1n5635n614.goho.co；外部API前缀/api；保留旧local-https宿主回环合同。实际listen/可信代理和运行配置由C02核真实服务器后写入部署配置，禁止猜测代理网段或放宽校验。生产host应要求显式输入这些值，缺少配置拒绝启动。
