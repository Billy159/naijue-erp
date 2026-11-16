# AFTER-PREP-BASIS-AUDIT-PATH-01 修正

原候选8a911110…全部顶层文件已逐字保存在 `predecessors/8a911110c9aa94dae380674f62978c92d62a45d4df5a16f2f976228172c53b72/`，原SOURCE-PINS摘要复核一致，旧审查结论不覆盖。

仅修CAS和reader的171 BASIS中20afba86…对应路径：从本轮新after-preparation AUDIT/result.json，指回实际旧 `r3-direct33-input02-registration-cas-20261116-02/result.json`。原input02 CAS源码的AUDIT与实际ACTUAL-INPUT02-REGISTRATION-READBACK.json中的registrationResultSha256共同确认该旧path/hash；具体原始文件pin见LOCAL-CHECKS.json。

根因是本机assemble_candidate全局替换AUDIT目录名时也替换了刚加入的历史BASIS字面量。生成规则现只替换 `AUDIT = B / ...` 赋值，重新生成CAS、reader并同步carrier的source SHA。本轮新ENTRY/AUDIT未变，新AUDIT/result不在BASIS中，仍按原条件必须不存在。

窄检查：8个Python compile、CAS/reader171 BASIS相等、旧path与20af准确配对、新AUDIT不在BASIS、carrier source SHA准确；比较确认两个issuer、a48 helper、wrapper模板、9规则/75静态pin及其余运行源码逐字未变。精确diff见同目录diff文件。未执行现场reader、发行、CAS、服务器或PG；这只是该发现的本机修复，不代替QB独立复核。
