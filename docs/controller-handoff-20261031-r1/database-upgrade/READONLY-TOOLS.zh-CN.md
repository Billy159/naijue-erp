# 可执行只读核查工具（没有连接器，不执行升级）

从 source/ 工作目录运行，Node版本按package.json。缺失值模板故意REFUSE，不能原样执行。

1. 主控在已明确授权/确认身份的连接中，以现有受控方式只读获取database/OID、普通runtime/session_user、实际inet地址/端口（Unix为null）、postmaster_start和server_version_num；不要回传凭据。
2. 将READONLY-PLAN模板另存工作文件，填实际目标、新实际source commit（本包不是6a85原样）及已核对source SHA。Unix目标必须由外部控制者绑定实际socket路径/配置端口/进程；本collector的NULL inet不是任意socket认证授权。
3. node scripts/release/render-runtime26-readonly-check.mjs /absolute/reviewed-plan.json > /private/exact-readonly-check.sql
   只生成原catalog probe扩展的metadata观测，READ ONLY事务、目标前后guard、ROLLBACK；不连PG。主控必须检查输出后，用明确目标的既有受控psql执行，不用默认连接，不删guard，不借owner身份伪装runtime。
4. 原probe行的manifest/identity/hash/布尔须作为一体保存，并绑定sourceCommit/sourceSha256形成actual envelope。manifest移除routine.source以减少泄露；原PG canonical digest保留，不能用文件SHA或Python重算JSON摘要替代。
5. 独立审核的expected必须属于同一目标/角色/源码，满足完整V6/V7预期，不是复制actual或改expected hash来消除差异。
6. python3 scripts/release/compare-runtime26-metadata.py /private/actual.json /private/independent-expected.json > /private/difference.json
   exit2=REFUSE；exit0仅EXACT_METADATA_ONLY_NOT_UPGRADE_AUTHORIZATION，绝不是升级/发布批准。JSONreviewId标签不证明独立审核真实性。
7. 据实际差异制定目标专属V6方案并独立审查；完成隔离演练后再使用V7离线renderer。prepare-runtime26-v7.mjs是模块，不会自行连接/执行SQL，其target/approval guard只允许明确合成scope，不能直接改字串变生产执行包。

离线复验（全部只用合成资料，不访问PG）：
- node --test scripts/release/prepare-runtime26-v7*.test.mjs
- node --test scripts/release/render-runtime26-readonly-check.test.mjs
- python3 -I -B scripts/release/compare-runtime26-metadata.test.py

本包包含依赖源码而非node_modules；在受控机器按锁文件安装依赖，不能降低安全规则来“跑通”。真实PG核查/升级尚未在用户目标执行。
