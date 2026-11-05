# 奈爵 ERP 修复后架构与缺陷复查报告 当前进度

核对时间 2026年10月29日 23时08分 UTC。原件为 `final-audit/奈爵ERP_修复后全面复查报告_e5bbe6a9_20261029.docx`，正文标题为《奈爵 ERP 修复后架构与缺陷复查报告》，固定审查版本e5bbe6a9。已直接提取DOCX正文与表格核对，未拿Demo80矩阵替代。原报告明确列7项主问题，另有7项架构观察及第六至八节的补线、资料和验收建议；三者不混成BUG完成率。

## 原报告7项逐条状态

1. **A1 P1 健康响应与发布消费者合同不兼容**：源码已改，stage、activate、boot共享的健康检查先验HOST_ALIVE及build/commit身份，再作新鲜readyz 200/READY检查；4组离线合同测试通过。**未完成的是发布放行**：新发布脚本的独立复审、批准的hash pin及隔离发布/恢复实测。旧pin保持拒绝新脚本是故意保留的安全门，不可自改pin冒充审查。
   - 源码：`scripts/release/deploy-candidate.py`、`scripts/release/boot-entry.py`。
   - 回执：`recovery/report-batch1/a1-green.log`；说明：`docs/repair-review-20261029/A1.md`。
2. **F1 P2 非法商品详情深链白屏**：路由入口canonical ID验证、明确错误及返回入口、leaf React错误边界已落地；旧异常先红后绿，当前1e统一检查也跑过deep-link-boundary测试。**23:12补齐固定1e产物的原生浏览器6种非法深链及重复导航恢复，实际通过且坏链接阶段零业务请求**；人为诱发leaf异常仍仅DOM验证，不扩张为所有异常通过。
   - 源码：`apps/web/demo-replica/frontend/runtime/products/feature.ts`、`detail-entry.tsx`。
   - 回执：`recovery/report-batch1/f1-green.log`、`recovery/unified-gap-acceptance/check-third/runtime-products-deep-link-boundary.test.mjs.log`。
3. **B1 P2 销货事实读取与商品维护锁序相反**：已改成稳定product ID→稳定SKU ID，锁后复核关联，无去锁或自动重试；20项测试通过。真实PG17双会话已复现旧40P01，并证明新锁序双向交错无环。**仅组件并发通过**，未证明完整SAVE/APPROVE/UNAPPROVE/VOID、账本余额回执一次性、CAS、断连提交及迁移约束。
   - 源码：`adapters/postgres/src/sales-native-facts.ts`，维护侧`product-maintenance-store.ts`。
   - 回执：`recovery/report-batch2/b1-green.log`、`pg-locks2.log`。
4. **A2 P2 readiness与业务请求同池争用**：已加single-flight、最多32等待者、2秒逻辑deadline、取消传播；物理清理未结束不放开槽位，不缓存成功。针对性测试已过。**实际负载下池竞争、可信监控与反向代理配置的现场验收尚未完成**，无性能改善百分比。
   - 源码：`apps/api/src/readiness-probe.ts`、`production-application-host.ts`。
   - 回执：`recovery/report-batch3/checkpoint2-tests.log`（79项合并回归，非79个A2场景）。
5. **A3 P2 商品分页全范围证明成本及缺少总deadline**：20秒总HTTP预算已贯穿鉴权前、取池、查询和序列化；取消及迟到lease清理已补。全匹配新增SKU/全部原生仓库的证明不删，ID分页搬运改成两条固定结果聚合SQL。传输2项、reader/HTTP/pool定向62项、清理44项及类型检查通过；另48项实际PG_TEMP类型化组件通过并已回滚停库。**真实权威admission函数、完整低权限runtime、EXPLAIN、规模内存和P95仍未完成**，不宣称全域数据库计算已变常数或已测得提速。
   - 源码：`apps/api/src/product-management-query-http.ts`、`adapters/postgres/src/product-management-query-reader.ts`、`bounded-pool.ts`。
   - 回执：`recovery/read-cost-optimization-prep/ACTUAL-NATIVE-EVIDENCE.json`、`recovery/read-cost-sql-component/component-first-evidence.json`。
