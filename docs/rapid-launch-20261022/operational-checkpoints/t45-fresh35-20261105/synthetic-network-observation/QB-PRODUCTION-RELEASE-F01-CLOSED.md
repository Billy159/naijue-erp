# QB production V2 F01 挂载后继复验

结论：**PASS_SCOPED_SOURCE_AND_MODELS_NOT_ACTUAL_CONTAINER_OR_UID**。F01源码范围关闭，无剩余发现；原NEED_FIX收据保留。

固定后继helper `6e1edabece28677feb99ee011cd742d11e41ddc2534656206a75aa4205e3ac45`，READY `840bec33ab41c7bb662497d8c8ee3dc25720662b0db23a54aca61596a9fa430c` / owner RESULT `4b6d4227fbb5e67b21cd7574833bf47a7ffeb3af5181ec88af571d22868fa9f9`匹配。相对bc713a只改helper及直接capacitytests，其他五个冻结文件逐pin不变，不冒称已提交/合并。

仅5组必要复验：原实际create argv包含record+INDEX/9叶共11个精确同路径readonly绑定，无泛目录或凭据，原容量/媒体/spool等参数不变且V1不加新挂载；6种source/index/字节/凭据路径/重复行/target替换拒绝；4类root/权限/符号链接/单链接反例拒绝；9个path/hash与原native resolver一一匹配；原boot/rollback批准API仍对6e拒绝DEPLOYMENT_HELPER_REAPPROVAL_REQUIRED。前10组已过范围直接复用，owner两个直接用例采用固定回执，不重跑全5叶或PG。

从固定快照加载原函数，复用明确fixture构造器、root stat/record/capacity身份模型，仅读原有受pin reference字节，未复制reference树。实际Docker命令仅由记录参数的假对象接收，没有执行。最初单行门禁脚本误引用未定义变量，在调用门禁前失败，已仅纠正脚本；之后两调用者都按原门禁拒绝。

真实容器挂载及父目录权限、ordinary UID读/watch、native启动、PG、恢复/业务、完整构建/部署均未测。本结论仅关闭源码载体缺口。boot/rollback的9394f7批准pin仍旧，C按原完整helper复核/注册机制另行准确绑定；QB未改approval或发布许可。合成216b/2235包未触及。实际模型/Fast UNVERIFIED。

详见RESULT.json、fixed-evidence.json、recheck.py/log/results、create-argv.json及gate-results.json。
