# 冻结审查版与继续开发交接

## 审查版不等于当前WIP / 生产版本

- 运行入口只有 `synthetic-unified.html`。同一个actualApplication与左导航；静态HTML完整内联，仅接受closed synthetic transport。
- `source-snapshot/` 是**实际esbuild输入**加必要rebuild scripts/config/lock/验收文档的独立副本。`SOURCE_SNAPSHOT.json`逐文件hash；`provenance.json`绑定运行HTML与实际working-tree输入，不把Git HEAD当部署版本。
- 后续正在修改的原仓库与此快照分开。验收先记包ID、HTML SHA、源hash。修复产新版本/新hash，不覆盖旧FAIL、截图、manifest或旧包。
- 快照不含node_modules、真实业务数据、凭据、原Demo业务数组、截图、数据库、后端WIP无关文件。本包只承诺重建指定离线前端，不是整个仓库的后端构建/部署源；全量WIP由主控按各owner边界另行交接。
- `package.json/package-lock.json`保留原版本锁，其他后端测试脚本指向未包含文件属预期，不运行`npm test/check`当此缩减快照完整仓库。指定前端build命令见README。使用用户已有锁定依赖；若需新装依赖，应先获得用户许可，不自动联网。

## 本批实际源码边界（原仓库仍保留）

1. `apps/web/src/products/`：独立真实商品管理reader/控制器/列表/筛选/UI/tests，不拿交易候选API缺字段补空。
2. `application/routes/{products,product-categories,product-settings,barcode-schemes}.tsx`、对应styles、shared contracts/controller/presentation/build与devhost：全部默认缺失/关闭，显式cap才可达；不自动注册真实API或grant。
3. `product-settings/read-only-settings-host.tsx`：4Tab按allowedTabs显式装配；颜色/版型UI action-lazy，卸载/迟到/拒权/identity隔离；尺码组/季节原实现复用。
4. 仅获批准的原模块最小改动：dictionary allowedSettingTabs；shared `inventory/product-drawer-host.tsx` 与 `components/use-dialog-focus-return.ts` 原生关闭/commit后返焦点；条码方案对应host；Party显式readOnly cap与真实写按钮disabled，默认维护协议不变。
5. `management-browser-harness/` v2保留独立历史构建；`unified-browser-harness/`为本轮统一入口。不替换旧交易harness、无公开站点、无生产注册。
6. 独立新分类/颜色/版型模块由另一owner冻结，接口不变；本owner只composition，未改其实现。冻结清单 `apps/web/src/product-settings/colors/verification/source.sha256` 仍应全OK。

## Production仍待显式决策/执行（本包没有开启）

- 每kind独立现行policy与APIhost注册；不得用ADMIN默认grant或浏览菜单能力替代真实授权。
- Product管理全目录/限定product集合与全仓总库存访问分开。可信完整cutoff/receipt/checkpoint/guards及所有warehouse/SKU覆盖成立才可显示缺失余额0；授权子集不能标全库存，未知保持null或明确不可读。
- 分类productCounts独立NONE/ALL授权。全目录可见不代表ALL计数；NONE不得查询product，count:null。
- Drawer基础/规格/图片、九价和媒体仍按目标授权；列表grant不能扩大。实际媒体provider未给不造URL。
- 真实target API、Cookie/TLS、服务器/数据库迁移与事实证明、生产CSS/action就绪、线上身份生命周期与部署回滚均后置，不以synthetic验证代替。
- 商品维护6Tab/写、扫码/条码补录、流水、导出打印历史、员工账号和收款管理未闭环，不假接入。

## 下一步固定范围

本地前端任务只读审查本快照与用户已核实Demo/线上；优先记录旧Mac3FAIL复验、真实Arco/复用分叉、访问顺序CSS污染、交易dirty/prepare/receipt边界。**本轮交包前不重写全站Arco，不为凑35/65发明页面。**
新问题交回dot后按原/线上/新证据及用户确认要求修复，再产清晰可回溯版本；没有实机证据不能改为视觉PASS。
