NORMAL43 Root/Main SOURCE 正在实施，尚未冻结，不能运行。

D1 唯一 owner：本目录 Root127→132 patch、admission、CAS/fresh、Main7/Main8、根端本地通道。T45 唯一 owner：V/NORMAL43-FULL-DATA-CONTINUATION-SOURCE-01 全部消费者、new lineage、原计划custody、CLI/observer与执行准备。无交叉修改。

Main SOURCE-SCOPE：outputs/主控/20261118-r3-after42-source43-scope-01/SOURCE-SCOPE.json /89f3971ef29022be17de1bdf192f032f3af582f95dc45b3a66ef5a94ca09bae9。仅apply/start/writer/stop/restore，300/300/3000/120/300，parent5100，28GiB。新业务transport writer key已由Main选择，但原business IDs/plan/preparedBinding/initializer/manifest/cutoff全部保留。prepare05已完成，只读历史引用，不可执行。

已有实际输入投影 ACTUAL-HISTORY.json；actual dispatcher3a3c/Root127、42已升级afterada并完整停库恢复、prepare05的2f7a/a686/552b、44910steps和原prepared/execution witness均来自本机既有真实回执。18份认证snapshot仅保存stat9。当前没有未来C/epoch/时钟/授权。

根端新增guard保持old41字段独立历史，不把prior42塞回old41 guard。新43 writer保持originalPreparedBinding和originalExecutionBinding两旧witness，expectedBinding只允许变更真实currentC/epoch及准确after catalog证据；业务请求等其余字段不变；preparedBindingSha256使用实际旧native执行witness已签值，不改用普通JSON摘要。

ACK42 raw SHA尚未观测，不造值。计划futurefresh对安全ACK对象核proofe789/work，取真实rawSHA和stat9；Main7签入issued predecessorBindings，Main8start从issued读取。认证18stat与原计划/ACK元数据分开；CAS只读取旧计划元数据，原SQLite与initializer语义仍由原native persisted-program精确核验。

原8参API约定（T45已确认）：apply E/P=None；start E=实际apply读回/P=None；writer E={apply,start,operatorReadySha256,executionDescription,planCustody}，P=原4709成功prepare05回执；stop E=本轮settled-basis/P=start；restore E=stop或typed失败/未提交start/P=start或None。历史install32/catalog35/Root08/Upgrade42来自冻结引用，不把Start当安装或准备回执。

待T45最终interface/rules/描述四叶/host scope/plan custody字段后，完成writer签发分支和准确渲染、仅本轮增量检查、绑定同QB consumer receipt后冻结。所有运行入口未调用；0server/fresh/clock/issuer/CAS/PG/writer/Node/build。旧维护、SQL、sealed18run2与APP289不重跑。
