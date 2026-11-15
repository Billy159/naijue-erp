# D3-BATCH-CLOSE-01定向修复

QB指出stream-import-cli的finally中batchState.close无保护，会跳过后续approval关闭及plan.dispose，且用异常覆盖已确认COMPLETED/UNKNOWN/verification事实。本轮只将三项清理各自放入独立try/catch，每项失败在既有output标local_cleanup=FAILED，后续清理仍执行。事务、authority、plan/重编译路径、SQL适配和CORE角色完全未改。

新增batched-stream-cleanup-failure.test.mjs只执行这一个异常分支测试，内含COMPLETED与UNKNOWN两种状态。实际Node24.21.0运行1项通过。批SQLite原close实际先完成后由替身抛错，验证approval关闭和plan.dispose各继续一次，state分别仍为COMPLETED/UNKNOWN，verification分别仍VERIFIED/NOT_RUN，local_cleanup均FAILED；实际cli.mjs子进程分别exit3/exit2，输出state保持。该测试使用合成host/SQL替身和临时SQLite，不证明生产宿主或PG。旧6+2+3+3+1、CLI04和05检查均未重跑。

CLEANUP-DELTA-06.diff只含finally必要变更。原05全部准确交付字节及6c83ecc9…清单保留在snapshots/host-snapshot-05，01–04历史也保留。当前06清单覆盖stream-import-cli新摘要，其他源码沿05/04复用。交QB仅核这个局部P2差分，其余已审scope直接复用。

新162行SQL-core PG评价harness仍在outputs/D3/20261115-r3-batched-pg-local-01准备，当前0PG/0server，没有ATTEMPT或运行许可消费。未因本修复重跑任何旧PG或全511234编译。
