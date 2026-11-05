# 文件与环境归属

当前状态：完整交接包已校验并恢复，前后端写入权已移交。当前精确公共接缝以 WRITE-SCOPE-20261022.json 为准。早期尚未接包/只读表保存在 history/OWNERSHIP.initial-intake.md，仅作历史，不再构成等待条件。

| 范围 | 唯一 owner | 现行范围 |
| --- | --- | --- |
| 控制根文档、STATUS、矩阵、共享决定、reports/controller | 主控01a15f48-7d75-74fa-a12e-e9e56a73d003 | 汇总、只读审查、独立联调及上线门槛 |
| apps/web/**、status/frontend.json、reports/frontend | 前端01a15f4b-3497-7521-ac21-3d4e0db5a033 | 源码/前端测试与固定构建；不改后端/主控汇总 |
| apps/web/src/application/contracts.ts | 主控锁定 | v4可选store-settings精确变更已收，SHA71823c5ad70892413ce86ca1c0baf2f84d2f4c985ecefb8021013f6f0a4af947；新变更先登记唯一owner |
| adapters/postgres、packages/domain/application、apps/api、scripts/import-v2/v3、tests、相关后端docs | 后端01a15f4d-371d-72ff-be00-b4d1d0728029 | 含已登记finite17/payment/settlement；公共接口按单项登记，不改前端/根配置 |
| status/backend.json、reports/backend | 后端 | 独占阶段回执与不可变checkpoint |
| 根package/lock/tsconfig、跨端契约、公共构建/发布registry | 主控协调并登记唯一owner | 依赖已安装Node24，lock不变；tsconfig仅已登记生成review快照排除，不降低严格度 |
| 独立合成PG+HTTPS联调runner与生命周期 | 创建者主控或后端 | 只管理各自精确新目录/端口/PID；不抢对方测试目标 |
| 原naijue-erp-v0.0.1、全部WIP、冻结Demo、交接原件 | 受保护旧owner/冻结参考 | 只读、不reset/clean、不覆盖、不构建冻结Demo |
| task7目录/49268/浏览器、task8原PG证据 | 原任务 | 仅报告只读；不抢浏览器、不杀进程、不重跑冒领 |
| 原16文件备份及已确认v2/v3数据 | 原件受保护；后端唯一私有数据接收者 | 不上传Git/Library；真实数据尚未解压导入；源备份INCOMPLETE保留 |
| 服务器隔离恢复准备与执行 | 主控已正式接手 | fresh2 DB+媒体限定通过，精确新CID已停止PID0，目录和旧失败保留；旧task4不并行，后端不做运维 |
| 正式生产部署/切换/回退 | 主控协调具体方案与上线门槛 | 尚未执行；原线上仅查看，生产指纹不变；新增权限和不可逆删除服从平台要求 |

开发repo：/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022。完整归档SHA bfa5da83a03808d69851e4c269dfc1eec86a38b404c3283602bed1e48a55ffb8，2181校验成员及2160源码/WIP精确复原记录已存；不能拿GitHub378c580或旧deedf387冒充当前最新。

共享变更登记目的、确切文件、唯一owner、版本、兼容/影响范围与验证方法；收回精确diff/pins后重锁。冻结review-build、checkpoint、source-snapshot不得就地改，后续新版本用新目录。

当前真实宿主run3：主控node47087/PG55561/HTTPS55661，19:22:56UTC起30分钟TTL；按既有生命周期关闭，不因等证书无限延长。IAB证书警告只由用户本人处理，不改信任或验证。源码、控件和服务所有权不因浏览器阻塞转移。


当前application/contracts.ts已核最小fullPage type import+optional字段后重锁，SHA256 202d23bf77e2f4e8ae1632bcf778d2e8db9dd1fe7c49892cd5f44f3b83d282b2；前端继续apps/web其余已授范围，后续合同变更先登记唯一owner。原71823c为上一冻结基线，不作为当前活动合同pin。
