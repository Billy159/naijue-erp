## 颜色搜索断点

两侧输入编码515均观察到上青色、1条；仅保存QA截图，Demo截图及清除操作未完成。当前Chrome焦点已变为用户另一窗口，避免打断，后续重新确认独立对比标签后补证。

## 2026-10-28 调拨已作废打印预览

两侧已作废详情实际打开打印预览，纸张均552×241 mm，Esc均关闭；预览框和表头结构不同，记录 N34-T10-PRINT-LAYOUT-01。样本尺码组不同，不比较行数及分组数；真实打印和导出未执行。矩阵 O-T10 从未检查改为有差异，整类未通过。

## 2026-10-28 调拨单号无匹配与高级筛选

两侧已作废状态下输入同一不存在单号并查询，均显示无符合条件的调拨单；收起再展开高级筛选均保留单号及空结果。配对截图已保存；其他筛选和状态仍未完成。

## 2026-10-28 已作废调拨历史关闭和返回

两侧历史弹窗按 Esc 关闭后返回列表，均保留已作废筛选及各自结果；QA 历史为读取失败状态，不能据此宣称历史数据读取通过。已保存配对返回截图。

## 2026-10-28 已作废调拨详情与历史

两侧作废详情左侧均选中调拨列表；两侧打开历史，Demo 显示作废/弃审历史，normal34 合成样例显示读取失败。N34-T03-VOID-HISTORY-01 记录；不同样例、失败原因未知，不能推断正式接口。输出、更多操作未验。

## 2026-10-28 调拨状态重置和作废筛选

两侧已审核查询后点击重置，均恢复全部状态和混合列表；两侧再选择仅已作废并查询，Demo 1 张、QA 合成 10 张，已加载可见行均为已作废。数量随样本不同不作一致性比较。保存配对截图；其余状态和操作继续未完成。

## 2026-10-28 调拨列表状态筛选配对

Demo 8877 与 normal34 57923 分别将状态设为仅已审核并查询，已加载可见行均为已审核；Demo 13938 张、QA 合成10张，不比较数据总数。已保存四张选择与结果截图；其他状态及筛选未覆盖，T01仍为 DIFFERENCE。

## 2026-10-28 筛选关闭与版型补证

两侧供应商无匹配后点击空白关闭并重新打开，均清除临时搜索词并保留全部选择。两侧版型无匹配实操，QA 同样缺少 Demo 的无匹配提示，合并至 N34-I01-SUPPLIER-EMPTY-01；配对截图及范围见记录。

## 2026-10-28 供应商无匹配补证

Demo 与 normal34 库存高级筛选输入相同无匹配词，Demo 显示明确的无匹配提示，QA 显示匹配0项但缺提示；记录 N34-I01-SUPPLIER-EMPTY-01。两侧输入框聚焦按 Esc 后下拉均保持打开；仅记录观察。仍未覆盖整页及真实业务。

## 2026-10-28 库存季节配对补证

Demo 8877 与 normal34 57923 在库存高级筛选从全部取消春并查询：两侧均取消对应选项并更新结果；Demo 四个独立季节，QA 样例另有春夏、秋冬，合并至 N33-FIXTURE-SEASON-01。样例数据不同，数量不作一致性结论。四张配对截图见该 finding；页面其余状态和真实业务仍未完成。


# 2026-10-27 normal32 审查进度

本轮仅审查，不写应用、不派修、不转主控。固定候选 8c7ed0c / phase2-normal-8c7ed0c-32，HTTP 头 X-Naijue-Candidate 已核；冻结 Demo b8bcfe3。独立两标签，1470×668、DPR2、同浏览器缩放；实际数据不同单独说明。

104项分母：未检查 84，部分检查 16，已发现差异 4；整页/整类通过均0。类别是本轮覆盖状态，不能与旧报告结果混算；进度涵盖下述各批局部检查，不代表全站无差异。

目前发现 N32-I06-01 范围卡片与用户批准截图不同；N32-I02-01 分类“全部”子项勾选表现不同。候选中子项后点全部确实返回全部，不将“全部无反应”记为已复现。仓库打开时两侧可见项均选，完整操作待核。详见 FINDINGS.json 和截图。

待继续：库存余项和各页面/弹层/适用状态，正式前端基础设置只读版本定位，源码/预览/真实接线分层与共性根因；需要时以报告子文件追加，不覆盖原报告。

调拨列表首屏实际有1条合成单，无法推断正式数据丢失；分页位置不同，N32-T01-01。筛选/详细状态未核。

调拨开单补充：空白页、商品候选及扫码抽屉均已两侧实际打开；候选1条样本不推断正式库缺商品。未选仓时扫码输入与Demo不同，待核裁决及选仓后状态。负责人只读与顶部操作灰显的具体合同/状态仍待核。

本批选两仓后扫码输入启用；选合成商品展示4尺码及查看/删除，组身份与完整性待证。离开确认后继续编辑保留仓和商品。两侧空白销货已打开，候选身份/数据导致的默认值差异单列，不推断正式业务故障。

销货合成厅选择后自动填仓，营业员候选可开；商品选择后显示查看/赠品/删除和下一空行，颜色版型选项可用，尺码4项可见。尺码选定与同状态Demo、收款和退换仍待核。

用户新要求：暂停依赖旧normal32合成资料的销货、调拨、商品选取及金额比较，等待原owner准备可比的隔离QA资料与新固定候选；不自动否定既有截图事实。只读来源、真实SKU组四成员/两明确SKU与价格边界见 FIXTURE-BOUNDARY-20261027.json。

新增只读参考：Demo实际稳定页面列出6尺码组、6版型、4季节；颜色共182只核第一页20，不能当全量。正式 <u>releases</u> 返回403，基础设置正式版本参考待可访问证据。详见 DEMO-NONSENSITIVE-FIXTURE-REFERENCE.json。此为单侧资料观察，不算两侧一致或整页通过。

新版33/55cd858已真实HTTP及页面绑定。颜色首20/182、六尺码组、六版型同Demo显示；季节新增春夏/秋冬组合与v3-A不新增组合字典项冲突，定位为合成测试资料问题 N33-FIXTURE-SEASON-01，不能外推正式库。详见 NORMAL33-FIXTURE-CHECK.json。

条码方案补充：33候选和冻结Demo同视口实际比较列表及2026方案弹窗。N33-FIXTURE-BARCODE-01：样例将六项均标当前且适用范围为空，与确认单和Demo不同；N33-P19-DETAIL-01：同一方案规则由Demo分行变为候选单行，弹窗布局不同。截图与源码定位见 FINDINGS.json；其他方案和关闭操作未验，不外推正式数据。

normal34 (2357cf508ee6e8188bcc1dddfa4735f735d70d36) 开始按清单顺序核。A01 Demo auth-entry.js 与候选 runtime-host.tsx 已核源码，未登录页面两侧均尚无可比状态，NOT_RUN；A02 和 O-A01 同视口库存初始态及账号菜单局部对照，PARTIAL；候选本人改密为已批准新增。S01/S04 在改按顺序前取得同状态配对并登记两项差异。当前104项：未检查80、部分18、发现差异6；整页通过0。

normal34 库存查询及查询范围、分类候选已两侧操作，N32-I06-01 与 N32-I02-01 在34仍可见；前者以用户截图为批准视觉例外。当前矩阵：未检查80、部分17、发现差异7；全页通过0。

用户指出分类标签右侧多余白块，确认是额外空标签，已登记 N34-I02-EMPTY-TAG-01；共用TreeSelect配置待验证，未假称根因或修复。矩阵79项未检查、18项部分、7项差异后又核高级筛选展开：78未检查、19部分、7差异。

本批新增：库存流水类型下拉与Demo不同；QA流水读取失败，暂不能判断正式接口。库存打印预览两侧打开和关闭，关闭入口形态不同。固定合计与操作列表头几何实测重叠约29像素，登记 N34-I01-STICKY-01；QA导出弹窗只打开取消，未实际导出。当前矩阵 {'NOT_RUN': 71, 'PARTIAL': 23, 'DIFFERENCE': 10}，不代表全站通过。

normal34 调拨与销货列表商品信息成对核实：Demo调拨分类数字是正数量关联的去重款数；销货是按分类和单位累计非赠品数量。QA两者使用商品款号/名称快照；当前严格列表摘要合同无分类统计，非仅样例文本问题。见 N34-LIST-SUMMARY-SEMANTICS-01。历史缺分类不得猜测，真实运行未验。矩阵 {'NOT_RUN': 71, 'PARTIAL': 22, 'DIFFERENCE': 11}。

用户提醒调拨详情的侧栏选中：两侧已审核调拨详情选中元素均为调拨单列表，销货未选；QA先前截图的调拨导航组为本次测试时手动折叠，展开后高亮可见，不记误选缺陷。T03 底部分类型汇总差异单记并与列表摘要同源问题追踪。当前矩阵 {'NOT_RUN': 70, 'PARTIAL': 22, 'DIFFERENCE': 12}。

用户明确负责人应可选，normal34新建选完两仓点击仍为只读横杠，已登记 N34-T02-RESPONSIBLE-01；实际组件按能力存在与否切换选择器或只读，具体接线待核。矩阵 {'NOT_RUN': 70, 'PARTIAL': 21, 'DIFFERENCE': 13}。

normal34 调拨扫码补充：空白单据未选仓时扫码输入被禁用，用户已明确要求默认可扫码，登记 N34-T06-SCAN-DEFAULT-01。选定两仓后，QA 合成条码可录入并重复累计，错误条码出现失败提示；这些只验证合成页面交互，不代表实体扫码、真实保存或审核通过。

调拨商品候选补充：两侧各输入“衬衫”均能打开候选和商品资料预览，Demo 搜索结果与 QA 合成资料数量不同；QA 当时已有 1 款 2 件，Demo 为空白明细，因此截图仅用于候选局部观察，不能当整页同状态对比。两侧按 Esc 后候选关闭且搜索词保留：demo34-transfer-search-candidates.png / candidate34-transfer-search.png；关闭后 demo34-transfer-search-escape.png / candidate34-transfer-search-escape.png。Demo 原先候选隐藏后重新编辑搜索词才打开，不据此判缺陷。候选选择、键盘选择及其后规格联动仍待继续按可比状态核验。当前矩阵 NOT_RUN 70、PARTIAL 20、DIFFERENCE 14，整页通过 0；具体状态以 PAGE-MATRIX.json 为准。

同业务状态补充：两侧新建调拨、已选两仓、各有一款且首尺码数量为 2，Demo 为独立未保存操作、QA 为合成商品；配对 demo34-transfer-one-style-two-units.png / candidate34-transfer-one-style-two-units.png。两侧均显示改选、查看、删除和下一录入行，Demo 底部额外显示分类款数标签，QA 未显示，归并现有调拨汇总问题，不新增同根因；不同商品及仓库名称是数据差异，尺码组是否一致须另核，不能据此宣称完整布局通过。Demo 选择商品、输入数量与 Tab 移焦仅在本次自建未保存单据中操作，未保存或审核。

调拨已填行改选：Demo 自建未保存表单与 normal34 合成表单各有一款 2 件，点颜色旁“改”，Demo 打开颜色候选，QA 报尺码组缺失或不一致及实际规格读取失败，无法继续改选；两侧取消后原数量均保留。已记 N34-T02-RESELECT-SKU-01（来源待核），截图 demo34-transfer-reselect-color.png / candidate34-transfer-reselect-color-error.png，取消后对应 -cancel.png。两侧商品不同，不能把原因断言为正式接口问题；实际分支见 transfer-proposal.ts:238，待核 QA SKU 与规格读取。未保存、未审核。

N34-T02-RESELECT-SKU-01 源码缩小范围：transfer-proposal.ts:353 扫码新建行仅携带 SKU，:276 在缺 product 时从 SKU 构造商品对象未带 sizeGroupId，:223 则要求该字段；这与实测报错吻合，属于源码链路推断，运行时对象未直接验证。qa-reference-fixtures.ts:1713-1714 的商品和 SKU 均声明 sizeGroupId，不能仅凭提示断言测试资料缺字段；不能外推手工行或正式环境。

调拨明细“查看”尝试：两侧已填行点击查看后，本次观察仍停留表单，未观察到可见弹层；现有证据不足以判定原因或通过，需核按钮实际事件及可能异步/浏览器状态，后续以稳定操作重新确认。截图 candidate34-transfer-view-attempt.png；不要把它计为弹层已验或单侧缺陷。

更正“查看”尝试：之前仅检查原标签并过早截图，不能判断无响应。冻结 Demo 实际打开新标签 #product-view/000CS0000001，显示基础资料、规格、条码、价格、图片、库存六页签；normal34 实际在单据上打开右侧只读抽屉，稳定后显示基础资料、规格、图片三个页签。QA Esc 可关闭且原数量 2 保留；Demo 原单据仍保留数量。记录 N34-T02-PRODUCT-VIEW-01，配对 demo34-transfer-view-loaded.png / candidate34-transfer-view-loaded.png；不同商品数据不作为布局差异。其余页签操作尚未验。

商品只读页签补证：Demo 从调拨查看打开新标签后，实际切换规格、图片、条码、价格、库存；QA 从调拨查看抽屉实际切换规格、图片，规格显示颜色/尺码组/版型，图片样本为空，不能验证图片放大。Demo 对应只读页有条码、价格、库存三页签，QA 此抽屉未出现，沿 N34-T02-PRODUCT-VIEW-01 记录，不推断其他独立入口不存在。配对规格 demo34-product-view-spec.png / candidate34-product-view-spec.png、图片 demo34-product-view-images.png / candidate34-product-view-images.png；Demo 其余 demo34-product-view-barcode.png、-prices.png、-stock.png。因商品不同仅对布局和可用入口作比较，不比较数据。

只读商品页补充：Demo 调拨明细查看进入商品只读条码页，实际打开“查看方案”弹窗并用 Esc 关闭，见 demo34-product-view-scheme-dialog.png；QA 此调拨抽屉无条码页签，不能配对执行该入口。源码 ready-pages.tsx 的 documentProductActivation 同时有销货和调拨接线，但受配置条件控制；销货实际入口尚未实测，不能据此断言页面表现或影响范围。此前说两者运行入口均已接入，应以此更正为源码共用且条件接线。

销货已审核销售详情的商品查看已两侧实测：Demo 新标签打开商品只读六页签，normal34 当前页打开三页签抽屉；与调拨查看属同类差异，合并至 N34-T02-PRODUCT-VIEW-01。截图 demo34-sales-audited-view-product.png / candidate34-sales-audited-view-product.png；两侧单据及商品不同，只比较入口和结构，不比较商品值。QA 自建调拨未保存测试草稿在离开前经明确提示放弃；未触碰用户草稿，未保存或审核任何单据。

销货已审核销售详情同状态配对：demo34-sales-audited-detail.png / candidate34-sales-audited-detail.png。Demo 收款区显示已收金额和结清提示，底部左侧款数、件数和分类标签；normal34 收款区有两笔合成收款但未显示提示，底部仅销售金额、优惠和应结。两侧数据不同不比较数值，已登记 N34-S04-DETAIL-SUMMARY-01；SalesReadBody 源码确未渲染这些信息，数据合同及历史分类来源待核，不造值。其他状态仍待查。

销货已审核销售操作历史：两侧均可打开弹窗及 Esc 关闭，Demo 显示历史记录；normal34 合成单据提示读取失败，重试一次仍失败。见 N34-S-HISTORY-READ-01 及 demo34-sales-history.png / candidate34-sales-history-error.png。失败来源待核，无法比较历史内容或推广到正式环境；未重复使用失效样例做多次重试。

销货已审核销售打印预览两侧实际打开并以 Esc 关闭，未执行浏览器打印；Demo 标题左对齐、规格合列、打印按钮在底部，QA 标题居中、规格拆列、按钮在顶部并标横向 A4，登记 N34-S-PRINT-01；配对 demo34-sales-print.png / candidate34-sales-print.png。样例商品及金额不同只比较结构，纸张及额外信息是否有批准依据待核。

矩阵同步新增实证：O-S19 操作历史、O-S20 打印预览由未检查改为发现差异；当前 68 未检查、20 部分、16 发现差异，整页通过 0。随后核未审核销售：Demo 列表查看直接进入编辑；QA 先只读再点修改，编辑页操作栏和明细改选形态不同，登记 N34-S03-DRAFT-ENTRY-01，截图 demo34-sales-draft-entry.png / candidate34-sales-draft-edit.png。不同商品和收款样例不比较数值；未保存、审核、作废。

未审核销售编辑收款方式候选：两侧均可打开可搜索候选、按 Esc 后原有金额保持（Demo 798.00，QA 两笔各 687.20）；配对 demo34-sales-draft-payment-method.png / candidate34-sales-draft-payment-method.png。支付方式样例和笔数不同，不比较候选数量。QA 输入右侧显示清除叉号，Demo 当前控件显示搜索图标；清除语义及资金账户联动、添加删除、键盘选择尚未验，不记为整项通过。未更改单据或保存。

新增销售独立未保存表单支付行实操：先查 Demo real-data-bridge.mjs:229，添加/删除收款行操作本地 fundsRecords 并更新界面，非保存单据；QA 亦仅在未保存新建表单操作。两侧选择销售、支付方式现金和对应账户，输入金额后点击添加，均出现第二行；删除第二行后首行金额分别保留（Demo 12120.00、QA 12，输入过程不同，不做数值配对结论）。截图 demo34-payment-add-local.png / candidate34-payment-add-local.png。未保存、审核、作废。支付方式清除、切换后账户重置与金额汇总仍需继续在该两张本次自建草稿中核，不能以添加删除局部通过代替收款整体通过。

支付方式联动实操：两侧本次自建销售空单先选择现金及对应账户并输入正金额，再切换微信；两侧原账户都清空、金额保留（Demo 12120，QA 12，因输入操作不同不比较数值）。Demo 在账户待重新选择时仍显示已收及超收提示；QA 此时提示消失，待选微信账户后进一步确认提示恢复与合同语义。配对 demo34-payment-change-method.png / candidate34-payment-change-method.png。操作未提交；支付方式清除和账户选项仍继续核。

双侧补证：此前单看 QA 重新选择微信账户不算对比；现已在 Demo 相同业务状态也选微信账户，并重新核 QA。两侧均显示已收及超收提示，金额分别为 12120 和 12，数值不同不作对比；Demo 账户未选时提示仍存在，QA 待选账户时不显示，属于可观察差异，是否符合最新业务合同待核。截图 demo34-payment-wechat-selected.png / candidate34-payment-wechat-selected.png；未提交。双侧证据文件初筛见 PAIR-EVIDENCE-AUDIT-20261027.json，36 个已开始项目中 11 个缺可识别配对截图；这只是文件名初筛，需逐操作回查，不将另 25 项自动算通过。

双侧截图缺口回查：O-T01 已找到 normal34 和 Demo 仓库菜单及两仓选中截图，已补矩阵索引；仅能证明这些局部操作。P15–P18 原矩阵指向 normal33 的对照记录，不能冒充 normal34，已明确标记当前版本须复查；其余缺口继续查找同版本操作证据或重新执行。未将文件名匹配直接视为实际操作通过。

资金账户清除补查：QA 自建未保存销售单在微信账户已选时点击账户控件清除叉，账户变为待选择、金额 12 保留，已收/超收提示消失；见 candidate34-payment-account-clear.png。Demo 同状态打开已选微信账户候选，显示搜索图标和账户列表，未见对应清除叉，见 demo34-payment-account-selected-open.png；尚未找到 Demo 等价的单独清除账户操作，不把它记为双侧清除通过。切换支付方式时两侧清空账户及保留金额已有配对证据。均未提交单据。

P15 normal34 颜色页重新双侧实操：同视口首屏两侧均显示 182 条、首行 A/001；点击 A 的编辑，Demo 打开编辑颜色弹窗并 Esc 关闭，QA 编辑按钮实际 disabled，标题提示当前入口维护尚未接通；新增颜色亦禁用。见 demo34-settings-colors.png / candidate34-settings-colors.png 和 demo34-settings-color-edit.png / candidate34-settings-color-edit-disabled.png。只确认该合成预览接入缺口，不推断正式系统；未保存或删除。P15 已更新为 DIFFERENCE，其他操作仍待核。

颜色页搜索与分页 normal34 配对：搜索“白色”两侧均返回本白色、白色、米白色三条，清除后回到全部。Demo 第2页显示21–40；QA 原点击失败因预览角标挡住页码按钮，elementFromPoint 命中角标，点按钮露出的上缘成功进入21–40。截图 demo34-colors-search-white.png / candidate34-colors-search-white.png，demo34-colors-page2-verified.png / candidate34-colors-page2-verified.png。记录 N34-P15-PREVIEW-MARKER-01，不能说正式分页逻辑故障；其他颜色页交互未全部完成。

P16 normal34 尺码组：两侧实际切换页签，均显示6组与对应尺码；搜索“男装”两侧均显示上衣和裤子2组。截图 demo34-settings-sizegroups.png / candidate34-settings-sizegroups.png，demo34-sizegroups-search.png / candidate34-sizegroups-search.png。同视口第一列宽不同：Demo 表头“包含尺码”约位于页面中部，QA 靠左，视觉布局差异待精确定位。搜索清除与其余操作未验，不能记整页通过。

尺码组搜索清除：Demo 清除“男装”后回到6组；QA 清除后先显示读取状态，稳定后回到6组，配对 demo34-sizegroups-clear.png / candidate34-sizegroups-clear.png。版型页两侧实际切换，均显示六项；首项 Y 版点击编辑，Demo 打开编辑弹窗并 Esc 关闭，QA 按钮 disabled 且提示维护未接通。截图 demo34-settings-fits.png / candidate34-settings-fits.png 和 demo34-settings-fit-edit.png / candidate34-settings-fit-edit-disabled.png。与颜色页维护未接通归并同类预览缺口，不代表正式维护故障。P17 仍未整页通过。

版型搜索与清除两侧实际操作：Demo 8877 与 normal34 57923 同输入“宽松”，均返回 B版（宽松）/ B 一条；点击清除后两侧均恢复六项。配对 demo34-fits-search.png / candidate34-fits-search.png。颜色/版型维护仍在 QA 预览未接通，本项只验证搜索清除，不算整页通过。

季节 P18 normal34 两侧实际操作：Demo 四项春夏秋冬、搜索“春”得1项；QA 合成资料六项含春夏、秋冬组合，搜索“春”得春季、春夏2项。配对 demo34-settings-seasons.png / candidate34-settings-seasons.png，demo34-seasons-search-spring.png / candidate34-seasons-search-spring.png。归入现有 N33-FIXTURE-SEASON-01 的样例裁决冲突，非新建重复根因，不推断正式库；搜索清除等未完成。

季节搜索清除双侧补查：Demo 8877 搜索“春”后点击清除，恢复四项；normal34 57923 同样清除后恢复六项。两侧已读取实际搜索值为空及列表数量，配对 demo34-seasons-clear.png / candidate34-seasons-clear.png；六项中组合季节仍为既有样例冲突，不能记同数据一致。

### 商品分类：normal34 与冻结 Demo 同状态补证

- 在 1470×668 视口分别打开 8877 和 57923，选中一级分类“T恤”，截图 `demo34-category-tshirt.png` / `candidate34-category-tshirt.png`。Demo 显示商品数量 0 款、下级 2 个，名称可编辑，保存与新增入口可用；隔离预览显示商品数量未知、下级 2 个，并提示维护尚未接通，保存及新增为禁用状态。数据及预览接入差异不得推断为正式系统结果。
- 本次仅对选中状态和可见控件作比较；搜索、展开收起、取消、编辑及保存等未在本次完成，不认定整页通过。Demo 未执行保存或删除。
- 两侧实际展开 T恤、选中短袖T恤、搜索“短袖”、点击清除：均显示短袖T恤和短袖衬衫，清除后保留已选分类。配对截图 `demo34-category-short-sleeve.png` / `candidate34-category-short-sleeve.png`、`demo34-category-search-short.png` / `candidate34-category-search-short.png`、`demo34-category-search-clear.png` / `candidate34-category-search-clear.png`。Demo 该分类显示 371 款，预览为未知，不能以不同数据量推断正式系统缺陷。P14 保持 DIFFERENCE、整页未通过。
- 分类名称未保存编辑／取消补查：Demo 选中短袖T恤，向名称末尾输入临时文字后点击取消，名称恢复原值；未点击保存。截图 `demo34-category-unsaved-edit.png`、`demo34-category-edit-cancel.png`。QA 同一分类尝试输入无变化，界面显示维护未接通，截图 `candidate34-category-edit-attempt.png`；因此 QA 的取消未保存修改行为无法对比，不记通过。仅反映 normal34 隔离预览。
- 新增一级分类入口：先读 Demo `frontend/product-current.js:267` 确认仅建立未保存草稿；两侧同选中分类点击入口。Demo 显示空白新增分类表单，随后点击取消；QA 入口禁用、无新增表单。截图 `demo34-category-new-root.png` / `candidate34-category-new-root-attempt.png`。未保存、未写入 Demo；QA 不具备新增表单的同状态比较条件。

### 商品信息列表 P01：normal34 同视口首次局部对照

- 两侧 `#products` 稳定加载、打开高级筛选，均可见供应商、版型、厚薄、领型/裤型；Demo 2955 款、QA 六款是环境数据不同，不直接判缺陷。截图 `demo34-products-list.png` / `candidate34-products-list.png`，`demo34-products-advanced.png` / `candidate34-products-advanced.png`。
- 两侧输入“衬衫”并等待候选稳定：都显示款号、商品名称候选和右侧资料；Demo 候选资料卡可见颜色和版型，QA 显示供应商，是否由数据或实现导致待源码及其他商品核实。截图 `demo34-products-search-suggest.png` / `candidate34-products-search-suggest.png`。QA 初始短暂显示无匹配后出现结果，未以加载中状态下结论。
- 仅局部检查，查询结果、筛选联动、键盘选择、分页和其他入口尚未完成，P01 不记整页通过。
- P01 鼠标选择候选并查询后，两边各得到相应商品一款。两边点击重置后稳定观察：Demo 直接恢复全部结果；normal34 清空条件但保留单款结果，显示“条件已修改，点击查询更新结果”，再次点击查询才恢复六款。登记 `N34-P01-RESET-01`，批准依据及固定版本原因待核；两边商品不同属测试数据差异。配对证据 `demo34-products-select-query.png` / `candidate34-products-select-query.png` 和 `demo34-products-reset.png` / `candidate34-products-reset-stable.png`。
- P01 分类多选：两侧全部分类状态打开并点 T恤；Demo 切换为仅 T恤，normal34 则将 T恤取消、保留 49 个其余项目。已归入既有 N32-I02-01，并补配对截图 `demo34-products-category-menu.png` / `candidate34-products-category-menu.png`、`demo34-products-category-tshirt.png` / `candidate34-products-category-tshirt.png`。此处核的是选择语义，未声称所有页面都共享同一代码根因；后续核源码。操作后两侧已重置草稿。

### 商品新增六页签：空白状态配对

两侧分别由列表进入新增并逐一点击基础、规格、条码、价格、图片、库存，截图 `demo34-product-new-{basic,spec,barcode,price,image,stock}.png` 与对应 `candidate34-...`。Demo 默认年份2026、男装上衣尺码、A版、2026条码方案；QA均为空并说明条码方案未确认，保存/图片上传暂不可用，图片区缺添加入口；是否由样例或新合同决定待核。价格九行和新商品库存提示仅比较空白状态，所有页签的编辑、联动、保存与实际业务未通过。未保存 Demo。

- 新增商品规格颜色/版型：两侧分别实际打开穿梭框。Demo 可读颜色182项、版型5项（另有当前A版），QA 两处显示读取失败、空列表；颜色重试一次仍失败。QA 弹窗更窄、标题截断、未见新增入口。登记 `N34-P03-TRANSFER-READ-01`，读取失败原因未知，不能外推正式系统；选择、移动、确认无法完成双侧对比。配对截图 `demo34-new-color-dialog.png` / `candidate34-new-color-retry.png`、`demo34-new-fit-dialog.png` / `candidate34-new-fit-dialog.png`。
- 新增商品尺码组：Demo 下拉展示六组，QA 显示读取失败；并入 N34-P03-TRANSFER-READ-01 的读取现象，未认定同一根因。截图 `demo34-new-size-menu.png` / `candidate34-new-size-menu.png`。
- 两侧填写临时款号 CHECK-UNSAVED，切规格页再回基础页，均保留款号；点取消均出现未保存确认，文案、按钮颜色和形态不同，取消离开后保留草稿。截图 `demo34-new-tabs-preserve.png` / `candidate34-new-tabs-preserve.png`、`demo34-new-unsaved-dialog.png` / `candidate34-new-unsaved-dialog.png`。未保存、未放弃测试草稿；其他字段与保存未验。
- 新增商品季节：Demo 下拉可选春夏秋冬，实际勾选春与夏两个独立项；normal34 同入口显示读取失败，无法对照多选及清除。并入 N34-P03-TRANSFER-READ-01 的读取现象，实际根因未知；设置页季节列表有数据不能证明该新增表单接通。截图 `demo34-new-season-menu.png`、`demo34-new-season-multi.png` / `candidate34-new-season-menu.png`。Demo 选择仅在未保存测试草稿，未写入。
- 固定源码 2357cf5 追踪：`apps/web/demo-replica/frontend/runtime/products/editor.tsx:97,111-112,117` 与 `editor-fields.tsx:15-18,23,25-32` 显示新增页季节、尺码组和颜色/版型候选经 maintenance reader 的 `readCandidates` 读取，颜色/版型新增按钮还取决于对应维护能力。该共同调用是源码证据，尚不能证明本次读取失败的实际错误或正式系统存在同一缺口。
- P05 价格草稿：Demo 重新登录后在本次新草稿、QA 在已有本次测试草稿，分别输入采购价0、零售价125.50，切规格再返回，两侧均保留并与未设置区分。证据 `demo34-product-price-retained.png` / `candidate34-product-price-retained.png`；未保存，不代表数值校验或真实保存通过。登录恢复后 Demo 原临时测试草稿不再显示，本轮不推断其持久性。
- P05 两侧清除草稿中的采购价0，再切规格页并返回：采购价均显示未设置，零售价125.50保留；截图 `demo34-product-price-clear.png` / `candidate34-product-price-clear.png`。仅验证本地输入显示，未验证持久化。
- 商品编辑入口：为保留本次新增草稿而新开一对独立对照标签，两侧各从商品列表首行点击编辑。Demo 成功加载商品基础资料；normal34 显示资料读取失败，重试一次仍失败。截图 `demo34-product-edit-basic.png` / `candidate34-product-edit-read-failed.png` 仅证明 QA 入口受阻，并非同业务状态的布局通过证据；QA 不同商品及正式环境不作推断。与新增候选读取是否共因未知，归同一读取缺口记录下但不合并根因。

### 营业厅与仓库 B01/B02 首次配对

两侧实际进入营业厅列表、打开新增营业厅并取消，再切仓库列表并打开新增仓库。QA 两新增弹窗均明确维护保存未接入，确定禁用；新增营业厅默认出库仓被禁用且说明先建厅仓，批准依据待核。新增仓库两边均可见所属营业厅单选，须保留最新单厅裁决。`demo34-halls-list.png` / `candidate34-halls-list.png`、`demo34-hall-new.png` / `candidate34-hall-new.png`、`demo34-warehouses-list.png` / `candidate34-warehouses-list.png`、`demo34-warehouse-new.png` / `candidate34-warehouse-new.png`。样例数量不同不认定缺陷；筛选、编辑、候选、关闭及真实保存仍未全面验证，整页未通过。

- B02 新增仓库选择及取消：两侧鼠标均能选择单个所属营业厅；选择后点击取消，Demo直接关闭，normal34出现未保存提示及继续/放弃按钮，登记 N34-B02-CANCEL-01，批准依据待核。配对证据 `demo34-warehouse-hall-selected.png` / `candidate34-warehouse-hall-selected.png` 和 `demo34-warehouse-cancel.png` / `candidate34-warehouse-cancel.png`。候选只有一个营业厅候选，替换选择、键盘、保存未验；未提交数据。
- B02 编辑：两侧各打开正常仓库，均能在弹窗内将状态切至已停用。取消后 Demo 直接返回列表，QA 显示未保存提示，合并至 N34-B02-CANCEL-01；两侧均未提交，QA 明示维护保存未接入。证据 `demo34-warehouse-edit.png` / `candidate34-warehouse-edit.png`、`demo34-warehouse-edit-disabled.png` / `candidate34-warehouse-edit-disabled.png`、`demo34-warehouse-edit-cancel.png` / `candidate34-warehouse-edit-cancel.png`。样本仓库名称不同，不作数据一致性判断。
- B02 仓库状态筛选：两侧分别选择已停用并点击查询，均显示零条和空状态；再点击重置均恢复正常筛选及各自列表。证据 `demo34-warehouse-inactive.png` / `candidate34-warehouse-inactive.png`、`demo34-warehouse-reset.png` / `candidate34-warehouse-reset.png`。没有已停用样例，不能证明有数据时筛选准确；两侧列表数量差异属样本差异，未据此判缺陷。
- B02 营业厅筛选：Demo选丁桥店XM查询，显示其一仓；QA选网点营业厅查询，四仓均显示属于该厅。QA点击标签清除回全部；Demo通过重置回全部。QA仅有一个可选厅，不能检验是否排除其他厅；Demo单项清除尚未配对。证据 `demo34-warehouse-filter-hall-result.png` / `candidate34-warehouse-filter-hall-result.png`，清除/重置证据分别为 `candidate34-warehouse-filter-hall-clear.png`、`demo34-warehouse-filter-hall-reset.png`。

### 往来单位 B03 客户与供应商

Demo为标签多选，分别选择客户、供应商并查询；normal34以客户、供应商页签分开，实际切换可见各自合成资料。客户供应商独占页签及取消标签筛选为已批准裁决，不能把这项差异要求恢复为Demo旧样式。QA明确提示只读、维护保存未开放，新增和编辑按钮禁用；未验证维护及真实保存。证据 `demo34-partners-list.png` / `candidate34-partners-list.png`、`demo34-partners-customer-filter.png` / `candidate34-partners-list.png`、`demo34-partners-supplier-filter.png` / `candidate34-partners-supplier.png`。样本数量和资料分类不同不作一致性判断；其余筛选和分页未验。

### 员工与账号 B04

两侧进入列表并选择营业员角色查询，结果均显示营业员；样本数量不同，不比较数据数量。Demo新增员工可打开表单并取消，normal34新增按钮置灰且点击无弹窗，编辑、办理离职亦显示置灰；原因和权限/接入边界待核，不推断正式环境功能。角色候选中Demo写“仓库人员”、QA写“仓库”，是否属批准文案待查。证据 `demo34-staff-list.png` / `candidate34-staff-list.png`、`demo34-staff-new.png` / `candidate34-staff-new-disabled.png`、`demo34-staff-role-menu.png` / `candidate34-staff-role-menu.png`、`demo34-staff-sales-role.png` / `candidate34-staff-sales-role.png`。筛选其余分支、编辑弹窗、分页及真实维护未验。

### 新增销货退货/换货 S03 空白状态

两侧各由新增单选择退货/换货，Demo显示单个商品明细录入表及底部退回、换出、差额；normal34显示退回、换出两个区块，底部仍为销售金额、优惠、应结。记录 N34-S03-EMPTY-01，双区块是否新合同要求须核，不能以空白态推断已填场景；候选无默认厅仓，Demo有，需对齐前置后继续。`demo34-sales-return-empty.png` / `candidate34-sales-return-empty.png`；未保存。

- S03 退回商品录入：候选选择网点营业厅后，两侧输入“衬衫”并鼠标选各自首个候选。Demo出现一条退回行、退回选择、应退和待退提示；候选显示退回行及空的换出区，底部仍是销售汇总。两侧商品与默认规格不同，候选颜色、版型、尺码和成交价尚未填，金额不可直接比较。证据 `demo34-return-search.png` / `candidate34-return-search.png` 和 `demo34-return-selected-product.png` / `candidate34-return-selected-product.png`。均为未保存草稿；继续补齐规格、比较换出和汇总。
- S03 单件退回已填状态：两侧分别完成颜色、版型、160/XS，数量-1，成交单价239；行金额和应结均为-239。Demo收款提示“已退0、待退239”、底部“退回1、换出0、应退239”；QA提示“已收0、未退239”，底部仍是“1款 -1件、销售金额-239、优惠0、应结-239”。证据 `demo34-return-filled.png` / `candidate34-return-filled.png`；商品和参考零售价不同，未把折扣差异当缺陷。仅未保存展示，不代表事务通过。
- S03 退换同时存在：两侧本地各录退回-239、换出+300，应结均61。Demo同表同时显示两行及“退回1、换出1、应收61”；QA切到换出录入时退回区只剩表头，切回退回时换出区只剩表头，金额仍计入两行。登记 N34-S03-HIDDEN-01，不能据此断定数据丢失或真实保存成功。配对 `demo34-return-exchange-filled.png` / `candidate34-return-exchange-filled.png`，切回 `candidate34-return-mode-exchange-hidden.png`。两侧商品样本不同，仅比较相同数量与手填金额；未保存。
- S03 退换并存转销售的取消：两侧均出现同文案确认框，点击取消后业务类型仍是退货/换货、应结61，Demo两行仍显示；QA当前区退回行保留、另一行仍受已登记隐藏问题影响。`demo34-return-to-sale-confirm.png` / `candidate34-return-to-sale-confirm.png`、`demo34-return-to-sale-cancel.png` / `candidate34-return-to-sale-cancel.png`。未点确认，未保存。固定 2357cf5 的 `apps/web/demo-replica/frontend/runtime/documents/proposal-form.tsx:64` 显示 d.lines 按方向渲染，而 state.entries[direction] 只在当前 section 渲染；与草稿隐藏现象一致，草稿转入 d.lines 的时机仍待查，不扩大为已保存数据缺失。
- S03 取消类型切换后，QA再次点击录入换出，之前换出行的商品、白色、A版、160/XS、数量1和单价300仍显示，应结61；对应Demo取消后两行均在 `demo34-return-to-sale-cancel.png`，QA证据 `candidate34-cancel-exchange-retained.png`。此证据仅说明本次草稿切换后可恢复，非保存或刷新持久化验证。
- S03 换出行“查看”：QA点击后打开商品只读抽屉，Esc关闭后换出行与应结61保留；Demo本次分别点击两条草稿行查看，未观察到弹层，原因未知，不能做同弹层通过判断。证据 `candidate34-return-line-view.png`、`candidate34-return-view-escape.png` / `demo34-return-line-view.png`（Demo未打开），样本商品不同；不推断正式环境。
- S03 折扣联动：两侧退回行输入5折。Demo参考价999，成交单价同步变499.50、行金额-499.50；QA参考价239，金额变-119.50，但成交单价仍为239，失焦后不变。登记 N34-S03-DISCOUNT-01，固定版本 `proposal-form.tsx:41,46,51-52` 可见折扣更新及显示单价、计算行金额分别接线，完整持久化未知。证据 `demo34-return-discount-5.png` / `candidate34-return-discount-5.png`、`candidate34-return-discount-5-blur.png`。仅本地草稿。
- S03 折扣反向联动：5折后两侧将退回行成交单价改200，行金额均-200、合计100；Demo折扣随参考价999变2折，QA折扣仍显示此前的5（参考价239）。属于 N34-S03-DISCOUNT-01 的反向显示不同步，证据 `demo34-return-price-200.png` / `candidate34-return-price-200.png`；未保存，不比较不同参考价下折扣的绝对值。
- S03 赠品：两侧退回行点赠品均使行金额归零、应结变300；Demo行内显示赠品标记和0折，QA无赠品标记且保留旧5折显示，但单价显示0。再点取消赠品，两侧单价恢复200、应结100；QA折扣仍为旧5，延续 N34-S03-DISCOUNT-01。`demo34-return-gift.png` / `candidate34-return-gift.png`、`demo34-return-gift-cancel.png` / `candidate34-return-gift-cancel.png`。仅未保存草稿。
- S03 应收100的收款：两侧均选择微信并打开账户候选；Demo为其账户数据，QA为合成微信账户。Demo金额预填100，QA金额原为空，手填100后两侧都显示“已收100、已结清”；只为草稿展示，未产生真实收款。Demo选择方式后未选账户时即显示已结清；QA完成账户及金额后显示已结清。候选数量和名称依样例不同不作缺陷；多笔、切换及应退未验。证据 `demo34-exchange-payment-method.png` / `candidate34-exchange-payment-method.png`、`demo34-exchange-wechat-account.png` / `candidate34-exchange-wechat-account.png`、`demo34-exchange-payment-selected.png` / `candidate34-exchange-payment-selected.png`。
- S03 多笔收款：两侧第一笔微信100后点击添加，都出现第二笔空白行。Demo继续显示已收100、已结清；QA收款提示消失，记录 N34-S03-PAYMENT-EMPTY-01，空白行是否应使状态未知须核正式规则。`demo34-exchange-add-payment.png` / `candidate34-exchange-add-payment.png`；未删除、未保存，第二笔填写及真实收款未验。
- S03 两笔收款补齐：两侧各选择第二笔微信账户，分别填60和40，均显示已收100、已结清；补充 N34-S03-PAYMENT-EMPTY-01 的边界：QA空白行提示消失，填写完整后恢复。`demo34-exchange-two-payments.png` / `candidate34-exchange-two-payments.png`。仅草稿金额显示，未保存或实际收款。
- S03 两笔不足额：应结100时两侧均将两笔改成60和30，均显示已收90、剩余10；Demo用“待收”，QA用“未收”。`demo34-exchange-two-partial.png` / `candidate34-exchange-two-partial.png`；仅草稿提示，未提交收款。
- S03 两笔超额：应结100时两侧分别输入60和50，均显示已收110、超收10；Demo提示红色，normal34为橙色，作为视觉差异记录，金额规则和保存时处理未验证。配对证据 `demo34-exchange-two-over.png` / `candidate34-exchange-two-over.png`。仅未保存草稿，无真实收款。
- S03 应收转应退：两侧保留正数款项60和50，将换出金额由300改100，退回200不变，应结均变为-100。Demo显示“已退110、待退210”，QA显示“已收110、未退210”；旧正数款项仍显示，实际正负款项语义和应退状态应按现行合同核实，不能直接认定Demo文案正确。配对 `demo34-exchange-negative-retained-payments.png` / `candidate34-exchange-negative-retained-payments.png`。仅未保存草稿，未进行退款。
- S03 应退100的两笔负数款项：两侧在应结-100时分别输入-60和-40，都显示“已退100、已结清”；`demo34-exchange-negative-paid.png` / `candidate34-exchange-negative-paid.png`。这只验证本地显示，不代表退款提交或真实资金已结清。
- S03 退款切换付款方式：应结-100且两笔-60、-40时，将第一笔微信切支付宝，两侧均清除第一笔账户、保留两笔金额及第二笔账户；Demo仍显示已退100已结清，QA在第一笔账户未选择时隐藏状态提示。与 N34-S03-PAYMENT-EMPTY-01 同类，尚需核正式规则；截图 `demo34-refund-change-method.png` / `candidate34-refund-change-method.png`。未保存。
- S03 切换方式后选择账户：两侧支付宝账户候选均打开并可鼠标选择各自首项；选择后-60、-40仍保留，均显示已退100已结清。候选数据不同不比较名称或数量；QA补齐账户后提示恢复，补充 N34-S03-PAYMENT-EMPTY-01。截图 `demo34-refund-alipay-options.png` / `candidate34-refund-alipay-options.png`、`demo34-refund-alipay-selected.png` / `candidate34-refund-alipay-selected.png`。仅草稿。
- 覆盖矩阵纠偏：将已有 normal34 配对证据映射到 O-S10、O-S14、O-B01、O-B04，原先仍标未检查的状态已改为局部检查或发现差异；未核分支继续列明，均未标整项通过。
- O-S13 退换货应结-100：两侧点击整单优惠/抹零灰色区域尝试输入10，均未出现可输入控件，金额维持-100；DOM可见输入清单亦未找到该区域输入框。原因及应收状态待核，不能推断正式规则。截图 `demo34-return-discount-field.png` / `candidate34-return-discount-field.png`。未保存。
- O-S13 退换货改为应收100后，两侧点击整单优惠区域尝试输入10仍未出现输入控件，应结均100；该状态未证明销售状态规则。保留的负数款项-100使Demo显示已收100、待收200，QA显示已退100、未收200，文案语义差异待按正式规则核对。截图 `demo34-exchange-positive-discount-field.png` / `candidate34-exchange-positive-discount-field.png`。未保存。

### 收款方式 B05 / O-B05

在独立标签分别进入 `#settings/payments`：Demo新增按钮可打开名称必填弹窗并已取消；normal34新增及编辑按钮置灰，点击新增无弹窗。属当前预览维护入口缺口，具体权限及接口原因未知，不能外推正式环境；列表数据数量不同不认定缺陷。筛选、编辑、历史、实际保存未验。证据 `demo34-payments-list.png` / `candidate34-payments-list.png`、`demo34-payment-new.png` / `candidate34-payment-new-disabled.png`。无写入。


### 资金账户 B06 / O-B06

两侧切换资金账户：Demo新增弹窗含账户名称和所属收款方式，已取消；normal34新增、编辑呈禁用，点击新增无弹窗。当前 QA 无法实操验证资金账户多营业厅，不能据此认定已支持或删除；Demo旧弹窗无该字段不覆盖后续裁决。禁用原因待核，筛选、编辑、分页和保存未验；账户数量不同不作为缺陷。截图 `demo34-funds-list.png` / `candidate34-funds-list.png`、`demo34-funds-new.png` / `candidate34-funds-new-disabled.png`。未写入。

- B06 资金账户按微信筛选：两侧分别选择微信并查询，展示的行所属方式均为微信；点击重置均恢复全部方式及正常状态列表。Demo四条、QA一条属各自样例，不比较数量。QA方式选择显示可清除标签，Demo显示普通单选，外观及清除操作仍待核。截图 `demo34-funds-wechat.png` / `candidate34-funds-wechat.png`、`demo34-funds-reset.png` / `candidate34-funds-reset.png`。
- O-B08 收款配置操作记录：两侧打开基础设置操作记录抽屉，字段和筛选区域可见；Demo当前空列表，QA展示8条合成样例，不能比较数据或当真实历史。两侧按Esc抽屉仍在，点击右上关闭；筛选、分页和其他入口未验。`demo34-settings-history.png` / `candidate34-settings-history.png`。
- P08 商品只读整页：Demo在 `#product-view/501XF5395665` 展示基础资料只读；QA尝试相同路由形式 `#product-view/M26001`，显示页面尚未接入。此为直接路由尝试，QA真实入口和所需身份尚未核实，不等于所有商品只读功能未接入；样品不同不比较数据。`demo34-product-readonly-base.png` / `candidate34-product-view-route-unconnected.png`。未编辑或保存。
- O-P01 库存实际查看入口：两侧分别查询库存并点击首行查看，均打开基础资料只读抽屉，字段排列和三页签可见；商品样例不同不比较值。证据 `demo34-inventory-product-drawer-base.png` / `candidate34-inventory-product-drawer-base.png`。这确认QA抽屉可用，但不证明其整页只读路由已接入；规格、图片及关闭继续核验。
- O-P01 库存商品抽屉：两侧切换规格及图片页签，规格均按颜色、尺码组、版型分区；图片均显示主图、白底图、吊牌图、详情图及颜色图的无图状态。样例颜色数量不同；尚无两侧有图样例，未验放大。`demo34-inventory-product-drawer-spec.png` / `candidate34-inventory-product-drawer-spec.png`、`demo34-inventory-product-drawer-images.png` / `candidate34-inventory-product-drawer-images.png`。
- O-P01 库存商品抽屉关闭：图片页签焦点下两侧按Esc均保持打开，点击右上关闭均返回库存查询结果；`demo34-inventory-product-drawer-close.png` / `candidate34-inventory-product-drawer-close.png`。未测背景点击、其他焦点及有图放大。
- B06 单项清除：两侧先选择微信但未重新查询，再分别点击清除，筛选均回到全部收款方式，既有列表保持；Demo打开单选框后出现清除叉，QA直接显示标签叉。此次未验证已有微信查询结果后清除是否立即更新结果，截图 `demo34-funds-method-clear.png` / `candidate34-funds-method-clear.png`。
- B06 查询后清除：两侧先执行微信查询，再清除方式；条件回到全部，列表仍保留微信查询结果，未立即重新查询。两侧行为一致；截图 `demo34-funds-clear-after-query.png` / `candidate34-funds-clear-after-query.png`。未据此判断其他筛选。
- B06 已停用筛选：两侧选择已停用并查询，均返回0条及“暂无符合条件的数据”空状态；没有停用样例，不能证明有记录时的过滤正确。`demo34-funds-inactive.png` / `candidate34-funds-inactive.png`。
- B05 收款方式搜索：两侧输入微信并查询均返回微信一行；重置均清空关键词并恢复正常方式列表。两侧样本总数不同，不将数量当缺陷。`demo34-payment-search-wechat.png` / `candidate34-payment-search-wechat.png`、`demo34-payment-search-reset.png` / `candidate34-payment-search-reset.png`。
- B05 收款方式停用筛选：两侧选择已停用并查询均为0条、显示暂无符合条件的数据；缺少停用样例，不能证明有记录时筛选正确。`demo34-payment-inactive.png` / `candidate34-payment-inactive.png`。
- O-B08 操作记录模块筛选：两侧选择营业厅并查询；Demo原本无记录，结果为空；QA从8条合成记录筛出营业厅1条。仅验证样例下筛选，不代表真实历史准确。`demo34-settings-history-hall-filter.png` / `candidate34-settings-history-hall-filter.png`。
- O-B08 营业厅筛选后重置：两侧条件恢复全部模块；Demo原无记录仍0条，QA恢复8条合成样例。`demo34-settings-history-reset.png` / `candidate34-settings-history-reset.png`。不代表真实记录准确。
- O-B08 新增操作筛选：两侧选择新增并查询；Demo没有操作记录，QA显示8条新增合成记录。QA样例全部为新增，没有不同操作样例，不能证明筛选排除逻辑。`demo34-settings-history-create-filter.png` / `candidate34-settings-history-create-filter.png`。
- P09–P13 Demo只读整页分别打开规格、条码、价格、图片、库存并留证：`demo34-product-readonly-spec.png`、`demo34-product-readonly-barcode.png`、`demo34-product-readonly-price.png`、`demo34-product-readonly-images.png`、`demo34-product-readonly-inventory.png`。QA同形式路由提示未接入（`candidate34-product-view-route-unconnected.png`），正确整页入口及身份未知，无法形成同状态对照，五项仍标未检查；三页签抽屉不替代六页签整页。
- P08 更正：上次 `product-view/M26001` 不是QA路由，不能将该提示认作整页未接入。固定源码 `runtime/common/ready-pages.tsx:192-195` 接 `products/view/<商品ID>`；通过QA商品列表编辑入口观察到该合成商品ID后直接打开 `#products/view/00000000-0000-4000-8000-000000004000`，显示六页签只读基础资料。Demo对应 `#product-view/501XF5395665`；`demo34-product-readonly-base.png` / `candidate34-product-readonly-base.png`。这是直接路由检查，实际用户进入只读整页的入口仍待核，样例不同不比较具体数据。P09–P13须继续做同页签对照。
- P09–P13 商品只读整页：两侧分别切换规格、条码、价格、图片、库存页签，配对截图 `demo34-product-readonly-{spec,barcode,price,images,inventory}.png` / `candidate34-product-readonly-{spec,barcode,price,images,inventory}.png`。首屏可见对应分区与入口；Demo样例库存0、QA样例库存344，条码和颜色数据也不同，不能比较数据或认定数据行为通过。页内查看、滚动及同数据状态未完成，五项仅局部。
- 矩阵版本标识澄清：顶部 version 是原 normal32 基线，现补充 normal34 目标构建、源码及逐行证据版本限制；保留历史证据，不能据此认为所有行均在 normal34 检查。104项实际计数与矩阵一致：未检查36、局部30、发现差异38；整页及整类弹层通过均为0。本次新 Chrome 对照标签 Demo 显示登录页，等待该会话登录后继续两侧实操。
- P10 复看已有 normal34 配对截图：Demo 主条码默认方案显示具体名称，QA 显示“已设置”；固定源码 `runtime/products/detail.tsx:64` 对可用方案固定显示该文案。登记 N34-P10-SCHEME-LABEL-01，两个商品不同，不比较具体名称；接口是否提供名称、查看方案操作和批准依据尚未核。页面仍未通过。复用 `demo34-product-readonly-barcode.png` / `candidate34-product-readonly-barcode.png`，本次没有新做两侧实操。
- N34-P10-SCHEME-LABEL-01 补充源码范围：固定版本的合成条码快照以 AVAILABLE 和 schemeId 表示默认方案，并由 synthetic-preview-transport 传给页面；这只能解释预览样例数据形态，正式接口及方案名称读取能力仍未知。未新增浏览器操作。
- 2026-10-28 浏览器连接纠正：用户打开的 Demo 位于 Chrome「狄兰」窗口，原扩展连接到另一资料导致误报未登录；通过原生窗口确认已登录。商品只读条码页两侧分别打开 170/M 查看全部条码：Demo 显示规格、主条码及来源，QA 显示主条码和旧条码、分页，未见规格文字；两侧样品不同，记录待配对截图及源码核实，不能认定整项通过。未保存、删除或改动业务数据；保留其他未保存草稿。
- P10 条码详情弹窗同窗口配对补证：`demo34-barcode-dialog-170m-1028.png` / `candidate34-barcode-dialog-170m-1028.png`。两侧均从 170/M 行点击查看；Demo显示当前商品规格，QA未见规格；QA有分页，Demo此样例无分页。商品及条码数不同，不比较条码内容；是否批准分页待核。Demo焦点在关闭按钮时按 Esc 关闭；QA焦点在每页条数时按 Esc 未关闭，焦点不同，尚须同焦点复核。未保存或删除。
- P10 条码详情 Esc 同焦点补验：QA 弹窗中从每页条数按 Tab，确认焦点到关闭按钮，再按 Esc，弹窗关闭；此前 Demo 关闭按钮焦点下按 Esc 也关闭。该焦点状态两侧一致，不能据先前不同焦点结果认定缺陷；其他焦点及弹窗其他操作仍待核。
- P10 查看方案：两侧有默认方案的只读商品，点击查看方案；Demo 显示方案名称、类型、编码规则和长度的弹窗并可关闭；normal34 点击后页面无可见变化。配对 `demo34-scheme-view-1028.png` / `candidate34-scheme-view-no-response-1028.png`。两侧样例不同，不能判断方案具体内容及数据是否可读取；点击无响应的原因、接口和其他样例待核，未将整页记为通过。
- P10 查看方案接线溯源：固定 commit 的 `frontend/runtime/products/detail.tsx:64-70` 在 AVAILABLE 时设置 schemeId 并通过 SchemeConsumer 调用 `catalogue/entry.tsx:76-83` 动态挂载详情；因此不能仅凭无弹窗断言按钮没有接线。具体为何当前合成预览无显示（数据、加载或挂载等）未知，待进一步诊断；已有成对截图记录该次实际现象。
- P10 查看方案继续溯源：固定版本 `catalogue/scheme-page.tsx:24-35` 的详情组件若挂载，会渲染弹窗框架及读取状态或方案不存在提示，不以方案数据存在为弹窗框架条件；未证实运行时是否挂载，根因仍未知。已将操作现象和配对截图归入 N34-P10-SCHEME-LABEL-01 的相关观察，避免误报为已查明故障。
- P13 库存“查看全部仓库”：Demo 零库存样例点击后展示零库存仓库并将按钮改为“仅看有库存”，再次点击回到零库存空态；QA 正库存样例点击后按钮同样改变并显示4个仓库。截图 `demo34-product-all-warehouses-1028.png` / `candidate34-product-all-warehouses-1028.png`。QA 四仓均为正数，未验证零库存仓库是否显示或被过滤；两侧库存样例不同，不以数值或行数作缺陷结论。
- P13 查看详细库存：Demo 跳至库存状况表，带入当前商品并提供返回原查询；该商品库存为零，结果为空。normal34 跳至 #inventory 后显示 `Stylesheet unavailable: matrix-experiments.css` 和重试入口，点击重试一次仍同提示，因此此时无法核带入商品和返回行为；不能推断跳转筛选逻辑是否正确，也不能把此前可用证据改为本次通过。截图 `demo34-product-inventory-jump-1028.png` / `candidate34-product-inventory-jump-1028.png`。原因待核，本次未更改资源或服务。
- 2026-10-28 候选环境状态：针对上一条库存跳转样式错误，检查本机 57923 的 TCP 监听，当前无监听；请求该端口未获得 HTTP 响应。当前预览不可用可解释无法继续加载，但不能据此确定最初样式报错根因或源码问题。未重启服务、未切换旧版本；待固定 normal34 恢复并重新绑定构建后复核。
- normal34 恢复定位：原构建及启动记录位于 `reports/controller/rapid-launch-20261022/ui-preview-2357cf5-phase2-34/`，SERVER.json 标记合成预览及源码/构建版本，serve-fixed.mjs 从同目录 build 提供只读资源。历史启动记录不能证明该构建当前完整或服务已恢复；本任务只读且不负责服务器，未自行启动或改动，后续恢复需核资源和版本。
- normal34 恢复后 P13 复验：主控转交原 T45 恢复回执，57923 响应头标识 `phase2-normal-2357cf5-34-synthetic`；实际候选商品只读页库存点击“查看详细库存”进入库存页，但商品筛选为空、停在等待查询，也未见 Demo 的返回原查询入口。Demo 对应图 `demo34-product-inventory-jump-1028.png`，QA `candidate34-product-inventory-jump-recovered-1028.png`。两侧商品库存样例不同，不比较结果数量；差异为跳转上下文和操作，源码原因待核，尚非真实业务验收。
- N34-P13-INVENTORY-CONTEXT-01：固定源码 `runtime/common/ready-pages.tsx:203` 将商品详情 onOpenInventory 接为无参数 navigate inventory，未将回调商品参数传入；对应已观察到的筛选和返回上下文丢失。其他入口是否共享待核，未修改代码。
- N34-P13-INVENTORY-CONTEXT-01 影响范围源码线索：固定版本 ready-pages.tsx:186-190 挂载商品编辑器未提供 onOpenInventory，editor.tsx:115 与 editor-stock.tsx:13 显示该入口取决于可选回调；提示编辑页按钮可能缺失，尚未两侧实际验证，暂为待核风险，不自动扩大已确认范围。
- P13 Demo 返回原查询：从商品详细库存跳转后点击返回原查询，仍在库存页，商品筛选标签消失且返回按钮消失；所见结果摘要仍显示已选1款、0款结果，未证明原结果已刷新或还原，不能将其描述为返回商品详情。`demo34-inventory-return-context-1028.png`。QA 无对应按钮，此步骤无法两侧操作。
- 商品编辑库存入口补查：Demo 列表编辑 501XF5395665 后打开库存页签，可见查看详细库存；QA 列表编辑 M26001 后出现资料读取失败，重试一次仍失败，库存页提示尚未取得商品资料。截图 `demo34-edit-stock-1028.png` / `candidate34-edit-stock-read-failed-1028.png`；因 QA 未进入已加载同状态，不能以该截图确认编辑页按钮缺失，保留源码线索为待核。未更改或保存商品。
- P19 / O-P07 补充配对：两侧条码方案列表分别点击“2020年新方案”查看，均弹出详情；关闭按钮焦点下按 Esc 均关闭。Demo 展示识别码、存货默认条码原值、颜色1位、尺码2位及随默认条码长度；normal34 展示货号7位、颜色3位、尺码3位及14位，列表中该方案状态/范围亦不同。截图 `demo34-scheme-list-detail-1028.png` / `candidate34-scheme-list-detail-1028.png`。同名不能证明相同数据身份；QA为合成资料，此为预览差异和数据待核，不推断正式规则错误。列表详情入口可打开，不推翻商品详情页查看方案当次无响应的观察。
- O-T09 调拨操作历史：同窗口两侧打开已审核单据的操作历史。Demo `#transfer/doc/ALAL-2026-09-0131` 显示无成功业务变更及历史责任人缺失说明；normal34 `#transfer/view/00000000-0000-4000-8000-000000730022` 显示读取失败，点击重试一次仍失败。截图 `demo34-transfer-history-1028.png` / `candidate34-transfer-history-failed-1028.png`。两侧为不同单据，无法比较历史内容；QA合成预览读取失败的原因未知，不能推断正式接口状态。Demo关闭按钮焦点下Esc可关闭；QA关闭行为、成功读取及非空历史待核。源码 `runtime/documents/transfers-history.tsx:11` 有读取失败与重试呈现，不能据此确定失败原因；未写入单据。
- O-T09 补验：normal34 历史读取失败弹窗中，将焦点切至关闭按钮后按 Esc，弹窗关闭；与此前 Demo 同焦点结果一致，不能证明读取成功。
- O-S02 销货列表高级筛选：两侧在 `#sales` 展开高级筛选、打开客户多选并调整到选择一个客户，均可见已选项与复选框；Demo/QA客户样例及候选数量不同，不比较内容。截图 `demo34-sales-customer-filter-1028.png` / `candidate34-sales-customer-filter-1028.png`。QA显示条件已修改提示，Demo当次仍显示通用查询说明；是否已有批准及组件原因待核。查询、清除、多个客户、收起后保留等尚未完成。
- O-S02 收起与查询：两侧选中单个客户后收起并重新展开，选择均保留，高级筛选显示1；点击查询后 Demo 所选客户返回0张，QA所选合成客户返回15张。客户及数据不同，不能比较结果数或据此证明过滤正确。截图 `demo34-sales-customer-query-1028.png` / `candidate34-sales-customer-query-1028.png`。更正上一条提示观察：Demo关闭下拉后也显示“条件已修改”，与QA一致；先前下拉打开时的通用提示不足以认定差异。其他多选、清除和搜索仍待核。
- O-S02 查询后清除与重置：两侧点击已选客户标签的关闭按钮，筛选回到全部客户；原查询结果分别保持 Demo 0张、QA 15张，并在失焦后提示条件已修改。两侧随后点重置，列表分别恢复各环境全部结果（Demo 27,909 张、QA 30 张）；样例不同不比较数量。截图 `demo34-sales-customer-clear-1028.png` / `candidate34-sales-customer-clear-1028.png`。Demo 截图是在清除后输入框仍有焦点时，失焦后才显示更新提示；两侧多选、搜索等仍待核。
- O-S02 客户下拉搜索：两侧输入“零售”，Demo展示48个匹配客户，normal34展示1个匹配客户；两侧均筛出包含关键词的可见候选并保留全部客户选择。截图 `demo34-sales-customer-search-1028.png` / `candidate34-sales-customer-search-1028.png`。数据不同不比较候选数；QA当前仅两个客户候选，选择两个即全部，无法验证两个客户作为全部以外子集的显示及查询，需更多样例。搜索后选取、键盘操作及其他筛选仍待核。
- O-S02 搜索后切换：两侧从全部客户状态输入“零售”，点击一个已勾选的匹配项取消；搜索词均清空、下拉保持打开并展示剩余已选项，Demo为484项，QA为1项，差异来自可用样例数量。截图 `demo34-sales-search-toggle-1028.png` / `candidate34-sales-search-toggle-1028.png`。未验键盘选取与多项子集查询。
- O-S02 客户多选键盘关闭：两侧客户下拉打开、搜索输入框焦点且搜索词为空时按 Esc，下拉均仍打开、已选项保留；截图 `demo34-sales-customer-esc-1028.png` / `candidate34-sales-customer-esc-1028.png`。仅覆盖该焦点状态，键盘方向键和Enter选择未验。
- O-S07 销货扫码入口定位：两侧打开 `#sales/new`，业务类型均未选，当前首屏均未见独立扫码工作窗入口；截图 `demo34-sales-scan-entry-blank-1028.png` / `candidate34-sales-scan-entry-blank-1028.png`。Demo标未保存、QA标有未保存修改，两侧状态不完全相同；保留候选草稿，未清空或改动。冻结源码 `frontend/sales-current.js:188-189` 存在扫码工作窗逻辑，但此观察无法证明实际入口或当前运行状态；需在明确安全的同业务状态下继续，扫码操作未验。
- N34-LIST-SUMMARY-SEMANTICS-01 固定版本复核：直接读取 commit `2357cf508ee6e8188bcc1dddfa4735f735d70d36` 的销货 `sales-list.tsx:53` 和调拨 `transfers-list.tsx:50`，两者均将 `productSummary.items` 的商品款号/名称拼成标签；`docs/rapid-launch-20261022/API-CONTRACTS.md:42` 指定每页最多3条商品快照预览及完整款数/hasMore，不是分类汇总。此证据绑定固定源码版本，不证明正式运行版本或历史分类可用；复用已有列表配对图，不重新操作或改源码。
- O-S07 源码入口补查：冻结 Demo `frontend/index.html:17` 加载 `scan-workbench.js` 和 `sales-current.js`；后者 `:188-189` 有窗口适配及打开函数，`:235、:245` 有 toggle-scan 事件分支，但当前 `entrySections`（`:121-124`）仅生成分区标题、切换入口及明细表，未在该函数生成扫码按钮。此仅说明所核渲染函数和事件分支，不能证明不存在其他挂载或业务状态入口；当前运行首屏未见入口已留图，工作窗及两侧同状态操作仍未验。未读取或修改草稿存储。
- 原问题清单同步：发现 `USER-ISSUE-COVERAGE-NORMAL34.json` 原 results 是较早快照，部分 T02/T03/S03/O-S10 等状态落后于现行矩阵。为每个能对应的条目附加当前页面级矩阵状态、操作、剩余范围与证据，同时保留原字段作为历史快照。页面级差异不等于原问题全部子项已验证或关闭。
- O-A03 本人改密：同为新增销货页，Demo账户菜单仅见退出登录；normal34账户菜单有已批准的修改密码入口，位于退出登录上方，打开后显示原密码、新密码、确认新密码和至少8位提示；点击取消返回原页，QA有未保存修改状态仍在。截图 `demo34-own-password-menu-1028.png` / `candidate34-own-password-dialog-1028.png` 分别为菜单与新增功能弹窗，并非同一弹窗配对。未输入密码或提交；正式前端参考、校验、Esc和真实改密未验。
- N34-I02-EMPTY-TAG-01 影响范围源码线索：固定源码 `runtime/products/filters.tsx:63`、`runtime/documents/source-controls.tsx:34` 均有全部选择时 `maxTagCount` 渲染返回 null 的类似写法；与库存是不同组件，不能据此认定白块根因或其他页面也复现，需对应页面实操验证。已有库存配对截图继续有效，未重复派修。
- O-S02 状态筛选键盘补查未完成：为保护已有销货草稿，另开同一 Chrome 会话的 Demo 列表标签，QA 使用现有列表。初次点击状态后依次按方向下和 Enter，Demo 焦点在搜索框，QA 焦点实际落在页面内容，焦点条件不同，不能据此判断键盘操作一致或不一致；需重新对齐焦点后配对复测。未查询或写入业务数据。
- O-S02 状态筛选键盘补查：两侧均在销货列表全部状态、下拉打开且焦点为搜索输入框时，依次按一次方向下和 Enter；两侧下拉均保持打开，全部及三个状态复选框均仍勾选，未见选择变化。配对截图 `demo34-sales-status-keyboard-1028.png` / `candidate34-sales-status-keyboard-1028.png`；仅覆盖该起点与按键序列，不能证明所有键盘选择正常。Demo 下拉顶部显示匹配3项/已选3项，QA显示全部状态，作为界面差异线索待与已有问题去重。未保存或修改业务数据。
- O-S02 状态筛选：两侧全部状态下拉打开、搜索框焦点时按 Esc，均保持打开且勾选未变；仅覆盖此焦点。随后鼠标取消“未审核”，两侧均保留已审核、已作废两项，“全部状态”和未审核变为未勾选，下拉仍打开。Demo 顶部显示匹配3项/已选2项，QA显示已选2项；Demo焦点仍在输入框，QA焦点变为页面内容，焦点行为差异待进一步核实。配对截图 `demo34-sales-status-uncheck-1028.png` / `candidate34-sales-status-uncheck-1028.png`。尚未核此组合的查询结果、重新进入和所有键盘路径；未写入业务数据。
- O-S02 两状态查询：在两侧同时保留已审核与已作废、取消未审核后点击查询，两侧筛选标签均保留；Demo第一页可见20条均为已审核，总计27904；QA全部20条均为已审核或已作废，总计20。数据集不同不能比较总数；仅验证可见返回状态，未逐条核 Demo 后续页。配对截图 `demo34-sales-status-query-1028.png` / `candidate34-sales-status-query-1028.png`。未写入业务数据。
- N34-S02-STATUS-ORDER-01：取消未审核后 Demo 顺序仍为未审核、已审核、已作废，QA变为已审核、已作废、未审核；登记为当前预览差异。固定源码 `source-controls.tsx:32-34` 先用选中项建立 Map 再加入候选，与观察相符；其他入口实际影响和焦点差异待核。
- O-B03 往来单位新增：Demo `#settings/parties` 可打开新增弹窗，名称必填、客户和供应商复选框、编码保存后生成，取消可关闭；normal34 客户与供应商页签均标只读权限，新增及编辑按钮禁用，无法进入相同弹窗。客户供应商分开是已批准裁决，不能将标签差异直接记缺陷；截图 `demo34-party-new-1028.png` / `candidate34-party-readonly-1028.png` / `candidate34-supplier-readonly-1028.png` 不是两侧弹窗配对。未填写、保存或修改资料；QA维护权限与正式参考、编辑和弹窗交互待核，O-B03只记部分检查。
- O-B03 Demo 编辑补查：打开已有往来单位后显示名称、客户/供应商勾选、原编码及正常状态开关；未修改输入，名称框聚焦时按 Esc 可关闭。截图 `demo34-party-edit-1028.png`。normal34 两类编辑仍因只读禁用，此为单侧参考，不能判定 QA 弹窗一致或真实权限正确。
- 基础设置操作记录（往来单位入口）：Demo 与 normal34 均打开标题为“基础设置操作记录”的面板，均有模块、数据对象、操作人、操作类型、日期、查询重置及六列记录；Demo当次0条，QA合成记录8条，数据不同不比较内容。截图 `demo34-party-audit-1028.png` / `candidate34-party-audit-1028.png`。QA 打开后焦点在全部模块，按 Esc 面板仍打开；Demo 对应焦点和关闭路径尚未配对，筛选和分页未验。未修改资料。
- 基础设置操作记录查询：两侧在数据对象输入相同不存在的 `zztest-no-match-482` 并点击查询，均显示暂无操作记录、0条且保留输入；截图 `demo34-party-audit-search-1028.png` / `candidate34-party-audit-search-1028.png`。两侧点击重置后输入均清空，QA恢复8条合成记录，Demo本来0条仍为0；仅QA非空样本验证重置恢复列表，不证明Demo筛选准确。无业务写入。
- 基础设置操作记录模块筛选：Demo 候选为营业厅、仓库、往来单位、员工、收款方式、资金账户；normal34另有商品、商品分类、颜色、版型、登录账号并将客户和供货商分开，是否均为批准范围待核。两侧选择仓库并查询，Demo空记录，QA仅1条仓库合成记录；选择保留。截图 `demo34-audit-warehouse-1028.png` / `candidate34-audit-warehouse-1028.png`。数据不同不比较结果数；Demo无非空样本，不证明筛选完整，其他模块与分页未验。
- O-B08 将往来单位入口、对象无匹配查询/重置、仓库模块查询及配对截图同步覆盖矩阵；仍为部分检查。报告基线标签 normal32 保留历史含义，FINDINGS 增加 normal34 当前目标及版本限制说明，未将旧发现批量升级。
- O-P09 覆盖矩阵补正：复用既有 normal34 两侧170/M查看全部条码及关闭按钮焦点Esc截图，原矩阵误标未运行，改为部分检查而非通过。O-P08 本次确认 Demo 501XF5395665 黑色/A版/170/M 弹窗仅有主条码，无历史条码样本；QA有合成旧条码，尚不能完成历史条码的同状态配对。未修改资料。

### 2026-10-28 调拨作废确认配对补查（normal34）

- O-T08 / N34-T08-VOID-CONTEXT-01：两侧已保存未审核单分别打开确认并取消；Demo 提示含单号、按钮为“确认作废”，候选缺单号、按钮为“确定”。两侧单据不同，Demo 为编辑页、候选为查看页；只比较同一未审核作废确认层。未提交作废，Esc、真实事务和其他状态未验证。
- 截图：demo34-transfer-void-confirm-1028.png、qa34-transfer-void-confirm-1028.png。责任归原调拨前端 owner，待既有路由处理；未宣称修复或验收通过。

### 2026-10-28 调拨编辑颜色改选补查（O-T03）

- 8877 已保存未审核 ALAL-2026-09-0128 与 normal34 已保存未审核合成 QA-DB-0022 的编辑页，分别点击已有行颜色：两侧转入行内改选并保留已有数量，出现颜色候选与确认/取消。商品不同，候选数量不同不能作为差异；两侧均未提交修改。Demo 的 Esc 关闭颜色候选，取消恢复行；候选点击取消恢复行和数量，但页面仍显示“有未保存修改”，Demo 显示“已保存”，列为待验证风险，未判定根因。候选 Esc 当时焦点在页面，不能据此判定键盘关闭能力。
- 配对证据 demo34-transfer-edit-color-1028.png、candidate34-transfer-edit-color-1028.png。其他颜色选择、确认、版型、键盘及离开提示未验。

### 2026-10-28 调拨编辑版型改选补查（O-T03）

- 8877 的 ALAL-2026-09-0128 与 normal34 合成 QA-DB-0022 均为已保存、未审核单的编辑页。两侧分别点击已有商品版型进入行内改选，打开版型候选并取消，原版型和原数量保留；两侧商品及候选数不同，不能据此判定候选内容差异。候选页面在本次开始前已处于未保存状态，本次不能独立判断版型取消对该状态的影响。
- 配对截图：demo34-transfer-edit-fit-1028.png、candidate34-transfer-edit-fit-1028.png。未选择或确认其他版型，未保存；版型实际切换、键盘操作等仍待核。

### 2026-10-28 调拨删除颜色确认补查（O-T07）

- Demo 已保存未审核 ALAL-2026-09-0128：已有非零数量行点击删除，出现“删除颜色？”并说明清除本单该颜色数量；取消后该行数量仍在。截图 demo34-transfer-remove-confirm-1028.png。
- normal34 合成 QA-DB-0022 编辑页有删除入口、行数量为 1，页面已有未保存状态，截图 candidate34-transfer-remove-before-1028.png。固定源码 apps/web/demo-replica/frontend/runtime/documents/transfer-proposal-form.tsx:58 的删除调用 session.removeGroup，apps/web/src/current-form/transfer-proposal.ts:187 直接从草稿过滤该组；因此为保护现有草稿没有点击，不能把源码推断当实际页面复现。列待验证风险，需在专用可丢弃草稿核对应状态、确认与取消，不涉及保存。两张截图不是弹层配对，故保持部分检查。

### 2026-10-28 调拨列表更多商品信息（O-T11）

- Demo 列表已作废 ALAL-2026-09-0148 显示三个分类和 +1 更多，点击后出现“其余商品信息：毛呢夹克 1”，再次点击关闭；该次焦点在按钮时按 Esc 后浮层未关闭。截图 demo34-transfer-list-more-1028.png。
- QA 标签当前有未保存草稿，为保护草稿未切离；此前实际列表样例 QA-DB-0024 为三款，不能支持本项配对。固定源码 synthetic-preview-transport.ts:80 按商品身份去重并截取三项、超出三项标 hasMore，不能据此证明当前实际存在超三款的可用样例。需找同状态样例并配对截图，未将本项记通过。O-T04 历史原尺码明细仍缺同状态双侧实际证据，保留未执行。

### 2026-10-28 调拨编辑明细商品查看补查（复用 N34-T02-PRODUCT-VIEW-01）

- Demo 未审核编辑单 ALAL-2026-09-0128 的首行“查看”在新标签打开商品只读页（基础资料、规格、条码、价格、图片、库存）；normal34 未审核编辑单 QA-DB-0022 打开单据右侧只读抽屉（基础资料、规格、图片）。商品样本不同，仅比较入口与页签结构。QA 按 Esc 关闭，原数量 1 和既有未保存状态仍在；Demo 等商品页稳定后截图。
- 增加配对截图 demo34-transfer-product-view-1028.png、candidate34-transfer-edit-product-view-1028.png 至原问题，不重复建问题；其他页签操作和权限状态未验。

### 2026-10-28 调拨编辑入口商品规格及图片页签

- 8877 的 586CS5361723 商品页与 57923 的 M26001 只读抽屉分别切换规格、图片。规格均显示颜色、尺码组、版型；图片均展示主图、白底图、吊牌图、详情图与颜色图分区。QA 样本各分区暂无图片，两个商品不同，不能据此认定图片内容一致或大图通过。抽屉 Esc 后候选原数量 1 和既有未保存状态保留。
- 截图 demo34-transfer-product-spec-1028.png、candidate34-transfer-product-spec-1028.png、demo34-transfer-product-image-1028.png、candidate34-transfer-product-image-1028.png；作为 N34-T02-PRODUCT-VIEW-01 的补充证据，不新增重复问题。

### 2026-10-28 调拨改选颜色 Esc（N34-T03-COLOR-ESC-01）

- 两侧已保存未审核单进入编辑，颜色候选展开且焦点在“选择颜色”时按 Esc：Demo 关闭列表，normal34 列表仍显示。候选用 Enter 打开候选，Demo 由行入口打开后焦点自动落在控件；商品不同但比较的是同种控件状态。两侧随后取消改选，原数量保留，QA 保持原有未保存状态。配对截图 demo34-transfer-color-esc-1028.png / candidate34-transfer-color-esc-1028.png。具体源码机制、版型 Esc 和真实保存未核。

### 2026-10-28 调拨版型 Esc 补查

- 复用 N34-T03-COLOR-ESC-01：两侧未审核编辑单的版型候选展开、焦点在选择版型控件时按 Esc，Demo 关闭列表，normal34 列表仍显示。候选以 Enter 打开；之后两侧取消改选，候选原数量 1 和既有未保存状态仍在。证据 demo34-transfer-fit-esc-1028.png、candidate34-transfer-fit-esc-1028.png。未新增同类问题。

### 2026-10-28 调拨候选 Esc 的固定源码追查

- 只读固定提交 2357cf508ee6e8188bcc1dddfa4735f735d70d36 的 apps/web/demo-replica/frontend/runtime/documents/transfer-proposal-form.tsx:54：颜色和版型均由 spec(kind) 渲染，候选菜单容器有 Esc 处理，触发按钮仅处理 Enter、空格、向下键；proposal-picker.tsx:34 为其弹层承载。此前实际焦点停在触发按钮，Esc 未关闭的观察与监听位置相符，列为可能机制，尚未排除其他监听影响。修复建议仅供用户决策，按同一 finding 合并，尚未派修。

### 2026-10-28 调拨颜色候选键盘焦点补查

- 同一未审核编辑单，两侧颜色候选展开后按方向下：Demo 焦点进入唯一颜色候选，Esc 关闭并回到控件；normal34 两次方向下均仍聚焦触发按钮，Tab 则跳至版型，未进入候选。两侧商品及候选数量不同，不比较内容。QA 无法经这两种键进入选项，选项焦点下 Esc 仍未验；已取消改选。配对截图 demo34-transfer-color-down-1028.png、candidate34-transfer-color-down-1028.png，合并至 N34-T03-COLOR-ESC-01。

### 2026-10-28 销货作废确认（O-S17）

- 8877 未审核销售单 V2-XS-17afee7c 编辑页与 normal34 合成未审核销售单 QA-XS-0019 查看页分别点击作废，只打开确认并取消。Demo 显示具体单号、不能再编辑审核、按钮“确认作废”；QA 提示保留单据和操作历史、按钮“确定”，未显示单号及不能再编辑审核。两侧业务状态同为未审核销售，但页面模式与数据不同，结论限定确认层。截图 demo34-sales-void-1028.png、candidate34-sales-void-1028.png；现象并入 N34-T08-VOID-CONTEXT-01，是否同根因待核。实际作废、Esc 与其他权限未测。
- 为保留已有调拨未保存状态，本次单独打开一个临时 57923 对比标签，未清原草稿。

### 2026-10-28 销货弃审确认（O-S16）

- Demo 已审核销售 V2-XS-ad693d2e 与 normal34 合成已审核销售 QA-XS-0020 均在查看页打开弃审确认后取消。Demo 提示撤销库存影响、保留结算明细和操作历史、可修改并重新审核；QA 提示退回未审核并撤销库存影响，未展示保留结算及历史的说明，按钮为“确定”。两侧仅比较确认层，未执行弃审；QA 取消后仍显示已审核。截图 demo34-sales-unapprove-1028.png、candidate34-sales-unapprove-1028.png。合并至确认提示类发现 N34-T08-VOID-CONTEXT-01，未假定同一代码根因。

### 2026-10-28 销货误录原因入口界定（O-S15，未执行）

- 冻结提交 frontend/sales-current.js:200、234 存在 reasonModal 和 void 处理分支；但已实际观察的未审核已保存销售页作废按钮进入 :232 delete-doc 普通确认（配对见 O-S17），不能以留存函数证明原因弹层可达。未找到该入口、更正及其他状态尚未覆盖；保持 NOT_RUN，不注入调用、保存或作废。

### 2026-10-28 已审核退换货详情（S04）

- Demo SA-2026-09-0195 与 normal34 合成 QA-XS-0017 均已审核、均有退回与换出。Demo 为一张商品明细表，数量列标“换出/退回”，底部显示退回、换出及差额；QA 分成退回/换出两表，底部显示销售金额、优惠和应结，未展示退换件数和差额标签。两单金额和数量不同，只比较结构及标签。
- 截图 demo34-sales-audited-exchange-1028.png、candidate34-sales-audited-exchange-1028.png，补入 N34-S04-01；候选源码定位 sales-entry.tsx:121。未触发弃审、保存或其他写操作。

### 2026-10-28 已审核退换货打印预览（O-S20）

- Demo SA-2026-09-0195 与合成 QA-XS-0017 均为已审核、退回与换出并存；分别打开并关闭打印预览，未发送打印。两侧均区分退回商品与换出商品。Demo 退回行数量和金额在预览中为正数，展示退回金额、销售金额和补差提示；QA 退回行以负数显示，摘要为退换数量、商品金额、优惠、应结、收退款，且规格拆列。单据内容和数值不同，只比较展示结构与符号形态，不判业务计算。截图 demo34-sales-exchange-print-1028.png、candidate34-sales-exchange-print-1028.png，归并 N34-S-PRINT-01。

### 2026-10-28 空白销售收款账户候选（O-S10）

- 两侧各自新建未保存销售单，选营业厅与现金方式后打开第1笔资金账户候选：Demo 呈浏览器原生菜单并列出现金账户，normal34 呈页面内候选列表并显示现金测试账户。两侧营业厅和账户数据不同，不能凭选项数量判断过滤或归属规则；Demo Esc 关闭菜单。截图 demo34-sales-cash-accounts-1028.png、candidate34-sales-cash-accounts-1028.png。未添加收款或保存；候选 Esc、实际选择及真实结算待核。

### 2026-10-28 销售收款方式切换（O-S10）

- 两侧未保存销售草稿均选现金和现金账户、输入金额10，再切换微信：Demo 和 normal34 的可见账户均恢复待选，金额仍为10；未添加或保存。QA 无障碍树的组合框残留旧账户名称，但截图中账户占位为“请选择第1笔资金账户”，因此不能仅凭 AX 值声称旧账户仍被选中；底层状态和提交合同未验证。截图 demo34-sales-payment-switch-1028.png / candidate34-sales-payment-switched-1028.png。两侧厅及账户不同，不能证明账户归属过滤。

### 2026-10-28 收款行添加（O-S10，进行中）

- normal34 未保存销售草稿中选微信、微信测试账户并输入 10，点击添加后新增第2笔空白行，第一行保留，出现删除入口；截图 candidate34-sales-add-payment-1028.png。源码 proposal-form.tsx 的添加入口调用 session.addSettlement；本次未保存单据，不代表真实结算通过。
- Demo 同状态草稿金额为 10，微信账户尚未选定；尝试继续操作时浏览器提示用户改变了 Chrome 状态，未确认添加动作执行，暂不把 QA 单侧结果写成对比通过。Demo 与 QA 草稿均保留，待浏览器空闲后确认 Demo 账户及添加结果并补配对截图。

### 2026-10-28 收款行添加配对补证（O-S10）

- 同为未保存销售单、应结0、第一笔微信金额10，点击添加后两侧均新增第2行、保留第一行及删除入口。Demo 第二笔金额显示 0.00，normal34 第二笔金额为空；截图 demo34-sales-add-payment-1028.png / candidate34-sales-add-payment-1028.png。Demo 第一笔账户未选，QA 已选微信测试账户，属于状态差异；第二行默认值差异先列待验证风险，需用两侧均有可选账户的样例复核，不能据此判定计算规则。
- Demo 的 frontend/real-data-bridge.mjs:217、229 负责绘制和追加草稿行；QA 的 apps/web/demo-replica/frontend/runtime/documents/proposal-form.tsx:62 绘制并接 session.addSettlement。未保存或发送真实收款。两侧未保存草稿保留，未测试第二行删除和第三行上限。

### 2026-10-28 收款第二行继续添加（O-S10）

- 两侧未保存销售单均为应结0、第一笔微信10，第二笔未选择方式/账户。Demo 第二笔默认0.00，点击添加后出现第三行；normal34 第二笔先为空、再手动输入0，点击添加均未见第三行或可见提示。Demo 第一笔账户未选、QA 已选微信测试账户，不能排除该状态差异影响，先记待验证操作差异，非业务结论。两侧截图 demo34-sales-third-payment-1028.png / candidate34-sales-third-payment-attempt-1028.png；Demo 已有三行而 QA 保持两行，截图体现的是操作结果差异而非相同结果状态。
- Demo 第三行出现后无继续添加按钮；QA 的绘制位置 apps/web/demo-replica/frontend/runtime/documents/proposal-form.tsx:62，具体未添加原因待追查。未保存，未操作删除或真实结算。另观察第二行出现后 Demo 显示已收/超收提示，QA 截图无提示；由于账户选择不同仍须同状态复核。

### 2026-10-28 收款追加差异源码追查（O-S10）

- 固定候选 commit 2357cf508ee6e8188bcc1dddfa4735f735d70d36 的 apps/web/src/current-form/sales-proposal.ts:351 要求已有每一行均有方式、匹配账户及有效金额，否则 addSettlement 直接返回 false；候选 UI apps/web/demo-replica/frontend/runtime/documents/proposal-form.tsx:62 的按钮未按这些条件禁用或说明。此逻辑解释实操中第二行未选方式和账户时点击添加无反馈；具体业务限制是否有后续裁决支持仍待核。
- 冻结 Demo frontend/real-data-bridge.mjs:201、229 的追加条件检查行数和金额，不要求每行已选择方式/账户；保存或审核校验另在 :225。因此两侧追加时机不同有源码依据，但不能因此建议移除正式提交校验。建议核对裁决后只复验追加入口、提示及保存校验接线；目前仍未执行真实保存。
- 收款提示方面，Demo :204 按累计金额计算；QA proposal-form.tsx:13、56 依赖 salesProposalMoney 计算结果，第二行未完整填写导致的汇总空值原因仍待核，不能将截图现象当财务计算错误。

### 2026-10-28 QA 第二笔补全后收款提示（O-S10）

- normal34 在前一实操草稿第二笔金额0、方式和账户未填时无已收/超收提示；选现金和现金测试账户后出现“已收 ¥10.00 · 超收 ¥10.00”。随后点击添加可出现第三笔，第三笔尚未填写时提示再次消失，且三行时不再出现添加入口。截图 candidate34-sales-third-payment-filled-1028.png；Demo 三笔不同账户填写状态见 demo34-sales-third-payment-1028.png，此组仅说明 QA 自身状态变化，不视为同状态配对通过。
- 本次确认空行填写状态会影响 QA 提示展示，与实际金额是否正确、正式保存审核是否成功无关。草稿保留，未保存、删除或审核。

### 2026-10-28 Demo 收款对齐断点

- 为继续同状态比较，将 Demo 未保存草稿第1笔方式从微信切换至现金，金额10.00保留，资金账户尚未选；第2、3笔未选，金额均0.00。normal34 草稿保留三笔，第1笔微信及账户10、第2笔现金及账户0、第3笔空白。两侧标签均未关闭或保存；同状态配对仍未完成。
- 共享浏览器当前需要串行使用，暂停继续操作以保留现场；本次未把途中状态记为对比结果。

### 2026-10-28 收款提示消失源码定位（O-S10）

- 固定 normal34 源码 2357cf5 的 apps/web/src/current-form/sales-proposal.ts:68-94：收款合计遍历全部草稿行，任一行缺方式、账户或金额不合法时 settledMinor 与 differenceMinor 均为 null；apps/web/demo-replica/frontend/runtime/documents/proposal-form.tsx:13-15 对 null 返回空字符串，因而不显示已收/超收。这个条件与本轮 QA 实操“补全第二行提示恢复、添加空第三行后消失”相符。
- Demo frontend/real-data-bridge.mjs:197、204 对金额做汇总而不依赖方式/账户完整性；同状态截图配对仍待补，且无证据证明正式校验可放宽。建议仅评估草稿状态下如何保留可理解的提示，实际保存/审核合同照旧。源码解释与运行表现一致不等于整页通过。

### 2026-10-28 矩阵证据文件核对

- 对 PAGE-MATRIX.json 当前所有相对截图引用逐项核查文件存在性，缺失0；此检查仅证明文件存在，不证明截图匹配状态或整页通过。商品信息列语义继续采用 N34-LIST-SUMMARY-SEMANTICS-01 既有配对及源码证据，不重复验收。
- QF2 最新状态显示仍等待明确浏览器交接；本轮未操作共享浏览器，继续保留两侧草稿。

### 2026-10-28 收款追加条件裁决检索

- 在正式工程 references/planning-20261002、planning-20261008 及开发源码 docs/rapid-launch-20261022 的 Markdown 中按“收款＋添加/多笔/账户/金额”等词检索，命中主计划 T60 的“一笔一个账户”真实资金账规划，但未找到明确要求草稿必须补全前一笔才能添加下一笔的裁决。该检索不能证明不存在其他裁决；N34-S-PAYMENT-DRAFT-01 的业务依据继续记待确认，不据此修改或放宽保存审核规则。

### 2026-10-28 问题清单截图引用核对

- 单独检查 FINDINGS.json 中 screenshot 数组的文件引用，缺失0；这是文件存在性检查，不认定各状态均可比。N34-T06-SCAN-DEFAULT-01 已有两侧空白及选仓后截图，未重复打开浏览器；实物扫码与事务仍未验证。

### 2026-10-28 重置同类范围源码排除

- 固定 normal34 的销售/调拨列表分别在 runtime/documents/sales-list.tsx: run、transfers-list.tsx: run 使用 run(true)，清空筛选后调用 execute；与商品和库存只清草稿的实现不同。仅限定源码路径，不把列表实际交互记为通过，也不因一个重置问题要求全站无差别修改。


### 2026-10-28 新候选版本事实（非切换）

- 读取 controller/rapid-launch-20261022/ui-preview-feae851-phase2-36/RESULT.json、BUILD-RESULT.json：normal36 为 feae851d7eaaf28a5b582c8aa87add43e29f4fdb / phase2-normal-feae851-36，57925，合成预览；回执标 P13 受影响浏览器复验待 QF2，34/35 保留，七个样例/读取文件与34相同。构建和 HTTP 回执不构成页面或业务通过。
- 目前未证明它是本专项全部范围的替代版本，未切换或改写34结论。QF2 当前活动中，遵守共享浏览器串行，保留已有草稿；normal36 的后续结果需按实际版本和受影响范围读取，不覆盖旧证据。

2026-10-28 接续：通过 Chrome 狄兰会话恢复 Demo 及 57923 实际页面访问。颜色页编码 515 搜索，两侧均为上青色、共 1 条；Demo 新增/编辑可用，QA 标明维护未接通且按钮禁用。此条仅记录搜索结果和接入缺口，未补配对截图，不记页面通过。用户销货草稿未改动。

2026-10-28 商品信息列源码补证：冻结 Demo frontend/transfer-golden.js:11 的 productCategories 对数量大于零的明细按商品 ID 去重后按分类计数，因此标签数字为款数；列表数量列另汇总数量。frontend/sales-current.js:70-72 调用 salesFacts.categories 的 units，frontend/sales-summary.js:10-20 按单位汇总非赠品明细数量，并使用分类快照；因此销货标签为数量（按各商品单位），不应统称款数。此为 Demo 源码口径，当前 QA 接口摘要及同状态页面配对仍需核，不能据此判整页通过。

2026-10-28 QA 商品信息列追查：固定提交 2357cf5 的 apps/web/src/transfers/transfers-page.tsx:99 在该列表实现中显示“历史分类未提供”，并说明不根据当前商品分类推断；qa-reference-fixtures.ts:1840 的历史样例 productSummary 构造包含商品 items。两条来源属于不同路径，尚未证明 normal34 具体展示路径的完整调用链，也不据此将历史缺分类误判为可直接用当前分类替代；继续核入口及接口。

2026-10-28 继续追查：固定提交 2357cf5 的 demo-replica/frontend/runtime/documents/sales-list.tsx:53 和 transfers-list.tsx:50 都将 productSummary.items 的 productCodeSnapshot 与 productNameSnapshot 拼接为列表标签；synthetic-preview-transport.ts:69、80 为合成 LIVE 单据产生相应 productSummary，qa-reference-fixtures.ts:1840 为历史样例生成摘要。normal-list-reader.ts:36 验证并传递该摘要。该链解释合成预览中显示款号/名称的来源；正式接口是否有可用分类快照尚未证明，不得用当前分类推断历史。之前记录的 apps/web/src/transfers/transfers-page.tsx 属另一实现，不能拿它解释 normal34 实际预览。

2026-10-28 正式接口源码补证：固定提交 2357cf5 的 packages/application/src/sales-query-ports.ts:65-69 定义共用 DocumentProductSummary，仅有款数、商品 ID、款号/名称快照和 hasMore，未定义分类或分类数量。adapters/postgres/src/sales-query-reader.ts:419 的列表摘要聚合亦构造商品快照。此为源码合同证据，不代表正式接口已实测；分类汇总需真实分类快照与单位/数量合同支持，不能将商品名伪装成分类。

2026-10-28 调拨接口源码补证：固定提交 2357cf5 的 adapters/postgres/src/transfer-query-reader.ts:1、194-198 复用销货查询的 documentProductSummary；sales-query-reader.ts:414-420 的公共查询按商品身份去重，最多返回三条款号/名称快照，未聚合分类。商品身份缺失时款数为未知。此结论是固定源码读取，不代表正式数据库实际样例或运行接口已验证。

2026-10-28 颜色搜索清除续验：同 Chrome 的 Demo 8877 和 normal34 57923 分别从搜索 515 清空，均恢复 182 条、每页 20 条、第 1–20 条及分页入口。Demo 清除过程键盘全选后 Backspace 实际仅剩 51，后通过输入框清空完成；不据此单次现象确定键盘缺陷。此项为操作记录，尚缺配对截图，不记整页通过。

2026-10-28 颜色分页补验：Demo 与 normal34 在空搜索、20条/页各点击第2页，均显示共182条、第21–40条；20条名称和编码从咖色262至暖黄色224一致。QA 编辑入口仍禁用、维护未接通。此为局部操作证据，尚缺配对截图，不能据此判整页通过。

2026-10-28 颜色页容量补验：Demo 8877 与 normal34 57923 均从第2页、20条/页通过键盘选择50条/页，均回到第1页并显示182条中的1–50条；选项均为20/50/100条。仅为操作局部记录，配对截图待补，维护接入与整页仍未通过。

2026-10-28 颜色页每页50条状态补充配对截图：demo-colors-50-1028.jpg、qa-colors-50-1028.jpg，同一 Chrome 窗口 2940×1690，空搜索、第一页。截图为当前窗口画面；维护未接入仍未关闭，不改变页面总体状态。

2026-10-28 颜色50条截图回看：配对图页面和窗口尺寸一致，均显示搜索框、表头、首屏与1–50条统计；QA 合成预览标识覆盖右下分页区域，因此该截图不能证明 QA 分页控件的完整外观。QA 行内“编辑”在图上呈蓝色，实际无障碍状态为禁用且提示维护未接通，容易让用户误以为可点击；与新增/编辑未接入同属该问题，不拆为独立功能缺陷。第二页配图和完整分页外观仍待补。

2026-10-28 颜色末页跳转：空搜索、50条/页，从第1页输入4并点跳转，Demo 8877 和 normal34 57923 均到第151–182条、末页下一页禁用；32条名称及编码一致。仅操作记录，配对截图待补；整页未通过。

2026-10-28 颜色末页配图已存：demo-colors-last-1028.jpg 与 qa-colors-last-1028.jpg，同窗口空搜索、50条/页、第4页；回看确认两图可见第151–182条统计和首屏行，QA右下分页仍被合成标识遮挡；完整32行及末页按钮状态以本轮操作树记录为依据，非截图全部可见。

2026-10-28 颜色末页搜索：Demo 8877 与 normal34 57923 在50条/页第4页输入515，均立即显示上青色515，共1条、当前1–1条；本次页面树可确认结果范围，截图待补，不推断其他筛选或整页通过。

2026-10-28 末页输入515后的配图：demo-colors-515-50-1028.jpg、qa-colors-515-50-1028.jpg；同窗口50条/页、搜索515、1条结果。该对图显示操作后的结果，操作前末页另见 colors-last 对图。

2026-10-28 P16续验：两侧从颜色515切换尺码组，搜索框均为空、20条/页；搜索男装均得2组，完整尺码文字一致，清除恢复6组。配对图demo-sizegroups-search-1028.jpg、qa-sizegroups-search-1028.jpg；既有列宽差异与其他未验交互保留。

2026-10-28 P17版型补验：两侧空搜索6条，宽松匹配B版编码B一条，清除恢复6条；配图demo-fit-search-1028.jpg、qa-fit-search-1028.jpg。维护未接入与其他未测项保留。

2026-10-28 P17无匹配/Esc：两侧无匹配均提示没有匹配的数据、0条，搜索焦点按Esc均清除查询恢复6条。配图demo-fit-empty-1028.jpg及qa-fit-empty-1028.jpg；此行为不等同弹层Esc关闭。

2026-10-28 补漏O-P12新增版型弹窗：Demo打开并取消，无保存；QA禁用入口无法进行对等弹窗操作。按实际入口补入分母：37页68弹层，共105项，整页通过仍0。缺口归既有维护未接入共因，不重复拆BUG。

2026-10-28 P17编码及切换：两侧Y搜索/回车得到1条，切尺码组再回版型均清空搜索并恢复6条。仅操作记录，未补此状态配图。

2026-10-28 P18季节清除补验：冬搜索Demo1条/QA2条，清除分别4/6条，配图demo-season-winter-1028.jpg及qa-season-winter-1028.jpg。归既有N33-FIXTURE-SEASON-01，不新增同因BUG；当前仅合成资料，正式字典未验。

2026-10-28 矩阵一致性整理：P15追加本轮截图并纠正过时清除待办；O-C01从NOT_RUN改PARTIAL，仅引用T01/P15/P16/P17已有实际操作，日期及其他候选仍未完成。未新增页面通过。

2026-10-28 库存图片预览补查：8877 与 57923 分别从库存结果首行查看进入只读商品资料，切到图片页，均呈主图、白底图、吊牌图、详情图及颜色图空态；数据及颜色数量不同。配对截图 inventory-demo-image-empty.jpg / inventory-qa-image-empty.jpg。均无可点击图片，O-I10 大图预览及关闭、切换仍 NOT_RUN，不作为通过或缺陷结论。

2026-10-28 O-I04 补查：Demo 8877 与 normal34 57923 均从全部季节取消春，再点击全部季节，恢复全选；输入框聚焦时按 Esc 两侧下拉均保持打开。取消春时配对截图 inventory-demo-season-exclude-spring.jpg / inventory-qa-season-exclude-spring.jpg；两侧字典样例数不同，沿 N33-FIXTURE-SEASON-01 处理，未比较库存数量。其余选项、键盘及联动仍未完成。  
2026-10-28 O-I04 续查：两侧从全部季节取消秋，收起再展开高级筛选后，季节条件与待查询提示均保留；未执行查询，字典样例不同。  
2026-10-28 补记 N34-I04-FILTER-COUNT-01：配对截图显示 Demo 季节条件非全部时筛选按钮显示 1，normal34 不显示。冻结 Demo inventory-workbench.js:43 渲染高级条件计数，固定候选源码 2357cf5 inventory/page.tsx:45 未渲染。O-I04 改为存在差异，其他操作仍未完成；未修改代码。  
2026-10-28 O-I03 单仓筛选：Demo 及 normal34 在全部仓库标签点击清除，重开下拉各显示已选0，再各选一个总仓并查询；结果均显示1个仓库，范围分别显示多立方总仓、总仓。配对 inventory-demo-one-warehouse-scope.jpg / inventory-qa-one-warehouse-scope.jpg。不同数据不比较库存数量；范围布局沿已有 O-I06 问题和用户截图裁决，不作新增重复问题。多仓、键盘等仍待核。  
2026-10-28 O-I03 多仓补查：8877与57923从各自单仓增选第二仓后查询，均显示2个仓库，执行范围分别列出所选两个名称；配对 inventory-demo-two-warehouses.jpg / inventory-qa-two-warehouses.jpg。数据不同不能比较库存总量，键盘与单项清除仍未验。  
2026-10-28 O-I03 续查：两仓查询后，QA 点击网点仓标签关闭，Demo 因第二标签折叠，在下拉中取消丁桥仓；均显示剩1项、提示条件已修改，未重新查询，结果仍为此前两仓。两侧使用入口不同，不算单项标签关闭完整配对；键盘及其他状态待核。  
2026-10-28 O-I06 待查询范围：两侧已查询两仓后取消一仓，不重新查询即打开范围，均回显上次执行的两个仓库，而非当前待查询条件。配对 inventory-demo-pending-scope.jpg / inventory-qa-pending-scope.jpg。用户批准的居中弹窗外观差异沿已有记录，其他操作未完成。  
2026-10-28 O-I03 键盘补查：两侧单仓已选，打开仓库下拉，焦点在搜索输入框时依次按 Down、Enter，列表保持，所选数量均为1。仅限此焦点及按键序列，不代表全部键盘可访问性通过。  
2026-10-28 O-I05 显示设置：两侧打开后焦点落在商品分类复选框；按 Esc 均关闭并返回显示设置按钮。版型初始勾选不同可能是已有偏好，不判断默认差异；切换、恢复默认与保存效果仍未检查。  
2026-10-28 O-I05：两侧开启供应商辅助字段后结果商品行均出现供应商信息，随后均关闭并确认复选框恢复0；配对 inventory-demo-supplier-display.jpg / inventory-qa-supplier-display.jpg。商品及供应商样例不同，其余设置和查询后保持未核。

2026-10-28 O-I05 商品合计：同一 Chrome 窗口下 Demo 8877 与 normal34 57923 各取消商品合计，表格合计行均消失；重新勾选后两侧合计行恢复。配对截图 demo-inventory-total-off.png / normal34-inventory-total-off.png；样例及版型显示偏好不同，不能比较数值或据此推断默认差异。该项仅局部通过，其余设置、查询后保持及整页仍待核。

2026-10-28 O-I05 颜色小计：Demo 8877 与 normal34 57923 均从关闭切换为开启，结果表均出现颜色小计行；随后均关闭并确认设置恢复。配对截图 demo-inventory-color-subtotal.png / normal34-inventory-color-subtotal.png；数据样例不同，仅核操作与行出现，不比较数值。该项局部操作，其他设置和整页仍待核。

2026-10-28 O-I05 尺码组说明：同窗口 Demo 8877 与 normal34 57923 勾选“显示尺码组说明”，两侧表格上方均显示尺码组标题及尺码序列；取消后两侧复选框恢复关闭。配图 demo-inventory-size-description.png / normal34-inventory-size-description.png。候选男装上衣组额外显示无尺码，样例尺码组不同，暂不归因界面；完整组数据和其他设置仍待核，整页未通过。

2026-10-28 O-I05 商品尺码组辅助字段：Demo 8877 与 normal34 57923 均由关闭切换为开启，首条商品辅助信息出现尺码组；两侧随后恢复关闭。配图 demo-inventory-size-field.png / normal34-inventory-size-field.png。不同样例仅核字段显示与开关，不比较数据正确性；整页及其余状态未完成。

2026-10-28 O-I05 季节显示及关闭保留：在 Demo 8877 与 normal34 57923 分别开启季节字段、点击关闭、重新打开显示设置，复选框均保持勾选；随后均恢复关闭。配图 demo-inventory-season-reopen.png / normal34-inventory-season-reopen.png。样例季节数据不同，未验证数据本身及跨查询、重载后的持久性，整页未通过。

2026-10-28 O-I05 分类与版型字段：Demo 8877 和 normal34 57923 均切换到分类关闭、版型开启，商品辅助信息相应显示版型而不显示分类；两侧各自恢复原偏好（Demo 分类1版型1，QA 分类1版型0）。配图 demo-inventory-category-off-fit-on.png / normal34-inventory-category-off-fit-on.png。恢复默认及跨查询、重载仍待核，不作整页通过。

2026-10-28 O-I05 恢复默认：两侧从版型开启（其余为分类和商品合计开启）点击恢复默认，弹层均关闭；重新打开均仅商品分类与商品合计勾选。Demo 原版型偏好随后恢复开启，QA 原版型关闭。配图 demo-inventory-restore-default.png / normal34-inventory-restore-default.png（后者为供应商开启后恢复默认画面，默认值相同；版型条件下重开结果以页面树记录）。QA 从供应商开启恢复默认时弹层保持打开，非同状态，不作为差异。查询/重载保留仍待核。

2026-10-28 列表商品摘要补充固定提交证据：2357cf5 的 normal-list-reader.ts:22,33 严格验证摘要字段，sales-list.tsx:53 与 transfers-list.tsx:50 使用商品快照；sales-query-reader.ts:392-395,414-420 分页明细按商品身份去重并构建最多三条商品快照，不含分类聚合。该证据已补 N34-LIST-SUMMARY-SEMANTICS-01；运行接口响应与历史分类快照覆盖仍未知，不将源码结论冒充真实运行验证。

2026-10-28 证据回看：demo-inventory-category-off-fit-on.png / normal34-inventory-category-off-fit-on.png 直接可见两侧分类关闭、版型开启及商品行版型；颜色小计配图两侧均可见小计行。两组数据和已查询仓库名称不同，图中 Demo 版型初始偏好与 QA 不同，不能由此推断默认差异或核对数值；两图使用同一窗口尺寸。销货列表配图按全部状态筛选而非同一单据，能支持列形态差异，不能支持逐单数据和状态一致结论。

2026-10-28 P14 商品分类子节点：同一 Chrome 窗口 Demo 8877 与 normal34 57923 分别展开 T恤并选短袖T恤，两侧显示路径 T恤 / 短袖T恤、下级0个。Demo 名称可编辑并显示371款；QA 名称禁用且商品数量未知，明确提示维护未接通。配图 demo-category-child-1028.png / normal34-category-child-1028.png；数量数据不同不推断正式数据，维护缺口沿既有问题，新增、编辑保存及其他交互未完成。

2026-10-28 P14 搜索：两侧已选择短袖T恤后输入短袖，树均显示 T恤/短袖T恤 和 衬衫/短袖衬衫，分类资料保留短袖T恤；清空搜索后两侧恢复树、所选分类仍保留。配图 demo-category-search-short-1028.png / normal34-category-search-short-1028.png，图片为搜索中状态；清除以实际界面记录为据。维护未接通及其它状态继续未完成。

2026-10-28 P14 搜索无结果及 Esc：两侧输入不存在xyz，树为空且右侧仍保留短袖T恤资料；焦点在搜索框按 Esc 后搜索词均未清除。随后手动清空搜索恢复树。配对 demo-category-no-match-1028.png / normal34-category-no-match-1028.png；此结果只覆盖该焦点，不代表所有键盘行为通过。

2026-10-28 O-P11 被使用分类删除入口：源码 frontend/product-current.js:183-185 显示先检查、再确认，最终删除仅在确认触发。Demo 短袖T恤点击删除后提示当前分类仍被371款商品使用、无法删除，未出现确认也未删除；normal34 相同分类入口禁用且提示维护未接通。证据 demo-category-delete-used-1028.png / normal34-category-child-1028.png。仅此受阻状态，空分类确认及商品/颜色/版型仍未验证，整体改 PARTIAL。

2026-10-28 P14 新增分类：Demo 点新增一级后右侧显示新增分类、路径一级分类；取消返回之前短袖T恤。选择 T恤 后点新增下级，路径显示 T恤，取消返回 T恤；未填名称或保存。截图 demo-category-new-root-1028.png / demo-category-new-child-1028.png；normal34 两入口禁用证据 normal34-category-child-1028.png，无法同状态配对，归已有维护未接通，不能称新增通过。

2026-10-28 P14 未编辑取消：两侧选择T恤父分类后点取消，均仍显示该分类。QA 名称输入禁用，已编辑后取消无法配对；本项为页面树操作记录，无新截图，不代表维护通过。

2026-10-28 B08 入口核查：normal34 菜单仅见往来单位，点击后切供应商标签；固定源码 common/ready-pages.tsx:232-237 显示 suppliers 路由初始选择供应商，实际访问 57923/#suppliers 呈同一往来单位页的供应商标签，新增/编辑禁用并显示只读。截图 normal34-suppliers-direct-1028.png。独立供应商页与指定正式参考的比较仍待验证；不以直接路由可打开宣称通过。

2026-10-28 B03/B08 供应商无匹配及重置：Demo 选供应商标签，normal34 选供应商页签，输入不存在xyz并查询，均显示暂无符合条件的数据、0条；重置后 Demo 恢复全部标签及486条，QA 保留供应商页签并恢复3条。页签分开是已批准差异，不将重置范围不同直接判缺陷；数据样例不同。配图 demo-suppliers-empty-1028.png / normal34-suppliers-empty-1028.png。独立正式参考和维护仍未验。

2026-10-28 B03/B08 状态筛选选项：同一 Chrome 窗口中，Demo 往来单位（全部标签）与 normal34 供应商页签打开状态筛选，两侧均列出“正常、已停用、全部”，当前均为正常；按 Esc 均关闭。配图 demo-parties-status-options-1028.png / normal34-suppliers-status-options-1028.png。两侧标签范围不同，此次只核选项和关闭行为，不代表供应商筛选结果或整页通过；选择、查询及维护仍待同状态验证。

2026-10-28 B03/B08 供应商已停用筛选：Demo 8877 往来单位选择供应商标签、normal34 57923 选择供应商页签，两侧通过状态下拉的 Down/Enter 选择已停用并查询，均显示暂无符合条件的数据、共0条。配对截图 demo-suppliers-disabled-1028.png / normal34-suppliers-disabled-1028.png。同窗口；数据集不同且均无停用样例，只证明此状态的空结果和操作，不能证明有数据时筛选正确。随后重置，两侧状态恢复正常，Demo 恢复全部标签，QA 保留供应商页签；客户供应商拆分为已批准差异。维护及整页仍未完成。

2026-10-28 B03/B08 供应商全部状态：Demo 选供应商标签、normal34 选供应商页签，两侧用下拉 Down 两次、Enter 选“全部”并查询，均显示正常供应商列表；Demo 451 条、QA 3 条，数据集不同不能比较数量。配图 demo-suppliers-all-status-1028.png / normal34-suppliers-all-status-1028.png。因 QA 无已停用样例，全部状态是否同时包含停用数据仍未验证；整页未通过。

2026-10-28 O-A01 账号菜单 Esc：同一 Chrome 窗口，Demo 8877 与 normal34 57923 往来单位页分别点击当前员工，菜单打开后焦点均在当前员工按钮；按 Esc 菜单均关闭，焦点仍在按钮。配图 demo-account-menu-esc-before-1028.png / normal34-account-menu-esc-before-1028.png。QA 额外的本人修改密码为已批准功能；未点击退出，也未验证密码修改、其他角色或整页。

2026-10-28 O-B08 往来单位操作记录 Esc：Demo 8877 与 normal34 57923 从往来单位入口打开基础设置操作记录，焦点均位于全部模块；按 Esc 两侧抽屉均保持打开。配图 demo-parties-history-esc-1028.png / normal34-parties-history-esc-1028.png。Demo 暂无记录、QA 为8条合成记录，数据状态不同，不比较记录内容；仅此焦点及按键，其他关闭方式与筛选仍待核。

2026-10-28 O-B08 操作类型：两侧打开基础设置操作记录的全部操作下拉。Demo 有登录账号关闭、登录账号恢复、修改本人密码；normal34 未显示这三项，额外显示删除。配图 demo-history-operation-options-1028.png / normal34-history-operation-options-1028.png；固定源码 Demo basic-settings-v2.jsx:140 与 2357cf5 settings/audit/contracts.ts:5,45、audit-drawer.tsx:107 支持选项差异。登记 N34-B-AUDIT-ACTION-01 待验证风险：新审计事件映射、对应记录及删除选项依据未知，不能仅凭下拉断言真实记录丢失。两侧 Esc 均关闭下拉，焦点落到开始日期；未验证记录筛选或真实审计。

2026-10-28 N34-B-AUDIT-ACTION-01 源码追查：固定 2357cf5 settings-audit-ports.ts:5 定义通用 DISABLE/RESTORE；account-maintenance-service.ts:47,59-61 将账号关闭/恢复以 ACCOUNT 和命令 action 提交审计。由此可知合同支持用账号模块加通用操作表达该类事件，但当前尚无对应实际记录验证筛选；本人改密映射及额外删除选项依据仍未知，保持待验证风险，不判记录丢失。

2026-10-28 O-B08 模块筛选：Demo 的基础设置操作记录下拉提供往来单位；normal34 分为客户、供货商，并额外提供商品、分类、颜色、版型和登录账号等模块。两侧模块选项截图 demo-history-module-options-1028.png / normal34-history-module-options-1028.png。Demo 选往来单位查询0条；QA 选供货商查询出1条合成新增记录，截图 demo-history-party-filter-1028.png / normal34-history-supplier-filter-1028.png。客户与供应商拆分为已批准业务裁决，额外模块来源及正式记录待核；因数据集和模块范围不同，该结果不证明两侧记录一致或真实审计通过。

2026-10-28 O-B08 重置及关闭：此前分别筛选 Demo 往来单位、QA 供货商后点击抽屉重置，两侧模块显示全部模块；QA 由1条恢复8条合成记录，Demo 原无记录仍为0。两侧点击右上角关闭均返回原往来单位页面；关闭前证据沿用 demo-history-party-filter-1028.png / normal34-history-supplier-filter-1028.png，重置和关闭为界面状态观察。真实记录、其他筛选及分页仍未完成。

2026-10-28 B04 离职筛选单侧：normal34 57923 员工列表默认在职，选择离职并查询显示0条；截图 normal34-staff-left-1028.png。切换 Demo 时浏览器状态被用户改变，未操作 Demo；此项仍待同条件配对，QA 无离职样例不能验证有数据过滤，也不代表整页通过。

2026-10-28 N34-B-AUDIT-ACTION-01 本人改密源码补查：固定提交 authentication/src/service.ts:124 调用 adapters/postgres/src/auth-store.ts:105-113；所见函数更新密码和版本、撤销会话，未见函数内显式提交基础设置审计。数据库触发器或其他审计路径未排除，未做实际改密；仅记录待验证风险，不能认定记录缺失。

2026-10-28 N34-B-AUDIT-ACTION-01 触发器补证：固定提交 migrations/0021_native_maintenance_receipts.sql:551-553 和 patches/0026-category-reorder-undo.sql:409-411 明确把现有本人改密作为无维护回执例外，账号保护触发器允许特定密码变更。结合 auth-store 可确认源码路径未显式产生该维护回执；运行库迁移状态、是否有其他审计渠道及实际记录仍未知，未实操改密，保持待验证。

2026-10-28 B04/O-B07 离职筛选与恢复确认：Demo 和 normal34 员工列表分别选离职并查询，Demo 3条、QA 0条，样例不同不比较数量；截图 demo-staff-left-1028.png / normal34-staff-left-1028.png。Demo 对一条离职员工点击恢复在职，仅打开确认，提示恢复后登录权限仍关闭、须手工开通；点取消后仍显示离职，未写入。截图 demo-staff-reinstate-confirm-1028.png。QA 缺离职样例，无法双侧打开同确认，不记通过；办理离职等其他状态仍待核。

2026-10-28 B04 登录权限：两侧重置员工条件后在职状态选择已开通并查询，Demo 显示2条、QA 显示4条，当前可见行均为已开通；数据集不同不能比较数量，QA 全部4条均已开通，不能单凭此证明排除已关闭。配图 demo-staff-login-enabled-1028.png / normal34-staff-login-enabled-1028.png。Demo 下拉有全部、已开通、已关闭；QA 显示已关闭（暂未就绪），关闭状态不能按已完成记录。员工维护、其他筛选和整页仍待核。

2026-10-28 B04 已关闭登录筛选：Demo 员工在职状态选择已关闭并查询，显示97条；normal34 下拉中该项灰色标注暂未就绪，实际点击后仍为已开通、下拉未关闭。配图 demo-staff-login-options-1028.png / normal34-staff-login-options-1028.png / demo-staff-login-disabled-1028.png。固定预览源码 staff-page.tsx:52 按 reader capability 禁用，登记 N34-B04-LOGIN-CLOSED-01 为预览能力缺口；不推断正式环境接口或真实数据。

2026-10-28 N34-B04-LOGIN-CLOSED-01 固定源码追查：2357cf5 staff-settings/http-client.ts:7-12 宣告 open-only 并拒绝 closed；organization-maintenance-service.ts:71、organization-maintenance-store.ts:128 亦拒绝该条件，理由是无账号如何归类尚待确定。此为跨前端与读取合同的源码缺口，不只是隐藏选项；部署运行状态未验证。建议先明确无账号与已关闭的业务分类，再以三类人员隔离样例验证，不自行猜规则。

2026-10-28 B04 搜索重置：Demo 8877 与 normal34 57923 各重置为在职、全部登录权限，输入 xyz 并查询，均显示暂无符合条件的数据、0条；随后各点重置，搜索词清空并恢复各自默认列表（Demo 99条、QA 4条，数据不同）。截图 demo-staff-search-empty-1028.png / normal34-staff-search-empty-1028.png。仅无匹配搜索与重置，匹配搜索、分页、维护和整页仍待核。

2026-10-28 B04 每页数量：Demo 和 normal34 员工默认筛选下均提供20、50、100条/页，分别从20切50；Demo 显示第1–50条，QA 显示第1–4条。配图 demo-staff-page50-1028.png / normal34-staff-page50-1028.png。QA仅4条合成样例，不能核实跨页、页码切换及多页数量正确性；整页仍未完成。

2026-10-28 B04 员工营业厅筛选：两侧下拉各选一个有员工的厅，Demo 选舟山一百ST查到4条，normal34选网点营业厅查到2条，可见行所属厅均对应所选。配图 demo-staff-hall-options-1028.png / normal34-staff-hall-options-1028.png、demo-staff-hall-query-1028.png / normal34-staff-hall-query-1028.png。两侧厅及数据不同，不比较数量；观察为单选控件，未验证清除、搜索和其他条件组合。

2026-10-28 B04 营业厅候选搜索及清除：两侧各选单厅并查询后，Demo 在候选输入“舟山”、QA 输入“网点”，候选按各自名称过滤；Esc 后两侧保留原选中厅及已查询结果。截图 demo-staff-hall-search-1028.png / normal34-staff-hall-search-1028.png；数据名称不同，不比较候选数。QA 点击所选标签关闭后显示全部营业厅，结果仍为此前2条，需再查询；Demo 未找到同形态清除入口，暂不声称双侧清除通过，后续核查可用入口及查询后结果。

2026-10-28 B04 营业厅清除补查：Demo 已选厅后点击控件右侧清除，显示全部营业厅但列表仍保留上次4条；再点击查询恢复99条。QA 上次清除后保留2条，本次点击查询恢复4条。两侧均需查询才应用清除；Demo 清除待查询截图 demo-staff-hall-cleared-pending-1028.png，QA 清除待查询为前次页面树观察。Demo basic-settings-v2.jsx:35-39,58,63 为该单选启用 allowClear。不同样例不比较数量，其他筛选组合待核。

2026-10-28 O-B07 办理离职确认：Demo 对一名在职员工点击办理离职，弹窗提示关闭登录权限、保留员工资料账号及历史单据，恢复后仍须手动开通；点击取消后该员工仍在职，未执行写入。截图 demo-staff-leave-confirm-1028.png；normal34 在职员工办理离职入口禁用，见 normal34-staff-page50-1028.png，无法同弹窗配对，继续标 PARTIAL。

2026-10-28 收款方式编辑补证：同一 Chrome 的 8877 Demo 和 57923 normal34 收款方式列表，Demo 点击微信的编辑，弹窗显示必填名称、使用状态开关、取消和确定；点击取消，未写入。normal34 微信行编辑按钮禁用，无法打开同状态弹窗，截图 demo-payment-edit-1028.png / qa-payment-edit-disabled-1028.png。此为 Demo 弹窗与候选受限入口的证据，并非两侧同弹窗配对通过；编辑的输入保留、开关、Esc 和保存仍未核，不能据此判断正式环境能力或整页通过。

2026-10-28 B06 资金账户名称无匹配及重置：同一 Chrome 窗口、Demo 8877 与 normal34 57923 均在资金账户页输入 xyz 后点击查询，均显示“暂无符合条件的数据”和 0 条；点击重置均清空输入并恢复各自正常账户列表（Demo 80 条、QA 5 条，数据不同不比较数量）。配图 demo-funds-search-empty-1028.png / normal34-funds-search-empty-1028.png；仅验证该搜索和重置，QA 账户编辑禁用、多营业厅维护及多页仍未验证，整页未通过。

2026-10-28 O-B06 资金账户编辑补证：Demo 在正常账户行点击编辑，弹窗显示账户名称必填、所属收款方式只读、使用状态开关、取消及确定；按 Esc 关闭，未写入。normal34 正常账户编辑入口禁用，无法配对打开和验证 Esc；截图 demo-funds-edit-1028.png / normal34-funds-edit-disabled-1028.png。用户批准的资金账户多营业厅规则仍须在正式接入后核验，Demo 旧弹窗不覆盖该裁决；此项未通过。

2026-10-28 P17 版型编码及空结果：同一 Chrome 窗口，Demo 8877 与 normal34 57923 商品设置版型页输入编码 Y，均即时显示 Y版（修身）一条；分别输入 xyz 均显示“没有匹配的数据”、0条。配图 demo-fit-code-y-1028.png / normal34-fit-code-y-1028.png 与 demo-fit-empty-1028.png / normal34-fit-empty-1028.png。QA 维护提示及新增编辑禁用仍存在；该局部结果不代表维护、整页或真实业务通过。Demo 搜索框聚焦按 Esc 曾清空输入并恢复6条；QA Esc 行为尚未在无浏览器自动填充干扰时配对，不记一致。

2026-10-28 P17 版型搜索 Esc 补查：两侧均保持 xyz、0条并聚焦搜索框，先按 Esc 关闭 Chrome 自动填充，第二次按 Esc 后输入清空、各恢复6条版型。配图 demo-fit-esc-cleared-1028.png / normal34-fit-esc-cleared-1028.png；Demo 截图为关闭清空后重新出现的自动填充后拍摄，输入与结果保持。此项仅为该浏览器和焦点状态，不代表其他控件或整页通过。

2026-10-28 O-P06 新增商品分类：Demo 8877 /#product/new 与 normal34 57923 /#products/new 同为空白新增基础资料，各点击商品分类；Demo 展开分类列表，normal34 显示暂无数据、读取失败和重试。两侧 Esc 关闭菜单，未保存。截图 demo-product-category-open-1028.png / normal34-product-category-open-1028.png。候选读取失败原因未知，不推断正式接口；分类层级、选择和清除无法同状态配对，保持未通过。

2026-10-28 O-P06 源码追查：固定 2357cf5 product-editor-base.tsx:100-122,131 支持分类树 reader；未提供时回退通用 categories 候选（23-47），均在打开后读数据、失败显示重试。正常分类树路径禁止从单页候选推断层级。尚未确认 normal34 实际注入路径与失败响应，登记 N34-P02-CATEGORY-READ-01，候选现象属读取缺口，不推断正式服务故障。

2026-10-28 P02 新增商品供应商：两侧空白新增基础资料打开供应商，Demo 展示供应商候选，normal34 显示暂无数据和读取失败重试；图 demo-product-supplier-open-1028.png / normal34-product-supplier-open-1028.png。合并登记 N34-P02-CATEGORY-READ-01，分类及供应商均为候选读取缺口，但是否同根因、正式接口状态未知；没有选择或保存。

2026-10-28 P02 厚薄候选：两侧空白新增商品基础资料打开厚薄，Demo 展示薄款、常规、厚款，normal34 显示暂无数据、读取失败重试；图 demo-product-thickness-open-1028.png / normal34-product-thickness-open-1028.png。并入 N34-P02-CATEGORY-READ-01，未证明与分类或供应商同根因；选择、清除及正式运行仍未验。

2026-10-28 P02 年份与领型/裤型：两侧空白新增商品分别打开两个选择。Demo 年份默认2026并展示2015至2027等选项，领型/裤型展示候选；normal34 两项均为暂无数据、读取失败重试。图 demo-product-year-open-1028.png / normal34-product-year-open-1028.png、demo-product-shape-open-1028.png / normal34-product-shape-open-1028.png。默认年份差异已有记录；各读取失败不推断为同根因或正式接口故障，未选取和保存。

2026-10-28 O-P06/P02 接线更正：此前记录的 src/products/product-editor-base.tsx 双路径属于另一实现，不能据此认定 normal34 预览实际路径。固定 2357cf5 的 demo-replica/frontend/runtime/products/editor.tsx:12,97 将 cap.reader 传给 EditorChoice；editor-fields.tsx:15-23 按 kind 调用同一个 readCandidates，分类渲染 Cascader，其他字段 Select，失败均出现重试。该源码说明共用读取接口，不能证明运行注入、各 kind 响应或同一根因；继续保留正式运行未知。已更正 FINDINGS。

2026-10-28 normal34 环境边界核实：lsof 显示 57923 由进程 10937 监听；ps 指向 ui-preview-2357cf5-phase2-34/serve-fixed.mjs。该脚本仅接受 GET/HEAD、设置 connect-src none，并明确 syntheticOnly、不提供真实后端；构建回执绑定 2357cf5。此证据证明当前预览不接真实后端，不单独证明各候选失败的具体路径或正式接口故障。N34-P02-CATEGORY-READ-01 已补环境限定。

2026-10-28 O-P03 图片文件选择：Demo 空白新增商品图片页点击主图添加，实际打开 macOS 文件选择器；未选择或上传文件。尝试取消时工具提示用户改变 Chrome，随后状态仍为打开，因尊重用户操作停止，取消未确认。normal34 既有图片页明确上传不可用，无同等入口，仍不能双侧配对。未截图文件选择器，避免记录用户文件列表。

2026-10-28 O-P03 补续：确认上次 Demo 文件选择器仍打开后点击取消，返回新增商品图片页，未选文件；normal34 同为空白新增商品图片页无添加入口，提示保存与图片上传不可用。配对页面截图 demo-product-image-cancel-1028.png / normal34-product-image-unavailable-1028.png；文件选择器本身为单侧观察，未保留含用户文件列表的截图。上传、图片操作及正式运行未验。

2026-10-28 O-S12 折扣辅助入口源码核对：冻结 sales-current.js:251-252 存在弹窗及应用处理；:100 提供行内折扣输入，:285 行操作只渲染查看、赠品和删除。没有找到该函数内独立折扣辅助入口；不能仅凭处理分支推断弹窗当前可达，也不能判不存在或通过。需在适用业务状态下安全查找可见入口，未注入事件或操作既有草稿；状态仍 NOT_RUN。

2026-10-28 P02 新增商品页签输入保留：Demo 8877 与 normal34 57923 各自空白新增商品，输入同一测试款号 QA-COMPARE-1028 和名称 QA Test，切至规格再回基础资料，两侧均保留所填值；图 demo-product-tab-retain-1028.png / normal34-product-tab-retain-1028.png。两侧仍保留未保存测试草稿，未保存商品；仅验证这两个字段和一次切换，不能代表保存、其他输入或整页通过。

2026-10-28 P02 未保存离开：两侧自建测试草稿同款号名称，点击取消，Demo 提示有未保存的修改、继续编辑/放弃修改并离开；normal34 提示放弃修改、取消/确认。点击继续编辑或取消后均留在表单且两个字段保留。配图 demo-product-unsaved-confirm-1028.png / normal34-product-unsaved-confirm-1028.png，登记 N34-P02-LEAVE-PROMPT-01；未确认放弃、未保存。

2026-10-28 N34-P02-LEAVE-PROMPT-01 接线：固定 2357cf5 demo-replica/frontend/runtime/products/editor.tsx:118 的 discard 与 reload/delete 共用 SourceModal，discard 使用放弃修改/取消/确认；目录页 category-page.tsx:152 和全局 runtime-host.tsx:119 各自有另一套有未保存修改提示。此为源码范围证据，尚未验证其他入口运行态或删除/重载，不扩展为同根因的全站判定。

2026-10-28 P02 未保存提示 Esc：两侧分别再次点击取消、焦点落安全选项后按 Esc，均关闭提示并保留 QA-COMPARE-1028 与 QA Test；弹窗对照图沿用 demo-product-unsaved-confirm-1028.png / normal34-product-unsaved-confirm-1028.png。只验证该焦点与两个字段，未放弃未保存草稿、未保存商品。

2026-10-28 索引校正：校验矩阵 105 项、引用截图缺失0；当前状态为未检查18、部分38、存在差异49，整页/整类通过0。旧未完成索引将若干 PARTIAL 项放在未检查章节，现按矩阵重建索引；仅修正索引，不新增通过或改变验收结论。

2026-10-28 N34-P02-LEAVE-PROMPT-01 截图复核：同视口配对图中两个弹窗均居中有遮罩；Demo 放弃按钮蓝色，normal34 确认按钮红色。标题、正文和按钮文案差异已登记，增加颜色差异；这不证明其他弹窗或正式环境相同。

2026-10-28 原问题映射同步：核对 USER-ISSUE-COVERAGE-NORMAL34 的 currentPageMatrix 与当前矩阵，更新 15 处引用快照；保留原始 results 历史，不改变原问题结论或扩大通过范围。

2026-10-28 P05 九价批量粘贴：两侧已有自建未保存商品草稿，价格页从采购价粘贴1至9各一行，九行均按顺序显示相同数字。Demo 显示已填入9项提示；normal34 页面树未显示同提示，截图 normal34-product-nine-prices-paste-1028.png 需结合提示时序再判断。Demo 图 demo-product-nine-prices-paste-1028.png。未保存；异常值、空值及正式接口未验。

2026-10-28 P05 九价切页保留：前述两侧自建草稿粘贴九个数字后切基础资料再回价格页，1至9均按原顺序保留；图 demo-product-nine-prices-retain-1028.png / normal34-product-nine-prices-retain-1028.png。均未保存，不能证明正式持久化或异常输入处理。

2026-10-28 P05 无效批量粘贴：两侧九价原为1至9，从采购价粘贴11、abc、33；Demo 显示非负金额及两位小数提示，原值1至9保留；normal34 前三项变为11、abc、33，无即时错误提示，后六项保留。配图 demo-product-invalid-paste-1028.png / normal34-product-invalid-paste-1028.png。冻结 product-current.js:282 先验证整批，固定预览 editor.tsx:113 逐项直接赋文本；登记 N34-P05-INVALID-PASTE-01。候选保存禁用，不能推断非法数据能保存；未保存任何商品。

2026-10-28 P05 制表符粘贴：两侧九项初始为1至9，从采购价粘贴以制表符分隔的11、22、33；Demo 三项依序填入前三行，normal34 将文本插入采购价一个输入框，后续行保留原值。图 demo-product-tab-paste-1028.png / normal34-product-tab-paste-1028.png。归入 N34-P05-INVALID-PASTE-01：Demo product-current.js:282 按制表符或换行拆分，固定预览 editor.tsx:113 仅按换行拆分；均未保存，不能推断正式持久化结果。

2026-10-28 N34-P05-INVALID-PASTE-01 保存边界源码：固定 product-editor-state.ts:41-45 在执行客户端前解析命令，product-maintenance-validation.ts:42 调用 catalogue-price-input.ts:13-24 的九价规则，非负十进制或 null，源码按规则会拒绝 abc。此为静态调用链，normal34 保存禁用，未实测提交或正式后端；不把输入态错误扩大为已写入业务数据。

2026-10-28 P05 超量粘贴：两侧各恢复九价为1至9，再从采购价粘贴11至20共十行；Demo 提示最多9项并保留原九值；normal34 改为11至19，未显示第十项或超量提示。截图 demo-product-overflow-paste-1028.png / normal34-product-overflow-paste-1028.png。归入 N34-P05-INVALID-PASTE-01；源码 Demo 检查数量再赋值，候选 editor.tsx:113 截取剩余行。未保存。

2026-10-28 O-T04 入口条件补证：冻结提交 transfer-matrix-experiment.js:37-53,66，展示尺码映射多个历史身份时渲染原尺码数量明细入口，弹窗按原身份呈现数量；不能用普通单尺码样例替代。尚未取得两侧可比多身份样本及运行弹窗，保持 NOT_RUN；源码证据不等于页面通过。

2026-10-28 P05 空白行粘贴：两侧初始九价1至9，从采购价粘贴11、空行、33；均显示采购价11、零售价未设置、五级价33，后六行保留；图 demo-product-blank-paste-1028.png / normal34-product-blank-paste-1028.png。未保存，仅验证中间空行显示，尾部空行、持久化及既有粘贴差异仍未完成。

2026-10-28 P05 尾部空白：两侧先恢复九价1至9，采购价粘贴文本 11 后两个换行；Demo 处理为2项（11、空白）并清空原零售价2；normal34 实际页面树保持采购1、零售2，没有观察到改变。配图 demo-product-trailing-blank-1028.png / normal34-product-trailing-blank-1028.png。固定候选 editor.tsx:113 trimEnd 后单项交由浏览器处理；此结论限定本次剪贴文本和浏览器，不推断其他尾部复制格式及保存。

2026-10-28 O-T05 触发条件补证：冻结提交 transfer-matrix-experiment.js:134-140，普通录入重复已存在规格会出现确认追加；更换原行到已存在规格出现确认合并，取消保留原行。两种分支不可用普通新增商品替代。两侧运行态、确认/取消以及身份与数量合并尚未配对，保持 NOT_RUN，不动现有用户草稿。

- 2026-10-28 P04 新增商品条码：同一窗口分别操作两侧自建未保存草稿。Demo 默认2026方案，候选有多个方案，查看方案弹窗可打开并关闭；normal34 无已确认默认方案，候选显示读取失败，查看方案禁用。截图 demo-product-barcode-new-1028.png、demo-product-barcode-scheme-1028.png、normal34-product-barcode-new-1028.png、normal34-product-barcode-options-1028.png。前两张分别为 Demo 基础状态和弹窗，候选缺方案无法形成弹窗配对；这是当前合成预览能力缺口，不推断正式接口故障或方案默认值裁决。P04 仍 DIFFERENCE；未保存。
- 2026-10-28 P15 颜色搜索与清除配对：Demo 8877 和 normal34 57923 同窗口分别输入编码 515，均显示上青色、共 1 条；全选退格清除后均恢复共 182 条、第一页。截图 demo-color-search-515-1028.png / normal34-color-search-515-1028.png。候选新增与编辑仍禁用，页面未通过；未写入数据。
- 2026-10-28 P15 颜色分页配对：两侧每页20条、总182条，从第一页点第2页均显示第21–40条，所列20条名称编码一致；点击上一页均返回第1–20条。截图 demo-color-page2-1028.png / normal34-color-page2-1028.png。仅证明这次翻页和返回，页容量、跳转及维护未因此通过。
- 2026-10-28 P15 每页条数及跳转：在 Demo 8877 和 normal34 57923 颜色页，分别用方向键和 Enter 选择50条/页，再输入3并点击跳转；两侧均显示第101–150条，名称编码一致。截图 demo-color-50-page3-1028.png / normal34-color-50-page3-1028.png。仅验证该页容量与有效页码的路径；其他容量、越界和维护未因此通过。
- 2026-10-28 N32-I06-01 台账纠正：保留 normal32 历史地址，当前候选地址改为57923；只读核固定 2357cf5 的 inventory/page.tsx:46,51,57–58 实际构造居中 SourcePopover、两列和底部关闭。用户批准的是截图中带遮罩的居中弹窗，现有 QA 偏离该批准基准；不把批准本身记为缺陷。复用已有 normal34 双侧截图，未新增浏览器操作。
- 2026-10-28 P16 尺码组搜索清除：Demo 8877 和 normal34 57923 分别输入男装，均显示上衣及裤子两个尺码组；清空后均恢复6条。配对截图 demo-size-search-1028.png / normal34-size-search-1028.png。该次使用辅助功能设置文本值，不能代替鼠标清除按钮和键盘输入全覆盖；既有列宽差异及其他操作仍待处理。
- 2026-10-28 清单去重纠正：复核发现 P15 颜色搜索、清除和分页以及 P16 男装搜索、清除此前已留同版本配对记录，本轮有重复操作；这些重复不计新增覆盖。修正 P15/P16 未完成说明并由现行矩阵重建未完成索引；仅复用已有证据，不改变页面验收状态。
- 2026-10-28 O-S09 源码入口追查：冻结版 index.html:17 打开 REAL_DATA_MODE 并加载 real-data-bridge.mjs，其 :221–223 替换 SALES_FUNDS_UI.field/syncField 为行内收款；sales-funds-ui.js:14,19 中旧账户弹窗仍有代码。已观察新建销售页为行内选择，不能单凭旧代码认定弹窗在当前运行状态可达，也不能断言其他状态均不可达；保留 NOT_RUN，后续查可安全配对的编辑及退换入口。没有新做浏览器操作。
- 2026-10-28 B07/O-B09 路由核查：normal34 在独立对照标签直接访问 #settings/accounts，稳定后实际显示员工与账号列表，无独立账号页签，新增和编辑员工禁用，截图 normal34-account-deeplink-1028.png。固定源码 ready-pages.tsx:240–252 将 staff/accounts 两路由均接入 StaffRuntime。此为当前 QA 单侧证据，Demo 同类入口及指定正式参考未配对，独立维护弹层、权限与正式运行未验；两项改为 PARTIAL 而非通过，不作未批准功能裁决。
- 2026-10-28 B07/O-B09 Demo 补证：同一窗口从侧栏进入冻结 Demo #settings/staff，实际为员工与账号列表、没有独立账号页签，新增员工及编辑可用；配合 normal34-account-deeplink-1028.png 比较列表入口，截图 demo-staff-account-entry-1028.png。两侧数据不同，仅比较入口及控件；Demo 正常入口为 staff，QA 另验证 accounts 深链，不能当相同 URL 状态。正式前端参考及账号维护合同未核完，独立弹窗未验，保持 PARTIAL。
- 2026-10-28 O-S11 入口追查：冻结 sales-current.js:250 存在普通零价确认事件分支，:285 行操作未渲染该按钮，:101、:310 有零价标记赋值。已有赠品配对不等于普通零价，不能以源码推断弹窗可达或已取消；保留 NOT_RUN，待安全自建两侧未保存单据并检查输入、失焦及提示。未新增页面操作。
- 2026-10-28 O-S11 进一步核对：冻结销售源码 :257 已填行价格输入和 :272 录入行价格赋值在数值为0时设置 zeroConfirmed，:329 对已填行失焦执行合并及更新。该信息只限定需要实操的两类入口，不足以判定是否弹确认或业务正确；既有本次草稿的当前标签归属未确认，未修改或覆盖。
- 2026-10-28 B04 匹配姓名搜索：在默认在职、全部角色/厅/登录权限下，Demo 按本环境已有姓名关键词查询，显示2条包含该词的员工；normal34 按合成员工姓名“测试管理员”查询，显示1条。配图 demo-staff-match-search-1028.png / normal34-staff-match-search-1028.png；因资料与关键词不同，仅比较匹配路径，不比较数量或完整准确性。未写入，登录账号关键词与多条件组合仍待核。
- 2026-10-28 B04 姓名和角色组合：两侧分别用各自存在的员工姓名并选择营业员，点击查询后均保留条件并返回一条在职营业员；Demo 原姓名搜索有2条，角色过滤后剩1条。配图 demo-staff-name-role-1028.png / normal34-staff-name-role-1028.png。QA 名称不同且结果样本仅1条，不能证明所有排除条件；未写入。
- 2026-10-28 S02 矩阵漏记纠正：对照 FINDINGS.json 的 N34-S03-PAYMENT-EMPTY-01 及销售同状态配对图，新增销售已实际检查三笔草稿且发现空行时提示差异；原矩阵只记空白页并称收款尚未检查，现补证并由 PARTIAL 改 DIFFERENCE。此为历史实操证据归位，业务裁决及整页未通过不变，没有重做操作。
- 2026-10-28 矩阵证据关联审计：现行37页及68类弹层；页 NOT_RUN 1 / PARTIAL 8 / DIFFERENCE 28，弹层 NOT_RUN 15 / PARTIAL 30 / DIFFERENCE 23；整页/整类通过均0。所有已开始条目有证据文件引用，逐个路径存在；38个差异行未在 actions/notRunReason 明写 N3 问题编号，需与 FINDINGS 逐项关联或说明已有共性，不等于缺陷未登记。详见 MATRIX-EVIDENCE-LINK-AUDIT-1028.json；文件存在不代表截图状态匹配。
- 2026-10-28 证据关联补充：根据问题描述、同版本截图交集，将16个矩阵页面/弹层明确关联既有问题编号（relatedIssueIds）；公共问题按已有跨页记录引用，不新增根因。其余无明确编号的行继续待核，截图交集本身不足以证明问题归属，未自动批量映射。页面状态不变。
- 2026-10-28 O-I04 版型候选搜索：两侧库存等待查询、高级筛选展开且全部版型选中，输入 Y 后稳定显示1项 Y版（修身）；截图 demo-inventory-fit-search-1028.png / normal34-inventory-fit-search-1028.png。QA 点击结果后搜索清空，但随后仍显示全部选中，选择结果未可靠确认，不作为取消成功或差异结论；未查询及写入。
- 2026-10-28 O-I04 版型取消补查：QA 在全部版型列表点击Y行，显示Y未选、已选5项；Demo 在搜索Y的候选中点击Y行，搜索清空、Y未选、已选5项。截图 demo-inventory-fit-exclude-y-1028.png / normal34-inventory-fit-exclude-y-1028.png。两侧点击时搜索状态不同，不记搜索条件下操作完全配对；Demo 高级筛选计数为1、QA不显示，仍沿 N34-I04-FILTER-COUNT-01。未执行查询。
- 2026-10-28 O-I04 版型恢复和范围：两侧从排除Y、已选5项的状态点击全部版型，均恢复6项；随后查询并打开范围，均显示全部版型。配图 demo-fit-restore-all-1028.png / normal34-fit-restore-all-1028.png、demo-fit-restored-scope-1028.png / normal34-fit-restored-scope-1028.png。两侧仓库及商品样例不同，不比较库存结果；该范围外观仍按用户截图例外记录 N32-I06-01，未变更资料。
- 2026-10-28 O-I04 搜索后取消配对：两侧均从全部版型、搜索Y且稳定匹配1项，点击Y行；Demo清除搜索并取消Y、保留5项；normal34清除搜索后仍6项全部选中。配图 demo-fit-search-click-result-1028.png / normal34-fit-search-click-result-1028.png，登记 N34-I04-FIT-SEARCH-TOGGLE-01；固定 candidates.tsx:110–122 为关联代码，具体根因待证。同页不搜索点击Y可取消。未查询、未写入。
- 2026-10-28 接续：库存高级季节筛选对照，全部选中时搜索春并点击结果，Demo取消春，normal34仍全选；两侧样例字典不同，仅比较该项行为。配对截图 demo-inventory-season-search-toggle-1028.png / normal34-inventory-season-search-toggle-1028.png；归入 N34-I04-FIT-SEARCH-TOGGLE-01，未查询或保存，整页未通过。
- 2026-10-28 O-I05 查询后保留：Demo 8877 与 normal34 57923 全部筛选条件下开启季节辅助字段、执行查询并重新打开显示设置，季节均仍勾选，商品行可见季节；各自恢复原偏好。配对 demo-display-season-after-query-1028.png / normal34-display-season-after-query-1028.png。样例和既有版型偏好不同；重载及其他组合未验，整页未通过。
- 2026-10-28 索引同步：以现行 PAGE-MATRIX.json 重建未完成索引，修正 B07/O-B09 等旧状态；现为未检查16、部分38、差异51，合计105项。仅同步记录，不代表新实操或整页通过。
- 2026-10-28 O-I04 供应商搜索取消：Demo 全部供应商搜索一个现有项并点选后该项未选、剩450/451；normal34 全部供应商搜索其合成项并点选后仍全部3项选中。配图 demo-inventory-supplier-search-toggle-1028.png / normal34-inventory-supplier-search-toggle-1028.png；样例及关键词不同，仅比较操作。归入 N34-I04-FIT-SEARCH-TOGGLE-01；Demo 已恢复全部，未查询、未保存。
- 2026-10-28 O-I03 首标签关闭：两侧从全部仓库清除后各选两个仓库，再点击第一个可见仓库标签的关闭按钮；Demo 保留丁桥店XM仓库，normal34 保留网点仓，均提示条件已修改，未重新查询。截图 demo-inventory-warehouse-remove-first-1028.png / normal34-inventory-warehouse-remove-first-1028.png；仓库样例不同，不比较库存数量。折叠标签及其他键盘行为仍未全验。
- 2026-10-28 O-S06 源码依赖补证：冻结 sales-current.js:194-196 中批量选货搜索结果的 onSelect 调用 matrix，后者构造颜色尺码矩阵；:245 另有 matrix 事件分支。已观察新建首屏无独立批量入口，但无法仅凭源码断言全部运行状态不可达。矩阵尚无双方实际操作和配对，继续 NOT_RUN；未注入或写入。
- 2026-10-28 O-I03 Esc 尝试无效：Demo 原有单仓状态，点击组合框后页面树未确认下拉打开，按 Escape 后截图显示搜索仓库占位；因为按键前下拉未确认打开，不能归因 Esc 清除或判定关闭行为，也未做候选侧配对；截图 demo-warehouse-escape-1028.png 仅保留过程，不记覆盖。未查询或保存。
- 2026-10-28 O-I03 Esc 有效配对：两侧仓库已选0项，确认下拉可见、焦点在搜索输入框后按 Esc，列表均保持打开且0项选择不变。图 demo-warehouse-open-esc-1028.png / normal34-warehouse-open-esc-1028.png；仅此状态和焦点，其他键盘行为未验；未查询、未保存。此前未确认打开的尝试不计覆盖。
- 2026-10-28 O-I01 鼠标选货：两侧库存仓库筛选均已选0，商品框输入衬衫后点击首个匹配结果；Demo 选中 000CS0000001，normal34 选中 M26001，均显示款号标签和最近搜索。截图 demo-inventory-product-mouse-select-1028.png / normal34-inventory-product-mouse-select-1028.png；样例与候选数量不同，仅比较选中行为，未查询或保存。该操作产生各自最近搜索记录，未清理原有记录。
- 2026-10-28 O-I01 商品标签移除：两侧分别移除上次选中的单个商品，输入框恢复空白，已执行的原库存结果仍显示；截图 demo-product-filter-remove-1028.png / normal34-product-filter-remove-1028.png。两侧仓库均0项待查询，原结果数据不同；未查询或清除最近搜索，不将本路径扩展为键盘或查询通过。
- 2026-10-28 清单纠正：对照 P17/P18 actions 与既有同版本实操记录，修正未完成说明中已做的搜索、清除仍写未验的矛盾；维护和未覆盖行为仍保留，不重做或改变整页状态。
- 2026-10-28 B05 组合筛选尝试：normal34 打开收款配置后，浏览器工具提示用户改变 Chrome，立即停止后续操作；输入和下拉最终状态未经确认，也无 Demo 配对，不计检查结果。未保存或写入。未完成索引按现行矩阵同步。
- 2026-10-28 接续 B05：同一 Chrome 窗口、收款方式页输入“微信”、状态选“已停用”并查询，Demo 8877 和 normal34 57923 均显示无符合条件的数据、共 0 条；配对截图 B05-demo-wechat-disabled.png / B05-normal34-wechat-disabled.png。两侧无停用样例，不能据此判定有数据时的组合筛选；页面原有新增/编辑不可用问题未关闭，整页仍为 DIFFERENCE。
- 2026-10-28 B05 / O-B08：从两侧收款方式页打开基础设置操作记录，输入相同的不存在操作员并查询，均显示无记录；重置均清空输入，QA 恢复8条合成记录，Demo 原本无记录仍为空。配对截图 demo-b05-audit-operator-1028.png / normal34-b05-audit-operator-1028.png 及 demo-b05-audit-reset-1028.png / normal34-b05-audit-reset-1028.png。仅验证空匹配及重置，Demo 无记录不能验证有匹配的操作人筛选；真实历史未验，整页状态不变。
- 2026-10-28 S01/S04 作废样例核对：两侧销货列表其他条件为全部、仅选已作废并查询，Demo 当前返回0张，normal34 返回合成作废单（如销售 QA-XS-0021）；配图 demo-sales-void-filter-1028.png / normal34-sales-void-filter-1028.png。候选打开 QA-XS-0021 只读详情，显示已作废，返回后筛选保留；图 normal34-sales-void-detail-1028.png。Demo 当前筛选没有可用单据，因此详情无同状态配对，不能评价详情一致性；数量差异为数据环境差异，未执行作废或修改。
- 2026-10-28 用户问题覆盖索引同步：按现行 PAGE-MATRIX 逐条回填 15 个过期 currentPageMatrix 映射，保留各 result 的原始历史快照；修正 S03、O-S10、S04 未完成说明与已记录操作的矛盾，未改变页面状态或扩大通过范围。无新增浏览器实操。
- 2026-10-28 O-T05 候选源码定位：固定 2357cf5 apps/web/src/current-form/transfer-proposal.ts:287–316 检测重复坐标并构造 entry/replace 追加请求；demo-replica/frontend/runtime/documents/transfer-proposal-form.tsx:58 在 appendRequest 时渲染“确认追加数量”及取消/追加。冻结 Demo 的追加与改选合并为两种入口；源码并不能证明当前正常预览可达、文案差异实际发生或取消保留，仍 NOT_RUN，待可比草稿实操。
- 2026-10-28 O-T05 源码入口补充：固定 2357cf5 transfers-entry.tsx:17,23 的 transfer/new 路由加载 transfers-create-page.tsx，后者:7,34 导入并渲染 transfer-proposal-form；现有单据编辑分支也延迟加载该表单。此为静态导入链，不代表实际预览中重复规格弹窗已经触发，O-T05 仍 NOT_RUN。
- 2026-10-28 O-T05 单侧准备：normal34 新建未保存调拨，网点仓到总仓，M26001 白色 A版首尺码2件，再次选择同商品规格录入1件并Tab，出现“确认追加数量”；取消后原行2与录入行1均保留。截图 normal34-transfer-duplicate-confirm-1028.png / normal34-transfer-duplicate-cancel-1028.png；未保存、未追加确认。切换 Demo 时显示登录已失效，未能完成双侧配对，继续 NOT_RUN；候选草稿保留。
- 2026-10-28 O-T05 双侧重复录入：Demo 000CS0000001 不分色 A版与 normal34 M26001 白色 A版各自首尺码2件，再以同一规格录1件并移焦；两侧弹确认，取消均保留原2及新1。Demo 明示款号/规格、原尺码及1件，QA仅笼统询问追加，登记 N34-T05-APPEND-CONTEXT-01。配图 demo-transfer-duplicate-confirm-1028.png / normal34-transfer-duplicate-confirm-1028.png、demo-transfer-duplicate-cancel-1028.png / normal34-transfer-duplicate-cancel-1028.png。样例仓库商品不同；改选合并和确认追加未验，未保存。O-T05 转 DIFFERENCE，非整类通过。
- 2026-10-28 O-T05 Esc 配对：两侧重复规格确认框均已打开且焦点在关闭按钮，按 Esc 后关闭；原行2件和录入行1件仍保留。配图 demo-transfer-duplicate-esc-1028.png / normal34-transfer-duplicate-esc-1028.png。未确认追加或保存；弹窗文案差异仍存在，改选合并未验。
- 2026-10-28 O-T05 改选合并配对：Demo 001CS2131125 红色2件、卡其色1件，normal34 M26001 白色2件、藏青色1件；分别将1件行改为已有颜色并确认行内改选。Demo 弹“目标规格已在明细中”，说明按对应尺码追加及取消保留原行；候选只弹通用“确认追加数量”。取消弹窗后两侧保留已有2和改选中1，登记 N34-T05-RESELECT-MERGE-01。配图 demo-transfer-reselect-merge-confirm-1028.png / normal34-transfer-reselect-merge-confirm-1028.png、demo-transfer-reselect-merge-cancel-1028.png / normal34-transfer-reselect-merge-cancel-1028.png。Demo 还有此前测试的另一款；未确认合并、保存或审核，真实业务未验。
- 2026-10-28 O-T05 后续取消：取消合并弹窗后，再点行内取消；Demo 恢复红色2件、卡其色1件，normal34 恢复白色2件、藏青色1件。配图 demo-transfer-reselect-row-cancel-1028.png / normal34-transfer-reselect-row-cancel-1028.png。候选取消后商品候选列表打开，是否与 Demo 焦点行为一致尚需单独核对；未执行合并及保存。
- 2026-10-28 O-T05 焦点对照补充：配对截图显示 Demo 行内取消后焦点在恢复的原行数量，候选焦点落到空商品录入框并弹候选；登记 N34-T05-RESELECT-CANCEL-FOCUS-01。固定 2357cf5 表单第37、56行的取消 focusProduct 与空输入 onFocus 打开候选，与实测相符；未推断其他页。
- 2026-10-28 O-T02 无匹配和 Esc：在两侧各自未保存调拨草稿的空白录入行输入 ZZZ-NOMATCH-1028，均提示没有匹配结果；输入框保持焦点时按 Esc，候选关闭、文本保留。配图 demo-transfer-product-nomatch-1028.png / normal34-transfer-product-nomatch-1028.png 及 demo-transfer-product-nomatch-esc-1028.png / normal34-transfer-product-nomatch-esc-1028.png。已填行未改变，未保存；有匹配候选的键盘和鼠标操作仍待覆盖。
- 2026-10-28 O-T05 取消焦点源码补证：读取冻结 commit b8bcfe3 的 transfer-matrix-experiment.js:120、127–128、154；开始改选注册取消回调，取消后重绘并聚焦原行数量。固定候选 2357cf5 表单取消后聚焦商品输入且空输入触发候选，和两侧实操相符。补入 N34-T05-RESELECT-CANCEL-FOCUS-01，未改变验收状态。矩阵计数实核 NOT_RUN 15、PARTIAL 38、DIFFERENCE 52，问题引用无缺失或重复 ID。
- 2026-10-28 报告索引同步：UNFINISHED-INDEX 的 O-T02、O-T05 原说明滞后于最新配对操作，按 PAGE-MATRIX 的当前未完成范围更新；执行清单注明其104项及状态为历史快照，当前为105项，以矩阵为准。未改变验收状态或代替两侧实操。
- 2026-10-28 O-T02 键盘路径待验证：冻结 b8bcfe3 frontend/product-finder.js:21 在输入焦点处理方向键和 Enter；normal34 固定 2357cf5 transfer-proposal-form.tsx:56、67 的输入框 Enter/下箭头转焦首候选，候选容器处理上下方向。两侧具体有匹配状态、选中结果及按键次数尚未实操，源码差异仅作为待验证线索，不记缺陷或通过。浏览器使用安排等待用户回复。
- 2026-10-28 裁决索引校正：DECISIONS.md 中库存查询范围仍引用旧 normal32，现按已有 N32-I06-01 的 normal34 实证更新；同时明确当前合成预览不代表正式接口或真实业务，不将旧版本证据当作当前构建。裁决内容和验收状态未变。
- 2026-10-28 T03 入口源码补证：固定 2357cf5 transfers-entry.tsx:38、43–45，满足 existingEdit、RUNTIME_LEDGER 且 DRAFT 的详情通过修改按钮调用 begin，读取完整单据后准备编辑；补充 N34-T03-EDIT-ENTRY-01。Demo 入口源码定位仍待完成，不能用该代码代替真实权限或保存验证。
- 2026-10-28 T03 Demo 入口补证：冻结 b8bcfe3 transfer-current.js:12、28、39、76、134，列表 open-doc 读取单据后请求租约，编辑标题和可编辑状态由 locked 控制；未审核且租约可用才对应既有页面观察的直接编辑。记录 N34-T03-EDIT-ENTRY-01 已补两侧源码与适用边界；未核租约异常或真实保存。
- 2026-10-28 季节样例链补证：固定 2357cf5 的 apps/web/demo-replica/frontend/qa-reference-fixtures.ts:1298、1713、1750、1755 确认六季节字典及商品/候选引用，补充 N33-FIXTURE-SEASON-01 的完整路径。已有库存双侧证据仅支持合成候选差异，正式数据未验。
- 2026-10-28 O-S05/O-S07 入口补充：冻结 b8bcfe3 frontend/verification/sales-redesign.cjs:50 的历史测试在其构造页面中断言不存在 data-sale=pick 和 toggle-scan；sales-current.js:195、245 仍保留处理分支。测试代码与处理函数存在不证明当前真实运行页面所有状态都没有入口；继续保持 NOT_RUN，不注入事件、不凭历史测试取消清单。
- 2026-10-29 O-T02 单候选 Enter 配对：两侧各输入完整款号，均仅一个候选；Demo 一次 Enter 即选中并聚焦颜色，normal34 第一次 Enter 聚焦候选、第二次才选中。登记 N34-T02-SINGLE-ENTER-01，五张配图见该问题；两侧样例商品与尺码不同，未填新数量或保存。O-T02 转 DIFFERENCE；其他候选操作未验。
- 2026-10-29 O-T02 多候选键盘：Demo 搜索 CS（266项）及 normal34 搜索 M2600（2项），各在输入框按两次向下再 Enter，均选中第二项并聚焦颜色。Demo 方向选择期间焦点在搜索框；normal34 先转焦候选。截图 demo-transfer-multi-key-before/down2/selected-1029.png 与 normal34 同名配对；样本数量和商品不同，仅核按键路径，不比较结果数量；未输入新数量或保存。
- 2026-10-29 O-T02 多候选鼠标：Demo 搜索 CS，normal34 搜索 M2600，点击各自第二项，均选中对应商品且焦点到颜色。配图 demo-transfer-mouse-before-1029.png / normal34-transfer-mouse-before-1029.png、demo-transfer-mouse-selected-1029.png / normal34-transfer-mouse-selected-1029.png。数据量及商品不同；未填写新数量、保存或审核。上方向键及更多候选待核。
- 2026-10-29 O-T02 向上键和 Esc：Demo 搜索 CS、normal34 搜索 M2600，均从输入框按两次向下后按一次向上，回到第一项；随后按 Esc 均关闭候选并保留搜索词。Demo 操作时焦点仍在输入框，normal34 在候选项，关闭后分别为输入框和页面，焦点条件不同不直接判差异；配图 demo-transfer-multi-up-1029.png / normal34-transfer-multi-up-1029.png 及 demo-transfer-multi-up-esc-1029.png / normal34-transfer-multi-up-esc-1029.png。未保存。
- 2026-10-29 O-T02 更多匹配：Demo 搜索 CS 显示8/266，点击查看更多后为28/266；normal34空搜索仅6个合成商品，没有足够候选触发同等条件。截图 demo-transfer-more-expanded-1029.png / normal34-transfer-all-candidates-1029.png 记录数据环境而非同状态配对；QA更多入口与操作未验，不据入口不可见报缺陷。未保存。
- 2026-10-29 O-T01 调出/调入仓 Esc：两侧各在已有两仓和明细的未保存草稿中打开仓库候选，搜索输入焦点按 Esc，均关闭并保持原两仓和数量；四组配对截图 demo-transfer-from/to-open/esc-1029.png 与 normal34 同名。仓库与商品样本不同；搜索、方向键、负责人和其他联动仍待核，未保存。
- 2026-10-29 O-T01 调出仓无匹配：两侧在已选仓下搜索 ZZZ-NO-WAREHOUSE；Demo显示暂无数据，normal34仍显示已选网点仓；Esc均恢复原仓并保留明细。登记 N34-T01-WAREHOUSE-SEARCH-01；固定2357cf5 current-warehouse-select.tsx:12–15 补入已选值且禁用本地过滤，与现象一致，但未抓取实际响应，调入仓及共用范围待核。配图 demo-transfer-warehouse-nomatch/nomatch-esc-1029.png 与 normal34 同名。
- 2026-10-29 O-T01 调入仓无匹配：两侧同样搜索 ZZZ-NO-WAREHOUSE，Demo显示暂无数据，normal34仍列已选总仓；Esc均恢复原调入仓。归并 N34-T01-WAREHOUSE-SEARCH-01，截图 demo-transfer-to-nomatch/nomatch-esc-1029.png 与 normal34 同名。未修改或保存。
- 2026-10-29 O-T01 调出仓有匹配：Demo搜索下沙银泰XM只显示匹配仓；normal34搜索温州，显示不匹配的已选网点仓与温州仓。两侧Esc保留原值。归并 N34-T01-WAREHOUSE-SEARCH-01，配图 demo-transfer-from-match-1029.png / normal34-transfer-from-match-1029.png；仓库和搜索词不同，比较过滤结构，未选新仓、保存。
- 2026-10-29 O-T01 源码定位纠正：先前记录 current-warehouse-select.tsx 为新增页来源不准确；固定 2357cf5 新增调拨实际为 transfer-proposal-form.tsx:61–63 的 TransferWarehouse，选中项补入候选且 filterOption=false。current-warehouse-select.tsx 在 transfers-history-page.tsx:16、44 使用，历史编辑页面运行未核，不扩大为已复现。已更正 N34-T01-WAREHOUSE-SEARCH-01，保留本条历史纠正。
- 2026-10-29 O-T01 搜索取消后重新打开：两侧调出仓库在有匹配搜索后按 Esc，再重新打开，均显示完整候选，原仓及明细保留；配图 demo-transfer-from-reopen-1029.png / normal34-transfer-from-reopen-1029.png。仓库及商品数据不同；仅覆盖重新打开，不改变 N34-T01-WAREHOUSE-SEARCH-01 未修复状态，也不代表整页通过。
- 2026-10-29 O-T01 人员入口补充：Demo 新增调拨的创建者选择器输入 ZZZ-NO-STAFF 显示暂无数据，Esc 后恢复未选择状态；normal34 同位置负责人为只读横杠，点击无变化，无法执行对应搜索。截图 demo-transfer-creator-nomatch-1029.png / normal34-transfer-creator-unavailable-1029.png 为可用入口差异证据，非同一搜索状态的配对。创建者与负责人语义不同，按用户负责人应可选择的裁决沿既有问题登记，不以 Demo 旧身份逻辑替代；未保存。
- 2026-10-29 O-T01 调出仓方向键：两侧在已选调出和调入仓的草稿中打开调出仓候选并按一次向下；截图显示均跳过已作调入仓的禁用项，高亮下一个可选仓。Esc 后原仓和明细保留。配图 demo-transfer-warehouse-down-1029.png / normal34-transfer-warehouse-down-1029.png；实际仓库不同，未按 Enter 确认切换，因此不代表仓库选择及联动全通过。
- 2026-10-29 O-T03 新增调拨草稿版型 Esc 补充：Demo 选择版型触发控件有焦点时 Esc 关闭候选、改选行保留；normal34 同焦点 Esc 后候选仍打开，归既有 N34-T03-COLOR-ESC-01，不重复建问题。配图 demo-transfer-fit-esc-1029.png / normal34-transfer-fit-esc-1029.png；Demo 样例只有1个版型、QA有2个，未比较候选数量。两侧随后取消改选，原行数量保留；Demo 取消时清除了此前本次测试在空录入行输入的 CS 搜索词，未保存单据。
- 2026-10-29 O-A02 新增调拨返回列表：两侧在已选仓和已填明细的未保存草稿中点击返回列表，均弹“有未保存的修改”，提示离开会丢失，点继续编辑后原仓及各行数量保留。截图 demo-transfer-leave-confirm-1029.png / normal34-transfer-leave-confirm-1029.png。样例不同；未点放弃，其他入口和 Esc 未验，保持 PARTIAL。
- 2026-10-29 O-A02 Esc：新增调拨两侧从返回列表打开未保存提示，关闭按钮取得焦点时按 Esc，提示均关闭，原仓及数量保留。配图 demo-transfer-leave-esc-1029.png / normal34-transfer-leave-esc-1029.png；只覆盖此焦点、入口，未放弃、保存。
- 2026-10-29 O-T06 扫码抽屉 Esc：两侧均选好调出/调入仓且已有明细，打开扫码抽屉，条码输入框焦点按 Esc，抽屉均关闭，原明细数量保留。配图 demo-transfer-scan-esc-1029.png / normal34-transfer-scan-esc-1029.png。样例商品不同；没有输入或提交条码，默认无仓禁用差异仍未修，真实扫码及事务未验。
- 2026-10-29 O-T06 未提交扫码输入：两侧已选仓、有明细时在扫码输入框输入 TEST-PENDING-1029，不按回车；Esc 关闭并重开后输入框均清空，原明细数量保留。配图 demo-transfer-scan-reopen-1029.png / normal34-transfer-scan-reopen-1029.png；两侧样例不同，未提交扫码，既有默认禁用差异和真实扫码缺口不变。
- 2026-10-29 商品页接续检查：现有 normal34 #products/new 标签为已有未保存 QA-COMPARE-1028 草稿，停在条码页；现有 Demo #product/new 标签切入后页面区域为空，未显示可操作内容。为保护已有草稿未刷新或导航，未作双侧比较，也不将空白推断为产品缺陷；该状态待使用可安全加载的 Demo 页面再检查。两侧调拨草稿仍在原标签。
- 2026-10-29 商品只读对照接续：复用现有只读标签，重载 Demo #product-view/501XF5395665 已恢复；normal34 只读标签由列表进入并以此前确认商品ID直接打开 #products/view/00000000-0000-4000-8000-000000004000。两侧价格页显示相同9种价格类型及提示，Demo样本均未设置、候选零售价239；截图 demo-product-readonly-price-1029.png / normal34-product-readonly-price-1029.png。候选列表点击款号文本未导航，仅该点击不证明不存在其他入口；实际只读页入口仍待核，P11保持 PARTIAL。未改原有商品或单据草稿。
- 2026-10-29 O-P09 商品只读条码：两侧各查看175/L，Demo 黑色 A版显示规格及一条主码；normal34 白色 A版未显示规格，列出主码和合成旧码。候选弹窗每页50切换为20，仍显示2条、1页并可关闭；Demo样本无旧码，且该弹窗未显示分页，不能借此判断多页或历史样本一致。配图 demo-product-barcode-175-1029.png / normal34-product-barcode-175-1029.png，单侧分页图 normal34-product-barcode-175-page20-1029.png；无资料修改。归既有规格缺失与分页观察，O-P09保持 PARTIAL。
- 2026-10-29 P10 条码主表分页：normal34 合成商品共44条，切为20条/页后显示3页，点击至第二、第三页，末页4条且下一页禁用，再返回第二页；截图 normal34-product-barcode-page2-1029.png / normal34-product-barcode-page3-1029.png。Demo 当前商品仅11规格，末尾图 demo-product-barcode-bottom-1029.png，不具备同数据量配对，不能宣称两侧翻页一致或以样本不足判断分页差异。未修改商品，P10仍未完成。
- 2026-10-29 A02 商品只读页导航：两侧分别点击调拨和销货导航组，均收起对应列表/新增子项，再点均恢复，商品页仍保持。配图 demo-nav-transfer/sales-collapsed-1029.png / normal34 同名；仅此鼠标操作，其他页面与键盘状态未验，A02仍 PARTIAL。此前调拨导航有局部证据，本轮补充商品只读页和销货组。
- 2026-10-29 P01 年份筛选：两侧初始全部年份均选中，点击2026后该项取消，再次点击恢复；Demo 13年变12年，候选仅1年变0年，样例字典不同，不比较数量或查询结果。配图 demo-products-year-toggle-1029.png / normal34-products-year-toggle-1029.png；未查询、未保存，其他年份组合与键盘未完成。
- 2026-10-29 P01 季节筛选：两侧全部季节选中时点击春/春季均取消该项，再点恢复；Demo由4项变3项，normal34由6项变5项，季节字典与命名不同的合成样例沿 N33-FIXTURE-SEASON-01 已登记，不比较结果数量。配图 demo-products-season-toggle-1029.png / normal34-products-season-toggle-1029.png；未查询或修改资料，组合筛选未验。
- 2026-10-29 P01 年份季节组合：两侧分别选2026及春/春季查询，Demo显示17款2026/春，normal34显示1款2026/春季。两侧样例不同不比较数量；候选字典仅2026，选该年后显示全部年份，无法验证多年份子集语义。截图 demo-products-year-season-query-1029.png / normal34-products-year-season-query-1029.png；未修改资料或保存。P01仍 DIFFERENCE。
- 2026-10-29 P01 高级筛选厚薄配对：同为商品列表已展开高级筛选，Demo 显示薄款、常规、厚款共3项；normal34 显示匹配0项，当前无法做共同候选的选择及查询比较。配图 demo-products-thickness-options-1029.png / normal34-products-thickness-options-1029.png。可能涉及样例或接入，原因未知，不推断正式字典，也不记该筛选通过。
- 2026-10-29 P01 版型筛选：在年份2026（QA全部年份仅含2026）、春/春季条件下，两侧展开版型，从全选取消A版，均剩5项，再各自点击查询。Demo 17款原样例为A版，结果0款；QA 样例商品同时有Y和A版，仍显示1款；数据不同，不据数量判定差异或完整业务通过。配图 demo-products-fit-exclude-a-1029.png / normal34-products-fit-exclude-a-1029.png、demo-products-fit-query-1029.png / normal34-products-fit-query-1029.png。
- 2026-10-29 P01 领型/裤型筛选配对：同为高级筛选已展开、版型排除A并查询后的状态，Demo 候选显示15项，normal34 显示匹配0项。配图 demo-products-shape-options-1029.png / normal34-products-shape-options-1029.png。QA缺共同候选，选择、查询、清除未验证；原因未知，不外推正式数据或判定整个页面通过。
- 2026-10-29 P19/O-P07：两侧条码方案列表打开“2018年货品”，右上角关闭按钮均返回列表。Demo 显示存货默认条码原值及随默认条码长度，QA 合成方案显示自定义5位、9位；同名不证明资料相同，沿 N33-FIXTURE-BARCODE-01 记录，不推断正式规则。规则分行/单行沿 N33-P19-DETAIL-01。配图 demo-scheme-2018-detail-1029.png / normal34-scheme-2018-detail-1029.png；本次仅验证关闭操作，其他方案和整页仍未完成。
- 2026-10-29 证据索引完整性检查：现行 PAGE-MATRIX.json 包含37个页面、68类弹层；逐项检查 evidence 所列本目录文件均存在（缺失0）。此检查只证明文件路径存在，不证明截图内容或每项已完成。颜色页超范围页码尝试时，QA 页输入99后点击未观察到页面变化，随后浏览器切换至已有未保存调拨草稿；受遮挡和外部切换影响，跳转未能双侧完成，不判定行为或新增覆盖，等待可用时重新按同条件核查。
- 2026-10-29 报告同步：从现行矩阵重建未完成索引，当前105项（37页、68类弹层），未检查15、部分检查36、发现差异54；均不表示整页通过。旧索引部分检查数38已过时。本次只同步台账，未新增页面验证。
- 2026-10-29 P15 页码边界：两侧空搜索、20条/页、182条，Demo输入99并跳转后到第10页、显示181–182及输入10；QA输入99后鼠标点击及聚焦按钮Enter/空格仍在第1页，角标遮挡、输入事件或触发路径的影响未排除，不能判成确认缺陷或通过。图 demo-color-page99-1029.png / normal34-color-page99-1029.png；QA图分页被角标遮挡。需在不遮挡且确定输入事件正常条件下复核。
- 2026-10-29 P15 无匹配搜索：Demo 与 normal34 颜色页分别输入 ZZZ987，均显示没有匹配的数据、共0条，配图 demo-color-no-match-1029.png / normal34-color-no-match-1029.png；仅此状态操作，不代表维护可用。QA越界输入重复尝试时控件被预览标识遮挡，仍未排除输入触发问题，维持待核，未新增缺陷。
- 2026-10-29 B03 客户已停用状态：Demo 往来单位选客户标签，normal34 客户页签，均选择已停用并查询；两侧显示0条，配图 demo-customers-disabled-1029.png / normal34-customers-disabled-1029.png。Demo标签与QA分开页签是已批准差异；两边缺停用客户样例，不能由空结果证明有数据时的过滤正确，维护与真实业务未验。
- 2026-10-29 B03 客户搜索及重置：Demo 客户标签及 normal34 客户页签，正常状态输入零售并查询，分别48条、1条，均可见匹配名称；不同数据不比较数量。配图 demo-customers-retail-query-1029.png / normal34-customers-retail-query-1029.png。两侧重置清除搜索并恢复正常，Demo恢复全部标签、QA保留客户页签；客户供应商分开属已批准差异。仅验证本次路径，不代表维护或整页通过。
- 2026-10-29 B05 收款方式全部状态：两侧空搜索从正常选择全部并查询，Demo展示12条、normal34展示5条正常方式；数据不同不比较总数。两侧无停用样例，不能验证全部是否包含停用方式。配图 demo-payment-all-status-1029.png / normal34-payment-all-status-1029.png。维护不可用及真实业务未验仍保留。
- 2026-10-29 B06 资金账户全部状态：两侧空名称、全部收款方式下选择全部状态并查询，Demo 显示80条、QA显示5条正常账户；数据不同，不比较数量。两侧缺停用账户样例，不能确认全部包含停用结果；QA维护禁用及多营业厅规则仍待真实接入验证。配图 demo-funds-all-status-1029.png / normal34-funds-all-status-1029.png。
- 2026-10-29 B06 组合筛选：两侧均选微信方式、账户名称输入微信、全部状态并查询，Demo 4条、QA 1条均显示微信账户；样本不同不比较数量。由于这些结果均同时含相同关键词，不能据此证明两个条件独立相交，仍需反例样本；配图 demo-funds-wechat-combined-1029.png / normal34-funds-wechat-combined-1029.png。未修改资料，维护和真实业务未验。
- 2026-10-29 B06 组合筛选反例：两侧各有现金账户和微信账户，选微信方式、账户名称输入现金、状态全部并查询，均0条；与上一轮微信+微信非空结果一起支持该样例中两个条件相交，不外推所有规则及真实数据。配图 demo-funds-intersection-empty-1029.png / normal34-funds-intersection-empty-1029.png。
- 2026-10-29 B04 全部员工状态：两侧从默认在职选择全部并查询。Demo 102条，首屏可见在职与离职；QA 4条均在职，缺离职样例，不能确认全部包含离职的效果。样本数量不同不比较；截图 demo-staff-all-status-1029.png / normal34-staff-all-status-1029.png。员工维护及正式权限未验。
- 2026-10-29 B04 仓库角色筛选：两侧全部员工状态选择对应角色并查询，Demo 文案仓库人员、0条；QA文案仓库、1条测试仓库员。数据不同不比较数量，Demo无对应样本不能证明其非空筛选准确；文案差异已有记录，批准依据待核。配图 demo-staff-warehouse-role-1029.png / normal34-staff-warehouse-role-1029.png，维护和真实权限未验。
- 2026-10-29 B01 营业厅已停用筛选：Demo与normal34在营业厅页选择已停用并查询，均为空、共0条；截图 demo-hall-inactive-1029.png / normal34-hall-inactive-1029.png。两侧无停用样例，此项只证明空状态与选择路径，不能验证有数据过滤；维护及真实业务未验。
- 2026-10-29 B01 营业厅搜索重置：Demo 搜丁桥、QA搜网点，各查询得到对应1条正常营业厅；重置均清空搜索并恢复各自默认列表（41/1条），数据不同不比较数量。配图 demo-hall-name-search-1029.png / normal34-hall-name-search-1029.png；QA只有一个厅，此项不能证明排除其他厅或分页；维护与真实业务未验。
- 2026-10-29 B01 全部状态与重置：两侧空搜索选择全部并查询，Demo 41条、QA 1条，均为正常样例；重置均恢复正常。两侧无停用样例，不能验证全部包含停用项；数量不同不比较。配图 demo-hall-all-status-1029.png / normal34-hall-all-status-1029.png；维护与真实业务未验。
- 2026-10-29 B01/O-B01 营业厅编辑取消：各自打开正常营业厅编辑，将名称设为同一未保存测试值后点取消；Demo直接关闭并仍显示原名称，QA弹出继续填写/放弃提示，继续填写保留测试值，再取消并放弃后返回原名称。未点确定或保存，样例不同仅比较交互；并入 N34-B02-CANCEL-01 同类确认差异，批准依据待核。截图 demo-hall-edit-before-cancel-1029.png 为取消前，normal34-hall-edit-cancel-1029.png 为取消后确认，两图状态不同，不能当同状态视觉配对。
- 2026-10-29 B02 单项清除补配对：Demo选丁桥店查询1条后清除，条件显示全部但旧结果仍1条，再查询恢复51条；normal34选网点营业厅查询4条后清除显示全部，旧4条保留，再查询仍4条。QA仅一个厅且四仓均归该厅，无法验证排除和恢复其他厅数据。配图 demo-warehouse-hall-clear-pending-1029.png / normal34-warehouse-hall-clear-pending-1029.png；不据此判定整页通过。
- 2026-10-29 B02 仓库名称＋营业厅：Demo选丁桥厅搜丁桥、QA选网点厅搜网点，各显示对应1仓；重置均清空名称和厅并恢复各自默认列表（51/4），样例不同不比较数量。QA仅一个厅，且名称与厅相互匹配，无法证明跨厅排除或两个条件独立相交。配图 demo-warehouse-name-hall-1029.png / normal34-warehouse-name-hall-1029.png。
- 2026-10-29 O-S02 单独未审核筛选：Demo 与 normal34 均从全部状态取消已审核和已作废后查询；Demo 返回5张，QA返回10张，当前结果均显示未审核。数据不同不比较数量，仅覆盖此状态筛选及当前返回行；截图 demo-sales-unreviewed-filter-1029.png / normal34-sales-unreviewed-filter-1029.png。未保存或修改业务数据，整页与其余交互未通过。
- 2026-10-29 O-I12 库存打印预览 Esc：两侧库存全部条件查询完成后打开预览，按 Esc 均关闭并返回原查询结果；Demo 2,253 款，QA 6 款，数据与预览规模不同，仅比较此次关闭行为。截图 demo-inventory-print-before-esc-1029.png / normal34-inventory-print-before-esc-1029.png，关闭后分别为 demo-inventory-print-after-esc-1029.png / normal34-inventory-print-after-esc-1029.png。未执行打印；完整滚动、分页与真实输出未验证，既有差异保留。
- 2026-10-29 O-I03 仓库多选无匹配：两侧在全部仓库已查询状态，输入 ZZZ-NO-WAREHOUSE；Demo显示匹配0项及没有匹配的仓库，QA显示匹配0项和全部仓库但缺无匹配提示。输入焦点按Esc两侧下拉及搜索词均保留；数据不同不比较库存值。配图 demo-inventory-warehouse-nomatch-1029.png / normal34-inventory-warehouse-nomatch-1029.png，Esc后配图 demo-inventory-warehouse-esc-1029.png / normal34-inventory-warehouse-esc-1029.png。同类界面差异归入 N34-I01-SUPPLIER-EMPTY-01，代码根因是否相同待核。未查询或写入。
- 2026-10-29 O-S18 入口边界补证：冻结 Demo frontend/sales-current.js:179、205–207 的写入命令返回 REVISION 或 RECOVERED 时显示查看最新单据，:237 打开差异弹层并提供保留本次输入或打开已保存单据。当前无可安全配对的冲突状态，制造冲突需涉及写入，受 Demo 只读限制不执行；此为源码线索非页面通过，QA该状态仍未知。
- 2026-10-29 O-P10 条码入口源码与样本边界：冻结 Demo product-current.js:220、229、231 包含添加旧条码以及查看条码后的删除入口；固定 normal34 源码 editor-barcodes.tsx:13–15 对补充入口要求保存能力与真实 SKU，并仅对本次待保存记录显示移除。此前 QA 商品编辑读取失败且已重试，不能以源码证明运行态入口或删除合同；不重试同一失效样本。两侧添加、删除确认和正式业务均未验，保持 NOT_RUN。
- 2026-10-29 原问题清单映射同步：USER-ISSUE-COVERAGE-NORMAL34.json 各项 currentPageMatrix 按现行矩阵更新，保留旧 state/reason/evidence 并标明是历史快照；PAGE-MATRIX 顶层数量改为 NOT_RUN 15、PARTIAL 35、DIFFERENCE 55，原 normal32 标识保留并注明当前比较版本。映射同步不代表新增实操或整页通过，旧图不能自动归属 normal34。
- 2026-10-29 O-I08 库存流水日期：两侧默认开始 2026-09-29、结束 2026-10-29，打开开始日历、切到10月并鼠标选择10月1日，字段均显示 2026-10-01。Demo样品衬衫175/L原有9月30日一条，点击查询后显示0条；QA合成 M26001 170/M 流水读取失败，未重复请求，不可验证筛选准确性。截图 demo-inventory-ledger-date-1029.png / normal34-inventory-ledger-date-1029.png 为日期一致但结果状态与商品不同的证据，不代表完全同状态或正式业务。未写入。
- 2026-10-29 N34-LIST-SUMMARY-SEMANTICS-01 合成来源补证：固定 2357cf5 synthetic-preview-transport.ts:62、66–85 从明细 SKU 查商品身份、按商品去重并保留款号/名称快照，分别装入销货和调拨列表并经 normal-list-reader 校验；该代码在启用数据集时另加 qaHistorySummary，qa-reference-fixtures.ts:1837–1840 对历史样例同样生成商品快照。展示源码、Demo不同统计规则和正式摘要合同的既有证据继续有效；这是静态路径，不证明当前响应每行来源或正式接口运行，历史分类缺失不得由当前商品分类猜测。未重复浏览器操作。
- 2026-10-29 O-I08 开始日期清除：两侧流水日期同为开始2026-10-01、结束2026-10-29，点击开始日期清除叉后均为空、结束日期保持；Demo先前已查询为0条，QA处于读取失败，结果不构成配对。截图 demo-ledger-start-clear-1029.png / normal34-ledger-start-clear-1029.png。未再次查询、未写入。
- 2026-10-29 O-I08 业务类型：两侧下拉均可选择调拨入，选值均显示；Demo选项另有进货，QA另有换货、未知类型且未见进货，实际类型口径与批准依据待核，不根据标签推断业务遗漏。配图 demo-ledger-type-transfer-in-1029.png / normal34-ledger-type-transfer-in-1029.png；既有展开截图 demo34-ledger-type.png / candidate34-ledger-type.png。两侧商品不同且 QA 读取失败，未查询、不能验证过滤或真实业务。
- 2026-10-29 N34-I08-01 口径源码边界：固定 2357cf5 runtime/inventory/ledger.tsx:15,34 以七种枚举生成选项；packages/application/src/inventory-ledger-query-contracts.ts:8–15 筛选合同也无进货，有 EXCHANGE 和 UNKNOWN。已确认页面差异对应当前代码与合同，未找到本轮白名单内关于历史进货筛选的明确裁决，不能推断实际正式流水丢失或直接补/删标签；待核历史业务及用户裁决。未新做页面操作。
- 2026-10-29 P08 实际入口源码补证：固定 2357cf5 products/list.tsx:16,26 商品列表行只有编辑按钮，款号为普通文本；runtime/common/ready-pages.tsx:188 编辑保存成功后跳 products/view/ID，:192–195 接只读页。已有 QA 列表款号点击未导航与源码一致；商品编辑读取失败、保存未接通，保存后路径无法本轮实测。此前直接访问只读页仅证明页面可展示，不代表实际入口已通过；其他入口不能由此排除。
- 2026-10-29 N34-I08-01 历史合同补证：正式工程 references/planning-20261001/T05/历史缺口与待裁定.md H01 称真实采购流程为未授权候选，首发可保留历史进货读取及合法来源跳转，不开放新采购写API。这不能等同于要求或取消库存流水进货筛选；后续裁决和实际历史覆盖待核，保留口径待确认，不推断正式流水。
- 2026-10-29 O-S03 矩阵证据纠正：复用 S03 已有同版本退换货草稿找货配对（搜索衬衫、鼠标选首个候选、补齐规格），将 demo34-return-search/selected-product/filled.png 与 candidate34 同名截图补入 O-S03。此前该项称仅候选操作已过时；销售状态、键盘和图片预览仍未验，保持 PARTIAL。未重复操作或改变草稿。
- 2026-10-29 O-S10 账户 Esc：两侧现有本次未保存销售草稿均首笔现金、账户已选、金额10，打开第1笔资金账户候选，输入焦点按 Esc，候选均关闭，首笔账户和金额保留；Demo具体账户与QA合成账户不同，不比较数据；第三笔未选账户导致的提示差异仍按既有问题记录。截图 demo-sales-account-esc-before/after-1029.png 与 normal34 对应图；未修改、保存或审核。
- 2026-10-29 O-S10 已选账户无匹配搜索：两侧销售未保存草稿首笔现金和账户已选、金额10，搜索 ZZZ-NO-ACCOUNT，Demo提示暂无数据，QA仍显示现金测试账户；Esc两侧恢复原账户、金额10保留。配图 demo-sales-account-nomatch/nomatch-esc-1029.png 与 normal34 对应图。固定 proposal-picker.tsx:16–22 补入已选项并关闭本地过滤；未抓取实际响应，待核搜索是否执行，不将现象认作已确认业务缺陷。未保存。
- 2026-10-29 O-S10 键盘搜索复核：两侧现有销售未保存草稿首笔现金账户已选且金额10，打开账户后直接键入 Q；Demo显示暂无数据，QA仍显示已选现金测试账户；按Esc均恢复原账户。配图 demo-sales-account-key-q-1029.png / normal34-sales-account-key-q-1029.png。确认候选展示差异，服务响应及正式过滤仍未知；N34-S10-ACCOUNT-SEARCH-01 更新为界面差异，O-S10 转 DIFFERENCE，未保存。
- 2026-10-29 O-S03 销售无匹配及 Esc：同窗口两侧未保存销售草稿，收款首笔金额10，商品未选；均输入 ZZZ-NO-PRODUCT，均提示没有匹配。Demo 保持单一录入行和零汇总，Esc 关闭候选并保留词；normal34 增加空录入行且汇总显示横线，Esc 后候选仍在、词保留。配图 demo-sales-product-nomatch(-esc)-1029.png / normal34-sales-product-nomatch(-esc)-1029.png；清除本次输入后 QA 恢复零汇总。登记 N34-S03-SEARCH-ESC-01、N34-S03-SEARCH-DRAFT-01；未保存，原因及真实业务未验。O-S03 改 DIFFERENCE，整页未通过。
- 2026-10-29 O-S03 销售单候选键盘：同窗口既有未保存销售草稿，Demo 搜索唯一款号 000CS0000001，normal34 搜索唯一 M26001；搜索框焦点按一次 Enter，Demo 选中并焦点到尺码，normal34 未选且焦点仍在输入，随后方向下仍未进入候选。配图 demo-sales-single-before/enter-1030.png 与 normal34-sales-single-before/enter/down-1030.png。两侧商品及默认规格不同，不比较尺码焦点差异。纳入 N34-S03-SEARCH-ESC-01 的键盘操作范围；固定 proposal-picker.tsx:29–31 弹层处理 Esc/上下键，搜索输入与弹层事件接线及根因待核。未保存；Demo 草稿新增了本次选中行，normal34 保留搜索词。
- 2026-10-29 O-S11 普通零价：同窗口各自在未保存销售草稿选齐规格、数量1，成交单价输入0并Tab失焦。Demo 保留零价与数量、未出现确认入口；normal34 保留零价并显示确认零价，点击弹窗后取消，零价与入口仍在。配图 demo-sales-zero-blur-1029.png、normal34-sales-zero-blur/confirm/cancel-1029.png。商品与参考价格不同，仅比较操作；未确认、保存或审核。固定源码及限定范围裁决检索见 N34-S11-ZERO-CONFIRM-01，是否有新合同要求仍待确认，其他Demo状态未验；O-S11 转 PARTIAL。
- 2026-10-29 O-S13 销售整单优惠：两侧未保存销售草稿各一商品、规格齐全、数量1，成交单价设100、整单优惠设10并Tab失焦。两侧销售金额100、优惠10、应结90；Demo 输入显示 -10.00，normal34 显示10。配图 demo-sales-order-discount-1029.png / normal34-sales-order-discount-1029.png。记录 N34-S13-DISCOUNT-DISPLAY-01；正式金额符号合同和保存未验，不因UI差异修改内部规则。O-S13 转 DIFFERENCE。
- 2026-10-29 S02 销售折扣联动：两侧现有销售草稿各一件、成交单价先设100，再输入5折并失焦。Demo参考价999，成交单价与行金额均499.50；normal34参考价239，行金额119.50但成交单价仍显示先前100，失焦后仍如此。配图 demo-sales-discount-five-1029.png / normal34-sales-discount-five-focused/blur-1029.png。不同参考价只比较各自五折及显示一致性；合并到已有退货问题 N34-S03-DISCOUNT-01，不新增根因。未保存，真实交易未验。
- 2026-10-29 O-S14 销售切换确认 Esc：两侧销售未保存草稿各一件、五折、整单优惠10、首笔收款10；选择退货/换货后均出现切换业务类型确认，焦点在关闭按钮时按 Esc，均关闭并保留销售类型、数量1、折扣5及收款10。Demo 焦点落页面内容，normal34 返回业务类型控件；商品和参考价不同，不比较金额数值。配图 demo-sales-mode-dialog/after-esc-1029.png / normal34-sales-mode-dialog/after-esc-1029.png。未确认切换、未保存；焦点差异的影响及其他关闭路径未验，保持 PARTIAL。
- 2026-10-29 O-S04 销售尺码观察：两侧未保存销售草稿各一件160/XS。Demo 已填行点击尺码“改”后出现原规格及确认/取消；取消恢复原1件、5折。normal34 当前行直接以尺码下拉展示，打开后在尺码按钮焦点按 Esc 仍显示列表；Demo 改选行打开尺码列表、按钮焦点按 Esc 也仍显示，点击外部均可关闭。配图 demo-sales-size-reselect/reselect-cancel/open/esc-1029.png 与 normal34-sales-size-reselect/esc-1029.png。QA 当前仍为录入行，Demo 为已完成行改选，不能据此断言 QA 已完成行缺确认/取消；该状态及实际SKU、确认和保存仍未核，O-S04保持 PARTIAL。
- 2026-10-29 O-A02 销售未保存返回：同窗口两侧新销售草稿各一件、折扣5、首笔收款10，点击返回列表均弹“有未保存的修改”，说明离开放弃本次录入；点击继续录单均回到原页，数量1、折扣5及收款10保留。配图 demo-sales-unsaved-return/continue-1029.png / normal34-sales-unsaved-return/continue-1029.png。样例商品及价格不同，不比较数值；未点击放弃或保存，其他入口未验，保持 PARTIAL。
- 2026-10-29 O-I07 流水输入焦点 Esc：两侧既有库存流水抽屉，输入来源单号 TEST-123 并按 Esc，Demo 仍打开且词保留；normal34 关闭抽屉并返回库存数量按钮。配图 demo-ledger-esc-1029.png / normal34-ledger-esc-1029.png。QA 流水读取失败，实际查询和重新进入输入保留未验；登记 N34-I07-LEDGER-ESC-01，O-I07 转 DIFFERENCE。Demo 本次测试词清除操作未成功，仍保留于打开的抽屉。
- 2026-10-29 更正 O-I07：上条误以即时无障碍树判断 Demo Esc 后抽屉保留；稳定截图 demo-ledger-esc-1029.png 已显示抽屉关闭，当前重新打开同一数量流水确认来源单号为空。QA 当次同样关闭，重新打开的输入保留尚未验。撤销 N34-I07-LEDGER-ESC-01，不计缺陷；O-I07 回 PARTIAL。原测试词未留在当前抽屉；原误判留存以便追溯。
- 2026-10-29 O-I07 重新进入：QA 重新点击同库存数量并选 A版打开流水，来源单据为空、业务类型恢复全部，与Demo重开后的对应表现一致；QA仍提示读取失败，未据此判断流水查询通过。
- 2026-10-29 延迟误判定向复核：复看稳定截图 demo/normal34-sales-size-esc-1029.png，尺码下拉当时两侧均可见；normal34-sales-single-enter-1030.png 显示 Enter 后单候选仍可见、商品未选；normal34-sales-product-nomatch-esc-1029.png 显示无匹配候选仍可见。上述观察与记录一致，不能扩展到其他焦点或状态；未重跑草稿操作。未完成索引已按现行矩阵刷新。
- 2026-10-29 O-I01 库存商品单候选键盘：两侧库存筛选无已选商品，分别输入唯一款号 Demo 000CS0000001 和 normal34 M26001，待候选加载后按一次 Enter，均选中商品并提示条件已修改、点击查询更新。图 demo/normal34-inventory-single-search/enter-1029.png。样例不同，仅比较行为；未查询，产生各自最近搜索记录，未清理其他记录。多候选方向键及查询联动仍待核，保持 PARTIAL。
- 2026-10-29 O-I01 库存多候选键盘：两侧已有各自一款已选；Demo 搜 CS、normal34 搜 M2600，均有至少两个候选。按一次方向下再 Enter，Demo 追加第二项 CS0102181，normal34 追加第二项 M26004；已有第一项保留。图 demo/normal34-inventory-multi-down/enter-1029.png。商品与候选数量不同，仅比较选择顺序；未执行查询，新增最近搜索未清理。方向上、循环和查询联动仍待核，保持 PARTIAL。
- 2026-10-29 O-I01 两款查询：沿上次两侧各选两款的筛选分别点击查询。Demo 返回2款 000CS0000001、CS0102181；normal34 返回2款 M26001、M26004，均与各自选择对应。截图 demo-inventory-two-query-1029.png / normal34-inventory-two-query-1029.png。商品、仓库及库存样例不同，不比较库存数值；仅验证此多选查询路径，其他组合未验，保持 PARTIAL。

### 2026-10-29：查询范围配对

两侧各查询两款后移除第二款且不再查询，查看范围均保留上次两款；配对截图 `demo-inventory-executed-scope-edited-1029.png`、`normal34-inventory-executed-scope-edited-1029.png`。视觉按用户截图例外，N32-I06-01 未关闭。

### 2026-10-29 查询范围 Esc 配对

同一库存查询条件已编辑未查询状态，范围打开后关闭按钮焦点按 Esc，Demo 与 normal34 均关闭并将焦点返回“查看范围”。配图 `demo-scope-escape-1029.png` / `normal34-scope-escape-1029.png`。仅验证该焦点和当前实现，用户批准弹窗外观问题 N32-I06-01 仍开放。

### 2026-10-29 商品只读抽屉遮罩关闭

两侧库存页分别打开首行商品只读抽屉，在基础资料页签点击左侧遮罩，稳定画面均关闭并返回库存结果。配图 `demo-product-drawer-background-1029.png` / `normal34-product-drawer-background-1029.png`。商品资料不同，只比较关闭行为；有图放大和其他入口仍未验，O-P01 保持 PARTIAL。即时无障碍树有延迟，以截图和稳定树确认。

### 2026-10-29 销售颜色操作补充（O-S04）

销售未保存草稿两侧各有一款一件并有下一空行。Demo 点击已填行颜色进入改选行，显示原规格及确认/取消；候选行直接为颜色、版型、尺码下拉。打开颜色候选后触发按钮焦点按 Esc，两侧稳定截图仍显示候选，点击外部均关闭；Demo 随后点取消保留原行。配图 `demo-sales-color-open-1029.png`、`demo-sales-color-options-1029.png`、`demo-sales-color-escape-1029.png`、`demo-sales-color-cancel-1029.png` 和 `normal34-sales-color-open-1029.png`、`normal34-sales-color-escape-1029.png`、`normal34-sales-color-dismiss-1029.png`。数据和候选项数量不同；候选该行虽显示一款一件及下一空行，尚不能仅据此证明它等同 Demo 的已确认明细，真实 SKU、选择另一颜色与取消语义仍未验证。保留 PARTIAL，不新增未经验证的业务缺陷；已观察形态差异关联 N34-S03-DRAFT-ENTRY-01，适用范围待核。

### 2026-10-29 原问题映射更新

将原问题覆盖映射中的 7 个页面引用同步至现行矩阵，涉及 USER-UI-HOVER/O-A02、USER-UI-DOC-TOOLBAR/S02、USER-UI-DATES/S02、USER-PAYMENT-SOURCE-REUSE/S02、USER-PAYMENT-SOURCE-REUSE/O-S10、USER-DIRTY-LEFT-NAV/O-A02、USER-DIRTY-LEFT-NAV/S02。历史字段保留，不把页面级结果作为原问题完整通过。矩阵截图路径缺失 0 项；仅检查文件存在，不证明截图内容。

### 2026-10-29 商品信息摘要接线约束补证

固定 2357cf5 `apps/web/demo-replica/frontend/runtime/documents/normal-list-reader.ts:22,33` 精确检查对象键数和字段集合，现有 `productSummary` 仅接受 productCount/items/hasMore，item 仅接受 productId/productCodeSnapshot/productNameSnapshot。因而向这些对象直接加分类字段会被该读取器拒绝；后续方案须同时处理合同、读取校验和两个列表的兼容或版本路径。此为代码约束，不代表已观察到线上响应故障，也不允许以当前商品分类补造历史。归并 N34-LIST-SUMMARY-SEMANTICS-01。

### 2026-10-29 差异归并工作稿

按影响和复验范围整理 58 条未撤销问题记录（包括样例差异与待核风险），覆盖检查未漏编号或重复归组。归类不声称同组已有共同代码根因；撤销记录单列。建议顺序及最小复验仅供用户决策，不派修、不改源码。见 `问题归并工作稿-20261029.md`。

### 2026-10-29 问题证据字段和分级纠正

复核发现 N33-FIXTURE-SEASON-01 与 N34-I01-SUPPLIER-EMPTY-01 原以 severity 而非 priority 表示 P1/P2，阶段汇总误写为未分级；已保留原字段并统一补 priority，正确 58 条未撤销记录为 P1 18、P2 40，包含样例与待核风险，不等于 58 项已确认缺陷。另把三条原记录中嵌套的截图和步骤补到统一字段，均引用已有证据，未新增实测。

### 2026-10-29 销售尺码选择及取消（O-S04）

两侧新增销售未保存草稿各一款一件和下一空行：Demo 已填行从 160/XS 选 165/S，仍显示原 160/XS 与确认/取消；取消后恢复 160/XS，数量1与金额输入保留。normal34 当前行直接选 165/S 后行内立即显示新尺码，无本行确认/取消；另选回 160/XS 恢复显示。截图 `demo-sales-size-changed-pending-1029.png` / `normal34-sales-size-changed-1029.png`，以及 `demo-sales-size-changed-cancel-1029.png` / `normal34-sales-size-restored-1029.png`。不同商品仅比较界面行为，QA 当前行是否业务上已确认及 SKU 绑定未核；保留 PARTIAL，沿 N34-S03-DRAFT-ENTRY-01 登记，不保存。

### 2026-10-29 员工登录账号精确查询（B04）

在 Demo 8877 与 normal34 57923 的员工与账号列表，重置到默认在职及全部角色后，分别输入当前列表可见的各自员工登录账号并查询；两侧均显示对应单条在职员工。配图 `demo-staff-account-search-1029.png` / `normal34-staff-account-search-1029.png`。两侧样本不同，未比较员工身份或总量；账号模糊搜索、更多组合、维护与真实权限未验。B04 保持 DIFFERENCE，不表示页面通过。

### 2026-10-29 员工账号与角色组合（B04）

两侧各用列表中可见的营业员账号，在默认在职状态选择营业员并查询，均返回对应1条；保持账号不变改选管理员并查询，均显示无符合条件数据。配图 `demo-staff-account-role-1029.png` / `normal34-staff-account-role-1029.png` 及 `demo-staff-account-role-exclude-1029.png` / `normal34-staff-account-role-exclude-1029.png`。样本及登录权限不同，未比较身份与权限正确性；其他组合、维护和真实数据未验，B04 不通过。

### 2026-10-29 颜色列表越界跳转补证（P15）

两侧空搜索、20条/页、182条且从第一页输入99：Demo 点击跳转后末页10、181–182条；normal34 实际键入99、Tab聚焦跳转按钮并回车后仍第一页且输入99。候选同一键盘路径输入有效3能显示41–60条，说明该次输入和按钮触发有效；原鼠标路径仍受合成标识遮挡。配图 `demo-color-99-confirmed-1029.png` / `normal34-color-99-keyboard-1029.png`。登记 N34-P15-JUMP-BOUNDARY-01，越界处理的批准依据及源码路径待核，不外推正式环境。

### 2026-10-29 颜色分页代码与共用范围

固定 2357cf5 `runtime/catalogue/source-controls.tsx:10,63–67` 的 Pager 导入并渲染 `runtime/inventory/pagination.tsx`；后者第22行跳转只对范围内整数调用 change，对99等越界值无跳转或该事件内提示，与本轮观察一致。固定源码 `catalogue/dictionary-page.tsx:76`、`scheme-page.tsx:16` 及 `inventory/page.tsx:49` 使用该 Pager 或 Pagination；这些其他页面未在相同可跳转状态操作，列为受影响范围待核，不自动认定缺陷。越界是否按 Demo 截到末页仍须核批准依据。问题 N34-P15-JUMP-BOUNDARY-01。

### 2026-10-29 图片样例缺口溯源

固定 2357cf5 `runtime-preview-transport.ts:3,7,23–28` 将 `/products/images/query` 回落到基础合成 transport；`unified-browser-harness/synthetic-transport.ts:43` 在 dataset 读取时调用 qaReferenceRead；`qa-reference-fixtures.ts:1781` 对图片查询返回空数组。已实操库存商品图片页为空，与该源码路径一致；未抓取每个运行请求或证明正式接口无图。O-I10/O-P02 保持 NOT_RUN：有图放大、关闭及其操作需具备两侧有图隔离样例后补验，不反复尝试同一空样本。

### 2026-10-29 销货原因确认入口源码边界（O-S15）

冻结 Demo `frontend/index.html:17` 设置 REAL_DATA_MODE；`sales-current.js:200,234` 的 reasonModal 唯一直接调用是 void 分支，而该分支在 REAL_DATA_MODE 下先返回提示；实际已保存未审核单据工具栏 `:165` 使用 delete-doc，`:232` 为普通作废确认。既有 O-S17 已观察普通确认并取消，未执行作废。此补证只限定当前文件直接调用路径，不排除其他脚本动态入口，也不凭源码将原因层判为通过或删除清单，O-S15 仍 NOT_RUN。

### 2026-10-29 旧收退款账户弹窗调用路径（O-S09）

冻结 `sales-current.js:165–176` 的新建/编辑/查看单据共用 `SALES_FUNDS_UI.field(d,editable)`；`real-data-bridge.mjs:219–223` 将其替换为按 editable 生成收款行的 fundsField 并替换 syncField。原 `sales-funds-ui.js:14,19` 中的账户按钮与弹窗仍保留源码，但统一字段被替换的路径与已实际观察的销售新建行内收款一致。不能据此排除其他动态入口，退换及编辑状态的入口未充分核实，O-S09 仍 NOT_RUN；未执行保存。

### 2026-10-29 分类有下级时删除前检查（O-P11）

两侧选 T恤一级分类，均显示下级2个；Demo 显示商品0款，点击删除提示仍有2个下级无法删除，没有进入确认也未删除。QA 商品数量未知，删除按钮禁用并说明维护未接通，无法配对该校验。截图 `demo-category-child-block-1029.png` / `normal34-category-child-block-1029.png`。零商品且零下级的可删除样例确认、取消仍未验证，不能以此推断 QA 正式行为。

### 2026-10-29 分类树无匹配及清除（P14）

同选 T恤一级分类，分别输入 ZZZ987，两侧树无匹配行且右侧资料仍保留 T恤；清空输入后树恢复、右侧仍为 T恤。配图 `demo-category-search-none-1029.png` / `normal34-category-search-none-1029.png` 和 `demo-category-search-none-clear-1029.png` / `normal34-category-search-none-clear-1029.png`。两侧原展开状态不同，不比较树的展开状态；QA维护禁用，P14保持未通过。

### 2026-10-29 分类树展开状态补配对（P14）

两侧 T恤均先展开并显示短袖和长袖，再输入 ZZZ987 并清空。稳定截图均保留 T恤展开、显示两个子项，右侧仍选 T恤。`demo-category-expanded-search-clear-1029.png` / `normal34-category-expanded-search-clear-1029.png`。即时无障碍树在动画期间未显示子项，按稳定截图核实；其他展开组合及维护仍未验，P14保持未通过。


### 2026-10-29 销货扫码与批量入口源码线索（O-S05/06/07）

冻结 `sales-current.js:121–125,163–180` 的当前单据结构输出明细区及状态切换入口，未生成扫码或批量选货按钮；`verification/sales-redesign.cjs:50` 历史测试断言两按钮缺席。此前运行新建首屏也未观察到按钮，旧事件分支仍存在。此证据不能证明其他脚本或所有状态均不可达，旧测试未在本轮运行也不是页面通过；同时扫码成功可能写工作记录，禁止实际提交。三项保留 NOT_RUN，不能据此删功能。

2026-10-29 O-S01 销售草稿营业厅候选配对：Demo 和 normal34 各自在已有未保存销售草稿打开营业厅候选，再按 Esc；两侧候选均关闭、各自原营业厅保留，未选择或保存。营业厅及商品样例不同，仅比较打开、关闭和保留行为；其余候选、切换关联字段和完整业务未完成。证据：demo-sales-hall-open-1029.png、normal34-sales-hall-open-1029.png、demo-sales-hall-escape-1029.png、normal34-sales-hall-escape-1029.png。

2026-10-29 O-S01 销售草稿营业员候选配对：两侧已选营业员状态打开候选，均有当前用户（推荐）及全部人员分组；按 Esc 列表关闭并保留各自营业员。Demo 焦点返回营业员按钮，QA 无障碍树显示焦点在页面内容；该焦点表现需进一步键盘路径复验，不单凭此判定缺陷。两侧人员数据不同，不比较候选数量。证据：demo-sales-staff-open-1029.png、normal34-sales-staff-open-1029.png、demo-sales-staff-escape-1029.png、normal34-sales-staff-escape-1029.png。未保存。

2026-10-29 O-S01 客户及出库仓：销售草稿客户均未选时打开候选并按 Esc，均关闭且保持未选；Demo 存在推荐客户及选用，normal34 当前样例未显示推荐，是否存在有效推荐关系尚未知，先列待验证风险，不直接判缺陷。Esc 后 Demo 焦点返回客户按钮，QA 无障碍树显示页面内容，键盘路径待复验。出库仓两侧均打开并 Esc，Demo 原选仓保留、QA 维持未选；因状态不同仅记录观察，不记同状态通过。截图 demo-sales-customer-open-1029.png / normal34-sales-customer-open-1029.png、demo-sales-customer-escape-1029.png / normal34-sales-customer-escape-1029.png、demo-sales-warehouse-open-1029.png / normal34-sales-warehouse-open-1029.png、demo-sales-warehouse-escape-1029.png / normal34-sales-warehouse-escape-1029.png。没有修改字段或保存。

2026-10-29 O-S01 推荐客户源码追踪（QA commit 2357cf508ee6e8188bcc1dddfa4735f735d70d36）：Demo unified-single-select.jsx:70、153–155 推荐对象匹配候选时显示推荐客户及选用；sales-current.js:231 从厅 defaultCustomerId 取值。QA 同 commit 的 runtime/documents/proposal-form.tsx:37 仅向营业员传 recommendedId；proposal-picker.tsx:19–22 按 recommendedId 分组，没有 Demo 推荐客户及选用区域。qa-reference-fixtures.mts:1702、1704 定义网点营业厅的默认客户为零售客户；:1716 构造销售厅候选仅映射厅身份及名称，:1774–1776 返回该参考列表。设置样例包含默认客户不证明销售接口返回了该关系。两侧截图证实当前显示差异，仍须确认构建闭包、正式接口合同及有推荐关系的运行状态，不将其称为正式接口缺陷或真实业务通过。建议最小范围核对厅默认客户读取和推荐展示接线。

2026-10-29 O-S01 推荐客户版本与合同补证：当前 57923 监听 PID 10937，进程实际运行 ui-preview-2357cf5-phase2-34/serve-fixed.mjs；该服务仅从该目录 build 提供 GET/HEAD，标记 synthetic。BUILD-RESULT.json 和恢复回执均绑定 2357cf508ee6e8188bcc1dddfa4735f735d70d36 / phase2-normal-2357cf5-34；此为版本与运行目录证据，不是逐资源或实际请求逐项证明。固定 commit packages/application/src/current-form-ports.ts:23–32 的销售候选项没有默认客户字段，isRecommended 仅限资金账户；apps/web/src/current-form/http-reader.ts:43–54 的严格解析不允许对客户使用 isRecommended。故仅在 UI 加推荐字段不足，需要协调现有合同和可靠数据来源；不能从候选唯一性推断默认客户。尚未证明正式服务实现或运行请求是否提供另一可用路径，保留待核。

2026-10-29 O-S01 客户焦点复验：两侧未选客户、已选营业厅的未保存销售草稿，打开客户候选后 Esc 再按一次 Tab；Demo 关闭时焦点在客户按钮，QA 无障碍树显示页面内容，但 Tab 后两侧均到出库仓控件，客户仍未选择。图 demo-sales-customer-escape-tab-1029.png / normal34-sales-customer-escape-tab-1029.png。此路径未观察到 Tab 跳错；不代表其他键盘路径通过。

2026-10-29 O-S01 客户搜索无匹配：两侧未选择客户的销售草稿打开客户候选，输入 ZZZ987，均显示暂无数据；Demo 仍显示其推荐客户区，QA 当前样例无该区。Esc 后均关闭候选，客户保持未选，既有商品、数量、折扣与收款输入保留。截图 demo-sales-customer-no-match-1029.png / normal34-sales-customer-no-match-1029.png、demo-sales-customer-no-match-escape-1029.png / normal34-sales-customer-no-match-escape-1029.png。搜索命中、键盘选择、推荐选用和更多状态仍未验证；未保存。

2026-10-29 O-S01 客户搜索命中和键盘选择：两侧未选客户的销售草稿分别搜索可见编码，Demo 实际输入 000 命中多项，按下方向键和 Enter 后选中第二个候选（显示以 725 开头）；尝试改成完整名称的输入未生效，以截图中实际 000 为准。normal34 输入 DEMO-C01 命中零售客户，同样按下方向键和 Enter 后选中。商品、数量、折扣和收款保留；候选数和数据不同，只能证明各自该键盘路径可选择，不比较排序。截图 demo-sales-customer-code-search-1029.png / normal34-sales-customer-code-search-1029.png、demo-sales-customer-code-selected-1029.png / normal34-sales-customer-code-selected-1029.png。两侧草稿现在各已选客户，未保存，后续操作需以此状态为准。

2026-10-29 O-S01 已选客户搜索：两侧各有已选客户，输入 ZZZ987，Demo 显示暂无数据，normal34 仍显示已选零售客户；Esc 后原客户及已有商品、数量、折扣和收款保留。图 demo-sales-selected-customer-no-match-1029.png / normal34-sales-selected-customer-no-match-1029.png、demo-sales-selected-customer-cancel-1029.png / normal34-sales-selected-customer-cancel-1029.png。客户与已报资金账户使用同一 ProposalReference，归并 N34-S10-ACCOUNT-SEARCH-01，不将未抓取的接口响应或正式业务推断为缺陷。

2026-10-29 覆盖矩阵纠正：O-S01 已有双侧确认的已选客户搜索差异，状态由 PARTIAL 改为 DIFFERENCE，并关联既有 N34-S10-ACCOUNT-SEARCH-01，未新增重复问题。当前 105 项：14 未检查、32 局部检查、59 存在差异；均非整页通过数。旧阶段汇总为历史快照。

2026-10-29 O-S01 已选客户搜索另一有效客户：Demo 搜 001 显示匹配客户且不显示原选 725；QA 搜 DEMO-C02 显示匹配具名客户，同时额外显示不匹配的原选零售客户。各侧搜索词和客户样例不同，仅对比匹配和保留策略；Esc 保留原客户，未保存。截图 demo-sales-selected-customer-other-1029.png / normal34-sales-selected-customer-other-1029.png，归并 N34-S10-ACCOUNT-SEARCH-01。

2026-10-29 公共导航补查准备：现有 Chrome 标签中 Demo 商品新增页未呈现可读取页面内容，QA 商品新增页为有未保存输入的价格页（零售价125.50）；两者不是商品只读同状态。未刷新、离开、取消或覆盖这些页面，故本次未形成新的双侧导航对照，不改变 A02 状态；已存在的调拨查看页导航证据继续复用。后续用已有可安全复用的只读对照页补键盘状态。

2026-10-29 P14 分类树键盘：两侧现有 T恤选中、搜索为空时，点击搜索框后按 Tab，焦点均显示为树外框；再按方向右和方向下，无障碍树均未显示焦点、选择或展开变化。图 demo-category-tree-keyboard-1029.png / normal34-category-tree-keyboard-1029.png。仅记录外框焦点下这两个键的观察，不能断定树节点不可键盘操作；节点聚焦、Enter、空格及选中移动仍待核。没有保存分类资料。

2026-10-29 P14 分类树进一步键盘观察：两侧从树外框按 Tab，无障碍焦点均显示第一个 fold button；依次按 Enter、空格后，无障碍树均未报告变化。QA 截图显示视口已滚动，无法单凭两键后截图区分每个按键是否触发展开；Demo 两子项在截图中可见。此轮不判通过或缺陷，后续应逐键捕捉前后稳定画面并对齐滚动位置。图 demo-category-fold-key-1029.png / normal34-category-fold-key-1029.png。

2026-10-29 P14 分类树 Enter 单键复核：两侧 T恤展开、折叠按钮焦点时分别按 Enter，前后稳定截图均保留短袖 T恤、长袖 T恤，未见收起；Demo 和 QA 该路径一致。各自树其他展开状态不同，只比较 T恤节点。图 demo-category-before-enter-1029.png / normal34-category-before-enter-1029.png 与 demo-category-after-enter-1029.png / normal34-category-after-enter-1029.png。此结果不证明键盘可完成收起，空格和其他节点待单键复验，分类维护及整页仍未通过。

2026-10-29 P14 分类树空格单键复核：两侧 T恤展开、折叠按钮焦点时单独按空格，随后滚回树顶部，两侧仍显示短袖和长袖子项；按键后截图及滚回截图分别为 demo/normal34-category-after-space-1029.png、demo/normal34-category-space-scrollback-1029.png。此为两侧一致的单一焦点路径，不表示空格完成收起，也不覆盖其他节点。

2026-10-29 证据路径检查：按当前 PAGE-MATRIX.json 的 evidence 及 FINDINGS.json 的 screenshots、pairedEvidence 中以 png/jpg/jpeg/webp 结尾的相对文件名检查本报告目录，缺失 0；此检查仅确认文件存在，不证明截图内容、双侧状态、版本绑定或适用范围正确，也不改变未完成状态。其他非图片引用、外部路径和历史报告未纳入本次检查。

2026-10-29 P14 搜索命中后选择：两侧搜索短袖，点击短袖T恤；Demo 清空搜索词恢复完整树，QA 保留短袖及筛选树，右侧均切换到该子分类。图 demo-category-search-child-1029.png / normal34-category-search-child-1029.png 和 demo-category-search-child-selected-1029.png / normal34-category-search-child-selected-1029.png；候选数据量及商品数不同，仅比较选中后操作。登记 N34-P14-CATEGORY-SEARCH-SELECT-01，未保存。

2026-10-29 P14 搜索选中差异源码定位：冻结 Demo product-arco.jsx:210–224 的搜索词为 CategoryTree 局部状态；product-current.js:182 选择后调用 window.render，:256 重新生成页面并挂载分类树。固定 QA 2357cf5 category-page.tsx:32–44、119–139 则把 search 保存在页面组件，选择仅设置 selected/draft，未重置搜索。与两侧页面观察一致。entry.tsx:48 将该页面用于 product-categories，尚无证据外推其他页面；归属 N34-P14-CATEGORY-SEARCH-SELECT-01。

2026-10-29 P14 已选子分类未编辑取消：两侧短袖T恤选中后，将 QA 残留搜索清空以对齐 Demo，然后各点取消，右侧均保留 T恤 / 短袖T恤及分类名称；QA只读且数量未知，Demo 显示371款，数据与权限状态不同，不比较数量和编辑功能。图 demo-category-child-cancel-1029.png / normal34-category-child-cancel-1029.png。未修改或保存分类；编辑后取消仍未配对。

2026-10-29 I01 库存全页折叠/展开：两侧已加载结果后，分别点折叠再展开，均从明细切至所有颜色/所有库存，按钮变展开，再恢复明细和折叠按钮。Demo 沿用此前2款已执行结果及已修改未查询条件，QA 新查询6款；查询条件、样例和数量不同，只核折叠交互，不比较库存值或同筛选结果。截图 demo-inventory-collapse-all-1029.png / normal34-inventory-collapse-all-1029.png、demo-inventory-expand-all-1029.png / normal34-inventory-expand-all-1029.png。固定列遮挡和其他缺陷仍开放，不代表整页通过。

2026-10-29 I01 单款折叠：两侧已加载并展开至少两款，分别折叠第一款，显示所有颜色/所有库存，第二款仍有明细；再次点击第一款展开，原明细恢复。Demo 2款与 QA 6款样例、筛选和仓库数据不同，只比较行折叠行为，不比较数量。截图 demo-inventory-one-collapse-1029.png / normal34-inventory-one-collapse-1029.png。其他折叠组合、固定列及真实数据仍未完成。

2026-10-29 商品信息语义核对补充：冻结 Demo transfer-golden.js:11–12 对正数量商品 ID 全单去重后按分类计款，最多3类及更多；sales-summary.js:6–23 对非赠品按行单位累加带符号数量，零值分类不展示，已保存单据缺分类快照显示历史未记录，不用当前商品补造。差异已补入 N34-LIST-SUMMARY-SEMANTICS-01；此为源码口径，不等于取得对应同一单据的运行接口响应或证明历史数据齐备。

2026-10-29 I01 单颜色仓库折叠：两侧各折叠第一款一个颜色的仓库明细，显示所有库存，再展开恢复仓库行。Demo 样品衬衫不分色仅一个可见仓库，QA M26001 白色有四仓；因此只观察开关及恢复，不证明 Demo 多仓聚合或数量相等。图 demo-inventory-color-fold-1029.png / normal34-inventory-color-fold-1029.png。查询样例不同，固定列等差异仍开放。

2026-10-29 B01 营业厅无匹配名称：两侧正常状态输入 ZZZ987 并查询，均显示暂无符合条件的数据、共0条；重置后输入清空并恢复各自正常列表。图 demo-hall-no-match-1029.png / normal34-hall-no-match-1029.png。两侧厅样例数量不同，仅核此无匹配路径；已停用数据、维护和真实保存仍未验。

2026-10-29 B02 仓库无匹配名称：Demo 与 normal34 仓库页均为正常状态、全部营业厅，输入 ZZZ987 并查询，均显示暂无符合条件的数据、共 0 条；各自点击重置后清空输入并恢复正常列表。截图 demo-warehouse-no-match-1029.png / normal34-warehouse-no-match-1029.png。Demo 51 条、QA 合成样例 4 条；仅核此搜索及重置路径，未验证停用仓、保存或真实接口，不改变整页未通过状态。

2026-10-29 B02 营业厅候选无匹配：两侧正常仓库列表、全部营业厅，打开筛选输入 ZZZ987；Demo 显示暂无数据，normal34 保留全部营业厅选项。Esc 两侧关闭并恢复全部营业厅。配图 demo-warehouse-hall-search-none-1029.png / normal34-warehouse-hall-search-none-1029.png；登记 N34-B02-HALL-SEARCH-ALL-01。固定源码 settings/controls.tsx:68–71 无条件插入全部选项，尚未抓取运行响应；不外推其他入口已实测。未查询或写入。矩阵 counts 按当前行状态重算，状态不因单项而通过。

2026-10-29 B04 员工列表营业厅候选无匹配：两侧重置至在职、全部角色、全部营业厅，打开营业厅筛选并输入 ZZZ987；Demo 显示暂无数据，normal34 保留全部营业厅，Esc 均恢复全部营业厅。两侧员工样本不同，未查询或修改员工。配图 demo-staff-hall-search-none-1029.png / normal34-staff-hall-search-none-1029.png。固定源码 staff-page.tsx:50 与仓库页共用 ReferenceSelect，归并 N34-B02-HALL-SEARCH-ALL-01；其他入口尚未实测，员工页仍未通过。

2026-10-29 B06 资金账户收款方式候选无匹配：两侧重置至正常、全部收款方式，打开筛选输入 ZZZ987；Demo 显示暂无数据，normal34 保留全部收款方式，Esc 均恢复原筛选。配图 demo-payment-method-search-none-1029.png / normal34-payment-method-search-none-1029.png；两侧样例不同，未查询或修改资料。固定源码 payments-page.tsx:55 与仓库、员工筛选共用 ReferenceSelect，归并 N34-B02-HALL-SEARCH-ALL-01；未实测的其他入口不外推，资金账户页仍未通过。

2026-10-29 O-B08 操作记录起始日期：两侧收款配置资金账户页打开操作记录，选择日历的 2026-10-29 并查询，均保留日期且显示0条；QA 原有8条合成记录时间为2000年，Demo 原本0条，不能据此证明 Demo 日期过滤或真实审计。配图 demo-audit-start-date-1029.png / normal34-audit-start-date-1029.png。QA 尝试直接设置文本后失焦被清空，最终有效操作为日历选择；不将未验证输入方式判为缺陷。未写入业务。

2026-10-29 O-B08 日期倒序：两侧开始 2026-10-29、结束 2026-10-28，日历选择后点查询；Demo 保留两值并显示0条，未观察到提示；QA 保留两值并显示结束日期不能早于开始日期。配图 demo-audit-inverted-date-1029.png / normal34-audit-inverted-date-1029.png。登记 N34-B-AUDIT-DATE-ORDER-01 为差异且批准依据待核；固定源码 controller.ts:77 存在校验，Demo 是否发出请求未抓取。此项由 PARTIAL 改 DIFFERENCE，不代表真实业务或整页通过。

2026-10-29 N34-S03-HIDDEN-01 源码链补证：固定版本 sales-proposal.ts:258–275 保存两个方向的 entries，proposal-form.tsx:64 切换 active 后只渲染当前方向 entries；pricingLines :552–560 同时汇集两方向用于汇总，与已配对发现的隐藏明细、金额仍计入一致。append/flush 位于 :330–347，旧 validate :602 调用 flush；native 保存构造 :563、587–589 直接收集 entries。未采集运行对象和保存请求，不代表真实保存通过，也不外推全部已保存明细。未修改代码或派修。  
2026-10-29 按现行 PAGE-MATRIX 重新生成 UNFINISHED-INDEX，修正旧快照数量（14 未检查、31 局部、60 差异）；该索引仅同步状态和未测原因，不将历史截图升级为当前版本证据。

2026-10-29 N34-S03-DISCOUNT-01 数据流补证：固定版本 proposal-form.tsx:46、51–52 分别保留折扣和单价文本，仅切换计价规则；行金额经 :41、sales-proposal.ts:68–82 按当前规则计算，解释已配对的5折后单价框旧值、金额变化。sales-proposal.ts:575–580 的 native 保存构造会按折扣重新计算单价及折扣值；只说明源码生成逻辑，未抓取保存请求，不证明后端或实际结算。复用已有销售/退货/赠品截图，未重复操作、改代码或派修。

2026-10-29 销货退换结构证据纠偏：冻结 b8bcfe3 sales-current.js:121–124 在 A.type 为换货时生成退回、换出双区，其他类型为单区；此前已拍到的单表只代表当次草稿状态，N34-S03-HIDDEN-01 已限定观察范围，不得概括为 Demo 所有退换货都单表。Demo :126–131 的非销售底部为退回/换出/应收应退或差额；固定 QA proposal-form.tsx:64–65 使用双区及销售金额/优惠/应结。内部模式与业务合同仍待核，未修改代码。

2026-10-29 销货退换模式映射补证：冻结 Demo sales-audit-core.js:5–7 直接使用 businessType，类型“退货/换货”按数量符号分入出，sales-current.js:121–124 此类型走单区，旧独立“换货”走双区。固定 QA sales-business-mode.ts:1–6 将 RETURN/EXCHANGE 归为可见退货/换货模式，有正数量映射 EXCHANGE、否则 RETURN；proposal-form.tsx:32、64 对此可见模式均渲染双区。仅证明对应源码路径和解释已观察结构，不代表正式后端通过；保留内部三类型及数量金额合同，不复制旧存储逻辑。原裁决 v067 指出自动反号/清资金可见行为并无具体批准例外，不将内部合同自动等同视觉差异获准。

2026-10-29 N34-LIST-SUMMARY-SEMANTICS-01 共用查询口径补证：固定 sales-query-reader.ts:391–395、414–420 的共享分页明细在销货与调拨均按商品身份去重取最多3项商品快照，预览未按分类分组，也未按 Demo 相应口径排除赠品或只取正数；product ID 缺失时 product_count 为 null。此字段不能重命名为分类统计或用当前商品分类补造历史；这是源码证据，未取得同单据运行响应或正式部署证据。

2026-10-29 O-B08 日期倒序后更正：两侧将结束日期改为 2026-10-29，与开始日期相同后查询；QA 提示在选择时消失，两侧保留同日区间并显示0条。Demo 本无记录、QA 样例日期不在该日，不能证明有记录的同日边界。配图 demo-audit-same-date-1029.png / normal34-audit-same-date-1029.png；倒序校验是否批准仍待核，未实测此次重置。

2026-10-29 O-B08 同日查询后重置：两侧点击操作记录抽屉的重置，起止日期均清空；QA 恢复8条合成记录，Demo 原本无记录仍0条。配图 demo-audit-date-reset-1029.png / normal34-audit-date-reset-1029.png；仅核此次重置，不代表真实历史或整页通过。

2026-10-29 用户批准参考核实：库存查询范围以本会话用户提供的 codex-clipboard-60b9e917-2293-4b85-b384-e5bd12587960.png 及文字为准。原临时附件路径本次不可见，报告目录未确认原图副本；已在 N32-I06-01 标记来源与缺口，不把 Demo 或 QA 截图冒充批准原图，也不推翻会话明确裁决。

2026-10-29 N34-T06-SCAN-DEFAULT-01 原因边界：固定源码 transfer-scanner.tsx:31 输入禁用依赖 canScan，transfer-proposal.ts:339–346 中 canScan 同时要求条码读取能力和两仓，扫码目标也携带两仓上下文；文案只解释选仓，不区分读取能力缺失。既有配对证据仅证明默认不可输入、两仓后可输入，未验证实物扫码或正式事务；修复建议应区分接收输入与解析提交，保留真实 SKU 和权限。

2026-10-29 O-A01 菜单外点击关闭：收款配置页两侧分别打开账号菜单，再点击页面标题，菜单均关闭且页面维持已登录状态；截图 demo-account-outside-close-1029.png / normal34-account-outside-close-1029.png。QA 额外修改密码为已批准功能，本次未点击更改密码或退出。仅覆盖标题点击，其他键盘与角色未验。

2026-10-29 O-A01 账号菜单 Tab：两侧收款配置页点击账号按钮打开菜单，按钮焦点下按一次 Tab，焦点均到操作记录且菜单仍在；截图 demo-account-tab-1029.png / normal34-account-tab-1029.png。QA 多本人改密为已批准功能，未触发改密或退出。仅限该焦点与一次按键，不能据此判断完整键盘可访问性。

2026-10-29 O-S02 销货列表客户多选无匹配：两侧列表重置并展开高级筛选，客户为全部，输入 ZZZ987；Demo 显示匹配0项及没有匹配的客户，QA 仅有全部客户，无空结果提示；配图 demo-sales-customer-nomatch-1029.png / normal34-sales-customer-nomatch-1029.png。两侧客户样本数量不同，均未找到该词；未改变选择或查询。按相同表现归入 N34-I01-SUPPLIER-EMPTY-01，是否同一组件根因待核；O-S02 由 PARTIAL 改 DIFFERENCE，不代表整页通过。

- 2026-10-29 销货客户无匹配补充源码核对：normal34 销货列表通过 SalesReferenceFilter 使用 documents/source-controls.tsx 的 SourceMulti；库存使用 products/filters.tsx 的筛选树。两者为不同实现，按现象归组，修复和复验分别定位；配对截图及实际状态见 N34-I01-SUPPLIER-EMPTY-01。
- 销货列表客户无匹配焦点下 Esc 已双侧操作：均保持下拉和搜索词；不能推及其他焦点。
- 销货客户无匹配：双侧点击标题关闭并重新打开，搜索词清空且全部客户保持选中；样本数量不同。
- O-S02 全选再次点击：两侧先处于单客户并点击全部，再点击已勾选全部。Demo 显示已选0项且关闭重开仍为0；QA 仍显示全部及两个子项勾选。配对图 demo-sales-customer-all-toggle-1029.png / normal34-sales-customer-all-toggle-1029.png。不同样本量不比较数量，空选择查询语义未验。详情 N34-S02-ALL-CUSTOMERS-TOGGLE-01。
- O-S02 空客户边界：Demo 取消全部后查询，客户恢复全部、结果 27,909 张；QA 从全部依次取消两名客户，取消最后一名后立即恢复全部。不能建立同态空选择查询对照，也不据此声称查询范围有错。图 demo-sales-empty-customer-query-1029.png / normal34-sales-last-customer-clear-1029.png。
- B05 收款方式 Enter：两侧均为全部状态、输入微信后按 Enter，输入保留且原列表仍显示（Demo 12 条，QA 5 条）；本次没有触发查询，截图 demo-payment-enter-1029.png / normal34-payment-enter-1029.png。两侧样本不同，不比较数量；查询按钮已有配对记录。QA 编辑/新增仍不可用，整页未通过。
- B05 搜索框放大镜：两侧全部状态且已输入微信，点击输入框右侧放大镜后输入和原列表保持，未见结果更新；配对图 demo-payment-search-icon-1029.png / normal34-payment-search-icon-1029.png。只说明此界面此次操作，查询按钮此前已验证。
- B04 登录账号片段与角色：在在职、全部营业厅/登录权限下，两侧分别输入各自已有账号片段并选营业员查询；Demo 返回1条，normal34 返回2条，当前行均匹配各自片段和角色。样本与关键词不同，不比较结果数量或证明正式权限；截图 demo-staff-account-fragment-role-1029.png / normal34-staff-account-fragment-role-1029.png。维护仍不可配对，整页未通过。
- B04 账号片段与角色排除：保留此前各自账号片段并由营业员改管理员，两侧查询：Demo 0条，normal34 返回1条管理员、此前两条营业员不再显示。片段和样本不同，不比较数量或认定全部角色权限；配对截图 demo-staff-account-fragment-manager-1029.png / normal34-staff-account-fragment-manager-1029.png。
- 证据文件核对：现行矩阵105条和问题清单64项中所有作为独立图片文件名列出的引用均存在；仅检查文件存在，不证明截图配对、内容真实性或验收通过。
- N34-I02-EMPTY-TAG-01 影响范围补查：双侧销货列表全部筛选、展开高级筛选，当前截图中状态/业务类型/营业厅/营业员/客户/仓库标签旁未见库存截图所示白块。仅此视口可见状态，不能推断空节点或其他页面。配图 demo-sales-all-tags-1029.png / normal34-sales-all-tags-1029.png。调拨查看选中状态已有双侧证据，复用此前结果。
- 销货/调拨商品信息摘要核查：复用 N34-LIST-SUMMARY-SEMANTICS-01 已绑定的双侧截图和冻结源码：调拨为正数量商品按身份去重分类款数；销货为非赠品按分类/单位累计有符号数量；normal34 严格接口仅含商品快照。历史分类未知及实际接口响应仍未验证。
- 问题记录完整性补齐：N33-FIXTURE-SEASON-01 将既有合同与合成样本证据的预期/实际提到顶层；未扩大为正式数据库结论。
- 更正 B05 放大镜记录：此前截图坐标使用一半比例，不能证明实际点击了放大镜；撤回该项操作结论及通过判断，截图仅留历史。Enter 检查使用键盘，不受此坐标问题影响。
- P16 鼠标清除补查：两侧输入男装得到2组，实际点击搜索框右侧清除叉后均清空并恢复6组。截图 demo-size-mouse-clear-1029.png / normal34-size-mouse-clear-1029.png；其他操作及整页仍未通过。
- B05 更正后复验：按原尺寸截图实际命中两侧放大镜，微信输入及原列表均保持，未见查询更新；截图 demo-payment-icon-corrected-1029.png / normal34-payment-icon-corrected-1029.png。此前错误坐标的历史结果不作证据。
- O-S16 弃审确认 Esc：Demo 已审核销售 V2-XS-ad693d2e 和 QA 已审核销售 QA-XS-0020 均只打开确认层并按 Esc，确认层关闭，页面仍显示已审核；未执行弃审。配图 demo-sales-unaudit-esc-1029.png / normal34-sales-unaudit-esc-1029.png。单据数据不同，既有确认文案差异保留，真实事务未验。
- O-T08 作废确认 Esc：Demo ALAL-2026-09-0128 编辑页、QA QA-DB-0022 查看页均为已保存未审核，分别打开确认后 Esc；两侧确认关闭且仍显示未审核，未确认或作废。配图 demo-transfer-void-esc-1029.png / normal34-transfer-void-esc-1029.png。页面模式和样本不同，只比较此次关闭；既有文案差异、真实作废未验保留。
- O-S17 作废确认 Esc：Demo V2-XS-17afee7c 编辑页和 QA QA-XS-0019 查看页均为已保存未审核，各打开确认后 Esc，确认层关闭且仍显示未审核；未执行作废。配图 demo-sales-void-esc-1029.png / normal34-sales-void-esc-1029.png。页面模式及数据不同，仅比较此次关闭，不推断真实事务。
- O-I07 流水 Esc 重开补证：Demo 与 QA 在各自库存规格流水输入 TEST-123 后 Esc，再打开各自同规格，来源输入均为空；QA 本次仍提示流水读取失败，数据不同不比较记录或推断正式接口。截图 demo-ledger-esc-reopen-1029.png / normal34-ledger-esc-reopen-1029.png。旧 N34-I07-LEDGER-ESC-01 保持撤销。
- O-I02 分类搜索：两侧全部分类输入 ZZZ987，Demo 暂无数据，QA 保留全部分类且无空结果说明；输入焦点 Esc 后两侧均保留词和下拉。配图 demo-category-nomatch-esc-1029.png / normal34-category-nomatch-esc-1029.png，按现象归 N34-I01-SUPPLIER-EMPTY-01；O-I02 原已 DIFFERENCE，状态不变。
- 源码定位更正：库存页 inventory/page.tsx:9,23-24,40 调用 inventory/candidates.tsx 的 CandidateSelect，此前把 products/filters.tsx 说成库存实际实现不准确；后者为商品列表另一实现。销货使用 documents/source-controls.tsx；相似写法不自动证明同一根因。
- O-I02 无匹配重开：Demo 与 QA 分别在 ZZZ987 无匹配下点击标题关闭、重开分类树，均清空搜索词且保留全部分类；未执行查询。配图 demo-category-nomatch-reopen-1029.png / normal34-category-nomatch-reopen-1029.png。
- O-I02 键盘配对：Demo 和 normal34 在全部分类、分类搜索框焦点下按方向键下及 Enter，操作后全部分类仍选中，未观察到新增选择；QA 子项勾选与 Demo 不同是按键前已存在的差异，不归因于此次操作。配图 demo-category-keyboard-1029.png / qa-category-keyboard-1029.png；其他键盘路径及整页未完成。
- O-I02 分类树焦点：两侧从分类搜索框按 Tab，焦点均进入树容器；再按方向键下和 Enter，焦点仍在容器、全部分类保持，未观察到勾选变化。配图 demo-category-tab-focus/tree-down/tree-enter-1029.png 与 qa-category-tab-focus/tree-down/tree-enter-1029.png；仅覆盖该按键序列，其他键盘路径仍未完成。
- O-A01 账号菜单 Tab：库存页两侧点击账号打开菜单，按 Tab 后焦点从账号按钮移到导出，菜单仍显示；QA 的修改密码是批准新增。未触发退出或输入密码。配图 demo-account-menu-open-tab-1029.png / qa-account-menu-open-tab-1029.png、demo-account-menu-tab-1029.png / qa-account-menu-tab-1029.png；其他键盘和角色状态未完成。
- O-A01 焦点移出后的 Esc：账号菜单打开后 Tab 至导出，再按 Esc，两侧菜单仍显示、焦点仍在导出；只说明此焦点状态。配图 demo-account-menu-tab-esc-1029.png / qa-account-menu-tab-esc-1029.png。
- O-I04 / N34-I04-FIT-SEARCH-TOGGLE-01 同态补证：Demo 与 normal34 均展开高级筛选、全部版型、输入 Y 并等待匹配1项，点击 Y 结果后 Demo 取消 Y、剩5项；QA 清空搜索后仍全部6项选中。未执行查询。各自商品过滤与数据不同，不比较库存。配图 demo-fit-y-before-1030.png / qa-fit-y-before-1030.png、demo-fit-y-after-1030.png / qa-fit-y-after-1030.png。既有异状态记录不作同态结论，根因仍待证。
- N34-I04-FIT-SEARCH-TOGGLE-01 固定提交源码核对：inventory/candidates.tsx:67,73,108–122 的输入签名变化会中止选择请求，搜索状态的单项取消需异步读取完整候选；TreeSelect 配置选择时不保留输入。filter-selection.ts:14–22 规定全部状态移除单项，filter-selection.test.ts:10–13 直接覆盖纯函数成功路径，未覆盖组件事件和中止时序。输入清除与请求中止可能有关，但未观察运行时先后或信号，根因保留未知。
- O-I04 非全部状态边界：两侧先选除Y外5项，输入A点击A；Demo取消A剩4项，QA仍选A共5项。Demo点击前显示匹配6项、QA为1项，搜索加载状态不完全一致；仅比较目标勾选。现象不限全部状态，不能单凭全量候选异步读取解释根因。未查询。配图 demo-fit-five-search-a-before/after-1030.png 和 qa-fit-five-search-a-before/after-1030.png。
- O-S02 已审核筛选：两侧从全部状态取消未审核、已作废，仅保留已审核并查询；稳定后 Demo 首20条、QA 10条所示状态均为已审核。数据集不同，不比较总数，未验证审核写入；配图 demo-sales-reviewed-filter-1030.png / qa-sales-reviewed-filter-1030.png。
- O-S02 已作废筛选：两侧从仅已审核改为仅已作废并查询，Demo 显示没有符合条件单据，QA 返回10条且状态均为已作废；样本不同，不比较数目或推断真实作废。配图 demo-sales-void-filter-1030.png / qa-sales-void-filter-1030.png。
- O-S02 状态和类型组合：两侧仅选已审核 + 退货/换货并查询，稳定后当前返回行均显示该状态及类型；Demo 与 QA 样本不同不比较数量。未操作单据事务，配图 demo-sales-reviewed-exchange-1030.png / qa-sales-reviewed-exchange-1030.png。
- S04 已审核退换单退回行查看：Demo SA-2026-09-0159 打开新标签商品详情六页签；QA QA-XS-0017 在单据内打开基础资料、规格、图片三页签抽屉。商品与单据不同，只比较打开方式；归 N34-T02-PRODUCT-VIEW-01。配图 demo-reviewed-return-view-1030.png / qa-reviewed-return-view-1030.png。
- S04 退换详情返回列表：Demo SA-2026-09-0159 与 QA QA-XS-0017 从已审核退换单点击返回，均保留已审核、退货/换货筛选与对应结果；QA 先 Esc 关闭商品抽屉。数据不同不比较数量，未修改单据。配图 demo-reviewed-exchange-back-1030.png / qa-reviewed-exchange-back-1030.png。
- O-S02 日期范围：保留已审核+退货/换货，两侧日历选2026-10-15至2026-10-20并查询；Demo无结果，QA返回一张10-17已审核退换单。样本不同，不比较数量或证明日期边界及完整筛选合同。配图 demo-sales-dates-range-1030.png / qa-sales-dates-range-1030.png。
- O-S02 同日边界：两侧保留已审核+退换货，开始和结束均设2026-10-17并查询；QA仍返回当天 QA-XS-0017，Demo无结果。仅证明QA该样本同日可包含，Demo缺当天样本无法证明其边界，数据不同不视为缺陷。配图 demo-sales-date-same-day-1030.png / qa-sales-date-same-day-1030.png。
- O-S02 Demo有样本的单日边界：两侧均为已审核+退换货，日期同为2026-09-10至09-10；Demo返回5张日期均为9月10日的单据，QA无结果。结合此前QA 10月17日单日有样本结果，分别观察到两侧包含各自当天样本；不同数据不比较数量，也未证明所有边界和时区。配图 demo-sales-date-sep10-1030.png / qa-sales-date-sep10-1030.png。
- O-S02 倒序日期：两侧已审核+退换货，开始09-11、结束09-10后查询；Demo 提示“开始日期不能晚于结束日期”，保留日期及前次5条；QA 页面提示“请检查查询条件和日期。”并保留日期，前次结果为空无法证明有数据时保留。提示差异 N34-S02-DATE-ORDER-01，配图 demo-sales-reversed-date-1030.png / qa-sales-reversed-date-1030.png。Demo sales-current.js:260 与固定QA sales-list.tsx:38 分别为对应路径；QA调拨同样通用文案仅是源码线索，待页面核。
- T01 日期倒序同类补查：两侧调拨列表开始2026-10-20、结束10-15，点击查询；Demo提示开始日期不能晚于结束日期，QA提示请检查查询条件和日期。双方日期和各自原有列表保留；数据不同不比条数。合并 N34-S02-DATE-ORDER-01，Demo transfer-current.js:147、固定QA transfers-list.tsx:45 分别定位。配图 demo-transfer-reversed-date-1030.png / qa-transfer-reversed-date-1030.png。
- T01 日期倒序后更正：两侧将结束日期设为与开始相同的2026-10-20并查询；QA在更正日期后仍显示错误，查询成功后消失并返回当天1张，Demo当天无结果。样本不同不比较数量；配图 demo-transfer-date-corrected-1030.png / qa-transfer-date-corrected-1030.png。
- T01 未审核筛选：两侧默认条件只选择未审核并查询，当前返回行均为未审核；Demo与QA数据不同，不比较总数，不代表审核事务通过。配图 demo-transfer-unreviewed-1030.png / qa-transfer-unreviewed-1030.png。
- 报告去歧义：历史 N32-T02-OBS-02 曾将负责人可修改要求列为待核；该部分已由用户明确要求负责人可选，合并至 N34-T02-RESPONSIBLE-01，不再重复列待批准。历史同条顶部未保存状态按钮灰显仍独立待核；真实创建者与负责人身份不得混同。未改变任何页面结论。
- T01 调出仓候选：两侧未审核调拨列表打开调出仓多选，Demo显示仓库候选；normal34显示候选读取失败，一次重试后仍失败。当前无法配对具体仓选择和查询，未采请求响应，不推断正式接口故障。N34-T01-WAREHOUSE-CANDIDATES-READ-01，固定源码 transfers-list.tsx:21；配图 demo-transfer-list-out-warehouse-open-1030.png / qa-transfer-list-out-warehouse-failed-1030.png。
- T01 单号片段查询：两侧未审核下输入各自存在的片段，Demo 0128 返回 ALAL-2026-09-0128，QA 0022 返回 QA-DB-0022，均为未审核；样本不同，仅验证本次匹配，未覆盖其他匹配及正式接口。配图 demo-transfer-number-fragment-1030.png / qa-transfer-number-fragment-1030.png。
- T01 筛选结果返回：Demo ALAL-2026-09-0128 与 QA QA-DB-0022 从未审核+各自单号片段的单条结果进入后返回，两侧均保留条件与结果。Demo进入编辑、QA进入查看，模式不同；未修改或保存。配图 demo-transfer-number-back-1030.png / qa-transfer-number-back-1030.png。
- P16 尺码组无匹配：两侧搜索 ZZZ987 均显示没有匹配的数据、0条；清空输入值后均恢复6条。候选快捷键尝试只删掉末字符，未证明全选快捷键行为；之后两侧通过控件设置空值完成清除，不记快捷键通过。配图 demo-size-nomatch-1030.png / qa-size-nomatch-1030.png 和 demo-size-nomatch-clear-1030.png / qa-size-nomatch-clear-1030.png。
- P16 每页条数：两侧尺码组列表从20改为50条/页，均显示50条/页及6条结果；仅有6条，不证明跨页。配图 demo-size-page50-1030.png / qa-size-page50-1030.png。
- P16 六组内容：使用已保存的 demo-size-page50-1030.png / qa-size-page50-1030.png 及两侧当前页面文本逐组核对，六组名称和每组显示尺码顺序一致，包含最后配饰均码的无尺码、均码。此为 normal34 合成预览显示，不证明SKU身份、正式字典或页面列宽一致；已有 N34-P16-COLUMN-01 保留。
- P16 尺码组跨页签配对：两侧起始均为尺码组、空搜索、50条/页，搜索“男装”后各显示2组；切换至版型再返回尺码组，两侧搜索均清空并恢复6组。Demo 返回后保持50条/页，normal34 返回后变为20条/页，属于本次路径下的分页设置差异；版型页签两侧均为20条/页。配图 demo-size-tab-return-1030.png / qa-size-tab-return-1030.png，前置50条状态见 demo-size-page50-1030.png / qa-size-page50-1030.png。问题待定位和原 owner 处理，不能以本次局部相同行为判整页通过；未做保存或业务写入。
- P18 季节分页切换同类补证：两侧季节页设置50条/页，切版型再返回；Demo保留50，normal34回到20，配图 demo-season-tab-return-1030.png / qa-season-tab-return-1030.png。Demo四项、QA六项，字典样本差异归既有记录；此处仅比较分页设置。合并 N34-P16-TAB-PAGESIZE-01。固定QA提交 dictionary-page.tsx:12,26,32,76 按页签key重新挂载查询并从20初始化；冻结Demo product-current.js:193–197,266,274 按页签保存分页状态，和观察相符。颜色、版型是否同样受影响未实际验证，整页未通过。
- P15/P17 分页页签切换同类补证：两侧各将版型设50条/页，切尺码组再返回，Demo保留50、normal34重置20；颜色同样设置50并切尺码组返回，Demo保留50且显示1–50/182，QA重置20且显示1–20/182。配图 demo-fit-tab-return-1030.png / qa-fit-tab-return-1030.png、demo-color-tab-return-1030.png / qa-color-tab-return-1030.png。与尺码组、季节合并 N34-P16-TAB-PAGESIZE-01；固定源码根因线索见上一条，颜色及版型维护禁用为独立已记录接入缺口。仅核本切换路径，不代表整页通过。
- O-I01 上方向键待验证风险：normal34 库存搜索 M2600 等两项出现后按上键，M26004高亮，但旁侧商品资料仍显示 M26001；Enter 实际选择 M26004。Demo 已有一项商品、搜索CS时候选仍在追加，按上键后资料为CS1832706，Enter选中CS0015531175；两侧已选状态与候选加载不同，不作为同态比较结果。截图 qa-inventory-up-candidates/selected-1030.png、demo-inventory-up-candidates/selected-1030.png；两侧仅改筛选和最近搜索，未保存业务。固定QA candidates.tsx:64,90,99–100 以previewId或首项显示预览，选项鼠标进入更新previewId；键盘/鼠标及异步影响未排除，记录 N34-I01-PREVIEW-KEYBOARD-01 为待验证风险，需稳定同态复核。
- O-I01 键盘预览稳定候选补证：Demo 搜 CS010218、normal34 搜 M2600，均等待两候选稳定后在搜索框按一次下键。Demo 高亮第二项 CS0102182，右侧资料同步该款；QA 高亮第二项 M26004，右侧资料仍为第一项 M26001。Enter 两侧均选中各自第二项。图 demo-inventory-preview-down-stable-1030.png / qa-inventory-preview-down-stable-1030.png 及 demo-inventory-preview-down-enter-1030.png / qa-inventory-preview-down-enter-1030.png。两侧商品、既有选择与库存结果不同，只比较候选高亮、资料及选择联动；本轮无保存。N34-I01-PREVIEW-KEYBOARD-01 更新为该路径差异已确认，源码线索保留，其他路径及整页不通过。
- O-I05 颜色小计：两侧已有库存结果、商品合计开启且颜色小计原为关闭时，勾选颜色小计后各出现对应小计行；取消勾选后小计行消失，恢复各自原有显示设置。Demo样本每颜色可见一个仓库，QA M26004每颜色四仓，样例、尺码、已执行筛选不同，不能用此对照证明跨仓计算或数量一致。图 demo-inventory-color-subtotal-1030.png / qa-inventory-color-subtotal-1030.png；QA为合成预览，未保存业务，O-I05及整页保持未完成。
- N34-LIST-SUMMARY-SEMANTICS-01 报告口径校准：重读冻结 b8bcfe3 的 transfer-golden.js:11–12、sales-summary.js:6,12–25，调拨实际取当前可得商品分类并对正数量商品按ID去重计款；销货对非赠品按分类及单位累计有符号数量，已保存单据缺分类快照使用历史未记录提示。Demo调拨当前分类的实现不授权正式系统据此补造历史分类；Demo单位缺失默认件也不证明正式历史单位。已补两侧URL、固定版本及四张既有截图存在性；不同单据的截图不能证明同单据API响应或数量对账，本轮未重复浏览器操作。
- O-T11 QA样例缺口源码界定：固定2357cf5 qa-reference-fixtures.ts:1820–1823 的24张预置调拨每张仅由前三个商品各生成一行；:1825–1830 的6张历史样例继承明细，:1837–1840 按商品去重后只有超过3款才设置hasMore。这一固定样例集无法触发QA“超过3款”分支；synthetic-preview-transport.ts:77–82 另可汇入运行态数据，未核得该路径全部实际内容，不宣称整个环境绝无更多样例。Demo更多弹层已有单侧截图；两侧弹层、Esc和关闭仍未完成，保留 PARTIAL，未修改或制造数据。
- O-T11 Demo浮层外点击补证：调拨列表筛选已作废、单号0148，ALAL-2026-09-0148 的 +1 更多显示毛呢夹克1；点击列表标题后浮层关闭，图 demo-transfer-more-open-1030.png / demo-transfer-more-outside-1030.png。此为Demo单侧操作，QA对应超过3款样例未取得，不作两侧通过；单据未修改。
- O-T11 QA当前样例实查：在现有57923调拨标签点击重置，全部状态和空单号，列表共30张；第一页20条、第二页10条，逐页无障碍树每条摘要均为3款，均无更多按钮。配图 qa-transfer-more-page1-1030.png / qa-transfer-more-page2-1030.png，截图只覆盖各页可见视口，逐行计数依据页面无障碍树。结合固定预置样例源码，当前列表无法构造Demo超过3分类的配对；不推断正式环境，未写入业务。
- T01 调拨组合状态筛选：两侧空日期、空单号、全部调出/调入仓，选择已审核与已作废并查询，稳定结果当前页均只显示两种选中状态；QA返回20条，Demo按其自身数据返回，样例及总量不同不对账。图 demo-transfer-approved-void-1030.png / qa-transfer-approved-void-1030.png。仅覆盖该组合及当前页，不代表全部筛选或真实审核通过；既有摘要和其他差异保留，未写入业务。
- P19/O-P07 2023方案及遮罩：两侧条码方案列表打开2023年条码方案，点击弹窗左侧遮罩均保持打开，再用关闭按钮退出。配图 demo-scheme-2023-modal/outside-1030.png / qa-scheme-2023-modal/outside-1030.png。Demo展示存货默认条码原值及随长度，QA合成项展示货号7位和14位；规则分行/单行及样例差异归既有 N33-P19-DETAIL-01 / N33-FIXTURE-BARCODE-01，同名不证明同一真实方案；未改数据，整页未完成。
- P11 商品只读价格九行：Demo 8877/#product-view/501XF5395665 与 QA 57923/#products/view/00000000-0000-4000-8000-000000004000 直接进入各自已知只读样例，切价格页，逐项核对采购价、零售价、五至十级批发价和最低售价九项名称与顺序一致，金额为文本；Demo样本为空，QA零售价239，其余为空，样例不同不比较金额。配图 demo-product-view-prices-all-1030.png / qa-product-view-prices-all-1030.png。直接路由不证明QA实际用户入口，零值、不同数据状态和真实保存未验，P11保持PARTIAL及整页未通过。
- P09 商品只读规格区块：Demo 男西服与 QA 合成衬衫，两侧从已知直接只读路由切规格页，均显示颜色、尺码组、版型三块，尺码组均为男装上衣尺码；Demo黑色/A版，QA白色、藏青色/Y版、A版，样品不同不比较内容。向下滚动未发现更多区域或可操作入口。图 demo-product-view-spec-full-1030.png / qa-product-view-spec-full-1030.png；此前尺码组字典完整文字的单独配对不能代替此商品实际SKU身份验证。QA真实用户入口、其他资料状态仍未验，P09保持PARTIAL，整页未通过。
- O-S02 销货营业员无匹配：两侧重置至全部筛选，打开全部营业员并输入ZZZ987；Demo显示匹配0项与没有匹配的营业员，QA仅保留全部营业员且无空结果提示，未改变选择或查询。配图 demo-sales-staff-nomatch-1030.png / qa-sales-staff-nomatch-1030.png；合并既有 N34-I01-SUPPLIER-EMPTY-01 的同类界面表现，不凭现象断言与库存组件同一根因；其他筛选及整页仍未完成。
- 2026-10-29 O-S02 局部配对：Demo 8877 与 normal34 57923 的销货列表营业员多选，均输入 ZZZ987 无匹配，输入框有焦点时按 Esc 后两侧浮层及输入均保留；截图 demo-sales-staff-empty-esc-1029.png、normal34-sales-staff-empty-esc-1029.png。两侧其他筛选和样例不同，此次仅比较该控件行为；原无匹配提示差异仍存在，不代表整页通过。
- 2026-10-29 O-S02 补充配对：营业员候选搜索 ZZZ987 无匹配后，分别点击列表标题，两侧候选关闭、搜索文字清空，全部营业员标签保留；截图 demo-sales-staff-outside-1029.png、normal34-sales-staff-outside-1029.png。仅此控件行为，其他筛选条件与数据不同，不代表整页通过。
- O-S02 高级筛选单号保留：Demo 8877 与 normal34 57923 销货列表，在展开的单号输入 ABC987，收起再展开；两侧收起时显示高级筛选 1、条件已修改，重新展开后均保留 ABC987。截图 demo-sales-number-collapsed-1029.png / normal34-sales-number-collapsed-1029.png、demo-sales-number-expanded-1029.png / normal34-sales-number-expanded-1029.png。仅核本次输入及展开收起，未查询、未验证数据结果；整页仍未通过。
- O-S02 单号回车：Demo 8877 与 normal34 57923 销货列表输入 ABC987 后，焦点置于单号框按 Enter，两侧结果均变为0并显示“没有符合条件的销货单”，输入保留；截图 demo-sales-number-enter-1029.png / normal34-sales-number-enter-1029.png。该词只验证本次空结果与回车触发，数据和其他条件可能不同，不证明有效单号、组合筛选或整页一致。
- S01 空结果分页补充：复用本轮两侧单号 ABC987 回车后0条截图，Demo 显示第1页、禁用的上一页/下一页及第1/1页；normal34 无可见分页按钮，额外显示数量、退回、换出及应结均为0的筛选合计。空结果状态一致但样本及其他筛选未逐项确认；合并现有 N34-S01-01，额外合计批准依据仍待核，未推断业务金额。截图 demo-sales-number-enter-1029.png / normal34-sales-number-enter-1029.png。
- S01/S04 已审核销售筛选返回：Demo 销售 V2-XS-ad693d2e、normal34 合成销售 QA-XS-0020，分别按各自完整单号查询得1条，点击查看进入已审核详情，再点返回列表；两侧均保留各自单号与1条查询结果。配图 demo-sales-filter-detail-return-1029.png / normal34-sales-filter-detail-return-1029.png；两侧数据不同，未比较金额、未修改或保存，不能证明所有筛选或状态。
- B05 收款方式首尾空格查询：两侧全部状态、搜索输入“ 微信 ”后点击查询；Demo 返回微信1条，normal34 显示暂无符合条件的数据、0条。此前不带空格的微信查询两侧均返回一条。截图 demo-payment-space-query-1029.png / normal34-payment-space-query-1029.png，归 N34-B05-SEARCH-WHITESPACE-01。Demo basic-settings-v2.jsx:68 去除搜索词首尾空格；固定QA payment-page.tsx:92,141 向查询传入原搜索值，未采请求及下游响应，根因不推断；其他页面尚未检查。未维护或保存。
- B06 同类搜索补查：资金账户页正常状态、全部收款方式，两侧输入“ 现金 ”并查询；Demo 返回8条现金账户，normal34 返回0条。此前两侧均有现金账户样例；数据数量不同，仅比较关键词首尾空格处理。截图 demo-funds-space-search-1029.png / normal34-funds-space-search-1029.png，合并 N34-B05-SEARCH-WHITESPACE-01；未采运行请求、未推断正式接口行为，其他入口待核。
- B06 空格对照补证：在上次正常/全部收款方式的条件不变时，两侧将“ 现金 ”改成“现金”再查询，Demo仍显示8条，normal34恢复现金测试账户1条；数据数量不同，仅支持候选同一状态的首尾空格差异。截图 demo-funds-no-space-search-1029.png / normal34-funds-no-space-search-1029.png，合并 N34-B05-SEARCH-WHITESPACE-01。
- N34-B05-SEARCH-WHITESPACE-01 源码定位校正：先前 payment-settings/payment-page.tsx 是另一实现，不能单独证明 normal34 实际预览。固定 2357cf5 的 demo-replica/frontend/runtime/settings/payments-page.tsx:42,54 将原搜索值交给查询；runtime-preview-transport.ts:13 接入 QA_REFERENCE_PROFILE 设置合成运输，settings/synthetic-preview-transport.ts:76-80,119-125 对 query.search 直接做包含匹配。该静态链与 B05/B06 空格对照现象相符，但未抓运行请求，不宣称正式接口相同行为；不修改代码。
- B02 搜索空格影响范围：两侧仓库正常、全部营业厅，输入“ 总仓 ”并查询，Demo返回多立方总仓1条，QA为0；QA去掉首尾空格再查询返回总仓1条。两侧仓库不同，仅比较空格处理，截图 demo-warehouse-space-search-1029.png / normal34-warehouse-space-search-1029.png / normal34-warehouse-no-space-1029.png；归 N34-B05-SEARCH-WHITESPACE-01。未修改资料，其他设置入口及正式接口未验。
- 证据索引回读：现行矩阵105项（未检查14、局部29、差异62），问题清单69条；矩阵 evidence 与问题 screenshot 中以常见图片扩展名结尾的本地引用均存在，缺失0。12项矩阵无 evidence 且全为 NOT_RUN；另外2项 NOT_RUN 虽有资料或截图引用，仍不表示双侧实际配对。此检查仅核文件存在和分类，不证明图片内容、同态、可达或整页通过。原顶层 normal32 为历史基线，normal34 增量须按各条记录绑定，不自动推广旧证据。
- B01 搜索空格影响范围：正常营业厅，Demo 输入“ 舟山 ”返回多个舟山名称，QA 输入“ 网点 ”为0，去掉空格后返回网点营业厅1条。两侧关键词及数据不同，只核对各自存在样例的首尾空格处理，不比较总量；图 demo-hall-space-search-1029.png / normal34-hall-space-search-1029.png / normal34-hall-no-space-1029.png，归 N34-B05-SEARCH-WHITESPACE-01。未修改资料，正式接口未验。
- B04 员工搜索空格影响：两侧重置为在职、全部角色；Demo 输入“ 林伊 ”返回林伊1条，QA 输入“ 测试营业员甲 ”为0，去掉空格后返回该员工1条。两侧姓名不同，仅比较各自存在样例的首尾空格处理；图 demo-staff-space-search-1029.png / normal34-staff-space-search-1029.png / normal34-staff-no-space-1029.png。归 N34-B05-SEARCH-WHITESPACE-01；无维护写入，正式接口未验。
- B03 客户搜索空格：两侧正常客户范围、输入“ 零售客户 ”查询，Demo 选客户标签并返回匹配客户，QA 客户页为0；QA 去空格后返回零售客户1条。两侧资料不同不对账，客户供应商拆分属已批准差异。配图 demo-customer-space-search-1029.png / normal34-customer-space-search-1029.png / normal34-customer-no-space-1029.png；按现象并入 N34-B05-SEARCH-WHITESPACE-01，固定QA客户合成运输走 partyPath 分支（synthetic-preview-transport.ts:149-152），与组织查询并非同一代码分支，不宣称同一根因或正式接口受影响。
- B03/B08 供应商空格搜索：正常供应商范围，Demo 单独选供应商标签搜索“ 001 ”返回匹配，QA 供应商页搜索“ 华成 ”返回0，去空格后返回示例供应商华成服饰1条。各自关键词及资料不同，仅核存在样例的空格处理；图 demo-supplier-space-1029.png / normal34-supplier-space-1029.png / normal34-supplier-no-space-1029.png。归 N34-B05-SEARCH-WHITESPACE-01，客户供应商拆分为已批准差异，未维护或验证正式接口。
- 问题记录结构核查：69条均有 steps，但证据和URL字段存在 screenshot、screenshots、pairedEvidence、evidence、urls 等多种格式，不能把单字段为空机械判定为缺证。N34-S01-01 根据实际对照页补入双侧销货列表URL及固定版本，原历史证据版本仍按记录分别限定。其余条目的真实配对与版本仍需逐条核对，未将缺失字段自动补成通过。
- O-S17 Esc 补查：Demo 未审核销售 V2-XS-17afee7c 编辑页与 normal34 合成未审核销售 QA-XS-0019 查看页，分别打开作废确认、按 Esc；两侧确认层关闭，页面仍为未审核、已保存。截图 demo/normal34-sales-void-before-esc-1029.png 和 demo/normal34-sales-void-after-esc-1029.png。两侧页面模式及单据不同，只核本次确认层关闭，不执行作废；文案差异沿 N34-T08-VOID-CONTEXT-01，不代表整页一致。
- O-B01 新增营业厅空表单 Esc：Demo 打开后名称输入框自动获得焦点，按 Esc 关闭。normal34 打开后焦点为页面内容，首次 Esc 未关闭；点击名称输入框后再按 Esc 关闭，焦点回新增按钮。按名称输入框焦点配对时两侧均关闭；初始焦点与页面外焦点下关闭行为不同，列待验证风险，尚未确认是否受Chrome焦点或权限影响，不单凭此认定缺陷。图 demo/normal34-hall-new-before-esc-1029.png、demo/normal34-hall-new-after-esc-1029.png、normal34-hall-new-input-esc-1029.png。QA维护未接入，未输入、保存或修改资料。
- O-B01 空白新增营业厅遮罩：Demo与normal34打开新增弹窗，在弹窗左侧遮罩位置点击；两侧弹窗均保持打开，随后按取消关闭。图 demo-hall-new-mask-click-1029.png / normal34-hall-new-mask-click-1029.png。两侧列表筛选词、样例不同，仅比关闭路径；QA维护尚未接入，未填写或保存。
- O-B01 新增营业厅默认客户：两侧空表单打开客户候选、搜索零售客户并各选一项，均能选中；Demo丁桥店XM零售客户，QA零售客户，样例不同不比较候选数量。选择后取消，Demo直接关闭，QA提示继续填写或放弃本次填写；只放弃本次自建临时表单。截图 demo-hall-customer-selected-1029.png / normal34-hall-customer-selected-1029.png / normal34-hall-customer-cancel-confirm-1029.png，取消形态归 N34-B02-CANCEL-01；两侧数据不同，QA维护保存未接入，未提交。
- 原问题覆盖映射同步：按现行 PAGE-MATRIX.json 更新 USER-ISSUE-COVERAGE-NORMAL34.json 中 10 个 currentPageMatrix 快照；原顶层历史 state/reason/evidence 未改。该映射目前收录8组原问题，尚不能据此认定本聊天全部原问题已覆盖；各项仍以具体配对与版本为准。
- 原问题映射补漏：将本聊天可见的库存白块、调拨详情导航选中、调拨负责人可选择、默认扫码四项加入 USER-ISSUE-COVERAGE-NORMAL34.json，关联已有问题与证据，区分已确认缺陷、已观察状态和未验真实扫码；不将聊天全部要求或整页记为完成。
- 用户要求映射补充：查询范围按用户截图居中弹窗的视觉例外映射 O-I06/N32-I06-01；新增销货销售、退换及编辑查看整页要求映射 S02/S03/S04 及相关弹层与差异。仍有未覆盖状态，销货整页不通过；未以局部结果替代整页或改写旧证据。
- O-I05 重载待配对：normal34 处于等待查询状态，季节原关闭，开启后关闭设置并重载，再打开季节变为关闭；图 normal34-inventory-season-reload-1029.png。Demo 当前有已执行2款及另有未执行筛选，为保留现状未重载，季节短暂开启后已恢复原关闭，分类与版型保持开启；因此该项仅候选单侧观察，不能判双侧差异或通过。需在不影响现有筛选的条件下补Demo配对。
- O-B01 默认出库仓风险登记：复用本轮空白新增营业厅配对图 demo-hall-new-before-esc-1029.png / normal34-hall-new-before-esc-1029.png；Demo选择器可用，QA禁用且提示先创建厅仓。固定QA store-form.tsx:43 新增时禁用。是否为用户单厅归属裁决下的必要行为及创建后维护合同待核，登记 N34-B01-DEFAULT-WAREHOUSE-01 为待验证风险，不以Demo覆盖新合同、未判缺陷。
- N34-B01-DEFAULT-WAREHOUSE-01 裁决范围补核：仓库单厅归属简化裁决-20261017.md:6-7 规定仓库仅一个有效所属营业厅及历史未知不猜，但未直接规定新增营业厅时默认出库仓选择时机；因此不能以此直接认定候选禁用已获批准。冻结 Demo basic-settings-v2.jsx:77-83 提供仓库候选并将本厅仓排序靠前，属于源码证据，本次空表单实际候选仍未实操；风险保持待验证，禁止由旧Demo推翻单厅合同。
- O-B01 默认仓运行补证：两侧新增营业厅空表单，Demo 点击默认出库仓后可见多个现有仓库候选，Esc关闭；QA 同字段 disabled 并提示先创建厅及仓。截图 demo-hall-warehouse-options-1029.png / normal34-hall-warehouse-disabled-1029.png；两侧候选状态本身不同，批准依据和单厅业务规则待确认，不选择或保存，N34-B01-DEFAULT-WAREHOUSE-01 继续为待验证风险。
- Demo 库存筛选保护回读：从库存导航至营业厅、完成只读空表单检查后返回库存，商品筛选仍保留000CS0000001、CS0015531175、CS0102182，版型仍为B版及其余3项，显示条件已修改，已执行结果仍为2款。未点击查询或重置；此为本次状态保护观察，不是两侧对比通过。
- 库存商品候选上键补充配对：Demo 与 normal34 均等待两项候选稳定，按上键后 Demo 高亮及预览同步至第二项，QA 高亮第二项但预览仍为第一项，补充至 N34-I01-PREVIEW-KEYBOARD-01。截图 demo-inventory-up-stable-1029.png / normal34-inventory-up-stable-1029.png。Demo 原有三项商品筛选、QA 无已选项，样本不同；仅证明该候选预览联动差异，未按 Enter，不代表整页通过。
- O-A01 补充账户菜单方向键：8877 和 57923 库存页分别打开菜单按一次向下，辅助功能焦点均仍在账户按钮；Esc 关闭后焦点仍在该按钮。配对截图 demo-account-down-1029.png / normal34-account-down-1029.png；QA 的修改密码为批准新增，未触发退出。仅覆盖该焦点路径，不代表其他键盘行为或整页通过。
- 报告证据路径完整性核查：PAGE-MATRIX.json 实有 105 项，状态计数与声明一致（差异 62、局部 29、未执行 14）；矩阵及 70 条 findings 中按图片后缀列出的本目录截图均存在。此仅核文件存在和计数，不证明配对状态、截图内容、覆盖或整页验收。库存 Demo 当前有未查询的筛选修改，保留该状态。
- 整理 O-I04 的证据限定：移除与后续稳定配对结果冲突的旧“未可靠确认”表述，保留早期观察的限制、版型搜索 Y 的已观察差异以及非全部状态候选数量不同的限制；不改变问题级别或整页状态。
- O-I06 补充弹层外点击：两侧库存已查询结果打开范围，在相同页面标题区域点击后均未关闭；点击关闭后焦点返回查看范围。截图 demo-scope-open-1031.png / qa-scope-open-1031.png / demo-scope-outside-1031.png / qa-scope-outside-1031.png。Demo有未执行筛选修改，QA无；样例和范围不同，结论仅限关闭行为，未据此评判内容或视觉一致。保留用户批准的居中弹窗视觉例外及未完成状态。
- 更正上次 O-I06 弹层外点击：坐标点击未证实命中页面标题，撤回“点击标题仍打开”结论。以页面标题元素重新点击后，两侧均关闭；demo-scope-title-close-1031.png / qa-scope-title-close-1031.png。筛选草稿不同，结论仅限本次关闭路径。另核全部仓库显示：Demo 写全部仓库，QA 列四个仓名；固定源码使用响应 warehouseLabels，实际权限范围及批准依据仍待核，合并 N32-I06-01，不假定语义相同。
- 原问题映射回读：14 项原问题仍保留；同步 USER-UI-ACCOUNT-PASSWORD / O-A01 和 USER-UI-MULTISELECT / O-I04 两处过期的矩阵投影，保持历史快照与关联问题编号。此仅同步报告，不增加通过结论。
- 销货列表业务类型筛选接续：在独立 Demo 标签及既有 QA 标签进入 #sales，尝试打开业务类型选择；本轮未取得可靠的可选项和同状态选择结果，不记通过或差异。Demo 库存标签原筛选保留；未执行保存或审核。后续须先确认弹层加载、焦点和实际勾选，再对齐状态进行查询。
- S01 补充退货/换货筛选：Demo 8877 与 normal34 57923 其他筛选默认，选择退货/换货并查询，稳定后当前可见行均为该类型；Demo 3170张、QA 合成18张，数据不同不比较总数。截图 demo-sales-return-filter-stable-1031.png / qa-sales-return-filter-1031.png。仅覆盖当前页筛选显示，未验证所有分页或内部 SALE/RETURN/EXCHANGE 合同。
- S01 退换筛选后返回：Demo 已审核 SA-2026-09-0195、QA 已审核 QA-XS-0023 分别进入查看并返回，均保留退货/换货筛选和第一页结果；不同单据只比较返回行为。截图 demo-return-list-after-detail-1031.png / qa-return-list-after-detail-1031.png。QA该条件共18张、不足20张第二页，不能做该条件的第二页配对；未操作保存审核。
- S01 分页补查：QA退换筛选18张，每页选项20/50/100/200，最小20，确实无法在该筛选形成第二页。两侧重置全部类型后进入第2页：Demo第21–40、QA第21–30；样本不同，只核翻页，不代表退换筛选第2页已验。配对截图 demo-sales-all-page2-1031.png / qa-sales-all-page2-1031.png。
- S01 全部类型第2页进入已审核退换单返回：Demo SA-2026-09-0209、QA QA-XS-0005 分别返回后保持全部类型和第2页（不同数据分别为21–40和21–30）；配对截图 demo-sales-page2-return-1031.png / qa-sales-page2-return-1031.png。仅覆盖该返回路径，不代表其他状态及整页通过。
- S01 每页数量变化：两侧全部类型第2页从20张切50张，均回到第1页；Demo 1–50、QA合成样例1–30。截图 demo-sales-page-size50-1031.png / qa-sales-page-size50-1031.png。仅核此切换，数据量不同；其他分页场景未代替。
- S01 日期倒序去重：复核发现 O-S02 同版本已完成倒序配对并登记 N34-S02-DATE-ORDER-01；S01 增加交叉引用，不重复判通过。此前尝试日期文本未提交，已清除本轮输入，未查询。
- O-S02 状态组合：两侧全部状态中取消已作废，选择未审核与已审核查询，当前页均只见所选状态；Demo与QA数据不同不比较总数。配图 demo-sales-two-status-1031.png / qa-sales-two-status-1031.png，仅覆盖当前页展示。
- P01 供应商排除查询：Demo从全部取消000上期结存后查询显示 Failed to fetch；QA从全部取消示例供应商华成后返回瑞丰、远山4款。样例不同且Demo未取得结果，不算配对通过或QA缺陷；原因未知，不反复重试。截图 demo-product-supplier-exclude-1031.png / qa-product-supplier-exclude-1031.png。
- P18 季节无匹配：两侧输入 ZZZ987 均0条；Demo第一次Esc清空恢复4条，QA第一次Esc保留词，点击输入框再按Esc恢复6条。QA首次焦点/输入事件差异尚未排除，不登记确定缺陷；图片 demo-season-empty-1031.png、qa-season-empty-1031.png、demo-season-esc-1031.png、qa-season-esc-1031.png（QA截图为第一次Esc）。Demo 8877/8878和QA根/健康地址本轮HTTP 200，仅说明响应，不证明商品查询可用。
- P18 追加同焦点实际输入复验：两侧点击空框实际输入ZZZ987并确认输入框焦点，第一次Esc Demo清空、QA保留；QA再点击框后Esc可清空。登记 N34-P18-SEARCH-FIRST-ESC-01，固定源码受控search输入但事件时序未知，不扩推根因或其他页。截图 demo-season-typed-esc-1031.png / qa-season-typed-esc-1031.png。
- 更正 N34-P18-SEARCH-FIRST-ESC-01：回看QA季节输入截图存在Chrome自动填充列表，Demo同图没有，首次Esc可先关闭浏览器列表，先前不是同态对照，撤回缺陷结论，保留待复核。版型页两侧以新词ZQ9182473操作，未观察自动填充菜单时首次Esc均清空，四张 demo/qa-fit-typed-before/after-esc-1031.png；不推断季节页已通过或其他页行为。
- P18 季节首次Esc同态复验：两侧实际输入新词 NQ7381549，按键前截图均未见浏览器自动填充列表；首次Esc均清空并恢复各自列表。撤回 N34-P18-SEARCH-FIRST-ESC-01 页面缺陷结论，保留历史及事件限制；季节数据差异另行保留。四图 demo/qa-season-new-before/after-1031.png。
- O-S01 出库仓接续：Demo当前新单未保存且未选厅；QA新单显示有未保存修改、未选厅且出库仓禁用。未改变已有草稿，不制造同态已选仓；QA状态留证 qa-sales-existing-dirty-1031.png。此状态不能证明有厅后仓库的行为，也不能代表整页通过。
- B05 收款方式正常状态无匹配：两侧输入 NO-METHOD-Q381 点击查询，均保留词并显示0条；截图 demo-payment-normal-empty-1031.png / qa-payment-normal-empty-1031.png。QA销货草稿未操作，为保护草稿使用独立对照标签。仅检查当前空结果，不代表停用样本、保存或整页通过。
- B05 正常状态无匹配查询后清空输入：两侧仍显示先前0条，再查询均恢复各自正常列表；Demo12条、QA5条，样本不同。四张 demo/qa-payment-empty-clear-1031.png、demo/qa-payment-clear-query-1031.png。仅检查搜索条件与查询时机，不代表维护或整页通过。
- O-T02 空白新调拨（两侧未选仓）行内商品候选：打开后按Esc均关闭且焦点留在商品输入；未选商品、未保存。样例候选不同不比较内容。截图 demo-transfer-candidate-esc-empty-1031.png / qa-transfer-candidate-esc-empty-1031.png；已有输入与其他状态未代替。
- O-T01 空白新单调出仓单候选键盘选择：两侧分别搜索唯一总仓，方向下+Enter后选中；Demo候选关闭，QA仍展开，随后Esc关闭并保留总仓。N34-T01-WAREHOUSE-KEY-CLOSE-01，固定源码 current-warehouse-select.tsx:15，事件原因未知。配图 demo-transfer-warehouse-key-1031.png / qa-transfer-warehouse-key-1031.png / qa-transfer-warehouse-key-esc-1031.png；未保存，两张本轮新建草稿保留。
- O-T01 调入仓同类补查：两侧已选调出仓，搜索唯一调入仓后方向下+Enter，Demo选丁桥店XM仓库并关闭候选，QA选网点仓但候选仍展开；QA Esc关闭且保留两仓。归 N34-T01-WAREHOUSE-KEY-CLOSE-01。两侧样例不同，仅核键盘关闭操作，未保存。配图 demo-transfer-in-key-1031.png / qa-transfer-in-key-1031.png。
- O-T01 已选调出仓鼠标补查：两侧分别点击当前已选仓，候选均关闭并保留两仓；仅覆盖当前项，不能代替选择其他仓的验证。配图 demo-transfer-warehouse-same-mouse-1031.png / qa-transfer-warehouse-same-mouse-1031.png。更正键盘关闭问题的源码定位：新增页实际使用 transfer-proposal-form.tsx:61–63 的 TransferWarehouse；此前本条记成 current-warehouse-select.tsx 是定位错误，根因仍未确认。未保存。
- T02 日期控件配对：两侧未保存新单均为2026-10-29、各已选两仓，点击日期输入打开同月日历；输入框焦点按 Esc 后两侧日历均仍展开，点击外部均关闭，日期及两仓保留。截图 demo-transfer-date-open/esc-1031.png / qa-transfer-date-open/esc-1031.png。仅核该焦点及关闭方式，未选择日期或保存；不影响整页 DIFFERENCE。
- T02 日期选择配对：两侧未保存新增单均已有两仓，日历点击当前10月29日后关闭、日期保留；重新打开后各选10月28日，日历关闭、日期变为10月28日，两仓保留。截图 demo/qa-transfer-date-same-selected-1031.png 与 demo/qa-transfer-date-change-1031.png。不同仓库名称，仅比较日期操作；未保存，未验证跨月、键盘选择和保存。
- 证据纠正：上次QA已选仓鼠标坐标落在候选外，原图只能证明点击外部关闭，不能证明点击选项。重新打开后按实际截图坐标点击已选总仓，候选关闭且两仓保留；见 qa-transfer-warehouse-same-mouse-corrected-1031.png。Demo原有点击已选项证据有效。仅覆盖当前项，不扩展其他仓。
- T02 日期跨月配对：两侧未保存草稿均由10月28日日历切上月并选9月15日，日历关闭、日期显示2026-09-15、各自两仓保留。配图 demo-transfer-date-cross-month-1031.png / qa-transfer-date-cross-month-1031.png；未保存，日期键盘操作仍未验。
- O-T05 追加确认补查：两侧未保存调拨各有同规格首尺码2件，重复录入1件后确认追加，均变为3件、下一录入行清空，汇总1款3件。Demo商品CS0015531175红色、QA商品M26001白色，样例不同仅比较操作及计算；确认提示文字差异沿既有 N34-T05-APPEND-CONTEXT-01，未保存或审核。配图 demo/qa-transfer-duplicate-confirm-1031.png 与 demo/qa-transfer-duplicate-confirmed-1031.png。
- O-T05 不同尺码追加：两侧原160/XS 3件，再选各自同商品颜色版型，在165/S录2并Tab；Demo弹追加确认后确认，QA移焦即直接合并，没有出现确认。最终两侧均为160/XS 3件、165/S 2件，1款5件；不同商品，未保存。配图 demo-transfer-append-second-size-1031.png / qa-transfer-append-second-size-1031.png 为最终结果；本轮未截Demo确认框，不以结果图证明确认框外观。合并 N34-T05-APPEND-CONTEXT-01 作为行为补充，根因未知。
- O-T05 不同尺码过程补证：两侧原160/XS 3件、165/S 2件；重复录入同商品颜色版型的170/M 1件并Tab，Demo显示确认追加，QA直接合并到1款6件。截图 demo-transfer-third-size-confirm-1031.png / qa-transfer-third-size-auto-1031.png 分别为确认中和合并后，状态不同，不能用作同态视觉比较；商品不同。Demo确认框保持打开，未保存。
- O-T05 追加确认源码定位：冻结 b8bcfe3 frontend/transfer-matrix-experiment.js:136–140 的 commitDraftValues 按已选商品与颜色行判断确认；固定2357cf5 apps/web/src/current-form/transfer-proposal.ts:287–320 的 commitPending 按变化明细完整坐标或矩阵中同尺码非零格判断重复。该条件差异与两侧不同尺码追加结果相符；尚不证明真实 SKU、保存或事务合同。建议保留正式身份与数量校验，针对确认触发和文案做最小复验，不执行修复。
- 操作边界纠正：本轮先前在 Demo 和 QA 未保存调拨草稿点击过“确认追加”，违反目标中“有确认层只打开后取消”的限制；未点击保存、审核或作废，不能仅据此推断是否发生任何其他持久化。保留既有观察并标记越界，不重复执行确认，后续确认层只打开后取消。UNFINISHED-INDEX 同步纠正确认追加状态。
- 证据文件完整性抽查：检查 PAGE-MATRIX.json 所列相对 PNG 文件，当前不存在缺失文件；这只检查文件存在，不能证明截图是同状态、同版本或足以支持结论。修正 N34-T05-APPEND-CONTEXT-01 原 scope 中“不同尺码确认后”易误解为两侧均确认：实际 Demo 确认、QA 自动合并；确认操作越界保留说明。
- 磁盘空间恢复核实：本机 df 报约 496 MiB 可用；未清理或修改业务资料。现有矩阵实数核对为37页（差异28、局部8、未执行1）及68类弹层（差异34、局部21、未执行13），合计105项，与矩阵声明一致；整页和整类通过均为0。数字是检查状态，不代表问题数量或完成验收。
- T02 草稿商品查看补证：Demo 已填行查看新标签只读页含六页签，切回后原行3+2及待录入170/M 1保留；QA已填行查看打开三页签只读抽屉，Esc关闭后原行3+2+1保留。Demo与QA同为未保存调拨草稿，但数量及商品不同，不能当同数量状态视觉对比；归既有 N34-T02-PRODUCT-VIEW-01。截图 demo-transfer-draft-product-view-1031.png / qa-transfer-draft-product-view-1031.png；未保存。
- O-S07 只读边界补充：冻结 b8bcfe3 frontend/sales-current.js:191–193 中未知、歧义和不在范围的条码会调用 recordFailure，再经 persistRecord 写工作记录；此前只提示成功扫码写入不完整。Demo 禁止提交测试条码，含失败条码；入口未验证仍为 NOT_RUN。源码线索不证明运行入口可达，也不代表功能取消。
- O-P08 样例边界补充：Demo 当前从调拨商品查看进入 CS0015531175 条码页，185/2XL 有主条码，但显示的历史/兼容列为空，不能证明历史列表可打开；该样例不可用于 O-P08 配对。仅只读观察，QA 对照未操作，仍 NOT_RUN；不将无历史样例当成页面功能缺失。
- 原问题映射快照同步：USER-ISSUE-COVERAGE-NORMAL34.json 中历史 currentPageMatrix 已落后当前矩阵，将 3 个映射条目的状态、操作、未完成、证据和整页标志从 PAGE-MATRIX.json 同步；无匹配行 0。保留顶层历史快照及原问题结论；只是记录同步，不代表新增实操或验收通过。
- P19/O-P07 2021方案配对：两侧条码方案列表点击2021年条码方案并在关闭按钮焦点按Esc，均关闭。Demo显示存货默认条码原值、随默认条码长度；QA合成方案显示货号7位和13位。同名不证明资料身份一致，不断言正式规则错误，分别沿 N33-P19-DETAIL-01/N33-FIXTURE-BARCODE-01 记录。配图 demo-scheme-2021-modal-1031.png / qa-scheme-2021-modal-1031.png；未保存或修改。
- P18 结论一致性修正：矩阵未完成理由仍保留首次Esc差异待核的过期措辞，与已撤回的 N34-P18-SEARCH-FIRST-ESC-01 及无自动填充状态下同态补验相矛盾；现明确撤回、保留历史动作与其他未完成项，不改变页面 DIFFERENCE 状态。
- P15 颜色跳转零页码：两侧20条/页、第一页输入0并点击跳转，均停留第一页且输入仍为0。截图 demo-color-jump-zero-1031.png / qa-color-jump-zero-verified-1031.png。QA首次尝试点击后到第10页，事前未核输入值，不作为零输入证据；返回第一页后确认输入为0再点击得到上述结果。该项仅覆盖零输入，不消除已有99越界问题或整页未完成。
- 未完成索引与矩阵同步：更新 O-S07 成功与失败扫码均可能写记录、O-P08 已排除的第二个无历史样例、P15 零页码局部结果。原14项未执行及全部分母保持；不将无法配对或越界操作记通过。
- 阶段汇总状态补充：原快照写58差异/33局部及59问题，现有矩阵为62差异/29局部/14未执行，问题记录72条含2条撤回。已在原阶段汇总顶部注明当前数字、原内容仍为历史快照；不把记录总数等同产品缺陷，逐项以当前矩阵与问题记录为准。
- 执行清单索引更新：在原清单历史104项快照前加入由当前矩阵生成的105项状态索引，含新增弹层，逐项链接到矩阵及未完成原因；未扩大或缩小范围，不把索引生成当作新实操。
- 库存商品候选上键及回车补充配对：独立的两侧未查询页面各搜索得到两项候选，Demo CS010218、QA M2600，数据不同但候选数量及操作一致。按上键后两侧均高亮第二项；Demo 右侧资料同步第二项 CS0102182，QA 右侧仍显示第一项 M26001；回车后两侧均选择各自高亮的第二项。归入既有 N34-I01-PREVIEW-KEYBOARD-01，补充证据 demo-inventory-up-stable-highlight.png / qa-inventory-up-stable-highlight.png 及 demo-inventory-up-stable-selected.png / qa-inventory-up-stable-selected.png。仅验证该路径，未执行查询或保存，库存整页仍未通过。
- O-A02 销货新单未保存提示 Esc：在独立 Demo 8877 与 normal34 57923 新单各输入 QA-ESC-TEST 备注，确认输入后点返回列表，均出现“有未保存的修改”，关闭按钮获得焦点；按 Esc 后均留在新单、备注保留、焦点回到返回列表。截图 demo-sales-unsaved-esc-retain-1031.png / qa-sales-unsaved-esc-retain-1031.png。两侧均未选择业务类型、未录商品；默认营业员及支付控件状态不同，因此仅比较该提示及备注保留，不据此判全页一致。首次 QA 尝试未先确认中文输入，不能用于输入保留结论，随后使用 ASCII 备注重做并确认。未点放弃、保存或审核；两侧测试草稿仍保留。其他入口及状态未完成。
- O-A02 销货新单遮罩与关闭补充：两侧未保存提示打开时在同位置点击遮罩，均未关闭，截图 demo-sales-unsaved-mask-1031.png / qa-sales-unsaved-mask-1031.png；QA 点击右上关闭后留在新单且备注 QA-ESC-TEST 保留。Demo 随后点击关闭显示“登录已失效”，因此未能确认关闭后 Demo 备注及焦点是否保留；需用户重新登录后只读复核，不能将 Demo 状态记为通过，也不推断草稿保存。未点放弃、保存或审核。
- O-A02 销货新单关闭补验：用户重新登录后，Demo 对照标签仍显示原测试备注；再次打开提示点击右上关闭，备注保留、焦点回返回列表。QA 同样保留备注和焦点。配图 demo-sales-unsaved-close-retain-1031.png / qa-sales-unsaved-close-retain-1031.png；两侧遮罩点击均未关闭的图为 demo-sales-unsaved-mask-1031.png / qa-sales-unsaved-mask-1031.png。此前登录失效过程保留，不代表首次关闭当时已验证成功。仅限新单备注状态，未保存。
- O-A02 销售新单提示 Tab：两侧同为备注已填、无商品的未保存单，从提示初始关闭按钮焦点按一次 Tab，均到继续录单；Esc关闭并保留备注。图 demo-sales-unsaved-tab-1031.png / qa-sales-unsaved-tab-1031.png。仅覆盖一次 Tab，不代表完整焦点循环或整页通过；未执行放弃。
- O-A02 销货新单提示逆向焦点：两侧关闭按钮初始焦点按 Shift+Tab，均转浏览器地址栏而提示仍打开；点击关闭后备注均保留。图 demo-sales-unsaved-shift-tab-1031.png / qa-sales-unsaved-shift-tab-1031.png。此为同浏览器环境下观察，不是 Demo 与 QA 差异，也不能证明完整键盘无障碍；未保存或放弃。
- O-I05 显示设置重载配对：独立空白待查询页两侧启用季节、关闭设置、重载并等待加载后再打开，Demo季节保持勾选，normal34恢复关闭；截图 demo-inventory-settings-reload-1031.png / qa-inventory-settings-reload-1031.png。Demo原版型开、QA关，仅比较季节；Demo季节已恢复本轮开始时的关闭，原版型保持。固定源码 page.tsx:30,51 以 defaults 初始化页面状态，登记 N34-I05-SETTINGS-RELOAD-01；其他选项、已查询状态及账号范围未验。矩阵 DIFFERENCE 63、PARTIAL 28、NOT_RUN 14；整页通过仍0。
- O-I05 源码补充：冻结 b8bcfe3 inventory-workbench.js:6,109–110 加载并保存浏览器显示偏好；固定 QA page.tsx:30,51 以默认值初始化页面状态。该源码对应本轮季节重载差异，但未读取浏览器存储，也不证明其他账号或选项。阶段汇总数字同步至63/28/14，历史逐项快照保留。
- P15 颜色分页负数输入：两侧颜色页无搜索、20条/页、182条、第一页，输入 -1 后确认控件值并点击跳转，均留第一页且输入仍显示 -1。配图 demo-color-negative-jump-1031.png / qa-color-negative-jump-1031.png。只覆盖该负数路径，既有99越界差异和维护未接入仍开放，整页未通过。
- O-I05 索引同步：执行清单由局部改有差异，未完成索引改为已配对空白季节重载、保留其他场景待核；旧历史快照不倒改。矩阵105项证据图片路径存在性抽查无缺失，此不证明证据足以完成全站验收。
- P16 尺码内容搜索：两侧尺码组各有包含40的尺码，但名称搜索框输入40后均显示无匹配、0条；图 demo-size-search-contained-1031.png / qa-size-search-contained-1031.png。QA截图存在浏览器自动填充建议，仅比较结果，不作同态视觉判定；未选建议或修改资料。仅覆盖该查询词，列宽及其他未验范围仍开放。
- 原问题映射同步：与当前矩阵逐项核对，更新 2 项 currentPageMatrix 状态、动作和证据；无未映射结果。历史快照和原问题未关闭结论不改；此为记录一致性整理，不是新页面检查。
- S01 销货倒序日期有数据补验：两侧全部筛选且已有结果，日历选开始2026-10-20、结束10-10并查询。Demo提示“开始日期不能晚于结束日期”，QA提示“请检查查询条件和日期。”；两侧日期与此前列表仍显示。样本不同仅比较提示与保留，配图 demo-sales-reversed-date-1031.png / qa-sales-reversed-date-1031.png，合并既有 N34-S02-DATE-ORDER-01。未写单据。
- S01 倒序纠正补验：两侧将结束日期由 2026-10-10 改为 2026-10-20，再查询；均保留 10-20 至 10-20，先前错误提示消失并更新结果。Demo 无匹配记录，QA 合成数据有 1 张，数据不同不比较数量。配对截图 demo-sales-corrected-date-1031.png / qa-sales-corrected-date-1031.png；既有 N34-S02-DATE-ORDER-01 文案差异仍未关闭，不代表整页通过。
- O-P07 关闭方式补查进行中：normal34 在条码方案列表打开“2020年新方案”，焦点位于关闭按钮时按 Esc，弹窗关闭。Demo 同名方案已打开，但按 Esc 时浏览器报告用户切换操作，重新读取时弹窗仍开；该动作是否被发送不确定，不能判断 Demo Esc 行为，保留待配对。两侧方案规则与数据不同，不据此判断正式业务规则。
- O-P07 接续：Demo 与 normal34 的“2020年新方案”详情在关闭按钮焦点下按 Esc 均关闭并返回列表；配对截图 demo-barcode-escape-1031.png / qa-barcode-escape-1031.png。两侧方案数据不同，仅核关闭动作；此前中断不确定的 Demo 操作已重新完成。既有展示差异及整项未完成状态不变。
- P16 商品设置尺码组：Demo 和 normal34 均输入前后各一空格的“ 男装 ”，两侧无匹配、0条；无空格此前两侧均为2组。截图 demo-size-whitespace-1031.png / qa-size-whitespace-1031.png；只覆盖此筛选，不将基础设置其他搜索控件的空格差异合并为同根因。另检查 105 项矩阵中所引用证据文件，均存在；存在不代表内容或覆盖已通过。
- P16 搜索后页签返回：Demo 与 normal34 均在尺码组搜索男装得到2条，切到版型再返回尺码组，搜索框清空且恢复6组。截图 demo-size-tab-search-return-1031.png / qa-size-tab-search-return-1031.png；仅此路径一致，P16 原有列宽及页大小保留差异仍未关闭。
- 覆盖映射一致性核对：发现 USER-UI-DATES 的 S01 映射未同步最近配对结果；已把倒序后纠正日期的证据补入 PAGE-MATRIX.json 并同步映射，未改变问题状态或通过数。
- T02 负责人补证：两侧同日空白新单，Demo“创建者”可打开人员候选并Esc关闭；normal34对应区域是只读“负责人 —”。截图 demo-transfer-creator-options-1031.png / qa-transfer-creator-options-1031.png，补入 N34-T02-RESPONSIBLE-01。Demo创建者与用户要求可选择的负责人不是同一业务身份；未选择人员或保存。
- O-T01 未选仓搜索：空白新增调拨单两侧搜索调出仓 ZZZ987，均显示暂无数据；Esc均关闭候选、清除搜索文字并保持未选。配图 demo-transfer-warehouse-empty-search-1031.png / qa-transfer-warehouse-empty-search-1031.png。已选仓的候选过滤差异仍未关闭，仅确认未选状态路径。
- O-T02 未匹配商品 Esc 后重新聚焦：两侧搜索 ZZZ-NOMATCH-1031、Esc、点击备注再回商品输入，均保留输入；Demo候选未重开，normal34自动重开无匹配列表。登记 N34-T02-REFOCUS-01，截图 demo-transfer-product-refocus-1031.png / qa-transfer-product-refocus-1031.png；原因待查，未选择或保存商品。
- N34-T02-REFOCUS-01 源码溯源：冻结 Demo transfer-matrix-experiment.js:145,150 仅未选商品且搜索词为空时 focusin 打开；product-finder.js:13,21 Esc 关闭。固定 2357cf5 transfer-proposal-form.tsx:42,56 未选商品时 onFocus 按当前词打开。对应本次运行差异；Enter 不同为同一控件的另一分支，不自动合并根因。
- N34-T02-REFOCUS-01 影响范围初查：固定 2357cf5 销货 proposal-form.tsx:48 的新行及改选输入也在 onFocus 打开候选，但组件与调拨实现不同。销货同态焦点路径尚无双侧实操，先记待验证，不与 O-S03 既有 Esc 差异合并。
- O-T02 补充候选关闭后方向下：两侧保留无匹配搜索、输入焦点在商品框；按方向下 Demo保持关闭，QA重新打开无匹配候选。配图 demo-transfer-search-down-closed-1031.png / qa-transfer-search-down-closed-1031.png，归同一候选重开问题；焦点和按键为不同分支。未保存单据。
- 未完成索引状态纠正：O-I05 因重载设置差异在矩阵已为 DIFFERENCE，索引仍放局部检查；已移至存在差异，索引计数同步为差异63、局部28、未检查14，不改变原始检查结论。
- 原问题映射核验：14条原问题的 mappedItems 及 issueIds 均指向现有矩阵项/问题记录；负责人映射补入本轮空白新单配对证据。引用存在不等于相关状态全部已验证。商品信息分类统计继续以 N34-LIST-SUMMARY-SEMANTICS-01 中页面、摘要合同、样本及历史未知分别记录。
- O-T02 点击其他字段：两侧调拨空白行输入 ZZZ-NOMATCH-1031X、出现无匹配候选后点击备注，候选均关闭、输入保留。截图 demo-transfer-search-blur-1031.png / qa-transfer-search-blur-1031.png；备注触发浏览器自动填充，两图仅用于操作状态，不比较遮挡区域视觉。单据未保存。
- 接续断点：normal34 当前调拨测试草稿包含本轮无匹配搜索词；点击新增销货入口出现离开确认，已选择继续编辑，搜索词仍在。为保留草稿未执行放弃，销货后续使用既有适当对照页继续，不将单侧提示记为配对。
- O-S03 销售找货重新聚焦：沿已有 QA-ESC-TEST 未保存草稿，两侧销售、各自已选厅、无匹配 ZZZ-REFOCUS。Demo Esc关闭，QA Esc不关闭（既有差异）；均点备注再返回商品输入，均重开无匹配候选并保留文字。图 demo-sales-refocus-1031.png / qa-sales-refocus-1031.png；厅和资料不同，不外推退换或真实业务，未保存。
- O-S03 销售无匹配输入 Tab：两侧输入框及候选打开时按Tab，Demo关闭候选且焦点到浏览器地址栏；QA焦点进入额外空录入行并打开候选，原词保留。截图 demo-sales-search-tab-1031.png / qa-sales-search-tab-1031.png；作为 N34-S03-SEARCH-DRAFT-01 的额外空行影响，不另拆根因。两侧厅不同，未保存。
- N34-S03-SEARCH-DRAFT-01 源码追溯：固定 2357cf5 sales-proposal.ts:257–279 将非空查询视为已占用行、补空行；:553–561 对有查询无商品的条目返回 null pricingLines。与当前额外行/横线现象一致；Tab进入额外行是实际观察。未知金额与正式保存校验不得简单改为零；Esc另按 N34-S03-SEARCH-ESC-01。
- O-S14 未完成搜索切换风险：两侧销售草稿仅有本轮无匹配商品词及测试备注，切退换后均无确认、搜索词消失，备注保留。原以为可能出现确认，实际直接切换并清除本轮测试词；未保存。图 demo-sales-type-unselected-query-switch-1031.png / qa-sales-type-unselected-query-switch-1031.png；Demo也如此，但用户要求关注静默清空，是否需要保留/确认标为待裁决，不自动归通过。
- N34-S14-UNSELECTED-QUERY-LOSS-01 溯源：Demo sales-current.js:119 仅 doc.lines 非空才确认，应用清空 entries；固定 2357cf5 proposal-form.tsx:59 仅有 lines 或已选 entry.product 才确认，sales-proposal.ts:175–199 切换保留已选商品并重建空行。与未选搜索词无确认消失的实操一致；切换分支涉及付款/优惠重置，已有付款情况本轮未实测，不外推。
- O-S03 退换未匹配搜索 Esc：两侧未保存退换草稿输入 ZZZ-RETURN，Demo关闭候选并保留词、退换汇总为零；QA候选未关闭、增加空行且汇总为未知。沿 N34-S03-SEARCH-ESC-01 与 N34-S03-SEARCH-DRAFT-01 记录，不新拆问题。截图 demo-return-search-esc-1031.png / qa-return-search-esc-1031.png；厅与布局不同，不证明真实 SKU/保存。
- S03 未完成退回词切换：QA退回行 ZZZ-RETURN 切到换出时该行不可见，切回后搜索词恢复；对应 N34-S03-HIDDEN-01。Demo该状态为单表、没有同操作入口，参考 demo-return-search-esc-1031.png，候选 qa-return-incomplete-hidden-1031.png / qa-return-incomplete-restored-1031.png；这是候选单侧切换及结构对照，不标双侧同态通过。未保存。
- S03 退换支付方式未选状态：两侧第一笔支付方式搜索 ZZZ-PAY 均无数据；Esc关闭并清除搜索词，原未匹配商品词及测试备注保留。图 demo-return-payment-nomatch-esc-1031.png / qa-return-payment-nomatch-esc-1031.png；样本厅不同，仅核控件操作。原计划逆向切业务类型会清除现有未完成测试输入，未执行；不代表此场景通过。
- O-S10 退换支付方式键盘选择：两侧第一笔搜索现金、方向下+Enter，均选中现金并启用账户；Demo焦点到资金账户，normal34焦点回页面。图 demo-return-payment-key-select-1031.png / qa-return-payment-key-select-1031.png；新增 N34-S10-PAYMENT-KEY-FOCUS-01，来源待核。备注和未匹配商品词保留，未保存。
- N34-S10-PAYMENT-KEY-FOCUS-01 源码线索：冻结 real-data-bridge.mjs:220,226 选择方式后 rerenderFunds(accountId) 聚焦账户；固定 2357cf5 proposal-picker.tsx:14–21 选择成功只调用可选 afterSelect，proposal-form.tsx:62 支付方式引用未传该回调。与本次焦点结果一致，不排除组件其他监听；销售及其他状态待实操。
- O-S10 退换账户键盘选择：Demo搜索10101得单候选，QA账户本身单项；两侧方向下+Enter均选中，Demo焦点至收款金额，QA无障碍状态未报告明确焦点。图 demo-return-account-key-select-1031.png / qa-return-account-key-select-1031.png；后者焦点待补证，未输入金额或保存。
- O-S10 账户选择截图检查：Demo与QA图片均2940×1690；候选截图账户边框可见，但无障碍状态未报告明确焦点，不能凭边框断言焦点归属。图片尺寸不等于视口或缩放一致性证明。当前其他应用前台，未抢占浏览器。
- 问题报告引用核验：递归检查 FINDINGS.json 中独立PNG文件名，均可在当前报告目录找到；该检查只确认引用文件存在，不代表截图均为同态或证明每项验收通过。当前其他应用前台，未抢占浏览器。
- N34-S03-SEARCH-ESC-01 源码补证：固定 2357cf5 proposal-form.tsx:48 的新行与改选商品输入未声明 Esc/Enter/方向键处理，proposal-picker.tsx:29–36 将 Esc/方向键处理放在候选弹层；冻结 product-finder.js:21 对活动锚点处理 Esc、方向键与单项Enter。此与输入焦点实测相符，仍不能排除其他监听或 Arco 行为。
- 交叉引用补漏：12条已登记问题此前未在页面矩阵中以问题ID引用，按已实测页面/弹层补入；N34-I07-LEDGER-ESC-01 为撤销记录，仅留历史，不作为现行问题链接。无新通过或重新判级。
- O-S10 退换资金账户焦点补查：现有 Demo 与 normal34 草稿均保持已选现金及账户，Demo 无障碍树明确显示金额输入框获得焦点；候选重新打开已选账户并按 Enter 后无障碍树未报告明确焦点，随后按一次 Tab 焦点进入金额框。该补查未证明候选 Enter 后的具体焦点位置，不能据此单独断言差异；未输入金额、未保存。候选操作重选的是已有账户；两侧资料不同，结果仅用于键盘焦点范围。
- O-S10 退换收款添加：同一浏览器窗口内，两侧已选现金及各自账户，第一笔金额均显示0.00时点击添加，均增加第二笔空行；Demo焦点移至第二笔支付方式，normal34焦点落在页面。第二笔为空时Demo添加禁用，normal34按钮可点但未发生变化，补入既有 N34-S-PAYMENT-DRAFT-01。候选第一笔金额为空点击无变化，与Demo显示0.00不同态；未据此判断缺陷。两侧厅与账户资料不同、保留现有备注和商品搜索词，未保存；本次无新配对截图，需后补视觉证据。
- O-S10 退换第二笔支付方式取消：两侧首笔现金、各自账户和0.00，第二笔未选时打开支付方式列表、按 Esc，列表均关闭，第二笔保持未选、焦点回页面；首笔及备注、未匹配商品词保持。两侧选项字典不同，不据选项数量判断；未保存，本次无配对截图，不构成视觉通过。
- O-S10 退换第二笔方式改选：两侧首笔现金及账户、金额0.00，第二笔通过方向键最终选择现金；Demo焦点进入第二笔账户，QA焦点回页面。两侧首笔账户与金额、备注和商品搜索词保留，账户均启用；选择过程各暂选过其他方式，故不作为未选直接选现金的独立复验。补充 N34-S10-PAYMENT-KEY-FOCUS-01；未保存，无新配对截图。
- O-A01 退换草稿账号菜单键盘：两侧鼠标打开账号菜单后按Tab，焦点均移至返回列表而菜单仍在；在该焦点按Esc均未关闭菜单。QA多出的本人改密属批准新增，未点击退出或输入密码；未保存，未获得本次配对截图，不能判视觉通过。
- N34-LIST-SUMMARY-SEMANTICS-01 指标补证：固定 2357cf5 sales-query-reader.ts:392–400 的单据数量指标与商品预览分开，按非赠品汇总带符号数量，赠品标志未知则返回null，同时区分负数入和正数出；该指标没有按分类或单位分组，不能直接作为Demo分类明细，也不能把未知当0。源码追溯不代表实际接口响应或线上验证。
- O-C01 退换单日期：两侧日期同为2026-10-29，点击输入框均打开2026年10月日历；日期输入框焦点按Esc后均仍打开，点击备注均关闭，原日期和备注保留。未选择新日期、未保存；本次无配对截图，视觉与其他焦点的关闭行为仍待核。
- O-C01 退换日期选择：两侧2026-10-29的日期控件中选择2026-10-28，均更新显示并关闭日历；两侧首笔现金及账户、0.00、第二笔现金、备注与商品搜索词保留。只改未保存草稿；未检查重新打开时选中态，未保存，本次无配对截图。
- O-C01 退换日期重新打开：相同窗口和两侧2026-10-28草稿中重新打开日历，两侧均显示2026年10月、28日蓝色选中和29日蓝点；同屏观察Demo日期框右侧日历图标、QA为清除叉号，未操作清除，是否为焦点/悬停状态及可清除差异需补查。两个画面已在本会话查看但未保存成报告目录配对截图，不能据此认定完整视觉通过。
- N34-S03-DATE-CLEAR-01：冻结 transfer-date.jsx:69 单据日期禁止清除；固定 2357cf5 proposal-form.tsx:58 单据日期标必填但未传 required，source-controls.tsx:16–23 因此允许清除。调拨详情传 required，列表筛选可清除不能一并禁用。清除操作、其他页面运行影响及配对截图待补。
- N34-S03-DATE-CLEAR-01 影响范围溯源：固定源码 history-page.tsx:42 可编辑历史销货草稿同样未传required；调拨新单、历史及详情分别在 transfer-proposal-form.tsx:58、transfers-history-page.tsx:44、transfers-view.tsx:14 传required。历史销货页面未实测，不记已复现。候选叉号点击尝试后日期仍为10月28日，未证明成功清除；其他草稿内容保持。
- 清单引用修正：N34-S03-DATE-CLEAR-01 关联销货新单 S03 与公共日期 O-C01，使用现有 relatedIssueIds 字段；清单状态和整页通过数不变。
- O-S01 退换未选客户搜索取消：两侧搜索 ZZZ-CUSTOMER-1031 均显示暂无数据；Esc后关闭、搜索词清除、客户仍未选，原备注、商品词及两笔收款保留。Demo焦点回客户按钮，QA焦点回页面；此为实操观察，后续Tab路径及共同原因待核，不混同其他控件根因。两侧厅与数据不同，未保存，无新增配对截图。
- O-S01 客户搜索取消后续Tab：上述无匹配Esc后，Demo从客户按钮按Tab进入出库仓，QA从页面焦点按Tab也进入出库仓输入；不将焦点返回差异直接推断成Tab路径中断。两侧出库仓选择状态不同，仅对焦点路径；未保存、无新增配对截图。
- N34-S01-CUSTOMER-RECOMMENDATION-01：本轮退换未选客户时Demo候选展示推荐客户和选用，QA不同合成厅候选未观察到推荐；固定源码 proposal-form.tsx:37 只给营业员传推荐ID，proposal-picker.tsx:15–22 非账户推荐依赖该ID。未确认QA厅默认客户配置和运行推荐数据，保持待验证风险，不断言功能缺失；无新配对截图。
- N34-S01-CUSTOMER-RECOMMENDATION-01 样例补证：固定 qa-reference-fixtures.ts:1702–1704 网点营业厅定义默认零售客户；:1715–1716 销货营业厅候选只构造厅ID/名称，未携带默认客户。与候选页面未见推荐相符，但尚无当前请求响应或正式数据证据，保持待验证风险。
- O-S01 推荐客户选择：Demo点击推荐区选用后显示新东方中岛XM；QA无推荐按钮，普通列表选择样例默认零售客户，两侧原备注、商品词及两笔收款保留。路径与客户资料不同，不记同操作通过。重要修正：Demo选用客户触发更新后也出现未匹配商品词下的额外空录入行，N34-S03-SEARCH-DRAFT-01 原单行比较仅限先前输入/Esc时点，不能推广所有状态；汇总未知合同仍保留。未保存，无新配对截图。
- 调拨对照断点检查：现有 normal34 调拨标签仍有未保存搜索词 ZZZ-NOMATCH-1031X；另一个既有 Demo 调拨标签地址为 #transfer/new，但当前页面内容为空、无页面无障碍树。此前该标签存在测试草稿，未刷新或重新导航，避免丢失输入；本次未形成调拨配对，原因未知，不能归因于登录、服务或产品缺陷。销货对照标签保留。
- N34-S03-SEARCH-DRAFT-01 Demo源码补证：冻结 sales-current.js:277 entries() 找不到无行ID、无替换ID且无查询词的空条目时追加，:282 重绘时调用 lineTable；支持选客户更新后增加空行的观察。当前可确认差异是此前输入时点及Tab路径，不能概括为Demo始终只有一行；其他触发路径未全核。
- N34-S01-CUSTOMER-RECOMMENDATION-01 合同补证：固定 http-reader.ts:13–16,30–44 严格校验候选页及引用字段，推荐可用状态仅账户候选接受；若将来补客户推荐，不能仅往现响应增加字段，需同步合同与读取兼容。仅源码约束，不代表当前响应错误或已修。
- N34-S01-CUSTOMER-RECOMMENDATION-01 复用已有运行证据：candidate34-halls-list.png 实际显示网点营业厅默认零售客户“零售客户”，与本轮销货所选厅一致。结合QA候选未见推荐区和Demo推荐选用，已观察配置及入口差异；截图未证明接口响应和正式环境，当前配对截图仍缺。

- N34-S01-CUSTOMER-RECOMMENDATION-01 补配对截图引用：复核已有 demo-sales-customer-open-1029.png / normal34-sales-customer-open-1029.png，均为销售草稿、客户未选与候选打开，前者有推荐及选用、后者普通列表；营业厅、商品、金额不同，不能比较具体数据；图片尺寸一致不单独证明视口缩放。与 candidate34-halls-list.png 配合仅佐证候选设置显示，退换本轮仍无新截图。

- 日期证据索引核对：已有日历图片多为调拨或列表日期，不能冒充本次销货退换必填日期配对图；保持本项截图待补。阶段汇总首段同步78条问题记录（含2条撤销/撤回）、两项新增及空行结论限定，矩阵105项和整页通过0不变。

- N34-T02-RESELECT-SKU-01 修复边界补证：固定 transfer-proposal.ts:273 保留未解析尺码并阻止改选，:282–284 取消恢复待录状态，:220–228 校验商品和尺码组一致；这些身份及输入保护须保留，不能仅删一致性检查消除报错。源码范围不代替运行对象验证。

- N34-T02-RESELECT-SKU-01 跨表单合同边界：固定 sales-proposal.ts:453–461 明确要求当前商品的尺码组元数据，不能靠已有SKU、默认组或全局字典补缺；:474–476 要求字典实际存在该组。调拨修复需核可信当前商品来源和正式合同，不假设可从扫码SKU自动推断。相同报错名称不证明销货存在同一故障。

- 现行问题图片引用核对：按 screenshot/screenshots/evidence/pairedEvidence 四种现有字段统计，排除2条撤销/撤回后，仅 N34-S03-DATE-CLEAR-01 尚无报告内图片引用；颜色越界问题使用 screenshots 字段已有两侧图。字段有图不代表同态、完整或有效，日期图仍待实际补采。

- 原问题覆盖表同步：将账户菜单、日期/多选、收款四处旧矩阵快照更新到当前 PAGE-MATRIX 对应记录，包括本轮日期待验问题；原历史快照保留，未修改整页通过状态。

- O-S01 已选客户搜索索引补正：已有销售草稿实操记录将原客户未被搜索过滤归 N34-S10-ACCOUNT-SEARCH-01，矩阵此前只有推荐问题ID；现补关联既有问题，不改变原结论或宣称退换同态已验证。

- N34-S10-ACCOUNT-SEARCH-01 同类源码边界：客户和账户均使用 ProposalReference；固定 proposal-picker.tsx:16–22 若已选项不在返回items，会补入候选并在非推荐分组禁用。未抓响应、未验证该项实际可否选，观察到“仍显示”不等于服务端返回或可选。

- N34-S01-CUSTOMER-RECOMMENDATION-01 Demo规则补证：冻结 sales-current.js:354–356 当前厅先尝试推荐，只有启用且具有客户用途才可用，否则回退符合资格的默认客户；推荐入口不代表自动选择。需保留正式权限、身份及新裁决，不能无条件显示或自动选择。

- O-S09 覆盖修正：本轮已实际在退换新单两笔收款的行内控件选择方式和账户，未观察到旧账户弹窗入口；补入矩阵，但该局部观察不能证明编辑或其他状态没有动态入口，仍保持未实操旧弹窗。

- 现有Chrome只读状态：当前可见另一个 8877/#sales/new 标签显示未保存空单、业务类型请选择，日期2026-10-29；这不是此前保留备注与两笔收款的退换对照状态。仅查看未操作，不推断先前标签被清除或将此空单与候选退换配对；后续需重新确认目标标签。

- 问题复验条件补全：日期清除、客户推荐及销货／调拨分类摘要分别增加受影响状态、身份／未知值和合同边界；只是后续最小复验建议，没有执行修复或宣称通过。

- N34-I01-SUPPLIER-EMPTY-01 源码细化：固定 candidates.tsx:120 虽配置没有匹配提示，treeData始终含全部节点且本地过滤恒真；该结构可解释0项仍显示全部节点而未出现提示，但未验证组件内部状态，保留为推断。销货使用另一控件，不据相似现象断定同根因。

- N34-I01-SUPPLIER-EMPTY-01 销货同类表现单独溯源：固定 documents/source-controls.tsx:32–37 的 SourceMulti 合并已选并加入全部节点，无正常0条专门提示；:39–46 失败提示仅针对请求错误。与库存CandidateSelect是不同实现，未抓搜索响应，不合并源码根因。

- N34-I02-EMPTY-TAG-01 同类范围补证：复核现有 demo34-products-list.png / candidate34-products-list.png，商品列表初始全部分类、年份、季节标签旁未见库存截图中的白色空块；这是截图可见范围，数据量不同，未核打开关闭后和DOM，不外推其他状态。

- O-I10/O-P02 图片样例限制定位：固定 qa-reference-fixtures.ts:1781 明确该QA参考路由返回空 images。其与此前空图片页观察一致，仅说明该合成路径无法形成有图放大对照；不代表正式接口无图，运行响应未抓取。

- O-T04 样例范围补证：固定 qa-reference-fixtures.ts:1820–1827 的预置调拨三行分别来自不同商品，历史样例映射同一批行，不能用于同商品同展示尺码的多个历史身份对照；仅限定这一合成生成路径，不排除其他数据源。该弹层仍未实操。

- QA样例组成：固定 qa-reference-fixtures.ts:1808–1809、1820–1827 分别定义24张销货、24张调拨与每类6张历史样例。只能解释该参考样例路径的30条组成，不能把数量当作所有场景、真实业务或运行请求成功的证明。

- 2026-10-29 接续日历 Esc：现有 Chrome 狄兰窗口分别在 Demo 8877 和 normal34 57923 的新增销货单退货/换货未保存草稿中打开日期（均为 2026-10-28），各按一次 Esc；两侧日历的无障碍树均未变化，日期及备注 QA-ESC-TEST、商品搜索词 ZZZ-RETURN 保留。仅证明该焦点和状态下 Esc 未关闭，不代表所有日历键盘操作；未生成配对截图，清除按钮实际效果仍待验证。Demo 未保存或审核。两侧厅、客户及收款账户样例不同。

- 2026-10-29 收款空行补查：同为新增退货/换货、第二笔现金方式已选但资金账户及金额未填，Demo 的添加为禁用并提示先填写有效金额；normal34 无障碍树显示添加可操作，点击后未新增第三行，当前截图未见提示，备注及商品搜索词保留。两侧账户数据不同，瞬时反馈是否存在尚未确认；不据此推断保存或资金规则。日期清除图标再次尝试后日期未变，未证明实际点中，清除行为仍待核。

- 2026-10-29 收款半填添加对照：新增退货/换货、第二笔方式均选现金、账户未选，分别输入金额 5 后点击添加。Demo 保留第二笔 5.00、账户空，并新增第三笔空行；normal34 保留第二笔 5、账户空，未新增第三行。两侧备注 QA-ESC-TEST 和商品搜索词 ZZZ-RETURN 未清除；数据和账户不同、实际保存未测，QA 是否短暂提示未知。本次为未保存状态，未操作审核或保存。与已有收款问题合并，待配对截图及源码定位，不能以此宣称整页通过。

- 收款半填添加源码定位：normal34 固定提交 2357cf5 的 apps/web/src/current-form/sales-proposal.ts:351–355 在新增收款行前要求所有现有行均有方式、匹配账户及格式有效金额；第二笔缺账户会返回 false，与本次 QA 未新增行的观察相符。该源码规则不证明真实业务保存行为，也不能据此认定应放宽正式账户校验；应结合最新业务合同评估录入和保存边界。当前工作树有后续改动，未作为 normal34 运行证据。

- 收款半填后补选账户：在上一条未保存退换货草稿中，Demo 为第二笔选择现金账户后保留 5.00，已有第三笔；normal34 为第二笔选择现金测试账户后保留 5，再点击添加出现第三笔。两侧账户样例不同；Demo 选账户后焦点到第二笔金额，QA 无障碍输出仅显示选中文本，焦点差异不能据此断定。第三笔初始金额 Demo 为 0.00、QA 为空，属当前实测状态，须结合未知金额合同，不直接建议补零。未保存或审核，配对截图待补。

- 第三笔支付方式键盘对照：同一新增退换货草稿已有两笔现金、第三笔空方式。两侧打开第三笔方式，按 Down 两次及 Enter 均选中微信并启用资金账户；Demo 焦点转到第三笔资金账户，normal34 的无障碍焦点回到 HTML 内容。两侧第二笔 5、备注和商品搜索词保留；列表次序及账户字典不同。归入已有 N34-S10-PAYMENT-KEY-FOCUS-01，同状态重复佐证，不增加同根因问题；配对截图待补。

- 第三笔微信账户候选与 Esc：同为新增退换货、第三笔已选微信且账户未选，Demo 打开微信账户列表显示4个可见候选，normal34 显示微信测试账户；字典不同不能据数量判缺陷。两侧按 Esc 均关闭账户列表、未选择账户，焦点回到页面内容；第二笔金额5和备注、商品搜索词保留。未保存或审核；该状态的配对截图待补。

- 第三笔微信改现金：两侧先各选微信账户，再通过键盘切到现金；两侧均清除第三笔原微信账户，保留第二笔5及备注和商品搜索词。Demo 原第三笔金额0.00仍为0.00；normal34 原金额空仍为空，初始值不相同，不能据此比较同值金额保留。Demo 焦点落第三笔账户，QA落页面内容，归已有 N34-S10-PAYMENT-KEY-FOCUS-01。未保存或审核，配对截图待补。

- 商品设置尺码组补查：复用空白 Demo 标签及新开一个 normal34 对照标签（原候选单据和商品标签均有未保存输入，未离开或清理）；两侧从颜色切至尺码组，均显示6组，相同的鞋码38–44；输入“鞋码”即时筛为1条且尺码一致。候选出现Chrome自动填充建议，属于浏览器界面，不能判为应用差异。仅覆盖该查询和页签，视觉截图及其他搜索、分页状态仍待核。

- 尺码组搜索补查：两侧搜索 ZZZNOSIZE 均显示“没有匹配的数据”和0条；从尺码组切到版型再切回，两侧均清空搜索并恢复6组。版型页 Demo 的新增和编辑可用，normal34 明示入口维护未接通且禁用，沿已有接入缺口记录，不推断正式接口。仅检该切换，清除按钮及配对截图尚未补。

- 尺码组每页条数：同一未筛选6条状态，两侧下拉均有20/50/100条，键盘Down与Enter均切至50条、仍显示6条；样本不足以验证跨页。Demo 输入无匹配词后尝试全选退格，实际只减少一个字符，未完成清除，原因未明；候选同操作待配对，不能记为清除通过或缺陷。

- 尺码组清空补查：两侧在50条/页、无匹配词 ZZZNOSI 时通过无障碍设置清空搜索，均恢复6条、保留50条/页。该方法不是鼠标清除按钮或全选退格的验证；Demo 上次键盘全选退格仅少一字符的现象仍待独立复现，不能推断用户键盘一定异常。

- 商品设置版型补查：两侧从尺码组进入版型后每页均回到20条；搜索编码 B 均显示 B版（宽松）1条。Demo 打开该行编辑弹窗显示名称、代码、删除、取消、确定，点击取消后搜索 B 与结果保留；normal34 对应编辑禁用并提示维护未接通，弹窗无法配对，归已有接入缺口。Demo 未点删除或确定；配对截图待补。

- 商品设置季节补查：两侧从版型切至季节后搜索框清空、每页20条；Demo 数据为春夏秋冬4项，搜索“春”返回1项；normal34 为春季、夏季、秋季、冬季、春夏、秋冬6项，搜索“春”返回春季及春夏2项。属于已有 N33-FIXTURE-SEASON-01 的样例字典差异，不能因数量不同断定过滤缺陷；商品季节多选的用户裁决不变。配对截图、无结果/清除及其他状态待补。

- 更正本轮尺码组清除描述：矩阵P16已有2026-10-28两侧鼠标清除叉、搜索男装后恢复6组的同版本证据，直接复用；本轮 ZZZNOSI 的键盘尝试未完成，不推翻已通过的鼠标清除范围。本轮春/尺码组若与旧同版本证据重叠，不另视作新覆盖；B版型取消操作补入P17矩阵，整页状态不变。

- O-P11 分类删除确认样例查找：normal34 当前分类资料显示商品数量未知、删除分类禁用，提示维护未接通；Demo 查看中裤37款、卫衣28款、辅料及其他13款，均下级0，未找到零商品样本。未点击删除，也未打开确认；仅上述样本不足，不能推断没有空分类或正式接口状态。继续保留该项未完成。

- 截图索引核查：FINDINGS.json 的两项曾把“配对截图待补”文字混入截图文件列表，其中一项被拆成单字；已移至 screenshotNote，原有实际截图文件名保留。文件存在只证明索引可找到，未逐图核同态，不将待补截图记为已具备。

- FINDINGS.json 截图索引补全：12 项此前结构化记录无截图引用，但阶段问题索引列有同名现存文件；按原问题段落补入引用，保留原文对状态不匹配、单侧及样例不同的限定。文件存在不代表已完成配对验收。仍无文件引用的条目及近期未归档截图须另补。

- 去重纠正：近期新增 N34-T01-WAREHOUSE-KEYBOARD-OPEN-01 与原 N34-T01-WAREHOUSE-KEY-CLOSE-01 为同一仓库键盘关闭现象，已并入原问题，不增加问题数；复用原先两侧截图，近期第二候选复现本身未归档截图。

- 接续时确认现有 Chrome 中 Demo 8877 新增调拨已登录，保留两款各 1 件；normal34 57923 新增调拨显示 M26001 三个尺码分别 3、2、1，合计 1 款 6 件。当前两侧商品与数量不同，只确认草稿可见，未执行新的同态操作、未生成截图或更改草稿；不能以此当作配对验收。PAGE-MATRIX.json 与 FINDINGS.json 均通过 JSON 格式读取。

- O-I01 上箭头补查：新开只读库存对照标签，均为未查询、未选商品。Demo 搜索 CS，首项资料显示后按 Up，资料变为 CS1832706，候选列表同时继续追加；按 Enter 最终选中 CS0015531175。normal34 搜索 M26 得两项，按 Up 后截图显示 M26004 高亮，资料仍为 M26001；Enter 选中 M26004。两侧候选数不同、Demo 异步追加，不能据此断言 Demo 稳定的边界选择规则；候选预览不跟随高亮与既有 N34-I01-PREVIEW-KEYBOARD-01 一致。此轮图片仅工具画面未归档，旧配图仍有状态差异；选择行为会更新最近搜索，未执行库存查询或业务写入。

- O-I01 对上次异步限制补核：两侧清除本次测试选项后，各自稳定显示两项候选（Demo CS0102181/2；normal34 M26001/4），按 Up 均高亮第二项，Demo 预览同步第二项、normal34 仍预览第一项；Enter 均选择第二项。与 FINDINGS N34-I01-PREVIEW-KEYBOARD-01 中既有稳定两项证据范围重复，不新增问题或覆盖数量；本次工具画面未归档。此前 Demo 多候选追加期间回车选第一项仍只限当时状态。

- O-I03 仓库多选搜索后键盘补查：两侧库存待查询、全部仓库标签清除后显示已选0；Demo 输入丁桥、normal34 输入温州，均显示匹配1项及全部仓库。焦点均在搜索框，依次按 Down、Enter，两个下拉保持打开，匹配项未勾选、已选仍为0。仓库及商品样例不同，仅限此搜索框焦点和操作，不代表其他键盘操作或查询通过；此轮画面未归档，未查询。AX 曾在清除后保留旧组合框名称，但实际下拉计数及勾选状态均为0。

- O-I03 键盘空格：两侧已选0并搜索唯一仓库，搜索框依次 Tab 到列表、全部仓库复选框、匹配仓库复选框，确认焦点后按空格。Demo 丁桥店XM仓库选中、已选1且搜索清空；normal34 温州仓搜索清空、列表恢复4项但已选0且温州仓未勾选。单次配对观察，商品和仓库样例不同，未查询；截图仅工具画面未归档。登记 N34-I03-KEYBOARD-SPACE-01 待验证风险；固定源码 candidates.tsx:110–123 有异步 onChange/清空输入，但未抓事件、不能认定根因。

- N34-I03-KEYBOARD-SPACE-01 补核：normal34 以粘贴输入温州、唯一候选出现后依次Tab至该复选框按空格，再次清空输入并显示已选0；此前由无障碍设值带来的疑虑未解释此复现。随后尝试鼠标对照时界面计数显示匹配1但候选行未显示，未完成鼠标对照，原因未知；本次画面未归档。

- N34-I03-KEYBOARD-SPACE-01 鼠标补查：候选清除仓库搜索词，四仓均显示且已选0时，用鼠标点击温州仓复选框，显示已选1并勾选温州仓。此为无搜索词状态，不能作为搜索唯一项的鼠标对照；未查询，画面未归档。

- N34-I03-KEYBOARD-SPACE-01 范围修正：两侧已选0并以无障碍设值搜索唯一仓库后，鼠标点击匹配项复选框；Demo选中丁桥仓、已选1，normal34搜索清空、温州仓仍未选、已选0。此前QA未搜索列表鼠标选择成功；当前差异不限键盘，搜索后选择链路待进一步定位。两侧商品和仓库不同，未查询；配对截图待归档。

- N34-I03-KEYBOARD-SPACE-01 固定源码边界：inventory/candidates.tsx:108–116 将当前候选及选择事件传入 resolveFilterSelection，结果返回后清空输入；filter-selection.ts:15–27 按 trigger/checked 或 next 分支解析，并依据当前候选和已有选择映射。未捕获事件参数、候选快照或请求结果，不能认定哪一分支导致现象。已有分类搜索问题涉及不同状态，暂不因表象合并为同一根因。

- N34-I03-KEYBOARD-SPACE-01 截图补档：demo-inventory-warehouse-search-result.png 与 qa-inventory-warehouse-search-result.png 保存鼠标选择后的现存画面；前者已选1，后者已选0。两侧商品、仓库、焦点和条件提示不同；同Chrome窗口不等于已测实际视口和缩放。未保存操作前候选画面，不能将其作为完整复现步骤截图。

- N34-I03-KEYBOARD-SPACE-01 操作前补图：demo-inventory-warehouse-search-before.png 与 qa-inventory-warehouse-search-before.png 均显示各自唯一匹配、已选0；通过无障碍设值。与前次结果图分不同轮次，商品与仓库不同；未测视口缩放，不当成连续截图或整页验收。

- 去重纠正：仓库 N34-I03-KEYBOARD-SPACE-01 与已有 N34-I04-FIT-SEARCH-TOGGLE-01 均为库存 CandidateSelect 搜索后勾选未保留，合并至后者；仓库从未选添加、原版型/季节/供应商主要为取消，分别保留各自实测与截图限制。共用组件已核，具体运行根因仍未知；旧ID保留历史，不新增独立问题。

- P19/O-P07 2021年版型方案：两侧列表分别打开同名方案，关闭按钮焦点按Esc均关闭。Demo显示存货默认条码原值、随默认长度；normal34合成方案显示货号7位、版型1位和14位。方案同名不证明资料身份一致，沿既有 N33-P19-DETAIL-01/N33-FIXTURE-BARCODE-01，不推断正式规则。截图 demo-scheme-fit-2021.png / qa-scheme-fit-2021.png；未独立测量实际视口缩放，未修改资料。

- B03 客户编码与全部状态：Demo选择客户标签及全部状态、搜索AC-06-0000；normal34客户页签、全部状态、搜索DEMO-C02；两侧查询均返回对应正常记录1条。两侧编码和资料不同，Demo记录兼具客户供应商标签，QA按批准裁决分开；仅证明本组合可检索，不验证停用记录或正式业务。配图 demo-customer-code-all.png / qa-customer-code-all.png，同窗口但实际视口和缩放未独立测量；未修改资料。

- B03 客户编码与已停用组合：沿上一轮各自命中的正常客户编码和客户范围，从全部切到已停用并查询；两侧编码保留、均显示暂无符合条件的数据、0条。查询项本为正常记录，且候选无停用样例，不能证明停用记录实际筛选准确；资料不同。截图 demo-customer-code-disabled.png / qa-customer-code-disabled.png，未单独测量视口或缩放；未改资料。

- B03 已批准拆分页签状态：normal34 客户已停用、DEMO-C02及0条结果下切换供应商，显示独立正常状态、空搜索及3条；切回客户后原编码、已停用和0条结果保留。图 qa-party-return-customer.png。Demo为标签多选，不具等价页签，不能宣称配对通过或差异缺陷；仅本合成预览，未修改资料。

- B03 页签状态补充：normal34供应商页输入DEMO-GYS01查询1项，切客户确认DEMO-C02、已停用、0项仍在，再切供应商仍保留DEMO-GYS01、正常和1项。图 qa-party-return-supplier.png 与 qa-party-return-customer.png；Demo没有等价拆分页签，不作为双侧通过。仅合成预览、未修改资料。

- O-P11 分类删除确认补图：Demo选择皮革服装/真皮皮衣（0款、0下级）打开确认并取消，分类仍在；normal34同名分类下级0、商品数量未知，删除禁用。图 demo-category-zero-delete-confirm.png / qa-category-zero-delete-disabled.png，前者确认弹窗、后者禁用入口，非同状态弹窗配对；未删除。O-B07 复用已有离职确认及候选禁用图，纠正未完成索引过期的截图待补描述。

- P14 选中子分类时父节点折叠/展开：两侧均选真皮皮衣后鼠标点击皮革服装的展开按钮，子节点消失，再次点击后恢复；右侧分类路径始终为皮革服装/真皮皮衣。Demo商品数0款、QA未知且维护禁用，不对比业务数量。配图 demo/qa-category-selected-parent-collapsed.png 及 demo/qa-category-selected-parent-expanded.png；同窗口但实际视口与缩放未单独测量，未保存资料。

- P14 搜索父分类：两侧从真皮皮衣选中状态搜索皮革并点击皮革服装，右侧均切换一级分类；Demo清空搜索恢复完整树，normal34保留搜索。归已有 N34-P14-CATEGORY-SEARCH-SELECT-01；截图 demo-category-parent-search-select.png / qa-category-parent-search-select.png；商品数和维护能力不同，实际视口缩放未独立测量，未保存。

- 本轮拟核颜色每页100条时，Chrome提示用户改变应用状态；未确认页面切换、未继续操作，不记新增覆盖。检查105项矩阵 evidence 文件存在性，缺失0；只证明引用存在，不证明截图配对或验收完整。

- P15 颜色100条末页：两侧空搜索、182条，选择100条/页后点击下一页，均显示101–182、目标页2和下一页禁用；无障碍树显示首项灰蓝色812、末项黑蓝色708一致，未逐项核对82行。截图 demo-colors-100-last.png / qa-colors-100-last.png；同窗口，实际视口缩放未独立测量；候选维护仍禁用，整页未通过。

- P15 颜色每页100条搜索分页：两侧从第二页101–182分别输入编码515，均显示上青色515、共1条；清除搜索后均显示共182条、第1–100条，目标页1，保持100条/页。截图 demo-colors-100-search-515.png / qa-colors-100-search-515.png 及 demo-colors-100-search-clear.png / qa-colors-100-search-clear.png；同一Chrome窗口，未独立测量实际视口和缩放。候选新增与编辑仍未接通，本项仅为搜索分页局部观察，不代表整页通过。

- O-B08 员工模块筛选：Demo 与 normal34 从员工页操作记录选择员工并查询；Demo 0条、QA 1条合成新增记录，数据不同，无法证明 Demo 有记录时过滤准确。截图 demo-audit-staff-module.png / qa-audit-staff-module.png；同窗口但未测实际视口及缩放。未修改资料。
- 新覆盖统计保守基线见 COVERAGE-NEW-20261029.json：保留原状态，不将已发现差异自动计作完整对比；旧源码入口尚未证明可达的七项列尚未检查并标可达性未确认。其余项目存在具体局部阻塞时仍列部分检查，原因记录在行内。

- 新覆盖口径逐项复核：O-I06 仅“已执行范围弹层的已观察展示及关闭/条件隔离”，O-S16 仅“已审核销售弃审确认层的显示、取消与 Esc”，均完成限定范围对照且有差异；不涵盖实际弃审、其他权限或整页。两侧同窗口，实际视口和缩放未独立测量，数据状态限制保留。其余不按旧 DIFFERENCE 自动改为完成。新统计：对比完成一致0、对比完成有差异2、部分检查89、整项阻塞7、尚未检查7、不适用0。历史阶段索引已标明旧快照，防止误用。

- P01 商品列表分页：Demo 8877 及 normal34 57923 两侧默认100款/页，均提供100、200、500款/页。Demo共2955款、QA合成6款；QA不能形成第二页，故未将单侧翻页当作配对通过。解除条件为同版本可供查询的至少101款隔离样例；实际视口/缩放未独立测量。截图 demo-products-pagination-options.png / qa-products-pagination-options.png。

- 按当前台账建立问题分组索引：76条现行记录分模块及跨页面现象归类，2条撤回和1条合并历史保留原台账，不计作独立现行记录；分组不代表同一根因。库存搜索后勾选、基础设置搜索空格、销货/调拨分类摘要等的源码依据与未知边界仍以原台账为准。

- P01 首屏主表：Demo 与 normal34 商品列表默认条件、100款/页下，十列表头顺序均为款号、商品名称、商品分类、年份/季节、供应商、版型、厚薄、零售价、总库存、操作，均有行内编辑入口。截图 demo-products-list-main-1031.png / qa-products-list-main-1031.png；样本及总数不同，未独立测量实际视口和缩放，不能据此判列宽或整页一致；此前候选编辑读取失败仍是未解决缺口。

- 原问题映射 USER-ISSUE-COVERAGE-NORMAL34.json 对照现行 PAGE-MATRIX 与新覆盖口径更新：14项用户问题映射的页面编号均存在；同步页面操作、剩余原因及证据，并保留历史快照。页面关联不等于每个原问题子项已经完成；最新 P01 分页等不在映射范围不强行追加。

- 统计纠正：先前将 O-I06、O-S16 的限定对照计作完成，但该批配对没有独立证明实际视口和缩放一致，且结论只覆盖局部状态；两项恢复为部分检查，原发现、操作和历史统计保留。新统计为完成一致0、完成有差异0、部分检查91、整项阻塞7、尚未检查7、不适用0；不能把当前统计当成全站验收。

- 已将主要阻塞按页面状态、已知现象与最小解除条件补入 UNFINISHED-INDEX.md，区分样例不足、候选读取失败、维护入口未接通、只读限制与入口可达性未确认；不重新请求失效参考地址或将这些缺口算成通过。

- 差异归并工作稿补齐近期18条台账引用，包含撤回、合并历史和 Demo 双侧均出现的风险；按现象归组，不推断同源，不将双侧行为自动列迁移缺陷。详细证据仍引用 FINDINGS.json。

- 2026-10-29 14:34 再核当前候选入口HTTP响应头 X-Naijue-Candidate: phase2-normal-2357cf5-34-synthetic；只确认该入口声明的候选标识，不代替构建完整性或页面、业务验收。

- 将已有销货客户全选/取消证据链接并入差异归并工作稿，明确该问题为选择状态差异；Demo查询后恢复全部，QA不能形成同态空选择查询，不据此认定查询范围错误。复用现有配图，未重验。

- 差异归并工作稿补充用户可读的主要影响及分类摘要语义，明确这是固定候选观察、源码和样例边界，不将预览能力缺口或未知正式状态写为生产结论。

- N34-S03-HIDDEN-01 配对图限定复核：Demo和QA均显示应结61，Demo同屏可见退回-239及换出300并列出退回1、换出1；QA退回区只剩表头，换出300可见，底部为1款0件和销售金额/优惠/应结。两侧商品不同，不能据此判款数计算错误；截图未独立证实视口及缩放。未新增浏览器操作。

- P01 当前对照环境：同一Chrome窗口分别打开8877与57923商品列表标签的浏览器菜单，两侧缩放显示100%，截图 demo-products-chrome-zoom-100.png / qa-products-chrome-zoom-100.png；未改变缩放。此次未测页面实际CSS视口，不能据当前值追认其他时间的截图或证明历史对照视口一致。

- 新统计口径逐项修正：P02、P03、P04、P07、O-I07、O-I08、O-T09、O-S19、O-P04、O-P05、O-P06、O-B03、O-B04、O-B05、O-B06 的关键状态因QA读取失败或维护禁用不能完成双侧对照，分类改为环境或资料阻塞；原局部操作、差异和原因均保留。不声称正式接口未实现；解除条件见未完成索引。

- 归并工作稿的五项主要开单、金额与列表摘要问题补齐已有配对截图、复现条件和数据/身份边界；未重测、未修改应用或派工。

- 清单文字去除过期矛盾：O-S20 已有已审核退换货打印预览配对，保留样例不同、符号及结构差异和未实际打印限制；O-P11 已有Demo零商品分类确认并取消，但QA禁用无法配对。该更正复用2026-10-28/29已有证据，不新增覆盖或改判通过。

- 阶段对照汇总顶部补充新六类覆盖口径、79条台账及撤回/合并边界；原旧口径数字保留历史，不混称完成数或独立缺陷数。

- O-T03 已填行改色及取消：本轮新建两侧未保存单据，Demo CS0102181黑色A版与QA M26001白色Y版各填160/XS数量2、失焦形成已填行；分别选另一颜色，Demo新色仍显示2，QA提示原规格尚未对应160/XS且不显示数量输入；两侧取消后原颜色和数量2均保留。商品、颜色、版型不同，不能据Demo推断QA目标SKU存在或应直接映射。图 demo/qa-transfer-color-reselect-2.png、demo/qa-transfer-color-reselect-cancel-2.png；同窗口此前两侧100%缩放，本轮未独立测CSS视口；未确认改选、保存或删除。QA首次数量未失焦时直接改色提示先完成输入，图 qa-transfer-color-change-incomplete.png。期间误点侧栏产生离开确认，选择继续编辑且输入保留。归已有 N34-T02-RESELECT-SKU-01，不新增同类问题。两张本轮新建草稿留在现有标签，不清理。

- 2026-10-29 O-T03 补查：固定 2357cf5 合成资料包含 M26001 藏青、Y版、160/XS 组合；QA 改色后版型清空，重新选 Y版，待确认行重新显示数量2、未对应提示消失（qa-transfer-color-reselect-fit-restored.png）。这不证明正式 SKU 身份或保存。随后本意点击取消，但控件索引可能失准，实际未保存草稿变为藏青/Y版2件；qa-transfer-fit-restore-after-cancel.png 文件名不构成取消已触发的证据，不能判定取消异常。未保存、未审核；覆盖状态不变。

- 2026-10-29 覆盖口径复核 P16：固定版本两侧已有六组内容、名称搜索及清除、每页条数和页签切换证据，列宽及页签返回后的每页条数有差异；两侧仅6项，无跨页样例。历史配对截图像素尺寸相同但未记录实际 CSS 视口和缩放，不能据此证明满足统一视口条件；P16 暂仍“部分检查”，不改整页通过。后续在保护现有两侧未保存调拨草稿的前提下补测同视口、同缩放，跨页仅在可安全取得同版本样例时补查。

- 2026-10-29 P16 新配对：为了保留现有两侧未保存调拨草稿，使用同一 Chrome 窗口新建一对只读商品设置标签，两侧均进入尺码组并显示6组；两侧菜单分别显示缩放100%，未测量 CSS 内视口。配图 demo-sizegroup-newpair.png / qa-sizegroup-newpair.png，缩放证据 demo-sizegroup-zoom-newpair.png / qa-sizegroup-zoom-newpair.png。六组内容顺序一致，列宽差异仍可见；两侧均只有6条，跨页翻页缺样例。未改资料、未保存或审核；覆盖暂保持部分检查。

- 2026-10-29 销货旧入口复核：在同一 Chrome 窗口独立标签的新增销货首屏，两侧业务类型尚未选择；可见行内商品及收款入口，未观察到批量选货、扫码、旧账户或折扣辅助独立入口。配图 demo-sales-blank-entries-newpair.png / qa-sales-blank-entries-newpair.png；不能外推销售、退换和编辑的其他状态，O-S05/06/07/09/12 仍为可达性未确认。未注入调用、未保存审核。QA 首屏显示有未保存修改，该标识来源未知，不判为空白无修改状态，也未清除。

- 2026-10-29 O-T07 新增调拨非零行删除：两侧各自未保存草稿、未选仓、160/XS 2件。Demo 点击删除出现“删除颜色？”、取消后仍保留2件；normal34 在本次独立新建合成草稿点击删除，行直接移除，未见确认，显示0款0件。配图 demo-transfer-delete-own-confirm.png / demo-transfer-delete-own-cancel.png / qa-transfer-delete-own-before.png / qa-transfer-delete-own-after.png。两侧商品不同，同一Chrome窗口先前核缩放100%，未测CSS内视口；已保存单及真实业务未验。Demo未确认删除；QA移除仅自建未保存草稿行，未保存或审核。登记 N34-T07-DRAFT-DELETE-CONFIRM-01。

## 用户更正：销货扫码工作窗（2026-10-29）

用户明确指出：截图中的“扫码录入”位于新增调拨单，销货单没有独立扫码工作窗。O-S07 销货扫码工作窗、O-S08 销货扫码多价格目标选择不得作为销货功能缺失或修复要求；此前依据旧源码列为入口未确认的记录保留为历史。调拨扫码按 O-T06 及已有问题另行记录，本更正不证明扫码实物或真实业务已验证。销货行内商品款号/名称/条码输入与独立扫码工作窗是不同入口，不据此推断其业务实现。

## 用户更正：销货收款／退款入口（2026-10-29）

用户指出销货单收款／退款相关操作位于单据内的收款区域：支付方式、资金账户、金额及添加入口；旧的独立账户弹窗不作为当前应有入口。O-S09 原“旧账户弹窗入口未确认”仅保留历史记录，不作为缺失功能或修复要求。收款／退款行内选择、金额、添加、提示及销售和退换状态的已查与未查范围继续沿 S02、S03、O-S10 及相应问题证据记录，本裁决不代表这些操作或真实结算已全部通过。

## 用户更正：销货折扣录入（2026-10-29）

用户明确指出：销货单没有折扣辅助算价弹窗，折扣在商品明细行内直接输入并计算。O-S12 原“折扣辅助算价弹窗入口未确认”保留为历史记录，不作为当前功能缺失或修复要求。行内折扣与成交单价、金额联动仍按既有 N34-S03-DISCOUNT-01 等实操证据和未验范围记录，不能因取消旧弹窗项目而视为金额逻辑已通过。