6. **A4 P2 脱敏日志缺定位信息**：已接requestId、固定routeTemplate、READ/WRITE、stage/first-failure、安全error枚举、池及admission拒绝指标、dropCount；不输出SQL、bind、cookie、凭据或业务正文。诊断补充12项及相关回归通过。**不是分布式追踪或真实生产监控验收**；拒绝指标是每请求0/1，不是物理拒绝次数。
   - 源码：`apps/api/src/request-diagnostics.ts`、`production-application-host.ts`，及pool诊断接线。
   - 回执：`recovery/report-batch3/diagnostic-followup-green.log`、`cleanup-green.log`。
7. **B2 P3 后端README落后于实现**：当前实现清单、provider入口、HISTORY独立修订及验证边界已写入README；旧未实现文字明确放入历史阶段。**该文档整改已完成**，不把文档完成写成数据库验收完成。
   - 源码：`adapters/postgres/README.md:1-23`；说明：`docs/repair-review-20261029/A2-A4-B2.md`。

**可防守的统计是：7项主问题均有源码或文档整改落地；不能称7/7完整验收，更不能由此推出前后端全功能、真实性能或可上线。** 最新前端统一检查1e为53/53，销售专项第六轮所列12项通过，都只是所列有限合成范围。

## 原报告其他建议和未完成验收

- **第一节7项架构观察不是另7个未改BUG**：样式权威、六模块装配、生命周期、mode owner、独立加载、共享UI、生产检查入口均在原报告已肯定；不建议为了缩文件重写。CSS去重的canonical数字不是网络字节、gzip或提速百分比。
- **第二节及第八节全PG/权限闭环仍是大头**：真实HTTP权限、合法服务建立合成状态、保存/审核/反审/作废、CAS/幂等/回滚、deferred/FK/trigger、掉线未知COMMIT原key恢复及正确安装链。用户已明确授权临时隔离PG访问，**授权已到、执行验收尚未完成**；B1和A3组件不替代它。
- **前端错误恢复现场证据仍缺**：慢CSS取消/重入、资源失败恢复、同URL chunk失败后真实浏览器重试；现有Promise/DOM测试不能替代浏览器缓存行为。F1原6种负向深链实点已补齐，其他资源故障场景仍保留未测。
- **第六至七节补线并非全空白，也未全部完成**：商品v2/CAS已有仅编辑名称价格的有限服务+HTTP+浏览器闭环，不等于创建、删除、新SKU、图片完整维护；销货/调拨合法事件链已有各自有限合成服务/浏览器回读，非共享真实PG账本。默认客户、负责人、结构化条码、款数/分类、B13精确叶整合等已有后续实现及专项证据，应按各能力范围复用，不再次算成7项主BUG；历史unknown不能补零或套当前分类。
- **仍须单列的边界**：20/50/100条、长文本、空表、负数和打印多页/纸张；真实容量、代理监控、查询计划与P95；“命令→锁序→写表→约束→能力/读模型”维护矩阵及跨请求分页变化语义未在本次核对中建立完成证据。
- **真正的业务决定状态**：CLOSED已选B（仅已有账号login=false；未开通只在全部），后续实现、类型检查、定向组件和有限前台浏览器测试已完成，见 STAFF-CLOSED-FILTER-B.md；真实PG成员归属仍待验收；历史分类无可信来源继续UNKNOWN。本人改密是否归入基础设置审计及其事件合同，未找到新的明确决定，不能用管理员RESET_PASSWORD代替。
- **应保留而非待改造**：日期倒序保护、普通零价确认、同厅默认仓约束、草稿取消/明确放弃；不可达旧扫码/批选/旧收款弹窗不恢复、不重新放进测试分母。

## 时间与放行口径

目前不是还剩一整套前后端重构，而是已落地整改的环境/业务/性能验收及少数补线。不能以“7项都有补丁”报百分比，也不能在全PG尚未执行时保证剩余约3小时内全部验收结束。应按实际里程碑汇报：当前已验证包→隔离PG业务/权限→真实规模性能及错误恢复→独立发布复审与具体发布确认。未执行生产部署，本状态文件不构成放行授权。
