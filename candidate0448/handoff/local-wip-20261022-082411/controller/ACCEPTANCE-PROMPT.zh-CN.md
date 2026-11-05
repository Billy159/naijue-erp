你是本地前端验收者。只验收本文件唯一绑定的固定版本。每个缺陷必须记录“复现→定位→修改源码→同路径复验→更新结果”，不能以依赖存在、HTTP200、静态截图或局部单测称全站完成。

一、唯一当前版本绑定
版本：v13.1-arco-menu-background
统一应用入口：http://127.0.0.1:57755/v13.1/synthetic-unified.html
HTML：2190776字节；SHA256：e494b6cbe2c163dc8d3afd1309ea7d7990c8d7b43148ff4ec0430277b4f0ff9c。
固定目录：/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022/apps/web/unified-browser-harness/review-builds/v13.1-arco-menu-background
source-snapshot：290项源码、配置、构建上下文及package/lock pin。
integration-source-snapshot：102项前端集成源文件pin。
核对SNAPSHOT-SHA256SUMS、INTEGRATION-SHA256SUMS及provenance.json；SNAPSHOT-REBUILD-RESULT.json证明仅从源码快照重建HTML逐字节相同。不能以活动dist或旧Git HEAD替代此版本，交接378c580基线上的WIP以实际文件hash集合为准。
当前contracts.ts为202d23bf77e2f4e8ae1632bcf778d2e8db9dd1fe7c49892cd5f44f3b83d282b2，主控持锁，本批未改。固定Node24.21.0，已有独立依赖，不另install或借旧仓node_modules软链。
静态运行唯一owner为主控，绑定127.0.0.1:57755的版本路径；每条路径返回完整同一Application，不是iframe或链接目录。只暴露精确缓存HTML，无源码/API/目录服务。运行PID及是否仍监听按主控最新PREVIEW-V13_1-MOUNTED.json；不承诺后台无限存活，不自行另启服务或覆盖旧BODY。

二、报告及环境边界
前端报告根：/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/frontend
本批ARCO-MENU-v13.1.json、MENU-BROWSER-v13.1.json、ARCO-CONTROL-MATRIX-v13.1.json、COVERAGE-100-v13.1.json及MENU-V13_1-FINAL-RECEIPT.json。历史功能证据MENU-BROWSER-v13.json，旧白底FAIL为MENU-V13-BACKGROUND-RED.json；同路径修复不抹旧失败。
主控独立证据在reports/controller/ARCO-MENU-V13-INDEPENDENT-BROWSER.json及ARCO-MENU-V13_1-INDEPENDENT-BROWSER.json；与本任务操作分开，不冒领为同一浏览器测试。
冻结Demo：/Users/billy/Desktop/Workspace/project-007-业务管理系统/奈爵服饰-8877-Demo，commit b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3。按该commit实际文件及最终index脚本/CSS顺序核对，不以早期模板为最终标准。线上对应源码仍VERSION_BINDING_PENDING；https://1n5635n614.goho.co/仅辅助只读，不猜地址、不强求登录、不复制线上bug。
本入口全部隔离合成内存数据，无密码、正式账号、数据库和外部网络；刷新清空合成单据。点击“进入验收版”即可。公开调试区只注入合成故障，其原生debug控件不冒充业务Arco控件。业务写入测试只在此合成环境，不保存/审核/停用生产数据，不改变真实库存。旧dirty仓库、冻结Demo、交接原件、task-7浏览器/进程/49268继续保留。
真实TLS/API/PG、正式认证、非空媒体、旧Mac同DPR2条件另列。浏览器证书警告必须用户本人处理，不绕过、不改系统信任。离线真实host构建不代表这些链路已验收。

三、本批真实Arco Menu及复用验收
DemoFrame只调用一个DemoNavigationMenu，共用包根Menu、ItemGroup、SubMenu，Arco2.66.16。selectedKeys来自已执行route/document状态，openKeys受控，初始两组展开。不能点击就乐观标记导航成功，不凭UIflag授能力。
精确href-only目标保持原链接；onActivate目标调用原回调并防Enter的额外原生click。缺目标的菜单项是真实Arco disabled、aria-disabled、tabIndex-1且无href。保留原DocumentNavigation.showList/openCreate与ApplicationController.navigate的脏稿、uncertain、P1保护，不新增API或合成fallback。客户/供应商拆分是此前明确业务差异，保留，不硬并回往来单位。
安装的inline Menu原生处理Enter；共用键盘适配补ArrowUp/Down、Home/End、Left/Right/Esc，仅在该Menu内移动焦点/控制展开，不伪造激活。折叠组跳过子项；Esc从组内回该header；Tab遵守浏览器顺序。
v13实际发现普通项及4分组标题白底255/255/255，与侧栏248/249/250不一致。定位navigation-menu.css缺背景声明，被Arco light默认背景覆盖。v13.1只对普通项、组标题、header明确scoped transparent，保留selected/hover/disabled tokens；旧v13 HTML与FAIL不改。
本任务IAB tab2 CSS1049×590/DPR2.440000057实际同路径GREEN：14普通项除selected外透明，4标题透明，sidebar248/249/250，selected商品232/242/255；header公开点击后actual:hover true、243/248/255，折叠不改变商品选中，焦点轮廓可见。Menu宽187.186、sidebar宽207.998、mainX207.998。浏览器error/warn日志空。只表示本批样式/交互scope，不是整页视觉通过。
本任务旧v13功能实测继承（v13.1无逻辑变化）：方向键/Enter可导航；销货备注脏稿后Enter商品仍保留原编辑器、原备注、selected sales/new、commands0；取消确认Esc回精确取消新增按钮；延迟翻页取消后转条码方案，40秒后仍方案/原导航焦点，旧商品未复活；菜单激活商品在途revoke立即及21秒后Menu0/table0/pager0、入口可见。主控另独立核Home/End/循环/disabled/普通项真实hover/无横向溢出；不重复冒领。
MENU-RED.log真实组件缺失exit1保留；MENU-GREEN-FINAL.log、MENU-WEB-TYPES-FINAL.log、MENU-STRICT-P1-HOST-FINAL.log、MENU-APPLICATION-SALES.log、MENU-APPLICATION-TRANSFER-FINAL.log、MENU-SPLIT-BUILD.log均exit0。最初旧native button断言失败迁到实际Arco menuitem aria-disabled后业务断言同路径转绿，旧日志保留。依赖开发测试有Arco/React19 element.ref弃用警告，未升级依赖；真实生产候选浏览器无该警告。Screenreader操作未测，不能用aria属性代称实测。

