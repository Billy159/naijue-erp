| 新增步骤/输入 | 创建者 → 消费者 | 字节/时间与失败处理 |
|---|---|---|
| 真实入口起点 | main 自己实际进程出生时间 → host deadline | 原190/110/300；不在 host 重新起算，任何更紧 expiry 继续生效 |
| actual C/birth/ACK、已核 apply admin 截止 | 原 host 原有验证 → pinned helper → genuine root caller | C 原字节不刷新；启动描述前 work_left>170；不足不跑 child，原 AFTER closure |
| 请求 service/adminUntil | host O_EXCL boot/genuine-describe-request.json → 容器 helper stdin/FIFO → Node | 输入<=65536；没有 password/DSN/SQL/inner authority |
| source token + one Date.now window | 原 source loader → describe-only target/compile → 原 descriptor | S+G 全占150秒；window只在source完成后取；install分支保持原签名时间及descriptor深比较 |
| Node/stdout/stderr | 容器 subreaper/独立 PG → boot 私有有界日志/process JSON | 150+TERM2+KILL2；stdout131072/stderr65536；超限/超时/非零保留实际结果并失败；回收未知不冒成功 |
| docker exec 桥接 | host capture → host桥接日志 → 原 host try/finally | <=158秒；host仅证明Docker客户端；丢响应/进程收据缺失为未确认，关闭本次准确容器，不重跑 |
| payload/descriptor/raw liveFacts/process | protected boot + worker/results O_EXCL → normal result refs → 原 exporter | 65536/131072/131072/65536，公开排版亦限界；发布任何部分失败仍 handed_off=False、原 typed AFTER 清理 |
| root/public已存四文件 | fixed reader → 本机原件 + Main DESCRIPTOR/PAYLOAD/normalized LIVE-FACTS | root boot/worker bytes/hash相等；public独立hash/bytes且对象相等；不重跑Node、不读取秘密 |
| handoff | 完整输出 + 同C/ACK/容器 + 真实剩余时间 → success result | result落盘后仍检查工作截止；失败保留原件、原键读回；不自然到期冒还原 |
| 后续真实安装/REAL | Main 新有限输入/原业务keys → 现有受控消费者 | 本轮未签发、登记、提交；原900秒/角色/目标/权限/回退条件未放宽 |

新增阶段取证：describe-only实际10个固定阶段及hrtime → 原有界私有stderr → 独立process收据内安全摘要/最后阶段。安装分支无trace，原d/liveFacts不加字段；非空stderr可成功。解析检查是本机文本fixture，不是native阶段实测。
