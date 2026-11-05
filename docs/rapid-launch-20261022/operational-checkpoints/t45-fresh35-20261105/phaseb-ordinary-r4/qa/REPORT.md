# QB r4 定向源码验收

结论：**PASS_SCOPED_SOURCE_AND_LOCAL_MODELS_NOT_EXECUTION**，本次未发现待修源码问题。

固定提交 `13664cdad37c4ccdc9af2bbe85dd7e0f65b0faaf`，父提交 `5fca405dba372a6b703ed024d23867711fe0d51d`。wrapper `39404646…`、test `0e5efe95…`、READY `807553b9…`、RESULT `27e0e960…` 哈希匹配。比较的准确原 r3 wrapper 为 `7b239be925bd29783f264a4bf903770cb07505011209af13724fa12125862a78`。

仅新增普通空文件读取器、缺项补写及其入口；旧函数仅改变最终核验和 main。其他所有函数与顶层结构经固定源码比较一致，原私密正长度读取器、首次物化、O_EXCL/fsync 写入器及目标常量保持。

独立补核 9 组通过：原最终核验消费合法空文件且私密读取仍拒绝零长度；未注册/错误模式/链接/符号链接/owner/非空伪装拒绝；读取时替换路径或增长拒绝；只补缺项并保留原 inode/marker；九类既有树错误或已使用/已启动状态在首次创建前拒绝；精确 authority/空 capacity inode 复用；创建竞态不覆盖；过期在外部检查与写入前拒绝；main 新阶段失败不调用容器恢复、观察或停止。

测试从固定 Git 源码在内存编译，使用真实本地临时文件、fd/路径身份、O_EXCL 和 fsync；owner/调度/镜像观察明确建模，无真实 root 准入或服务器执行。原作者 11 项 PASS/0.094s 采用固定 RESULT 回执，不重跑；本轮未提供单独作者原测试日志，不把回执等同 QB 重跑。

已有 3878 文件/190151231B 匹配、缺 3414 文件/46354060B 的1.82s只读核验采用 T45 固定回执，非 QB 服务器实测。旧 FAILED124 和部分目录不改判。竞态或后续故障可保留已成功创建的缺项，接续不提供整包原子回滚。

原准备截止检查保留于入口；新源码不生成新截止或 DB 窗口。C/T45 的实际下一份精确计划和作业超时仍须绑定获授权的原剩余截止；这份尚未执行的现场计划不在 QB 已验证范围。未测真实接续、最终7292文件树、fsync耗时、Docker/PG、发布或业务；不记通过。环境镜像检查的原只读 Docker inspect 保留，拒绝路径不触恢复/停止。

不重复 main/r2/fixture/REAL6ed 或已验 PG；未构建、未复制新源码树、未改工程、未上服务器。T45 唯一 ops writer。本结论仅供 C 采用本批两叶源码，不构成实际执行授权。实际模型与 Fast 状态均 UNVERIFIED。

证据：RESULT.json、fixed-evidence.json、independent-check.py、independent-check.log、independent-results.json。
