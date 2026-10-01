# 库存状况：局部修复与关键功能补验 · 2026-09-15

本记录是前端原型交接与验收证据，不是正式需求回写。状态：等待人工验收。商品模块保持冻结，没有进入调拨或开发真实后端。

入口：http://127.0.0.1:8767/#inventory 。服务器已运行；如停止，双击本目录 `start.command`。数据全部是明确标记的 Demo，交互、浏览器下载、浏览器打印是真实执行。

## 修改范围

只修改三个运行文件：

- `inventory-workbench.js`：简单菜单按类型分别使用 160px / 130px；每页选项增加选中语义；查询范围 footer 添加专用类；摘要统一读取最近成功查询快照，并列出商品、分类、仓库、附加条件限制。
- `inventory-workbench.css`：只追加查询范围右对齐、每页选中标识、打印菜单左对齐三条局部规则。
- `index.html`：仅更新上述两个文件的缓存版本。

未修改 `inventory-result.js`、`inventory-xlsx.js`、打印排版、图片接线、库存计算、矩阵结构、配色、字号、行高。商品实现、公共视觉文件、模型、引擎及正式文档共14份保护文件的哈希检查通过。本轮新增测试、截图、下载文件与本记录；在黄金页使用说明顶部增加本轮交接链接。

改前运行文件保存在项目 `work/ERP-V2-inventory-local-fix/`。改前截图来自这些备份文件在独立验证页中的实际浏览器渲染，没有把生产入口回滚来截图。

