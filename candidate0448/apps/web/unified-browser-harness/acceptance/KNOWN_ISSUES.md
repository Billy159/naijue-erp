# 已知差异、FAIL与待核（不把 source/DOM 当实机 PASS）

## 真实 Mac 失败，已改代码但仍待同条件复验

旧管理HTML `95c7790d9e498dd2967a9f4ce89f85d7b9d9945bc86cbb5ee75ad1efcb238bef`：

1. 商品默认“全部年份”“全部季节”省略截断。1470×724、DPR2、zoom1：trigger160；idle-selection121/121；idle-token79/79、max-width calc(100%-42px)；idle-label47/48。active tag-content48/48，合法input32×24，不应隐藏input。修复只改商品idle lone token `:only-child max-width:100%`，保留多token计数预留，不改active输入。
2. 商品Drawer Escape后activeElement BODY；原查看按钮同节点connected enabled。已改真实click捕获trigger、native dialog先close、React关闭commit后有scope票据回焦。
3. 条码方案详情同上。已改同一关闭/回焦协议。

DOM以native close将焦点转BODY的shim回归，并补Esc后新导航/新控件不抢焦点、身份与拒权清除。**不是浏览器实测已通过**。

## 明确存在的业务/接入差异

- **P1 新统一 actualApplication DOM 已复现，未修：** SALE手工新增→SAVE丢响应→查询原receipt确认→跨模块到商品→左侧“销货单列表”→直接点“新增销货单”，仍显示原已保存CREATE editor，而不是空白proposal。旧回归只证明先明确返回列表再新增的路径，不能覆盖跨模块重入。应在真实浏览器同路径复现，记录菜单/面包屑/原单号/表单状态；不要再次保存或擅改session当本轮验收完成。交回dot/交易owner处理。本包保持此已知缺陷，不通过删除断言宣称全流程PASS。

- 商品新增/编辑/删除/6Tab全页、价格维护、条码补录、上传、库存Tab未实现。3Tab只读Drawer不能替代这些页。
- 分类/颜色/版型仅只读，写动作disabled；尺码组/季节/条码方案本来即为只读，不补假写。
- 商品无native created_at，用稳定款号/id排序而非伪造Demo创建倒序；领裤型raw code中文映射未确认；版型来自实际SKU、季节单FK，不伪造Demo多季节/无SKU声明版型。
- 全目录访问不等于全仓库存/九价/媒体访问；unknown保留null/未提供，不补0。合成数据不能证明生产grant完整。
- 客户/供应商拆分是已确认变更。统一预览若只读配置已接则新增/编辑必须disabled，不能点后才模拟成功。
- 新单候选目前fixed modal，不是原Demo所有锚定/行内选货交互；列表日期/新单日期/既有编辑日期并非全部同一种Arco组件，见ARCO_REUSE_REVIEW。
- 库存流水、扫码、导出/打印/操作历史、员工账号、营业厅仓库维护、收款配置未接，不是空页或假成功。
- 新单只支持明确页面内存prepare/newSAVE/receipt。审核/弃审/作废/库存写入不在合成transport范围。新端原生recovery/unknown提交结果状态不是Demo旧runtime同名功能。

## 仍需逐页实测

交易新单布局、菜单/面包屑、筛选标签、候选modal焦点；库存矩阵与滚动；独立客户/供应商布局；所有管理新页与4Tab；Arco真实DOM来源；CSS互相污染；窄屏/resize/键盘；线上只读功能遗漏。没有全站视觉PASS。

本包内联route/action CSS用于离线单HTML，**不能证明正式lazyCSS按需装载、真实API/Cookie/TLS/生产授权、PG或上线已完成**。
