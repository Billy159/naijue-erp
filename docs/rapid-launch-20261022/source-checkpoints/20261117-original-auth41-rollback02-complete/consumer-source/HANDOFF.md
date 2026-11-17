# 原认证41回滚后继02：仅源码交付

唯一新键：`t45-r3-ordinary41-original-auth-rollback-20261117-02`。旧01真实FAILED/exit2（terminal16ae7614…），永久保留不重放；原22:49:37.752恢复期限已错过，仍未证明原认证恢复。此次只修SOURCE，不签发、登记、启动、PG或APP操作。

父版本为 `ORIGINAL-AUTH41-ROLLBACK-SOURCE-01`（SOURCE02fd0d57…）。8静态叶中6份helper/history逐字复用；角色叶仅两个固定key由01改02，host仅同一固定身份与proof读取改变，完整最小差异见 SOURCE-DELTA.patch。仍复用original snapshot41/capture/closedC41，旧自身attempt/restored未出现，原私有数据不改。

故障原因：公开服务证明 `authority/fresh35-current-production-service-v2-service-41.json` 的真实root:root0444被private=True误拒。现在明确要求canonical、普通文件、root uid/gid、0444、nlink1，再按公开proof读法read_file(...False)。后续精确c31d0e8a…SHA与service/physical合同原样保留；没有全局关闭private，没有chmod服务器，没有放宽任何私有快照/目录/角色边界。host/inner仅rollback-only、新票据最多900秒/worker300秒，原offline字段还原/完整前后比较/容器挂载/清理/原键恢复算法不变，不新增临时登录有效期或角色。

23:26:10.388681（北京时间）一次固定8路径metadata读取见 FIXED-INPUT-METADATA.json。proof root:root0444/nlink1；ACK、cleanup、Apply root terminal/result均root:root0600；public terminal为uid/gid1000的0644，现有公开读取正确；custody0700/root、capture0700/61035。没有读取这些文件body/digest，没有读取原/finite快照body/digest。此前原3 snapshot保全及失败job自身容器不存在等证据，见父执行目录 `ORIGINAL-AUTH41-ROLLBACK-EXECUTION-PREPARATION-01/runtime/rollback/RESULT.json`（b8210157…）及其元数据证据；本次没有新fresh，不拿历史13 snapshot stat9冒充新鲜。

64项本机SOURCE检查通过：保留原46项AST/接口/编译检查，补精确父子delta、0444接受、owner/group/private0600/writable0644/nlink/type/canonical改变拒绝及私有restore算法不变。仅纯表达式合成验证，无完整运行正例、PG连接或工厂执行；源码通过不等于运行回滚通过。

D1独占Root121→122：保留实际ade6214c…/b7af59ad…/policyc4379f17…，只追加本02新键，不能重登旧01。Main独立新决定、联合SOURCE审查、新fresh及真实新窗口尚待；当前旧01票据不得使用。此交付无future tickets。审查请只核此次delta和具体受影响条件，复用此前有效检查。T45唯一server owner。
