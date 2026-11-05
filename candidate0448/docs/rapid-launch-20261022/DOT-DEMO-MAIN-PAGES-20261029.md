# Dot 主要页面对照：2026-10-29

## 固定对象与真实性

- 正式候选生产源码：`b7fde7ae105f942de86d53938557b642980d7174`；包含 c043 分类投影及 44c52a48 溢出展开、b7 重试事件修复。分支 `recovery/dot-20261029`，离线交付，无push。
- 真冻结 Demo：`b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`，原frontend UI/bridge正常入口。缺失7个bundle按原build.mjs生成；104源文件哈希未变。不是53/643旧候选截图。
- Dot Linux原生Chromium前台、sandbox开启，1440×1000及库存900×1000。两个独立真实窗口可切换。所有资料为同一有限QA合成图谱，网络闭合拦截，所有业务写501；不是原后端/真实DB验收。冻结Demo24份native单据，候选另含历史合成行，分页总数不同有意保留，不假称同数据总数。
- 媒体/资金种子/旧尺码三份data资源是明示合成替代；原master seed以隔离合成localStorage初始化。没有读真实数据、Mac、生产凭据。

## 逐项结果

| 问题/页面 | 实际结果 | 证据与限制 |
|---|---|---|
| 销货状态全灰 | 已修，复用原CSS的data-document-status；未审核warning、已审核success、作废neutral | 06ff前台computed color RED→GREEN；c043实图仍正确 |
| 库存查询闪屏/仅3行大空白 | 已修测量与滚动条反馈环，保留有效结果，必要时单个隐藏inert探针 | RED 2秒206 RO，GREEN初始3次后稳定0，765px显示21行；宽窄/滚动/显示设置/重置/刷新及焦点/DOM预算验证 |
| 库存900尺码被固定列遮挡 | 原Demo同样可复现，不自动设计新响应式 | 冻结与候选同视口图；不将几何测试PASS说成窄屏可读性PASS |
| 销货/调拨商品信息误显示款号 | CURRENT分类投影已显示；销售signed非赠品数量、调拨正量去重款数，无单位文字 | 与冻结实际DOM逐字匹配：衬衫 -4/长裤 -2；衬衫 2/长裤 1 |
| HISTORY分类未知 | 明确“历史未记录分类”，不补当前分类 | 两页真实翻页各5历史行；tooltip明确未推断；不是历史分类已恢复 |
| 旧窗口列表读取失败 | 新固定产物实际查询、翻页、离开重入没有alert/pageerror | 不是初始空页冒query PASS；不能证明旧窗口环境根因已完全消失 |
| 商品页 | 冻结与候选实际打开6个合成商品；六tab新窗/空opener/父窗保留已有真实smoke | 冻结初次codes fixture错误空页未计通过，修正data后确认；不称商品所有编辑功能验收 |
| 商品设置、营业厅与仓库 | 原Demo与候选同视口实际打开并查看有限合成结果 | 候选部分维护操作因只读fixture未接线disabled，不算编辑/保存PASS |

## 本次明确差异/开放项

1. 旧调拨按分类name合并；新实现按真实category ID聚合，保留同名不同实体（父级已批准），已有同名异ID测试。
2. 超过3分类的 `+N 更多` 及调拨展开已对齐真实冻结 Demo，详见下节。销售按原 Demo 保留静态 +N；调拨单击显示其余分类。无新增 CSS 覆盖层。
3. 完整EXACT26正式reader、权限/历史发布生命周期及真实写回滚没有在本次完成。不能把独立PG片段验证称完整后端验收。
4. 其余报告项仍须父级按后续架构复查阶段分派，不以本表代替80/105项全站验收。没有恢复已裁定不可达的旧扫码/批选/折扣及旧账户弹窗。

## 测试与失败保留

