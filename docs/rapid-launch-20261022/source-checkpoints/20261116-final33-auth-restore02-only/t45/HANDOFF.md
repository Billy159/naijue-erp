# Restore33 仅恢复后继源码交接

状态 SOURCE_ONLY_UNISSUED_RUNTIME_NOT_TESTED。原restore01 FAILED2不重放，原start33 FAILED2不重放。新外层恢复键 t45-r3-ordinary33-auth-restore-20261116-02 的双grant request/job/tmp/result均于实际metadata读回中不存在，本机history也不存在；实际证据见 ACTUAL-SOURCE-COMPARE-AND-NEWKEY-ABSENCE.json。现场数据库停止，无active operation。认证仍未确认还原，不能把自然过期当还原。

最小差异仅 bundle/ordinary05_roles_job.py：PHASES只保留restore，外层key/container name改为restore02；CURRENT_SOURCE由错误旧31c3...改为真实已签且执行的defd7...；host在原有全部校验前增加一次原restore01精确终态/源码/许可/无intent及原inner restore未尝试的固定谓词。其余22个既有函数AST相同，六个支持叶逐字复用，原original_stopped/failed-start clean stop/validated ACK/old install/SID/OID/PGDATA13502421/离线snapshot+SCRAM/两auth字段CAS/原verifier与expiry还原/HBA/runtime/membership/300及220+80和inside200全部保留。

事实：旧restore源码CURRENT_SOURCE=31c3cd53187e71194b33148ca4a14a1bff72721c4f75e755d93e00aaae93715b，而原失败start33的真实主文件和原b6cb authority都锁defd7f48ad1d9f9ea5586c193cd3002fcd9ebc37695e7daa6f242b7add0c2a66。proof仍1b8550677d727949873efc42afaa25b5d243e31f3e6f5266ff97c97bda68f3c0。源码谓词原位保留并校正准确pin，不接受任意pin或旧新二选一。root/public失败01结果分别eba7.../4354...对象相同，terminal6d05...；原intent/inside/cleanup及custody restore-attempt/restored真实不存在。

HOST-AUTHORITY.UNISSUED.json提供原scope('restore')完整字段，新requestKey/containerName为02，phase只能restore。startsAt/expiresAt/authorizationReference/independentReviewSha256均NULL，不签任何clock。hostSourceSha256已锁新92b7...。沿原failed33分支：service、writerTerminalSha256、policySha256仍null；stopRequestKey为原失败start33，stopTerminal为93fa...、stopResult为原root incomplete c30c...、stopCleanup b225...。未捏造stop作业，未启动新库/新角色/原生检查。

必须消费已用原roles-authorization.json逐字同一33bcd2fbe1a81631d710f46ab40bf2687cdc40162baf02de474951e85e17d69f，出处 outputs/主控/20261116-r3-direct-service33-after-preparation-registration-window-01/roles-authorization.json，绝不重签或延长已用凭据。其rolesSource仍8aec...。原inner ordinary05_roles.restore的authority.restoreRequestKey保持原01，用于同一custody snapshot和单次restore-attempt记录；该inner此前根本未进入，已用原始失败proof和现场absence同时锁定。新外层root job是02，不重提交失败外层01，不改inner授权/快照/口令。实际成功必须读回原两verifier+expiry和四角色boundary完全相等，再确认维护容器停/PG停及目录保全，不能从源码或期限推断成功。

D1/C负责restore-only登记、原root签名及实际有限host许可；本T45交付不改变现live149e/542e/a48、不发行、不运行。最后实际登记读回 RUNTIME-WINDOW-SUCCESSOR-01/ACTUAL-REGISTRATION-READBACK.json SHA c58e94dbb4e71a60be23f75d0ef487247b74914ef7b2fbb81854143f3e0adcc7。原parent17:13:51.546UTC、restoration16:43:51.546UTC保留，不由本源码延长。QB只审此次具体恢复接缝；generic genuine describe DB05_COMMAND_PREFLIGHT_REFUSED根因仍未知，交D1另查，不能混同本已证恢复stale-pin。

已做7py compile、restore-only scope及apply scope拒绝、22既有函数AST和6支持叶复用、实际112c失败JSON与da02现场比较/未用键证据配对；0fixture/0授权发行/0PG/0执行。没有runtime恢复PASS，动态roles/host叶均未放入bundle。
