# B07 首次真实 fixture 前置权限失败：定向修复

2026-10-26，原D1报告增量。待原QB只审本差异，尚未执行后继实际窗。

## 已有实际失败与权限边界

C/T45回报首次窗11:56:10.092→.783Z、0.690584秒，parent exit2，fixtureActual=false/httpActual=false/clientsClosed=true，ownPID13623 stop0。准确原证据 `B/server-execution/B07-QA-IDENTITY-NORMAL-ACTUAL-20261026-01/OS-PARENT-LIFECYCLE.json` 及 F 原01输出 `PARENT-RESULT.json`。server日志明确 `permission denied to examine "unix_socket_directories"`；原SQLSTATE未捕获，本报告不补猜。首次FIXTURE-INSERT-INTENT不存在，0seed/0升级/0role/0HTTP为原T45实际范围结论。

原因接线：parent先以原diagnostic session连接，然后SET ROLE naijue_erp_test才调用fixture。fixture SQL.target同时读取端口和受限socket目录GUC，实际准备角色不能examine后者。诊断连接有读设置能力不能自动延伸到SET ROLE后的准备身份。

当前准确状态由T45保留：旧26 wholecopy位于 `.../b07-run2-readback-20261024-01/data-before-qa-identity-20261026-01`，原data是已恢复的原19且停止。不得再次恢复19，不覆盖原01失败/16/382/383记录，不重放业务6keys。

## 修复叶与约束

- `qa-identity-schema19.mjs`：SQL.target不再读取unix_socket_directories。直接核原已连接raw pg Client的connectionParameters.host/port与登记socket/port相等；随后SQL继续逐字段核真实database/OID/current_user/session_user/server_address/server_port/port/postmaster。连接事实与后端事实合并判定，未把受限参数替换为伪造SQL值或弱化为仅库名。node_modules/pg原源码明确Client持有connectionParameters，host来自配置，port解析为整数。目标/传输变化在INSERT前拒绝，read-only UNKNOWN outcome也沿同一真实连接检查。
- fixture预提交/COMMIT异常继续原固定脱敏错误，只额外保留严格5字符大写字母/数字的error.code为pgCode；无原message/detail/SQL/参数/凭据。parent只将此有效值写为databaseErrorCode。新fake用42501只验证格式传递，不称首次真实窗实际捕获过此SQLSTATE。
- `qa-identity-parent.mjs`：除上述安全错误字段外，仅固定新输出根改为 `F/rapid-launch-20261022/b07-normal-identity-draft-20261026-02`，保留原01所有wx结果。原7输入pin/11SQL/role/真实factory、两个普通池会话局部ROoff、审核gate和QAactor/keys边界不变。
- `qa-identity-schema19.test.mjs`：fake client增加与原pg一致的实际连接host/port，并让SQL返回真实剩余字段。新增实际保护参数反例：SQL若仍examines该GUC则断言失败；socket/port错拒绝且不发target SQL/INSERT；仅安全SQLSTATE保留。
- `QA-IDENTITY-PARENT-REGISTRATION.template.json` 和 `B07-NORMAL-RUNTIME-CONFIGURATION.template.json` 只把原01 output/purpose/review定位改到02，当前postmaster/审核hash仍null待真实绑定；不改socket/db/role/原6keys/QAactor。旧模板固定版本及首次实际注册仍保留于原source与实际01证据。实际后继注册写独立02 sibling文件，不能用旧01注册重入。

不GRANT pg_read_all_settings，不新增owner业务权限，不以diagnostic身份登录应用，不改共享HBA/PG配置，不关trigger，不改来源账号disabled。D1未执行PG/SSH/restore/seed/actual auth或业务HTTP。

## 只复失败影响范围

本次原Node24运行4项fixture定向检查全部PASS、0skip：新socket/GUC目标反例、新SQLSTATE脱敏、受影响的wrongtarget/schema26/guard/已有fixture拒绝、原预提交rollback与UNKNOWN COMMIT仅读回。父新02模板未填live注册仍连接前拒绝，另1项PASS/0skip。原11SQL/ACL/正常授权/完整fixture suite与已验父child/gate检查复用，不重跑。

后继必须先原QB新增范围通过、C登记02精确新窗口，再由T45启动当前已存在原19，取本次livepostmaster/保全ref，消费02 templates。原profile/原keys仍留痕；首次0seed不冒登录或历史成功。遇新真实失败继续原准确错误/回滚/unknown readback，不自动重试。
