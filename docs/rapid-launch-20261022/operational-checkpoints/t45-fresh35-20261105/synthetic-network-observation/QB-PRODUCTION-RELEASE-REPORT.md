# QB production V2 发布适配审查

结论：**NEED_FIX，唯一 F01/P1：缺少原生启动所必需的容器文件绑定**。

本次仅审固定哈希快照，非已提交/合并源码。MANIFEST `74f9e74ecc5bf5634163261441ed26ad2a8cfd0116c2358fed256cb2f409aba7`，READY `4e62d93ebc819e1d3ebe1ddd00b62fdf3837a30f616ad4f35d41d6e3bbac617a`，owner RESULT `b8c9d1e11d58d19225805f2cf01436492de7fdcce3c43a3f3dee5e7f1ba21524`。5改动叶、2不变调用者及各自父哈希均匹配。

新 validate_runtime35 放行精确 V2，但 create_capacity_gate_app/runtime_mount_arguments 没有挂载固定 `/etc/naijue-erp/fresh35-combined-installation-v1.json` 或 target.ordinary.referenceDirectory。以原函数和只记录参数的 Docker 模型检查，两个路径均无对应挂载或祖先挂载。原生 admit 在连接数据库前必读该受保护记录并检查 reference tree；宿主机验证文件不使其自动出现在容器内，现合同也未证明镜像包含此安装专属内容。普通干净运行镜像的合法 V2 计划会在原生准入时失败。现有完整 runtime 模型替换了宿主 record 读取，未覆盖容器可见性。

C/T45 confirmed the same fixed-source carrier gap. C assigned original T45 owner only exact read-only single-leaf binds for record, INDEX and nine whitelisted references, retaining identity/hash/trusted parents/ordinary UID access. No blanket directory mount, generic plan field or permission change. Recheck only affected successor leaves and argv/refusal controls; no PG/deploy.

其余10组独立窄核通过：20项重绑后语义/版本反例、历史V2描述、ordinary与install端点区分、8项profile/physical/capacity/media反例、自洽V1拒正式、10项重哈希恢复绑定、source/program/catalog/receipt不可替代、native SQL闭包，以及生成事实/5项伪事实/原批准门禁。实际快照 generator --check 为 exit1/DEPLOYMENT_HELPER_REAPPROVAL_REQUIRED，无写入。boot/rollback字节和9394f7批准哈希未改。Owner17Python+5Node结果采用固定回执，未重跑全套或构建。

模型从固定快照内存加载，使用本地临时参考/容量文件和显式host-record/Docker参数模型，无真实能力或服务器。catalog反例脚本首次需同步已有newDatabaseReceipt别名，已仅修正脚本、保留初始日志并复用前5组成功结果。

真实普通UID读/watch、PG、服务器、完整构建/发布/恢复均未测；原helper重新批准仍待C准确绑定。实际模型/Fast UNVERIFIED。原生消费者引用绑定 base `f5c0824664778d1b5c5e30b1ba68156c6420c90c`，非重审其原合同。详见 RESULT.json、fixed-evidence.json、独立脚本/结果/日志、visibility-results.json。
