# 调拨筛选恢复：有限读取下的 Demo 交互

## 恢复内容

- 已实际查看用户 004259 图片，并对照冻结 `inventory-filters.jsx` 的共享工具条、strict 多选值、候选复选框与 CSS；后置 `final-ui.css`、`golden-consistency.css`、`interaction-common.css` 没有额外仓库弹层覆写。
- 仓库、状态都显示“匹配 N 项 · 已选 N 项”；仓库匹配数来自真实 exactTotal，不把已加载数冒充匹配数。无搜索全集总数尚未知时明确显示“已选全部仓库”，不编造 N。
- 不限筛选仍是原契约的空 ID 数组。它在当前候选中投影为 ALL 和每个可见候选均已勾选；跨搜索保留显式已选 ID/名称，但不把不匹配的已选项插进当前菜单。
- 去掉仓库弹层新增的“每次最多20项”、第 N 页及上/下一页页脚。用 Arco 2.66.16 正式 `treeProps.virtualListProps.onScroll` 支持的非虚拟列表滚动回调触底追加，每请求20条、串行、每次搜索最多200条。到上限明示需缩小搜索，真实总数不截断。没有自动全目录读取。
- 状态有限集合支持汉字、原生 ID、全拼及首字母；仓库仍只使用现有获准的仓库名/营业厅名搜索，不伪造远端拼音或编号搜索。
- 使用 Arco 正式 remote onSearch 模式关闭对异步候选的本地 hitKeys 二次筛选。拒绝操作不会被 optionChecked 的自动清搜索回调抹掉提示。React19 StrictMode 的 Portal 重放用局部一次 post-open render 重新连接，不新增读取。
- 没有改日期控件、后端 API、授权、数据库、transfers.css 或外壳样式。独立 filter-controls.css 已接入生产精确 transfers CSS 入口。

## 明确保留的能力边界

- 只有无搜索、单次响应已完整返回的候选集合，才允许从 ALL 取消单项并提交正确的显式补集。当前2项夹具可正常执行。
- 尚未完整、搜索子集、或跨页累计的集合都不能被当成已证明的一致全库集合。原接口没有跨页快照 revision，也没有排除 ID/显式空集合模式；这些情况下保留原不限 draft、明确提示，绝不静默用已加载 subset 假装“全部减一”。跨页已加载完时提示不能证明完整一致集合，而不是继续诱导加载。
- 从上述 ALL 边界直接切换明确子集仍是已报告的 API/UI 能力缺口。本次不新增按钮设计、不私改后端，也不声称全场景与 Demo 完全等同。
- 列表查询仍按原“修改 draft 后显式查询”生命周期；打开、搜索、滚动仓库候选不执行业务列表查询。

## 最终验证

- `npm run typecheck:web` 通过：typecheck-web.log。
- `node --test apps/web/src/transfers/*.test.ts` 22/22 通过：unit.log，其中7项为新增 candidate controller 测试。
- `node apps/web/src/transfers/tests/run-dom-tests.mjs` 11/11 通过：route-dom.log；原首挂是真实 React StrictMode，DOM5/6覆盖动作后读取、工具条、全勾、拒绝不完整补集、重复触底仅一次下一页及权限撤销。
- `node apps/web/src/transfers/tests/run-filter-dom-tests.mjs` 4/4 通过：focused-dom.log。覆盖 StrictMode 首开实际 transport 精确1次、完整2项补集、重复搜索及0结果后恢复、已选标签跨搜索保留、搜索乱序/close-reopen/撤权取消晚到、关开实际 transport 精确1次、21项成功追加后可见候选全勾、跨页即便载完仍拒绝补集、状态工具条与大写拼音首字母匹配。
- controller 测试覆盖不预载、10页/200项硬上限、串行重复滚动、搜索 generation 与忽略 signal 的旧响应、失败后显式重试、跨页总数变化与重复 ID fail-closed、关闭/身份撤销清理，以及403使父范围失效。
- `git diff --check -- apps/web/src/transfers` 通过：diff-check.log。
- Arco 依赖在测试中仍输出已有 React19 element.ref 弃用警告；未改依赖源码或掩盖测试失败。
- 上述为合成 Node/React/JSDOM 验证，不是真实浏览器、网络瀑布、性能或 Demo 像素验收。本次没有启动浏览器、监听器、PostgreSQL、用户电脑任务或外部网络请求。

最终源文件及本报告 SHA256 见 SHA256SUMS。由 root 统一提交，本切片未 commit。
