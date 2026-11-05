# 应用物化未完成，现场保留

北京时间2026-11-06 01:00:12–01:03:12，原作业 `t45-f35-5d70-materialize-20261106-01` 终态 FAILED / exit124 / 180.118秒；错误码 `PHASE_TIMEOUT_UNKNOWN_OUTCOME_NO_REPLAY`。本次由T45设置的180秒进程时限先于外部01:23:06准备截止触发，物化未完成。原键不重放。

01:04:39，独立必要只读作业 `t45-f35-5d70-materialize-state-readonly-20261106-01` COMPLETED / exit0 / 0.468秒，核到：

- 新应用root已存在，prepare marker准确绑定5d70的source190de/archive9dc7/manifest4954和原image6de/e475。
- deploy已落盘3,878个普通文件、190,151,231字节（仅文件元数据统计，未称完整或内容校验通过）。
- metadata/deployment-manifest、metadata/source-descriptor、authority、state/capacity尚未建立；start-intent与container-receipt均不存在。
- 原操作unit inactive/dead、MainPID0；unit自身Result=success不覆盖实际业务phase FAILED124。同名container查询为空。

准确源码仍为wrapper `7b239be925bd29783f264a4bf903770cb07505011209af13724fa12125862a78`，外部C六字段plan实际SHA `a8743b2b25131d51a23f6fb4a97fb5a7bc5dc05ccffdc32c7e91180c0da8580c`。binary stage已核READY的固定归档可复用，未重传。原镜像不重建。

部分文件及全部原回执已保留；失败后0补写、删除或覆盖，0PG/容器启动，0正式或真实数据操作。下一步须由原C基于此准确断点绑定必要后继；不能重放失败键、假定完整物化、擅自换root重试或提前开PG。本文不推断底层IO根因。

证据：本目录 `MATERIALIZE-RESULT.json`、`materialize-evidence/`，上步传输见 `STAGING-RESULT.json`。
