# Dot 恢复候选接续（不是原e5提交）

2026-10-29：原shared工作树当前不可见；只读调查证据在scratch/recovery/incident-facts.md。最后主控可证旧repo读取10:20:59 UTC，当前shared对象birth10:55:27 UTC，无actor证据，不宣称系统清理或用户删除。

## 此候选来源与永久差异声明
- 远端 https://github.com/Billy159/naijue-erp.git 的codex/erp核为5b873cf2a2858956cce533d741e95b30f7e35f29；新scratch完整Git基线的独立worktree。未写shared，未改生产、未读Mac/凭据/sessions。
- 叠入保全53前端subset，原生产manifest278项源码SHA全一致；重放保全脚本及原可见操作恢复最终643生产输入。
- 对最终643 manifest：323个非依赖输入中322个字节SHA精确一致；唯一非精确文件为`frontend/runtime/common/route-resources.ts`。原文件640字节、SHA256 `09649a274b6ddfdb8ae41e472fb2321245634057e8bb643e04fa4900bc22a37c`缺失，不能声称找回。
- 该helper按保留application.js的运行逻辑语义重建；先缺失红测exit1，再实现；并行/已取消/迟到结果不得挂载3项主exec GREEN，主控native前台3/3 GREEN。重新建立类型/产物/browser验证中，尚未宣称整体恢复验收。
- 974个依赖输入SHA一致；原177compiled输出SHA全一致。原e5 Git对象/完整测试文档字节未恢复，当前会形成新SHA，不能标作e5或伪造323/323。
- tests/runner为恢复版本；旧完整测试可能仍引用原架构入口，需要实际运行找出并恢复断言，不skip。

## 待继续
- runtime类型已主exec PASS。完整固定新SHA构建、runtime回归与可见浏览器待跑。
- 原报告并未清零。用户新要求先与Demo对照修BUG、再报告问题；恢复阶段不夹带新修。
- 已确认待修：销售/调拨状态class配色未接上（doc-*无匹配最终规则），不能继续沿用旧“已修复”分类；分类摘要资料缺口仍未完成。必须先测试再修，禁止用环境事故掩盖这些真实问题。
- 真实HTTP权限/PG/写入审核回滚、纸张、负载未验。仅合成读取fixture，无真实API/写操作。

## 保全
每个恢复稳定提交立即另存独立Git bundle及源码tar到scratch/recovery并核verify/hash，不等所有新BUG修完再备份。不是用户最终ZIP交付，当前仍开发中。

## 恢复阶段收口与唯一writer交回

- 已建恢复业务基线`d78e4109e43fb541f851b9cd8571b06c9e3c32a1`；其后提交只恢复测试/preview构建接线/README/接续元数据，不夹库存布局、状态配色、分类摘要等新BUG修复。
- `check-recovery-pass2`绑定`f4a58ab739f787d8bcff40c4f685cf0bf48dd783`：44/44检查PASS（39个runtime测试命令+runtime类型/catalogue/fixture/build/6项图断言各1命令）。缺浏览器组合回执仍如实PARTIAL_BROWSER_NOT_VERIFIED；不是原40测试逐字节找回。首轮6项旧mock/断言失败保留，补回当前feature接缝、leaf不销毁parent、默认方案名称多一次精确ID读取、NOT_SET不发字典请求等原批准断言后通过，未改业务去迎合测试。
- 根tsconfig类型主exec PASS。helper缺失红测在主exec先发生；3项GREEN在主exec及Dot native前台均实跑，日志`recovery-helper-RED.log`、`recovery-helper-GREEN.log`、`recovery-helper-native-GREEN.log`。原compiled helper与新build helper仅规范化局部符号名后逐字符相同，见`compiled-helper-semantic-comparison.json`；不改原640字节hash声明。
- 新原产物`build-recovered-d78e4109`已构建。实际输入集合与原643相同：1297输入中只有helper内容不同；CSS来源48文件逐SHA全同。manifest177 outputs。不同chunk名称不拿来冒整个bundle字节一致。
- Dot native可见运行`recovery-visible.py`，证据目录`visible-recovered-d78e4109-query`：实际点击库存查询，inventory/query200一次；5次1秒采样loading=false，首秒“正在整理库存…”/rows9，后4次rows4/status空。销售与调拨各query200、20行、无alert；日志无pageerror。此观察未复现反复loading，但不能证明所有时序无闪烁。
- 已查看库存查询后截图：首款3行后大空白，**视觉未通过**，交新writer排虚拟滚动/布局；不以请求200或“恢复成功”掩盖。状态颜色仍灰、分类摘要仍未完成，下一阶段先Demo和红测试再改。
- `tests/production-browser-fixture.mjs`、`production-browser-smoke.py`、`check-production.mjs`、图/边界测试是恢复性重建，不纳入原643输入hash的“exact”范围。桥接仅合成session/query，实际验证session200/写501；native又实际验证三类query200。真实后台/权限/PG/写入未验。新browser-smoke已恢复代码但尚未native跑其全部15场景，不冒回执。

