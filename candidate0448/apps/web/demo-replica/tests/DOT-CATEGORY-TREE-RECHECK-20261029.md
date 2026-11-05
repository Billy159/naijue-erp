# P14 分类树修复与限定验证

生产修复：5fc8aec82178288f5857caf488453258e3b0ef85。未推送 GitHub。

## 复现与修复
基线55ec3842在 actual-third/fourth/fifth 中，编辑父分类草稿后点击子分类超时。DOM 中21个标题仅19个可访问treeitem，子节点留在 aria-hidden 动画副本。保留浏览器原生动画、不禁用截图动画仍复现。具体动画清理触发根因尚未确定，不归因为普遍 React19 不兼容。

仅分类 Tree 使用已支持的 animation={false}，直接呈现有效树节点。选中、草稿保护、权限、排序条件与外观布局不变；展开收起过渡动画取消。不移除 aria-hidden、不强制点击、不增加 CSS 补丁。

## 实际验证
在 dot 原生云电脑，runtime tsc=0、真实前端构建=0。actual-green-5fc8 前台11步、actual-repeat-5fc8 12步、actual-complete-5fc8 13步通过。最终覆盖展开、搜索短袖、选择后清空、无匹配/Esc/清除、新增和编辑取消、编辑中换节点继续/放弃、带搜索草稿取消保留、选中不漂移、三次收起展开、可访问节点数量与标题一致、重读不变及零写命令。

## 边界
这是原P14的局部证据，不是整页通过。未同轮配对冻结Demo，未验证保存、删除、排序、真实低权限或数据库写入。界面样例是隔离合成资料。已有正式权限门禁保留；测试配置仅显式打开原分类维护能力以验证未提交草稿取消。

## 复跑
使用 tests/category-tree-public-config.json 构建到新目录；以 tests/recheck-category-tree-browser.py BUILD OUT --node NODE --headed --case RECHECK-P14 执行。OUT必须不存在。所有请求封闭于 synthetic-management.invalid，无真实业务写入。
