# QB producer None 返回契约复验

结论：**PASS_SCOPED_RETURN_CONTRACT_SOURCE_AND_LOCAL_MODEL_NOT_NEW_PG**。F01对固定源码后继关闭，原实际r2失败与NEED_FIX收据保留。

launcher `156f19d8fc8cb1ac9c77215f1095c93af78b8b2768298a75962f85aee3968d36` / 94658B，test `5c11d72263274854cdb549200ceb72e16d85f1e3e77bd9e791b4efc50ce54172` / 68807B。READY34da2e40、RESULTf3bd4c5a与两父pin匹配。源码仅一处赋值拆分；原四测试仅改返回None；trusted、SQL/角色/权限、13字段、O_EXCL/fsync及其他字节不变，不冒称已commit或实际运行。

4组独立必要检查通过：精确字节差异；实际原trusted函数体返回None时修后保持Path并产闭合13字段0444证明且默认私密0400；同契约重复写拒绝并保留inode/字节；原trust/0711/actor拒绝仍先于写。只模拟root元数据/无ACL，不替换trusted或返回值。旧版同函数体已独立红例NoneType.lstat且无proof。原owner四case/14子例红、修后四case绿采用固定日志并录哈希，不重跑。

原模型把trusted替换为返回Path，遮住真实契约，原producer源分支发现后已单列NEED_FIX；该后继只修此缺陷。现场18ee9049与汇总48a3192d已核，r2停止、凭据清除/登录撤销/进程端口消失/cleanup全true，未确认actual program、未安装放行或导入。现场只导出AttributeError；NoneType.lstat为本地原函数复现，不冒称现场trace或SQLSTATE。旧ROLLBACK_UNCONFIRMED不改判。

前D1九叶和其余network10/release15组采用。新包/r3/新窗口、普通UID读/watch/epoch/same-pool、PG仍未验，不重放r2/root/旧窗。无源码、服务器、批准变化。实际模型/Fast UNVERIFIED。脚本错误码前缀和报告相对路径已仅在本机证据脚本中纠正，原初始日志保留。
