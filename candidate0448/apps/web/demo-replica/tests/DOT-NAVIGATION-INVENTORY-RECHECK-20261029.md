# A02 / I01 实际页面接续验证

基准 d0fdba5d5565c2adec1aca65d8f9ee74c1d6c876。本批无业务源码修改。dot原生构建成功后核对全部manifest inputs/outputs和当前源码HEAD；真实前台Chromium、原始合成QA只读桥，不访问生产。

## A02：10个有界步骤通过，整页PARTIAL
实际侧栏切库存、销货、调拨、商品、员工五入口，核实际结果、菜单选中、面包屑、账号位置；鼠标和Enter折叠展开导航组、焦点保留；浏览器后退前进正确；返回库存按现行普通路由重挂载合同为idle，再查询有结果；连续切换最终库存意图胜出，无旧页覆盖、新tab和卡加载。
这些是隔离合成环境观察，不是线上耗时/P95结论。普通侧栏返回不宣称恢复库存过滤草稿；商品详细库存显式返回由既有P13单独验证。

## I01：12个有界步骤通过，整页PARTIAL
六款四仓库存精确1504，独立整数聚合校验完整DTO与已挂载表格单元格。1440×1000、900×1000、1470×668滚动与虚拟窗口；固定列宽、合计/操作互不遮挡；单款/两款输入未查询不覆盖已执行结果；实际查询、单款/颜色/全部折叠展开后合计和焦点；高级筛选开合及重置立即重新查询全部，清草稿、折叠和滚动。
900px固定前后列整体空间挤压仍保留，不宣称窄屏完整布局已修；也不将所有离屏单元格等同全部视觉检查。没有同轮冻结Demo配对、真实角色/PG、流水、导出打印或故障重试整链验收。

## 文件
证据 recovery/navigation-inventory-test-prep/actual-a02-first 与 actual-i01-first。入口 tests/recheck-navigation-inventory-browser.py；可复用 document-list-readonly-public-config.json 构建。参数 BUILD OUT --expected-checkpoint FULL_SHA --node NODE --headed，可用--case分别运行。不要重复相同版本/范围的有效证据。
