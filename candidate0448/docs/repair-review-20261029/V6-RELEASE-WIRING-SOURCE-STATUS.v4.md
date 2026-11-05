# V6 发布接线源码状态 v4（2026-10-30 07:07 UTC）

## 当前结论

**候选源码的发布合同、部署元数据检查与容量 helper 校验已接齐，并通过本次有限发布回归：Python 53/53、Node 13/13，均 exit 0。** 这不是全新隔离数据库的从零安装证明，也不是生产部署、真实数据或统一界面验收通过。此前交付的 ae7 源码包/ZIP 保持不变；本记录描述新的 post-ae7 候选工作分支状态。

旧部署检查的实际格式是 **V1**，不是 V3。V3 是后端另一份 exact13 xmin 观察合同。本修复保留旧 V1 默认语义，新增显式 `runtime26Full.catalogProfile = "complete-write-v6"`，严格匹配 V6 format/patchLevel，要求原始 source/迁移/catalog/身份校验和 `complete_write_xmin_acl_match === true`。未选择、未知选择、跨版本和缺少/额外证据均拒绝；不由 review 内容推断或回退版本。显式 V6 使用版本化 staged binding，旧 V1 binding 字节/摘要保持原样。SQL135、角色/ACL 与业务守卫没有改写。

## 不是自动刷新校验值

原 `DEPLOYMENT_CAPACITY_SHA256 = cb3c146b29d0becc50485d57891d774884905110eb635c99610d50d5a94e23da` 对应确切源码提交 `482d883c4b4f7cb78ee673705bd75a804cdec1f1`。独立审阅检查了该可信前身到候选 helper 的全部 157 行 diff，包含此前 A1 新鲜 liveness/readiness 修复，而非只检查 ae7 之后的 V6 小差异。

独立技术审阅绑定候选 helper `f5a7e6aa2417579658a470f0c2a1ce6b6bf8c136c7abf300f0b2bf943e038852`。主控核实实际字节与审阅一致后，在用户明确要求的源码修复范围内，仅登记了候选源码的 CAPACITY checksum 后继。`DEPLOYMENT_FULL_SHA256` 仍为 `a2c149cd7543b82c76b249c975d01d6961d22a3fd0bb2ec26b3797e077bbe578`，其他旧 pin 和实际部署授权门禁均未变。没有生成或伪造 live approval、目标审核或生产执行权限。

生成器现在按 boot 实际 `capacityHost` 分支核对 CAPACITY pin，不再把当前容量 helper 错当成旧 FULL helper；缺失、重复、格式错误或不匹配仍关闭。生成器本身不会写入任一可信 pin。原完整 `generateReleaseContract(true)` 测试保留，并于本轮实际通过；新增的 generated-facts 测试没有替换它。

## 测试轨迹与证据

- V6 用例先在旧流程 RED，再实施有限合同/部署检查后 GREEN。
- ae7 原生基线：Python 47 项中有 5 个既存失败/错误；原 Node 合同检查 3/4。新候选最初 53 项中同样 5 个问题，并非新增 5 个回归，但仍必须处理。
- 修正测试侧的开发者机器 Node 绝对路径、缺失的无关容量 fixture，以及已经停用的直接 create_app 调用；生产守卫未放宽。日志参数负例改为实际校验 limits_args，不再因无条件拒绝的旧入口而虚假通过。
- 独立 helper/generator 源码审阅后，主控完成精确 CAPACITY 源码 checksum 登记，实际 07:07 回归 Python **53/53**、Node **13/13**，无 skip；完整原 generator 检查仍在执行范围内。

原始独立审阅、原生日志、exit 文件及 SHA-256 清单位于相邻 `v6-release-evidence-0707/`。审阅 JSON 的旧 boot hash 是审阅发生时、登记前的观察；清单另存登记后的 boot 源码 hash，不能混称同一时刻。所有测试由主控原生执行，准备/审阅代理未执行数据库或测试。

## 仍未关闭

HIGH 的完整“全新隔离环境可重复部署”验收仍待完成。现有 V5→V6 helper 只是有限 15 用户列 + xmin 读取增量，不等于空库安装器；后续 from-zero713/profile/carrier 仍是仓库外候选，未在此轮声明实施或验证。不能拿另一测试库的身份、catalog 摘要或审核文件充当新目标批准。

下一步必须在独立新目标上验证确切源安装、有限权限、普通 runtime 新登录与独立原始 V6 审核，再执行授权的原服务链及缺权/多权/序列/PUBLIC/grant-option/角色/source 负例。旧 V1/V3/V4/V5 含义与 SQL135 保留；现有数据库、已提交数据与证据不得重建或重放。正式部署仍需原发布读回、容量、备份恢复、目标与执行授权门禁。此前 NORMAL14/TRANSFER4 服务通过仍只按其原范围有效。
