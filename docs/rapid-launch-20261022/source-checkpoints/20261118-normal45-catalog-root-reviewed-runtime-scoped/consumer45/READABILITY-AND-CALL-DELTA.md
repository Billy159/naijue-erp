Source44 仅本机来源修正；未执行 Start、Node describe、PostgreSQL、Docker、SSH、签时钟、AUTH、CAS 或 job。

- Root bridge、inside Python 与 subreaper 保留 UID0。唯一 Node 描述子进程固定 UID/GID61035、extra_groups=[]；JS校验同一身份及无额外组。Root08 ORDINARY_RUNTIME_REQUIRED 原件未修改。
- 原 BOOT/native-services 仍 root0700，原脚本/witness仍root0400；不在原目录扩大权限。复用 final33-private root:61035 0710 父目录，新 Start44 独占子目录0710，仅 generator、final33-run helper、historical-prepare05 三叶root:61035 0440，显式chmod/chown。通过新目录单项readonly bind，在容器同一路径读取；收集器输出仍写原root-only BOOT。无AUTH/credential/plan/rawinitializer投影。
- generator import helper只定义函数；helper末尾入口比较会阻止主函数在import时运行。helper内部旧业务ID、prepare05映射和typed binding保持。运行Root08准确API生成新execution envelope，无PG连接、无原计划编译。来源调用链与有限时间条件保持。
- 原 state 在first-install既有源中要求root:61035 0710，final33-private父沿原writer模式。新投影检查容器真实祖先可遍历且root不可普通写；host只判断映射后的state以内祖先，避免将容器不暴露的host ROOT0700误作ordinary路径。新挂载进入原r3ReadonlyMounts，既有owned_05逐项核对source/target/readonly。
- 安装record走原authority-61035 0750/0440只读投影；provision/deployment保持0400。current proof走既有 /run/naijue-rewrite 0755 projection+public0444，外层仍核C/birth/ACK/guardian。原资料权限没有在本轮改动或实测。
- Root08 materializer按0755 mkdir/0644 write，但无显式umask或chmod；旧wrapper也未提供UMask。因此这些实参不是最终现场mode证明。准确Root08祖先、source叶、reference INDEX/九输入、Node/deps/record/proof的实际普通身份可读性未核。D1后继fixed fresh来源负责在时钟/CAS/PG前做必要metadata/access判断；失败停回Main，不自行改权限。本轮没有将静态分析写成实际可达PASS。
- runtime/baseline-scope-input-pins.json是Root08内的root0400私密叶；仅launcher消费，选中describe路径不读取它，不扩权。source loader读取静态源、schema/SQL/model/body/definition及reference，在内存重建目录；原始SQLite/initializer/业务包正文不属本次描述输入。
- JS catch与Python复制闭集对齐：类型、系统码、guard、阶段、一个映射模块+正整数行列；未知UNKNOWN。原message/完整stack/函数名/路径/cause不输出。不将诊断加入descriptor授权内容。
- 42成功Start/Stop/Restore及SQL42/afterAda保留原历史语义；43真实typed failed-start-cleanup/Restore另由Root44固定验证，consumer只引用真实结果，不伪造成功Start43/Stop43或writer执行。

53项本机必要静态/纯函数检查通过。两次node --check仅解析新generator及helper，不执行模块。所有Python均compile检查；未构建APP/重编计划/SQL。实际运行及业务验收均未验证。
