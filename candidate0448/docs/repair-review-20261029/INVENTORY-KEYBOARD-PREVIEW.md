# N34-I01-PREVIEW-KEYBOARD-01

固定2e7e804b真实产物 headed RED：搜索M26，ArrowDown高亮M26004，但预览仍显示M26001。截图、断言和日志 `ui-controls-20261029/keyboard-red/`。

修复只复用Arco公开 SelectHandle.activeOptionValue，在键盘导航后下一帧更新现有previewId，不另建键盘索引，不改变选择/Enter语义。关闭、卸载时取消待更新；query intent改变不发布旧帧；新搜索清空旧预览选择。

库存生命周期定向native回归与typecheck已通过；新固定产物前台GREEN待下一步执行，不能据此将矩阵项已验收勾选。

追加GREEN：固定4ac0644f生产产物，dot真实headed实际ArrowDown到M26004，右预览同步M26004；ArrowUp回M26001也同步，截图已目视。无pageerror。关闭/新搜索/分类筛选/员工保存/单据抽屉顺序回归通过。`ui-controls-20261029/keyboard-green/result.json`。
