# 多营业厅隔离服务与UI验证

源业务基线 bac60d98aef485411c694d07721dcee66e71b355。此目录是测试代码，不在生产入口加载。

## 已执行
在dot云电脑：6组Node合同测试通过；实际构建成功；B06-MULTIHALL 7步实际前台通过；B02-HALL-RESTRICTION 2步前台通过。两厅、两仓、两方式、三账户来自全新独立当前主数据，不修改旧QA数组，不伪造历史信息。

B06覆盖双厅详情、移除、取消继续、远程无匹配保留已选、重新添加、清空放弃、重新读取原双厅。B02覆盖厅对应仓库筛选，以及存在另一厅仓库时默认候选不串厅。没有发保存/回执命令，没有改业务代码。

## 必须保留的边界
真实部分是现行HTTP插件/service解析投影与页面；authenticate、evidence/ACL、readList/readDetail为隔离测试适配器。拒绝营业员负例仅证明服务传播adapter拒绝，不是生产认证、PG ACL或SQL正确性的独立证明。字段关联也不是销售账户资格的新权限。保存/审核/真实数据库仍未验收。

两次浏览器失败为测试定位：被删除标签的动画DOM仍在，需等待可见标签；大厅搜索input匹配到复选框，改为combobox内textbox。保留旧失败证据，不改生产控件来掩盖。

## 执行
设置MULTIHALL_REPO为仓库绝对路径，MULTIHALL_EXPECTED_CHECKPOINT为当前完整HEAD，以Node24 --experimental-transform-types --test read-contract.test.mjs运行。SOURCE_BINDING记录已审查祖先版本，当前HEAD必须由调用者显式指定，且全部绑定源码hash不变；源码有变化必须重新审查，不会自动接受。

用public-config.json生成新的隔离真实前端构建。browser-check.py BUILD OUT --repo REPO --expected-checkpoint FULL_SHA --node NODE --case B06-MULTIHALL --headed；可单跑B02-HALL-RESTRICTION。OUT须新目录，全部网络封闭于synthetic-management.invalid。config仅启用测试现有草稿能力，不更改正式配置。不得据此宣称全页/全系统/正式上线通过。
