# Root08 最终登记 SOURCE：实际109→110

本目录Source02仅修复旧Source522的调用顺序合同，运行代码逐字复用。旧522与其复核记录保留，不改写。底座仍为已实际登记的109键根b401，仅新增原未用Root08键；ENTRY、window、Main七参数和全部运行限制不变。此交付没有签发、登记、物化或SQL执行。

## 实际事实

真实CAS `1ea0b632…`、dispatcher `b4013f9a…`、诊断02 module `f6aca8ef…` / policy `4b9e9042…`已核。实际读回 `b460ff5d…` / 汇总 `bcceec1c…`证明诊断02 COMPLETED0，terminal `68ef74f7…` / result `67e2ba34…` / cleanup `efa0d88a…`。实际诊断容器5a815d05…已停/PID0/network none，childReaped / descendantsAbsent / cleanClusterAfterRead=true，active[]、端口和DATA pid均缺失。

Main恢复顺序决定b07d9ba7…绑定上述事实，未在该文件签发运行权限。原operation/subbatch/namespace没有持久记录；staff、user_account、audit_change、operation_receipt各1及schema_migration27保留，不能说全库空。三个旧prosrc实际匹配，不冒充definition证明；新SQL没有安装。已发生的诊断容器与未来维护C明确分开。

## 新增差异

`ACTUAL109-DISPATCHER.py`由实际模板和真实02 policy复原，整文件摘要等于b401。候选dispatcher只新增Root08 key/helper/一处execute条件；旧109键、三个guard、所有原函数字节及诊断02专用`-I/-S`条件保留。Root08继续原Python`-s`路径。原Root07/normal38/normal39、消费过的writer、失败诊断01及成功诊断02的module/policy/历史pin均保留。

新admission只接受固定12成员manifest：11静态源码成员和未来Main真实有限授权。八资产以固定`.asset.json`名称沿原白名单传输，admission完整核manifest/摘要/长度/有限授权后，仅O_EXCL生成冻结worker需要的八个canonical`.asset`原字节副本。最大977195B仍在原4MiB单叶/32MiB总量/128成员界内。原client0895、freeze、API、共享锁不改，无任意文件/SQL参数接口。

consumer4fed / workerf144 / profile5445 / QB abfa原字节复用，原39 consumer及66传输检查不重跑。392=384继承+3修改+5新增，28GiB/300秒和原件stat9保护沿用。旧6c只继承复制，不exec/import。Root08 marker只表示SOURCE物理就位，SQLUpgradePerformed=false/importReady=false，不能据源码ada8或旧lineage宣称已升级。

## 原通道调用合同

`ROOT08-API-CONTRACT.json`列出后续实际调用。本轮以下全部仅定义，未调用：

1. 新增root配对复核须sourceOnly=true/findings=[]、当前SOURCE pin一致、consumerSourcePins=4fed/consumerReview=abfa/rootPairReviewComplete=true。
2. 本机`prepare_channel.prepare_local()`的两件静态Rootstage代码已经准备；Source02运行字节不变，复用既有材料，不再次调用该准备入口。T45只核相同code/program pins，将本机准备记录的SOURCE路径/pin准确衔接到Source02，保留原准备记录。Main明确指令后的`stage_and_read(review_file,review_pin)`仍沿原私有root通道只stage两个精确代码文件，取得一次真实当前closure+registry，不登记job。
3. Main调用`main_issuer.issue_once(...)`：所有SOURCE/review/b07/真实诊断三receipt/当前b401/共享锁/custody stat9/grant expiry核完才采样唯一签发时钟；两份真实fresh≤120秒。本目录没有authority或占位window。
4. T45在另有Main有限CAS指令后调用`prepare_channel.register_once()`。原共享锁/原CAS发布机制内核当前根、诊断02真实三receipt与容器停止、DATA停稳和noactive，再发布一个module/policy/dispatcher。policy绑定fresh双摘要及三receipt；CAS四个publish点和Root08准入再次核对。失败/不确定只读原audit，禁止自动重放。
5. 真实CAS和Main另行明确物化指令后，完整执行路径**只调用一次`root08_cli.run_once(actual_cas_result_file)`**。它内部唯一调用`prepare`，核实际module/policy/dispatcher及本SOURCE和Main签发文件，创建T45新job-bundle，再调用原client.main的固定300秒请求，保留原parser/collector、锁、history和一次提交记录。不得先调用`prepare`再调用`run_once`。

`root08_cli.prepare(actual_cas_result_file)`仅为单独离线准备入口，不属于完整执行顺序。选择该入口即停止于准备结果，不能随后串调用`run_once`：它已创建job-bundle，而`run_once`会再次准备并由既有`mkdir(exist_ok=False)`拒绝。Source02不改变此拒绝行为、不加幂等/重放或另选key路径；当前job-bundle尚未创建。

未来Root08 authority/fresh/marker/维护C/epoch/角色当前均未生成，SOURCE通过不会自动执行上述顺序。Root08只复制代码；三函数SQL仍沿独立seam5c48/QB177930，在实际Root08 marker、真实host/角色/C/有限授权和独立读回后另做，不选择或重放writer。

## 验证与边界

`BASE109-CHECKS.json`的既有88项底座/证据检查及原66项传输/abfa范围复用，不重跑。Source02只检查完整执行合同只有`run_once`、`prepare`明确为互斥的离线入口，以及原runtime字节和派生pins；见`CONTRACT-ONLY-CHECKS.json`和`RUNTIME-BYTE-REUSE.json`。

本轮0服务器/PG/Node describe/native/issuer/reader/CAS/worker/clock调用，无未来正向授权fixture、实际Root08 marker、物化或SQL执行。前端、共享合同、T45旧源码和durable WIP未改。新SQL未安装，真实完整导入与正式验收仍未完成，STAGED和发布限制保留。
