# 固定合成制品传输完成

北京时间2026-11-06 00:55:54–00:56:15，沿原已审binary通道唯一一次上传完成，耗时21.053秒/exit0；随后按原key只读回执再次确认READY，文件identity与上传回执一致。原remote40秒上限保持。

- 准确制品key：`f35-5d70-ordinary-20261106-01`。
- 归档83,652,102字节；SHA256 `9dc78883dc896a7498ef6d9023692e12222feaa5c215b7a26d8eadc4c12008b7`；sourceSet `190de4e0244c9c18c0a7d5469b6990f24ef16699866f323cbab42900ce124252`。
- 绑定source commit `5d70b3ee9038b4d0fe66328e2a172b688c07d9c9`、build `erp-5d70b3ee9038-full-20261106`；未采集成HEAD的新REAL改动。
- 原窄CAS后继作业 `t45-f35-5d70-staging-policy-20261106-01` COMPLETED/exit0/0.268秒；源码SHA256 `bcb8b0085ace06fe8c0324ccef31a98322a8b91e6a330a4cfc2c36e21d390e9a`，仅外部C允许的参数及回执文案差异。
- root gate新摘要 `b7b9015ba3feed3bf400ea3652c93a5b59c9b13bb052f318fd1b610bb8990f6c`，uid0/gid0/0444/nlink1，原binary status已核其准确授权字节。旧gate摘要 `a24505c9670723303c24dbd9ccf39da9a152ef8f3a92a1226a0ae85c4a83025a` 的原字节0400及原uid/gid/mode记录保留在该新作业私域，恢复仅沿原受控通道且无在途消费者时进行。
- C外部本批授权窗为北京时间00:53:06.630–01:23:06.630，只覆盖准确制品传输。没有借旧窗、扩大尺寸/超时、重放旧作业或运行28分片。

本轮没有启动/安装/连接PG或容器，没有新建镜像、生产/真实数据操作或发布。上述READY只证明准确制品已到原受控制品目录，不能写成Linux运行、PG验证或正式业务通过。下一步须另有C对同批准确执行scope及有效新窗口的绑定。

证据：本目录 `STAGING-RESULT.json`、`BINARY-STAGE-RESULT.json`、`BINARY-STATUS-AFTER.json`、`CAS-READY.json`、`CAS-EXACT.diff`、`staging-evidence/`。所有原r1/r2、旧制品和旧回执保留。