### 源码/参考/证据路径

- 新唯一候选：`/workspace/scratch/f6bee04e937b/recovery/recovered-worktree`。基础Git：相邻`github-base-5b873-fullgit`，远端HEAD5b873已实际核对；保全53和重放脚本独立目录保持。
- 冻结Demo源子集：`references/demo-ui-baseline/`固定b8bcfe3，MANIFEST逐文件来源；README明确0截图且非可运行完整Demo，不把53/643截图冒原Demo图。
- 另有仓库原携带完整参考代码：`handoff/local-wip-20261022-082411/reference-demo/frontend/index.html`及相邻sales-current.js/transfer-current.js/product-current.js/CSS。只读参考，不在其中构建/改写；完整数据的合成性/运行闭合未因此证明，不能直接当安全已验可运行Demo。
- 可用当前实现截图：scratch/cloud-browser-validation的53/643同headed对照、scratch/recovery/visible-recovered-d78e4109-query最新实际查询图。后者库存空白是明确待修现场。

### 独立备份（不等业务新修完成）

- d78完整历史bundle：`recovery/recovered-d78e4109-full.bundle`，verify PASS、complete history，SHA256 `908e1f1400c78444dcf0424a4927563a5e8e16643dbd78c741a276ee01ebfaa1`；主控已上传Space `libfile_44cc516a6d6081918b24690d1250e042`。
- d78完整tracked源码tar：`recovery/recovered-d78e4109-source.tar.gz`，SHA256 `423eca5fcbdc4fdc07b01a92c14750d6b478eb551ae984b8ec8041339739fad8`。
- 本恢复收口HEAD还会生成带其短SHA的独立full.bundle/source.tar.gz/SHA256SUMS/verify日志；最终SHA由Git实际输出回报。无推送、无用户交付ZIP。
- 本线程至最终收口提交后停止源码写入，交主控分配新唯一writer。当前恢复并不宣称原e5完整恢复或原BUG清零。

## Demo修复第一批：状态色与库存测量反馈环（2026-10-29 UTC）

- fa219 真正生产构建、Dot原生前台Chromium sandbox测试先RED。销售未审核和已审核均是中性灰；冻结b8bcfe3 ui-tokens 的warning/success色值构成断言。调拨两色本来正确，不修改调拨。
- 库存旧1秒采样漏检：原生ResizeObserver 2秒记录206事件，1183×32/1168×765反复切换，视口765仅3行。宽度失配导致结果卸载回探针，滚动条消失又反向触发宽度变化。证据scratch/recovery/main-pages-geometry-RED。
- 修复只改变生产sales-list状态属性及InventoryMatrix测量生命周期；复用原CSS，不叠全局覆盖。已有结果在宽度变化时保留，隐藏inert探针仅在需要测量时挂载，不参与焦点，稳定后退出；尺寸版本记录探针实际使用的viewport宽度。
- 第一修复常驻probe使旧DOM窗口预算断言失败，失败日志保留；未改断言，改为条件probe后原inventory-runtime测试通过。
- b5831fcc真产物前台19项PASS（main-pages-GREEN3）：RO初始3次、稳定后0；21行；900/1440宽窄、横纵滚动、显示设置、刷新、重置、无残留probe/单可见表；销售与调拨两色；实际page2请求新行/离开重入保持。分页测试补等待React实际新行，不是改业务凑断言。
- 视觉限制：900截图固定前3列+后2列总714px超过内容区，尺码被遮挡；原样式已有此问题，宽度断言PASS不是该窄屏视觉PASS。需后续单独Demo口径/可读性修复，不能称库存整页或全部报告验收。1440本次填充及状态色截图已查看。
- 分类摘要尚未改；主要商品/设置详细对照、真实后台/PG/写入/审核回滚/生产未验。测试网络只允许合成session/query，所有业务写501。

## 2026-10-29 分类读取投影与冻结 Demo 实跑（本批验收中）

纠正：此前仅看 `sales-summary.js` 的 saved fallback，推断真实 Demo 缺分类保存快照，因此必须先新增写字段，这个判断不准确。冻结 `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3` 的 index 启用 REAL_DATA_MODE，原 real-data-bridge 为 document lines 根据当前 catalog 注入名为 categorySnapshot 的当前分类；新实现明确命名 CURRENT 读取投影，不称历史快照，不新增 schema/写字段。HISTORY 无可靠分类来源仍 UNKNOWN，不拿当前分类补造。

