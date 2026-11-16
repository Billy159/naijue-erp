# 正常35第三后继：仅执行位置修正，UNISSUED

原01/2a9和02/1fd及两份QB报告保留原字节，均不可发行。QB02准确报告41d17195确认N35-C01/C02已关闭，仅剩N35-C03：02的executionCLI.source仍指01，CLI相同SHA不能证明HERE目录相同。03全部52 runtime与02逐字节相同，不改键、预算、源码语义、权限或native/ROOT06。

## 本次准确修正

INTERFACE.executionCLI.source直接赋为03下绝对phase_cli.py；consumerSourceInterfaces三项path也直接赋为03下实际源码位置；PHASES35和INTERFACE七个jobs.sourceDirectory均为03 bundle绝对目录。没有使用序列化JSON的字符串替换。上轮替换未生效的可复现原因是json.dumps默认转义中文，而待替换原路径为Unicode字符；不是相对路径特例。现在对解析后的字段逐项赋值，避免JSON编码掩盖目录引用。

位置静态核验从接口真实公布的CLI入口runpy取得其真实__file__/HERE，核03蓝图、7组源码目录、每个实际文件pin和三sourceinterface路径，递归检查接口中所有NORMAL35绝对路径都属于03。七组scope/键/预算及规范34前驱保持02，52 runtime原字节一致。对真实UNISSUED蓝图调用原CLI的提前拒绝分支，没有构造许可、身份或目标；没有进入client/state/network/submit，也没有执行native或重新编译。

LOCAL-CHECKS只汇总本次EXECUTION-LOCATION-CHECKS并引用QB02原报告；不把旧NEED_FIX报告冒充03 PASS。继承的CORRECTION-ONLY.*及LOCAL-CORRECTION-CHECKS只记录02对01的历史两项修复，不是03新变更；LOCATION-ONLY.patch仅列03实际元数据位置变化。所有server/PG/clock/issuer/新job为0，前轮7fed现存C元数据证据直接复用、不重读。

## 准入与剩余边界

03仍未独立复验、未与D1 root35最终配对，未做fresh/登记/签发/执行。下一步原QB只核N35-C03位置与必要元数据pin；原D1用03准确INTERFACE完成root配对，已过entry cf284/private58fa以及02关闭范围不重验。实际执行只能从03接口公布的入口及同代蓝图/sourceDirectory出发。旧34/01/02不能重放或发行，业务导入、APP、cold/clone、正式上线均未通过。