- 主页面第一批19项真实浏览器PASS；当前分类固定c043十项真实浏览器PASS；96项native合同/协议/HTTP PASS，0FAIL，1个原环境integration skip未计成功；合成fixture11项PASS；native双tsconfig typecheck PASS。
- PG17.11官方构建，本机独立Unix socket、fsync/synchronous_commit on。实际reader生成SQL中原分类CTE提取后，用typed合成page_lines在READ ONLY事务执行：负数/赠品/净零/>2^53/同名异ID/去重/前三项/HISTORY排除PASS，结束ROLLBACK；数据库已stop。只证明该SQL片段。
- 保留初次分类contract RED、旧产物可见款号RED、首轮合成category遗漏FAIL及fixture RED，再修数据投影后GREEN。未改expected凑绿。
- 老protocol17失败于06ff原源码同样复现；补当前合同负责人/创建者字段、同步原脚本3SELECT+事务精确计数；原断言保留/加强。HTTP老fixture同步P03单shared envelope，无改运行权限或生产DTO约束。
- 关于“必须新增开单分类快照”的先前判断已明确撤回：真实冻结bridge取当前分类，仅字段旧名叫snapshot。此次无新增业务schema/写入字段/单位字段。

主要证据位于同一scratch recovery：`main-pages-batch1-final`、`frozen-demo-visible2`、`frozen-demo-exact-tags`、`category-ui-history-final`、`category-pg-engine.json`及相应原始日志。

## 13:49 UTC 溢出交互与最终可操作检查

- 原冻结 Demo 四分类实图/DOM：`frozen-demo-overflow`；候选旧 c043 可见 RED：`overflow-ui-RED`。最终 b7 固定生产产物：`overflow-ui-GREEN5/result.json`，12/12，0 pageerror。显示前三类后 `+1 更多`，调拨弹层其余内容逐字 `配饰 1`，沿用原 `.tc-more-tags-pop` 布局/样式。
- 仅用户展开调用既有 `/transfers/detail/query`，既有服务端硬限 2000 行、SQL LIMIT 2001 与 413 拒绝保持；没有列表/滚动/翻页预取，没有全历史/全 catalog 读取，没有新 endpoint/schema/写语义。
- `category-v2` 协商增加精确 categoryCount 与可选详情 summary；v1 去除 count，旧/未知协商保留旧 DTO，严格完整详情 DTO 仍先校验。LIVE 明确 CURRENT，HISTORY UNKNOWN，不用当前分类伪造历史。精确整数/赠品/销售负量、调拨原有负量拒绝、重复 SKU 去重和同名异 ID 保持。
- 一个弹层路径；缓存只保留当前单据成功结果，键包含单据身份/业务版本/摘要；列表请求变化失效。实测同按钮关开复用、外点/滚动关闭、503 可见失败后重试、业务版本变化重新读、关闭/翻页时迟到结果不重开。
- 初次前台 GREEN3 发现真实重试 bug：React 卸载按钮后 document click 将原 target 误判 outside。改 pointerdown 在 DOM 变更前判定，原断言未放宽，GREEN4/5 通过。GREEN1/2 的 full_page 截图触发 resize 合法关闭属于测试观察干扰，保留失败日志并改固定视口截图，不把其计业务 RED。
- 最终 b7 原生官方 Node 24.21.0 受影响合同/协议/HTTP/fixture 108/108，0 skip；双 tsconfig PASS；可见宿主 2/2。`final-native-*` 日志。PG 仍仅实际生产 CTE 片段验证（overflow-pg-engine.json），未声称完整 reader/runtime EXACT26 验收；测试数据库已 stop。
- 用户 13:17 加载卡住事故：保留窗口 input() 阻塞 Playwright route 事件泵。先前“可操作”说法不准确；宿主及冻结保留窗口均改为非阻塞持续泵。详见 `DOT-VISIBLE-HOST-INCIDENT-20261029.md`，不归因用户环境。
- 最终 b7 前台真正点击：库存 query 21 可见行、销售/调拨各20行、两新增页、商品6行、商品设置/营业厅仓库、调拨与销售详情各3行；无非空 alert/pageerror。`live-final-b7fde7ae/user-route-checks.json`、截图与 API 日志。脚本进入持续待机后再用原生鼠标点击此前未加载的商品分类，实际 query 200 后树显示，证明待机仍可操作。只读维护页不计编辑/保存 PASS，未写入。

本次已知主要页面 Demo 缺陷收尾；其余架构报告、完整后端/写入验收仍由父级安排，不等于全系统验收完成。当前源码仅离线提交，未 push。