冻结原 UI 已在 dot 原生沙箱 Chromium 实际打开库存、销货、调拨、商品、商品设置、门店设置六页，无 pageerror；products 初次 fixture 错把 codes 响应写成 items 导致空页，修正测试资料后6商品正常。源104文件字节核对不变，7个缺失编译包按原 build.mjs/Vite 配置生成。仅网络边界使用合成 QA 数据，产品媒体/资金种子/旧尺码三个数据文件提供明确合成替代，无真实数据库。前台同时保留冻结 Demo 和06ff候选。冻结900库存固定列遮挡尺码与候选相同，记录为原基线限制，不重做布局。

实际 DOM exact tags（recovery/frozen-demo-exact-tags/result.json）：销货 `衬衫 -4`、`长裤 -2`；调拨 `衬衫 2`、`长裤 1`。无件/款单位文字。旧调拨按name合并同名分类；按父级批准，新读取按category ID分组保留不同实体，明确这一差异。

分类合同先在原生 Node24.21.0 red（category-contract-RED.log）真实 decoder 失败，再实现可选 categorySummary。正式列表 HTTP 仅请求头 x-naijue-document-summary:category-v1 才输出新字段；旧严格客户端仍收原形状，新严格客户端接受完整旧/新形状，未知字段仍拒绝。productSummary保留，UI不再误用款号预览当分类统计。CURRENT销货非赠品signed quantity；调拨正数量去重product；同一分页shared CTE，仅page_lines LIVE关联当前分类，无N+1、无全历史明细加载。UNKNOWN历史不关联当前分类。无单位字段。

验证边界：PG17.11隔离Unix socket已前台启动核验 fsync/synchronous_commit均on、listen_addresses为空。tests/integration/document-category-sql-engine.mjs 从正式reader实际生成SQL提取原分类CTE，在真实PG READ ONLY事务中执行类型化合成page_lines，负数/赠品/净零/大整数/同名异ID/正量去重/前三项/历史不补分类通过。**这是SQL片段实测，不是完整reader、授权、历史发布或EXACT26验收**。完整bootstrap仍开放：旧registry至19、exact26独立capability及后继patch不能遍历0001–26伪装完成。

旧protocol测试17失败在未改06ff隔离baseline复现（category-protocol-baseline06ff.log）。具体：老mock header缺responsible_staff_id/responsible_name，sales另缺created_by_name；补齐当前正式读合同fixture，expected referenceNames增加明确负责人/创建者，不删除断言。另四处原脚本已含BEGIN+3 SELECT+COMMIT却断言4调用，改为精确5调用且新增3 SELECT断言，保留bounded/N+1/参数化/回滚语义。分类授权调整仅将原“完全禁止product_category”改为更精确“只准分页LIVE join，历史与全量totals禁止join”，不是解除范围约束。

尚待：本批固定commit新产物前台分类终验；完整EXACT26真实reader链；维护编辑disabled的纯只读页不算维护功能通过。旧同名合并差异及超过3类的显示范围在最终清单如实列出。

c043固定产物首轮前台确实失败（category-ui-GREEN/result.json保留FAIL），原因不是历史缺快照：合成fixture qaCurrentProducts遗漏已声明的categoryId/categoryLabel投影，真实API原reader已有此字段。新增原生读fixture红测确认实际undefined，再仅修测试资料投影，未改业务判定/测试expected。固定同一c043生产字节重测 category-ui-GREEN2：8项显示/来源/无款号/无读错检查PASS；图中销货审核色正常，分类标签逐字匹配冻结Demo。补充下一页历史UNKNOWN可见检查继续收口。最终native合同/协议/HTTP测试96PASS、0FAIL，1个原有环境依赖integration skip不计成功；native typecheck通过。

收口：category-ui-history-final/result.json为同一c043正式产物10/10 PASS；真实点击下一页后销货/调拨各见5条“历史未记录分类”，tooltip明确未按当前资料推断。未把历史UNKNOWN计为分类已补齐。当前预览上限仍3类；超过3类使用“更多分类”而非原Demo的完整+N/调拨展开，列为仍有的展示差异，不能称全站像素/全部行为一致。


## 2026-10-29 13:49 UTC 主要页面收尾（覆盖上文历史待办状态）
生产基准 b7fde7ae：状态色、库存几何反馈、分类摘要、精确 +N 与调拨按需展开均已修并实际前台验证。原冻结 b8 Demo 已在 dot 独立窗口运行对照，不是候选截图冒充。最终溢出 12/12；原生受影响 108/108（0 skip）、双类型检查与宿主2/2通过。最终10条主页面/详情实际点击观察无非空alert/pageerror。加载卡住属保留窗口宿主阻塞，已修且待机后原生点击验证可继续加载。全部写接口闭合501，不将维护disabled计验收。详见 DOT-DEMO-MAIN-PAGES-20261029.md 最新节；完整正式reader/EXACT26生命周期、写回滚及架构报告整改仍开放。唯一writer即将交回父级，不自行并发开启后端阶段。
