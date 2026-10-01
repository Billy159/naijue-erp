# 商品图片密度与历史区域移除 · 2026-10-01

[COMPUTED|HIGH] 当前 8877 已加载本轮图片组件及样式，Google Chrome 实际操作和页面回读通过。

## 本轮范围

- 商品详情图片页与库存只读抽屉共用 `ProductPhotos`；移除历史图片区、折叠入口和对应展开状态。
- 颜色图直接复用详情图的 `.pc-arco-photo-row`，每格从 64px 缩至 48px，沿用 6px 间距，颜色名及完整 title 保留。
- 当前图片、上传顺序、Arco Image.Preview / Upload / Dropdown / Menu、每色一张规则保持；未执行商品保存、图片删除或上传写入。

## Chrome 局部验收

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 浏览器加载本轮源码版本 | 组件和样式均为 `product-photo-density-20261001a` | after-reload.png |
| 主页面历史图片区 | 无区域、折叠入口或历史文字 | after-photos.json / after-photos.png |
| 主页面颜色密度 | 48px 每格、6px 间距、54px 横向步距，与详情图相同；1470px 视口的18色一行 | before-photos.json / after-photos.json |
| 当前图片数量与顺序 | 主图9、白底1、吊牌2、详情38、颜色12；六种无图颜色保留添加入口 | after-photos.json |
| 原数据保留 | 114份图片记录、18个颜色及顺序与改动前逐项相同 | before-photos.json / after-photos.json |
| 颜色图片预览 | 原图2048×2048加载成功；Esc关闭后留在图片页 | color-preview.png / image-operations.json |
| 图片操作菜单 | 官方 Dropdown 正常打开，Menu 中“替换”“删除”均存在；点击外部关闭 | color-menu.png / image-operations.json |
| 660px只读抽屉 | 48px / 6px / 54px相同密度，18色自动排两行；无历史区和编辑操作 | drawer-photos.json / drawer-colors.png |
| 关闭抽屉 | 原查询HTML、滚动、URL与商品对象相同 | drawer-query-before.json / drawer-result.json |
| 运行源码范围 | 114个前端文件中仅组件、样式、编译资源与缓存版本4个变化，110个其他文件摘要相同 | runtime-scope.json |

构建 `npm run build` 与改动组件 ESLint 检查通过。首次菜单断言误用 `.arco-menu-item`，实际官方 Dropdown 输出 `.arco-dropdown-menu-item`；回读后改用 `role=menuitem` 并复验通过，未因此更改产品代码。原断言的DOM证据保留在 menu-selector-check.json。

## 路径与服务

用户已手动将外层目录改回 `project-007-业务管理系统`。原Python页面服务仍使用旧 `project-007/.../frontend` 绝对路径，8877返回404；已停止经PID记录核验的本项目启动进程，并从当前工程运行原启动入口。8877返回200，8878健康检查成功。没有迁移目录、重建数据库或修改账号。

本轮裁定替代历史“折叠显示历史图片”和前轮“只在库存抽屉隐藏”的展示规则：共用图片页均不显示历史区域，存储记录保持。先前冻结标签保留，本轮按用户明确补充执行定向UI修改。
