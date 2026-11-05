# 报告限定浏览器补验（2026-10-29）

本批没有业务命令、真实数据或生产请求。旧失败原件与新通过回执同时保留。

- 1e946511统一前端入口53/53通过（含构建、图检查、真实浏览器烟测）。这是有限合成环境，不是数据库验收。
- 同1e产物销售专项actual-sixth退出0、12项通过：SALE/RETURN空查询不污染金额；选定SKU但未填价格仍未知；100/10/90、反复聚焦、改20、直接替换零、无效负数；可达EXCHANGE保留原查询与已知汇总；实际鼠标局部25、Tab/ShiftTab及键盘替换20。无业务SAVE/prepare请求。第五轮动态`.last`错误指向新空行；现绑定原data-entry-row，不改业务。
- T08：bf175902有限样本3张原单，各取消/Esc/关闭，共9次；确认单号、文案、原DOM/焦点/路由及重新查询的原detail不变。未执行作废/弃审命令。
- I04/I03关联：bf175902版型/季节/供应商各鼠标和Space路径通过；仓库首轮点到0×0隐藏checkbox，改点可见原行后二轮mouse/Space/零选→1通过。保留每个独立范围结果，不能把首轮总FAIL改成PASS。
- S10：bf初轮与1e引用焦点改动后的定向重跑均通过，RETURN未保存草稿的第1/2/3笔方式/账户/金额键盘衔接、改方式清旧账户保留金额/商品查询/备注、Esc无修改。无选中SKU，不声称可保存、非空EXCHANGE、SALE或PG均通过。1e第一次预检因配置缺少测试脚本统一要求的existingEdit能力而停止，正确隔离配置重建后通过；非业务失败。
- F1原6坏链接原生验证见F1.md。

可移植补充入口：`tests/report-supplement-browser.py REPO BUILD OUT --expected-checkpoint FULL_SHA --node NODE --chromium CHROMIUM --headed`；构建配置用相邻`report-supplement.config.json`。可用`--case N34-T08-VOID-CONTEXT-01`、`--case N34-I04-FIT-SEARCH-TOGGLE-01 --i04-kind warehouse`、`--case N34-S10-PAYMENT-KEY-FOCUS-01`定向执行。该配置仅隔离UI能力开关，不授予权限；所有command/receipt/prepare在fixture前阻断。

员工CLOSED分类B及临时隔离PG访问已获用户确认，实施/全链验证属后续工作，不能计入本批通过。冻结Demo搜索空行延迟重绘差异仍单列；打印历史/单尺码缺样本、真实规模性能及发布许可不由本回执替代。
