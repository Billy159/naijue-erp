# 31-02 本地登记与只读核验适配

已完成本机源码配对，未执行登记、签发、新鲜现场核验、SSH、PG、构建或业务操作。正常启动 hold 仍未关闭，等待原 QB 对这一准确配对收口。

- Main 只绑定 SERVICE31-INSTALL-TRANSPORT-02；01 历史保留。原配置读取客户端不改，实际上传客户端固定 846e，实际 runner 固定 c734，接收端模板固定 857e，私有代码固定 12283 字节 / 725415。
- 登记适配器按现行 issuer 的 COMPLETED_ROOT04_REUSE 状态读取，不再使用旧 ROOT03_SUCCESSOR 状态。仅准备未来一次登记；未知结果仍只读原登记路径，禁止重放。
- basis reader 对应 128 个原文件及原 execution.lock；未来只要求六个未提交阶段（两 grant 共十二条记录）和六个登记路径不存在。实际04 独立验证 COMPLETED0 的 root/public terminal、root/public result 与输出 marker，接受 8bb，绝不要求04输出不存在或重新提交04。原03证据单独保留。
- 前驱改为实际30成功启动 → 原 preservation stop → 原认证恢复，读回三组 terminal/root/public，原 C/ACK/cleanup、保护恢复标记元数据及三个旧容器停止条件。认证正文不读取；未把历史停止收据写成新现场结论。
- 本次 26 项定向检查使用实际客户端 collector、实际 submit manifest AST，以及接收端 freeze 中 375–387 行未经改变的 member-buffer AST。包括准确字节正向、错 task/job/grant/row/body、旧30、其他敏感名、软硬链接及已有私有 job 拒绝。只在本机临时目录运行，未触真实客户端 state、队列或权限。该检查不模拟未来 authority，不越过真实 admission，不宣称实际31完整 freeze 或运行通过。
- 先前43项及已通过D1/SQL/factory等证据复用，本次不重跑。旧材料、原客户端、root04源码和历史结果均保留。

准确文件指纹见同目录 READY.json / PINS.json，basis reader 另在 ../20261116-r3-service31-registration-basis-local-01/READY.json。当前仍缺 QB 对新配对最终审查，以及其后主控明确的现场读取/签发接续；本轮不执行这些步骤。
