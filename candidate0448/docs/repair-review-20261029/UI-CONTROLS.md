# New UI reports: empty tag, category All, settings selectors

User screenshots were inspected. Dot-headed Chromium b7 reproduction captured a 16×23px white empty overflow Tag in inventory and product category controls (`../ui-controls-20261029/browser-red/result.json`); input was transparent. The underlying Arco maxTagCount renderer still creates a Tag wrapper for a null label. Three TreeSelect families now share a renderer which actually omits that empty overflow tag. The old CSS rule hiding extra tags was removed, not copied into another override layer.

Frozen b8 inventory-category.jsx confirms All is a standalone choice. Current code had represented null as every child checked, so clicking one child selected its complement. Real Arco DOM RED reproduced 49 selected instead of 1. Inventory/product category controls now use explicit standalone-All semantics and retain ID/budget/async safeguards; other filter kinds retain their existing contracts.

Frozen Demo and b7 staff controls were captured at the same viewport. Role/employment popup geometry matched, but current hall directory had incorrectly adopted an inventory white chip and close icon. Settings ReferenceSelect now uses the original flat single-select presentation and explicit clear policy, not inventory styling. Query, all/reset/clear and identity-change tests remain.

Evidence: empty-tag RED→GREEN, category-All RED→GREEN, personnel filter tests and typecheck in `../ui-controls-20261029/`. Initial personnel RED assertion tried to print a DOM object and was terminated (exit137); not counted as a clean RED. Browser comparison remains the direct visual failure evidence. A browser cleanup call initially ran after Playwright exit; evidence had already been saved and cleanup was corrected.

Staff editing and old static document status actions are still separate open loops. Their current preview transports are read-only; no real employee/account or business mutation is claimed by these UI changes.

追加 dot 实际前台产物验证：2195ab69 的库存/商品分类树展开，以及员工全部筛选展开截图与 computed style 检查无空可见 Tag、无 pageerror。证据 `ui-controls-20261029/browser-green2/`。已目视库存截图：全部分类右侧不再有空白矩形，只有正常标签和搜索区域。此批尚不覆盖完整分类选择查询链或员工保存。

`2e7e804b` 实际前台进一步通过库存、商品各自 全部→T恤→查询→全部→查询。记录真实发出的filter仅一个分类，再恢复空筛选All；库存T恤在有限QA中无商品，正常展示零结果，不把其他分类结果当成功；恢复All再次读取。截图和query证据 `staff-edit-20261029/browser2/result.json`。无可见空Tag、无页面异常。

非零分类补验（4ac0644f）：库存与商品两页均实际选择衬衫→查询，返回且显示恰好M26001/QA-W01/QA-K01，分类均衬衫；各总量344/344/184，总计872，不混入长裤M26004；恢复All重新显示6款。此前T恤零结果不是测试桥无条件返回空数组。`ui-controls-20261029/keyboard-green/`截图与categoryResponses证据。