以下证据路径均相对于本记录：`verification/inventory-local-fix-evidence/`，简称 **E/**。

## 逐项验收表

| 项目 | 当前发现 | 是否需要修改 | 实际操作步骤 | 预期结果 | 实际结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. 更多操作菜单宽度 | 原来共用360px选择面板，只有打印也过宽 | 是，单独160px | 打开更多操作；检查宽度、打印对齐；Esc关闭 | 紧凑、左对齐、正常关闭 | 浏览器测得约160px；仅打印一项；Esc有效 | E/before-menu.png → E/desktop-menu.png；E/browser-checks.json 的 menu | 已完成 |
| 2. 每页条数宽度及选中态 | 原来360px且无明确当前选中标记 | 是，单独130px与勾选 | 打开页数菜单；选100，再选500，恢复200 | 向上展开；选中明确；真实更新分页 | 实测约130px，200打勾，菜单位于按钮上方；100条为20页、500条为4页，DOM基础行分别100/500 | E/before-page-size.png → E/desktop-page-size.png；E/browser-checks.json 的 pageSize/size100/size500 | 已完成 |
| 3. 查询范围右侧关闭 | 原footer只有一个按钮仍沿用两端布局，靠左 | 是，专用footer右对齐 | 打开范围；关闭按钮、Esc、点击标题区外部关闭 | 不查询，不改变结果；内容完整 | footer为flex-end；Esc和外部关闭有效；结果仍为240款/4仓/76262件 | E/before-scope.png → E/desktop-scope.png；E/browser-checks.json 的 scope/scopeOutside | 已完成 |
| 4. 当前结果摘要 | “全部分类”会掩盖商品/仓库/附加限制 | 是，统一成功快照摘要 | 选9款、2仓、春夏；先不查询再查询；衬衫+2仓另查；模拟失败 | 草稿不污染摘要；成功后准确；失败保留旧结果 | 浏览器显示“已选9款商品 · 2个仓库 · 附加条件1项”；匹配为5款770件；分类显示“衬衫 · 2个仓库”；草稿仍保留前次摘要；失败保留通过模拟DOM补测 | E/restricted-query.png、E/category-export-page2.png；E/local-model-checks.json | 已完成 |
| 5. 有主图商品就地认货 | 正常Demo档案没有可用的实际商品照片；项目检索未找到可复用实拍图片 | 代码接线无需修改；实际照片需素材 | 检查商品保存后的images主图关联与预览；检索项目图片资源 | 至少一款实际商品主图，验证比例、关联、关闭后所有状态 | 接线检查通过；旧技术PNG和占位图不作为实际认货通过证据。本轮没有编造、下载或写入商品照片 | 本文“图片验证边界”；既有 recognition 模拟检查仅证明关联 | 受阻 |
| 6. 无图商品占位 | 无主图时应正常占位 | 否，复测 | 查M26001两仓；点图片；查看暂无主图；关闭；点-1看流水 | 小型就地无图提示；URL/结果不变；流水可用 | 显示“暂无主图”；返回仍#inventory、4条/81件；负数格可打开具体规格+备货仓流水 | E/no-photo.png、E/ledger-after-photo.png；E/browser-checks.json 的 noPhoto/ledger | 已完成 |
| 7. 受限查询恢复全部库存 | 已有功能，需要证明真实清除所有限制 | 否，复测 | 9款+总仓/网点仓+春夏查询，再点全部库存；另关闭小计后复测偏好 | 一次清除商品、分类、附加条件、恢复全部仓库并查询；第一页；偏好不丢 | 恢复240款/4仓/1972条/76262件，结果scrollTop=0；小计关闭仍保留；恢复原偏好后交付 | E/restricted-query.png、E/all-inventory.png；E/browser-checks.json；34项回归测试 | 已完成 |
| 8. 不限商品保留仓库 | 已有功能，需要与全部库存区分 | 否，复测 | 从9款+2仓+春夏，批量选择→不限商品→查询 | 只取消商品限制，仓库和春夏保留 | 返回120款、2仓、18170件，附加条件仍1项；不需要逐个删商品 | E/unlimited-products.png；E/browser-checks.json 的 unlimited | 已完成 |
| 9. 200条真实分页和最后页 | 需要核对稳定标识，不能只看页码 | 否，复测 | 浏览器顺序翻1–10页；收集每页商品/颜色ID/仓库ID；另切100/500；测试0条与单页 | 前9页200，末页172；无重无漏；跨页续；单页/空结果无多余导航 | 全部1972个稳定键与独立模型逐行一致。第1页末M26019/demo-color-5/reserve；第2页首M26019/demo-color-6/main。末页172；商品续和表头在；单款4行，空结果0–0；汇总不混入计数 | E/last-page.png；E/browser-checks.json pages/zero/single；E/local-model-checks.json | 已完成 |
| 10. 全量Excel导出 | 保留横向格式，补实际下载对账 | 否，复测 | 衬衫+总仓/备货仓→查询→第2页→折叠M26076→输入未查询草稿→导出；另测全分类两仓、全库存、隔离混合样本 | 全部匹配结果；折叠不丢；草稿不混入；数值类型、0/负数、前导零与各组表头正确 | 分类文件638行/159款/23705件；两仓全分类986行/38029件；四仓全库存1972行/76262件，全部逐行一致。隔离样本00000001/41/42为文本，三种表头正确，30行/1426件 | E/category-export-page2.png；E/inventory-browser-category-export.xlsx；E/inventory-browser-export.xlsx；E/inventory-all-browser-export.xlsx；E/inventory-browser-leading-zero-fixture.xlsx；各xlsx-reconciliation及leading-zero-check.json | 已完成 |
| 11. 实际打印/PDF | 应用预览123页，上一轮没有该全量PDF证据 | 无需修改，实际输出正确 | 独立Chrome标签→全部库存→更多操作→打印→浏览器打印→另存为PDF；读取最终PDF所有页 | 预览/实际页数一致；无空白无缺失；长商品跨页有身份/表头；末列完整 | 浏览器与PDF均123页；1972条/240款/76262件与同范围Excel及模型完全一致。全部页有对应页码，无空白；基础行的商品/仓库/每格数字/合计按序完全一致。图像抽查1、2、123页，无截断；第2页仍识别续页M26002。没有实物打印机验证 | E/browser-print-dialog.png；E/inventory-all-browser-print.pdf；E/pdf-reconciliation.json；E/pdf-page-1.png、pdf-page-2.png、pdf-page-123.png | 已完成（浏览器/PDF）；实物打印未执行 |

## 文件和数据对账

| 实际下载/打印文件 | 范围 | 商品数 | 基础行数 | 基础数量之和 |
| --- | --- | ---: | ---: | ---: |
| [分类全量Excel](verification/inventory-local-fix-evidence/inventory-browser-category-export.xlsx) | 衬衫，总仓+备货仓；第2页折叠，另有未查询草稿 | 159 | 638 | 23,705 |
| [两仓全量Excel](verification/inventory-local-fix-evidence/inventory-browser-export.xlsx) | 全部分类，总仓+备货仓；第2页折叠，另有未查询草稿 | 240 | 986 | 38,029 |
| [全部库存Excel](verification/inventory-local-fix-evidence/inventory-all-browser-export.xlsx) | 全部商品分类、全部4仓 | 240 | 1,972 | 76,262 |
| [实际打印PDF](verification/inventory-local-fix-evidence/inventory-all-browser-print.pdf) | 同上，123张A4横向页面 | 240 | 1,972 | 76,262 |
| [前导零隔离样本Excel](verification/inventory-local-fix-evidence/inventory-browser-leading-zero-fixture.xlsx) | 既有开发隔离夹具，3款/2演示仓 | 3 | 30 | 1,426 |

文件全部由应用操作产生，没有在应用外重新制作工作簿或用HTML截图假装打印。Python/openpyxl实际打开下载工作簿，读取单元格类型和逐行内容；PDF通过pdfplumber读取实际打印文件并渲染页面抽查。PDF文本内部分中文使用兼容字形，核对时仅做Unicode规范化，不修改数字。

两仓文件的数量单元格含6,007个0、37个负数，均保持数值；主款号保持文本。各款尺码横向表头按对应商品逐个检查。累计数量只计算基础库存记录，不重复加小计/商品合计。PDF与全部库存Excel使用相同成功范围，两者均为76,262件；两仓/分类文件范围不同，其总量不同是正常结果。

123页是此次实际输出验证通过的页数，不代表任何纸张设置和任意复杂查询永远相同。当前A4横向、默认边距下未发现需要修改的打印分页问题。没有把整份报表压在一张纸，也没有缩小字体来减页。

## 图片验证边界

项目现有商品档案主图为空。对项目图片文件的检索，排除历史截图和测试证据后，没有找到可用商品实拍图。没有下载第三方照片或污染已冻结商品档案。

代码检查/既有隔离模拟确认：库存从同ID商品档案读取role为主图且有URL的images项，预览复用该URL；普通商品名称不是编辑链接。该证据不能代替真实照片比例、清晰度、关闭后双向滚动保持的完整浏览器验收。因此第5项仍受阻，待提供一张可关联商品的实际照片后单独补验。

## 验证层次与回归

- **浏览器实测**：受限/不限/全部查询，摘要草稿隔离，菜单，范围关闭，1–10页稳定键，100/500条切片，0条/单页，无图预览，具体负数余额流水，四份实际Excel下载，Chrome打印保存PDF。
- **独立代码与模拟数据检查**：`verification/inventory-local-fix.cjs` 的8项检查；`verification/inventory-recognition.cjs` 的34项回归全部通过。包含失败/过期请求不覆盖成功快照、255行跨颜色续页、小计与商品合计独立、折叠不改分页、未知值不当0、库存流水0/正/负余额。
- **文件对账**：E/*reconciliation.json、E/leading-zero-check.json；全部正常分页1972个稳定键逐行匹配，PDF及Excel正文逐行匹配来源快照。
- **保护检查**：14份文件哈希未改变，未重新验收或修改冻结商品规则。没有新增日常测试菜单。隔离样本只在既有 `inventoryDebug=1` 验证入口使用，测试标签已关闭；日常库存页恢复全库存、200条及原小计偏好。
- **可读性检查**：桌面验证临时使用1440×900后已恢复浏览器默认尺寸。极窄内嵌窗口会压缩矩阵空间，本轮不扩展移动适配或重做布局。对比截图不构成新视觉选型。

## 人工验收入口

先看 [最终库存页面截图](verification/inventory-local-fix-evidence/inventory-final.png)，再在实时页面体验菜单、条件、分页。改前/改后截图见验收表。重点打开分类Excel和全量PDF核对实际使用感受。

未完成的必要验收：第5项真实商品照片。未执行的非本机能力：实物纸张打印。其余本轮功能完成，等待人工验收；未宣布模块冻结，也未启动下一模块。
