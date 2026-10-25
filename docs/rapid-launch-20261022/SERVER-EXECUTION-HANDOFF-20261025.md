# 唯一服务器执行权交接 2026-10-25

授权：重构任务书 Chat 01a16189-fe73-7a81-b7ad-3c24ede6fd24 人类消息 01a171d2-16b6-77c3-9438-ce7decc92da5“你让主控拆吧”，C已read_thread核实前文拆分范围。复用原T45 Chat，不新建团队。

执行权：从本记录起，01a100d0-cad5-71c1-8042-dc594311d3be 为唯一服务器/数据库/远端安装、启动、备份、发布执行writer。C停止这些实际操作，保留源码整合、本地构建、调度、最终发布判断和三份接续记录唯一writer。原D1/D2/D3准备源码；QB有限独立验收。服务器写串行，不新建库/账号/平台、不动冻结Demo/旧工程/真实原件/用户草稿。允许既有受控R1导入，故障测试仅登记QA。原正式网址https://1n5635n614.goho.co/不因导入成功自动切换。

路径：P=/Users/billy/Desktop/Workspace/project-007-业务管理系统；R=P/work/erp-local-source-20261022；K=P/work/local-takeover-20261021-control；B=K/reports/controller/rapid-launch-20261022。实际展开。通道R/scripts/release/ssh-control.py；connection引用P/monitor/normal-admission-20261013-01/release-connection.json，仅工具消费，不输出凭据。

首个接续C232：B/server-jobs/c03-real-r1-v18-sku-suffix9413-stage-20261025-232/bundle。当前仅本地准备/审查，从未run提交、没有远端原句柄待收。无其它在途远端变更作业；本地UI服务不移交。QB298已最终PASS，FINAL-RESULT.json在K/reports/qa-backend/rapid-launch-20261022/QB/slice298-c232-sku-suffix-carrier，2853字节/6f3a1474e1691dd3654b0c99bad9e37fa36a0ce1deb893c93a611092608d1d82；原NEED_FIX保留，F01只修input两回执路径ROOT218→ROOT232。新input4286/b2e15a40642c260912bce1e7612b869563dd3932776f17c9f7011f71a43c8182。执行者按QB finalization复制原FINAL-RESULT为bundle/QB-SUFFIX-CARRIER-REVIEW.json，填sourceExecutionReview及files准确原pin，开启executionEnabled；不改其余载体/writer/参数/锁/原键。最终PLAN和传输清单由T45独占。不重审载体，不重跑四QA。

执行：ERP_RELEASE_CONNECTION_REF=上述引用 python3 R/scripts/release/ssh-control.py run --task T45 --job-id 原C232完整ID --source-dir 上述bundle --script sku232-carrier.py --output-dir 同job/release-submission --timeout-seconds 按现有原载体stage1600及通道界限 --phase-arg=--execute-once。先读原脚本当前机制沿用准确超时，不延长原stage1600。collect同原ID/通道/输出目录。异步返回保存原handle，未知先收，不重发。依赖已有LinuxNode/pg/原142/144/157helpers由PLAN固定，不安装新平台。新bundle不含真实138MB；直接消费原ROOT218只读inputs，原来源hash由既有载体核。完整原键journal只在服务器私有inputs，公开回报不含原始业务数据/凭据。

目标R1：erp_rewrite_20261022_r1/OID1027659，runtime erp_rewrite_runtime_20261022非owner，socket/proc/1780/root/run/postgresql:5432，v26_v16_history_responsible_from_v15，canonical5a6a5cda81a406cf4c62200e8b1696019fa8a93d1b84c08215eaabe5b3cb50ce。fresh读取由载体执行并绑定RAM证据，不用旧快照冒当前。已接受SKU5586/alias5604，原C220+QB288固定；本次只余9413/9517，不stage前缀，最终14999/15121完整读回。实际224source9532/records5639/products2956/warehouses53；PLAN.expectedBeforeState精确全计数。不得先改ACL/DDL导致指纹漂移。每批最多100完整项、200alias，首批自然14；v18已人类明确批准，原幂等/逐项校验/原键unknown查回/整批回滚保留。C231实际QA+QB295已通过四case，不重验。

备份C206 actual完整PASS611.4346s/4802files，原回执路径和保护服务见PLAN.backup；完成2026-10-25T00:22:11.380393Z，原12h有效到12:22:11Z。保留所有失败现场/旧node_modules/11服务/来源；不清Docker共享资源。旧C218FAILED超时，C220accepted prefix；C219未started，不重放。C228FAILED产品season守卫，C231沿留存8字典修正SYN来源证明后actual完成，非R1真实导入，不重做。

后继：原SKU全部成功→原v18stock38303/38314（signed80933）原D3 retained consumer→历史调拨头14279及行/MAIN/PUBLISH原合同→维护HTTP/PG→正式候选。历史头第一样例原D3 TRANSFER-HEADER-RETAINED-WINDOW-20261025.json已有；C230实读INSERT22false/SELECTtrue，先等232结束再按原授权最小ACL并更新metadata，不能并发改5a。v5历史销货2471空厅仅相关分支等原人类裁决，调拨头不依赖全部SKU/stock，不误设全局依赖。

维护接线：原SOURCE413 catalogue QB296PASS、SOURCE415 Payment QB297PASS，D1 PARTY-HOST-CONSUMPTION-01已交待C固定/QB。K/reports/backend/rapid-launch-20261022/D2/COPIED-MAINTENANCE-PAIRING-v1有原HTTP runner和原C169 Color/Fit已COMMITTED key/payload零新增重放样例（QA OID1034834/runtime erp_qa_v14_core_runtime_20261024_01），按准确existingINPUT执行，不造新key。真实purpose/非owner/currentrole/读回需原host同环境证据；UI flag不授写权。

实际私有应用仍SOURCE382（C215 Linux npmci111/native通过、C216启动通过），未包含414UI/415host；原正式地址未切换。固定生产包、数据库就绪和必要业务验收分别报告，不能把旧C103/npm通过说成最新上线。

执行和接续显式gpt-6.1-sol/medium，Fast工具未核UNVERIFIED。T45只能写原B/server-jobs/job与自己B/server-execution回执、必要既有远程执行范围，不改开发源码或C三记录。完成、失败、未知提交、需验收时主动回本C 01a161ca-f5d5-7de1-a8ad-1cdd43c96915（用户已授权），最少任务ID/范围/文件/实际检查/未测/阻塞/下一步；有意义变化才报。取得C232最终实际回执即推原后继准备，不因已交报告长期空等。遇新合同超范围集中回C；已授权日常动作不逐项转回C执行。