四、继承能力及必要例外
销货/调拨保存并确认原receipt后跨模块直接新增为空白；未保存及提交结果不确定时保留原输入/原请求键，重复NEW或跨模块不能丢稿。prepare失败不发commands；丢响应仅核原receipt，不重复SAVE，不模拟审核或库存过账。本批严格P1合成mock-fetch回归覆盖上述分支，非真实生产写入。
共享真实Arco Input/DatePicker/Select/Checkbox/Button、Modal/Drawer、Tabs、普通Table、ExactValue Tooltip及七普通分页保留。日期部分串/非法串/清空与精确金额、大整数保持字符串语义，禁止转Number丢失空白、0、负值或精度。
StandardPagination已知安全total使用实际Arco；unknown/null无假0或估算总数；真实0仍0。大于MAX_SAFE整数的精确total例外采用明确BigInt导航及真实Arco Input/Button，保留domain安全偏移/页末限制。BigInt/unknown浏览器夹具未暴露，DOM通过、浏览器NOT_RUN分开。四处明细/稀疏分页不冒称七普通列表已覆盖。
v12页大小disabled导致焦点落BODY的FAIL保留；v12.1共用focus ticket仅对本次选择、确经disabled、同scope/generation/active且就绪仍BODY时通过公开Select.focus返焦。外部pointer/新焦点、Tab/Esc、导航、身份、卸载撤销，不抢用户焦点。实际取消/迟到/身份和主控独立返焦证据见ARCO-PAGINATION-v12.1.json。
商品整页为同workspace真正整页，独立Drawer保留。六个Tab仅基础/规格/图片部分只读接入；条码/九价/完整授权全仓库存未接，禁用且无IO。返回保原分页/筛选/滚动及精确触发器。缺厚薄、完整分类路径、原标签/历史SKU、图片角色/颜色归属/顺序等逐字段NOT_CONNECTED；合法图片空集合不代替非空媒体验证，不猜URL/授权。

五、后续逐页验收标准
沿100行清单逐页面、Tab、弹层核字段/必填、筛选/表格、导航/面包屑、空/错误/等待、键盘Tab/ShiftTab/方向键/Esc/关闭/遮罩/精确返焦、取消/迟到、身份清除和脏稿返回。合理业务差异保留并说明。旧取消403不得撤销新身份，当前403清当前事实，重试建新scope。
真正查包根imports、版本、组件树及可达DOM，不能只扫五标签或仿CSS。Arco内部native DOM、官方/icon路径和StandardOverlay语义props不误算伪组件。当前固定graph107生产TSX、2处literal自绘role层；整个src为4处，是不同scope。原生table13=12业务表格+1官方Arco renderer，逐个分类；普通列表不得借矩阵例外逃避替换。
本批Menu已接真实组件；顶栏Breadcrumb仍ReactNode/text（商品整页已有真Arco Breadcrumb），7处领域状态Tag、其余自绘层和业务表格仍待治理。复用组件/状态/验证/tokens，逐项列重复代码、特化、行为不一致和CSS污染的文件行号；不能硬合并销货和调拨不同状态词或把保存状态当业务授权。
只改已授apps/web，锁定contracts/根包锁/跨端接口按唯一owner协调；不改backend/migrations/原始数据/生产权限。当前磁盘保留2GiB，未重新预算不做新构建/大快照，不删除旧证据。

六、结果记录
35页面/页签+65弹层分母不变，严格整行视觉PASS=0。已实现、部分/只读、未接入、FAIL、NOT_RUN分开；每条带固定版本、动作、视口、文件行号/hash和实际复验结果。局部PASS不是全站完成。
历史仅作证据：v10布局FAIL、v12返焦FAIL、v13白底FAIL及旧PROMPT-v10.1版本绑定冲突FAIL均保留。此文件只有一个当前版本绑定，不追加旧端口或互相冲突的“本次固定绑定”。
