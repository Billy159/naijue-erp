# normal34 问题记录核查（2026-10-29）

当前 findings 共 72 条，observations 共 15 条；findings 含撤销记录 2 条，不能把总数当作有效缺陷数。

撤销记录：N34-I07-LEDGER-ESC-01、N34-P18-SEARCH-FIRST-ESC-01

非撤销记录未发现 sourcePinned/source 字段：无；字段存在不等于定位充分。

截图字段名称不统一，包含 screenshot、screenshots、evidence、pairedEvidence；只检查顶层单一字段会误报缺失。需逐项人工确认截图版本与操作状态，不据字段存在断言有效。

此核查仅对现有记录做结构清点，不代表全部操作、真实业务或整页通过。
