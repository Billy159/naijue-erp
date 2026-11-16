# start33 既存挂载边界只读取证

检查时间：2026-11-16 15:36:00 UTC（北京时间23:36）。未新建或启动容器，未执行Node/PG，无数据库连接、配置/权限/数据修改；未读credential正文、配置env值或完整argv，未全树扫描。

## 实际已有记录 observed-existing

- 停止容器823a830f…属于原start33，image6de4…，user=0:0、readonlyRootfs=true、running=false、pid=0。既存Docker配置保留6项相关bind；这些是停止容器当前仍保存的配置，不能声称取得当时mount namespace快照。
- saved readonly-mount-plan.json SHA f5f7625f4e276a9dfae64bc4fb29e389d55fc8ef5cad9b2be25e9ef00810a70c；其3项相关只读映射与停止容器逐项一致。saved create-attempt SHA ea0836a76485ea8803fb8e51487945d505609972c08fe4cff87345b770b026cf，原start33/attemptOnce=true/authority b6cb…。
- `/var/lib/naijue-erp/fresh35-production` ← R3主机`state`，**RW=true**。ROOT06没有独立子bind。
- 旧`installed-real-operation-51724553-20261114-01/operation`及其node_modules有独立RO bind；对应源码r3_05_readonly.py的OPERATION仍是旧517目录。这和准确carrier源码一致，不能称挂载漂移。
- `/run/naijue-rewrite` ← R3主机`authority/r3-service-33-worker-proof`，RO；`/etc/naijue-erp` ← 原start33`authority-61035`，RO。
- `/opt/naijue-erp/fresh35-combined-v1` ← 原R1主机`deploy`，RO。没有reference-inputs子bind遮蔽。

## 源码推导 source-reconstructed

根据现存最长父挂载覆盖规则，batched161-run.mjs中ROOT06路径投影到R3主机state下ROOT06；SERVICE投影到worker-proof/current-production-service.json；reference-inputs投影到原R1 deploy/reference-inputs。具体全路径、覆盖bind及source pins见RESULT.json。这些是已有挂载配置加源码的推导，**不是在停止容器内实际stat**。

六项相关映射与normal_service05_after08.py + r3_05_readonly.py + r3_05_runtime.py + fresh35-production-carrier.py准确投影一致。ROOT06源码通过RW父状态挂载可见，独立RO代码/依赖仍指旧517：这是具体范围差异，但既存配置没有违背当前carrier投影，也没有证据证明它引起原拒绝。

## 仅主机metadata，不能代替执行namespace

- state inode13502389 root:61035/0710；ROOT06父inode13665680及operation inode13665681 root:root/0755。固定scripts/release/unified-install、tools/unified-import目录及5个直接模块root:root，目录0755、文件0644，已查项均非symlink，符合uid0/无group-other写的metadata谓词。
- worker-proof目录inode13666138 root:root/0755，current-production-service.json inode13666148 root:root/0444；authority-61035 root:61035/0750及C副本0440。
- 原R1 reference目录root:root/0755；INDEX与九个固定reference leaf均root:root/0644、非symlink。只读元数据，未读reference正文或重哈希。
- ROOT06/operation/node_modules主机路径ENOENT；旧517所挂deps源inode13504771 uid/gid1000/0755。这个非root身份只属旧517依赖挂载，不在ROOT06树下，不能据它判ROOT06 trust失败或推断ERR_MODULE_NOT_FOUND。
- 未检查整棵ROOT06，未恢复当时`/var/lib`等image ancestor状态或执行namespace路径身份；没有新增namespace、Node或PG观测。原异常类型/阶段未保存，底层根因仍UNKNOWN。

下一步仅交C/D1。正常后继的观测源码须经QB，再由C确认精确许可与start/restore最终CURRENT_SOURCE和proof pins配对；本报告不准开34，不恢复旧key或重跑成功input02/ROOT06。
