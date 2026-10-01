"""Produce the bounded preflight delivery documents and hashed import manifest."""
from common import *
import os
from datetime import date

def link(path, label):
    return f'[{label}](<{OUT/path}>)'

def describe_dataset(path):
    rel=str(path.relative_to(OUT)); name=path.stem
    common={'path':rel,'format':'jsonl','encoding':'utf-8','formalImportExecuted':False,
            'automaticStockMutationOnLoad':False,'automaticFundsMutationOnLoad':False,
            'runtimeAuditReplayAllowed':False}
    if rel.startswith('quarantine/'):
        return {**common,'classification':['隔离','只读历史','不参与业务计算'],
                'canImport':False,'archiveOnly':True,'participatesInBusinessCalculation':False,
                'loadAction':'isolated_read_only_archive_only','businessRoles':[]}
    if rel.startswith('diagnostics/'):
        return {**common,'classification':['不参与业务计算'],'canImport':False,'archiveOnly':True,
                'participatesInBusinessCalculation':False,'loadAction':'diagnostic_only','businessRoles':[]}
    if name in ['rebuild_events','warehouse_totals']:
        return {**common,'classification':['只读历史','不参与业务计算'],'canImport':False,'archiveOnly':True,
                'participatesInBusinessCalculation':False,'loadAction':'rebuild_evidence_or_summary_only',
                'businessRoles':[],'doNotImportAsAdditionalStock':True}
    if name=='rebuilt_stock':
        return {**common,'classification':['可以导入'],'canImport':True,'archiveOnly':False,
                'participatesInBusinessCalculation':True,'loadAction':'load_precomputed_inventory_once',
                'businessRoles':['inventory_balance'],'openingQuantity':'0','snapshotUsed':False,
                'mustNotApplyHistoryAgain':True,'cutoffSourceDate':'2026-09-10'}
    if rel.startswith('data/history/'):
        roles=['historical_queries']; inventory=name in ['purchase_lines','sales_lines','transfer_lines']
        if inventory:roles.append('preflight_inventory_reconstruction_already_applied')
        if name=='sales_funds':roles.append('historical_sales_cash_records')
        return {**common,'classification':['可以导入','只读历史'],'canImport':True,'archiveOnly':False,
                'participatesInBusinessCalculation':True,'loadAction':'load_read_only_history_without_replay',
                'businessRoles':roles,'participatesInPreflightInventoryRebuild':inventory,
                'readOnly':True,'auditStatusKnown':False,'doNotInitializeCurrentFundsBalance':True}
    result={**common,'classification':['可以导入'],'canImport':True,'archiveOnly':False,
            'participatesInBusinessCalculation':True,'loadAction':'load_master_or_explicit_relationship',
            'businessRoles':['master_reference']}
    if name=='product_barcodes':
        result.update(classification=['可以导入','只读历史'],readOnly=True,barcodeScope='product_only',
                      completeHistoricalSkuBindingKnown=False,loadAction='preserve_product_barcode_evidence')
    if name in ['customers','suppliers']:
        result.update(loadAction='attach_role_to_existing_party',identityTable='data/master/parties.jsonl',
                      doNotCreateDuplicateParty=True)
    if name=='payment_methods_derived':
        result.update(sourceKind='existing_confirmed_v2_method_not_a_twelfth_tplus_method')
    if name=='fund_accounts':
        result.update(doNotInitializeCurrentFundsBalance=True,sourceLatestBalanceIsEvidenceOnly=True)
    if name=='skus':
        result.update(cartesianExpansionAllowed=False,nonComputationalOnlyObservedSkuCount=13,
                      missingStockBalanceMeansZeroUnderConfirmedOpeningPolicy=True)
    return result

def fingerprint(path):
    digest=hashlib.sha256(); count=0; size=0
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):
            digest.update(block);size+=len(block);count+=block.count(b'\n')
    result={'sha256':digest.hexdigest(),'bytes':size}
    if path.suffix=='.jsonl':result['recordCount']=count
    return result

def main():
    validation=load_json(OUT/'controls/validation.json')
    inventory=load_json(OUT/'controls/inventory.json')
    assert validation['all_pass']
    for required in ['CONTROL_TOTALS.md','QUARANTINE.md','INVENTORY_REBUILD_RECONCILIATION.md']:
        assert (OUT/required).exists(),required
    counts=validation['file_counts']
    def n(name):return counts['data/master/'+name+'.jsonl']
    preview=f'''# ③A-2：T+真实数据转换预检

2026-09-22。**预检通过，可以建议进入③B；本轮未执行正式导入，完成后停止。**

本包按当前项目基线和最终人工裁决生成完整转换结果，待定业务裁决0。输出范围仅本目录。原始T+资料、已确认裁决、当前Demo及已登记运行文件共335个受保护文件，前后摘要全部一致。

## 转换结果

| 内容 | 结果 |
|---|---:|
| 商品 / 分类 | 2,941款 / 49节点；分类完整，143款直接挂已允许父级 |
| 颜色 / 尺码 / 版型 | 182 / 240 / 11 |
| 真实出现SKU | 14,864；无笛卡尔积、唯一性冲突0 |
| 历史商品级条码 | 2,943；全部只挂商品，未伪造完整SKU条码绑定 |
| 往来主体 | 485；其中客户角色484、供应商角色451，共450同时有两种角色 |
| 员工 / 部门 / 营业厅 / 仓库 | 99 / 58 / 47 / 51 |
| 结算方式 / 资金账户 | T+来源11种＋既有V2派生方式1种 / 80个账户 |
| 历史销货 | 27,903单、79,508行；全部保留 |
| 销货现结 | 25,416笔，均有真实销货外键；470张多笔现结单未被压缩 |
| 历史进货 | 2,172单、49,127行 |
| 可靠历史调拨 | 13,946组→13,946单、254,519行；双方来源完整 |
| 重建库存 | 137,940个真实交易触达的仓库SKU键，637,673条可追溯库存事件 |

14,851个SKU出现在参与重建的可信交易中；另外13个仅有隔离资料或快照的真实观测证据，仅保留身份，不因此生成库存或改变数量。主尺码采用旧“尺码”页的真实编码语义，不用新尺码参考页覆盖。商品自由项按原商品编码＋原颜色编码＋原尺码编码串联，颜色/尺码名称必须在来源字典中唯一对应；源单位和名称保留。

## 已确认裁决的实际应用

- 全2,941款逐款categoryId已与最终映射核对。西服、皮革服装、长裤、毛皮服装父级直挂分别121、11、10、1款；未漏商品或新增分类。P13西裤尺码组的专项仅作用于已裁决商品，不改全库西裤。
- 96110舟山外场仓保持一个仓、关联92101与91115两厅，未编造轮换月份。96102庆春特卖仓挂91118；91118默认客户为AC-05-93107。其余明确关系按确认文件采用。
- 24账户开放47厅、56账户保留单厅；新裁决的21账户主要方式均为991“其它”，其余59保留原结论。历史每笔现结继续保留实际旧方式，未被当前主要方式覆盖。
- 所有期初数量为0。只采用原始有符号进货、销货和可靠调拨；退货不重复翻号。未配单及独立收款保持隔离。

## 库存与金额控制

库存独立重建：`0＋151,786－70,992＋283,423－283,423＝80,794`。这是混合源计量单位的控制合计，不能统称“件”，来源截止2026-09-10，不是9月22日实时余额。

正库存34,201行，负库存1,231行，零库存102,508行。零行只表示曾有可信交易且净额恰为0，不展开全仓×全SKU矩阵。51仓均有汇总，其中49仓发生本批可信交易。

销货原成交金额23,659,584.19，单头抹零9,111仅每单计一次；现结22,462,044.59逐笔保留。进货原金额10,222,329.75；调拨单侧金额16,491,961.69，未将两侧加倍作为交易额。金额保存原十进制值，不用数量×价格反算覆盖。

快照80,776只作诊断。已知32,430个单元中30,139相等、2,291不同；全局控制差−18并不代表应补18，也不等同已知单元范围差2,501。未出现仓库、空白格不当0，快照未参与任何库存事件。每条差异均可沿快照单元和重建事件追到原单据；数值溯源不冒称已查明历史业务根因。详见{link('INVENTORY_REBUILD_RECONCILIATION.md','库存重建与差异对账')}。

## 守恒与边界

独立读回核验通过：主键冲突0、非空外键未解析0、拒绝转换0；所有来源重复行原样保留。637,673条事件逐条核对真实可信明细、仓库、SKU、方向、单位与数量；另从历史明细重新计算库存，与持久化结果逐键一致。{link('controls/validation.json','全包核验记录')}列出全部通过项。

原始可选人员、部门等字段有缺失，保持null并逐条解释；“非空外键未解析0”不表示历史资料完备。5条原金额与四舍五入计算差异、21单现结对账差异均保留源值及来源。原备注涉及库存调整的70张销货仍是原始销货，只保留用途提示，不改造成调整单，也未推断业绩性质。

131张未配其他入/出库（88,800行）和25,155张独立收款（25,622行）全部隔离，不产生业务库存或重复资金。所有历史单只读；审核状态、审核人、审核时间、制单人/时间缺失继续null，不重新审核。商品级条码不会冒充可扫描的SKU完整绑定。

本包的库存余额已经累计历史。下一阶段应加载余额一次、归档历史一次，不执行历史审核、库存事件或资金余额增量重放。账户源最新余额只是证据，未初始化业务资金。

## 交付与下一阶段

- {link('IMPORT_MANIFEST.json','导入清单')}：逐文件计数、SHA256、用途和“可以导入 / 只读历史 / 隔离 / 不参与业务计算”标识。
- {link('CONTROL_TOTALS.md','六项计数与数量金额控制')}、{link('QUARANTINE.md','隔离清单与来源异常')}。
- {link('SCHEMA_CONTRACT.md','交换格式与身份约定')}、{link('PROGRESS.md','本阶段进度')}、{link('HANDOFF.md','本阶段交接')}。

满足本次六项完成条件，可以建议进入③B。此结论只表示转换包通过预检，不代表已导入、已上线或已验收③B。正式导入器、目标存储适配、幂等与回滚执行属于下一阶段，本轮未开始。
'''
    (OUT/'TRANSFORM_PREVIEW.md').write_text(preview,encoding='utf-8')
    progress='''# ③A-2 PROGRESS

2026-09-22。状态：完成，转换预检通过，正式导入未执行。

- 已读取当前PROJECT_BRAIN、最新业务基线、全量审计、SOURCE_MAPPING及CONFIRMED_DECISIONS；待定0，最终裁决优先。
- 主档、实际SKU、历史销货及逐笔现结、历史进货、13,946组调拨已完整转换至本目录。
- 库存零期初独立重建完成：80,794混合计量控制量；637,673个可信事件、137,940个仓库SKU键。负库存原样保留。
- 131张未配单及全部独立收款仍只读隔离；快照只诊断，无调整单、无历史事实反改。
- 专项控制、持久化读回、逐事件来源核验、独立库存复算、全包ID/FK核验全部通过；335个受保护文件无变化。
- 已输出TRANSFORM_PREVIEW、CONTROL_TOTALS、IMPORT_MANIFEST、QUARANTINE、INVENTORY_REBUILD_RECONCILIATION、完整JSONL数据及HANDOFF。

本阶段输出只在migration/preflight/TPLUS-20260922-A2。旧审计、业务裁决及旧进度文档保持历史原貌。可建议进入③B；本次任务到此停止，不自动继续导入或页面开发。
'''
    (OUT/'PROGRESS.md').write_text(progress,encoding='utf-8')
    handoff=f'''# ③A-2 HANDOFF

状态：预检已完成且通过；正式导入未执行。下一阶段为另行安排的③B，本任务已停止。

## 权威与边界

- 当前事实源：`data-cleaning/docs/PROJECT_BRAIN.md`及其最新已确认业务基线。
- 全量审计：`data-cleaning/authority/frozen-v1/business-decisions/`，字段链路与身份控制见保留的冻结preflight manifest及转换源码。
- 最终人工裁决：`data-cleaning/authority/frozen-v1/business-decisions/CONFIRMED_DECISIONS.md`。覆盖旧待定提案，不重新猜分类/关系。
- 本阶段包：`migration/preflight/TPLUS-20260922-A2/`；{link('TRANSFORM_PREVIEW.md','先读转换预览')}和{link('IMPORT_MANIFEST.json','导入清单')}。

## 下一阶段必须沿用

1. 校验manifest文件摘要和记录数；不得混入其他导出批次。同一批次原明细ID含源文件SHA＋页＋行，不能当跨导出批次永久行号。
2. 使用独立目标空间承接本包，按交换格式适配正式模型。先建立主档身份，再挂关系；营业厅/仓库/默认客户存在交叉引用，不通过丢外键或选首项绕过。
3. 客户、供应商为485主体的角色投影；两份角色文件不新增两套主体。11种历史结算方式和1种既有派生方式区分来源。
4. 先保留历史文档与明细为只读档案；不伪造审核、制单人/时间，不调用运行审核逻辑。
5. `rebuilt_stock.jsonl`加载一次作为已重建库存；`rebuild_events.jsonl`仅作为来源证据。历史三类交易、事件和余额不可再次叠加。103k左右零行是实际触达净零，不展开矩阵。
6. 25,416笔现结保留多笔结构与原结算方式。独立收款不猜销货、不合并生效；账户源余额不是当前资金初始化依据。
7. 隔离文件只能作为只读隔离档案；库存快照和diagnostics绝不作为库存初始化或调整来源。负数保留。
8. 本包已满足转换预检条件，不代表③B的导入、幂等、原子写入、回滚及应用集成已经验证；这些工作本轮未执行。

## 重现与核验

脚本均在本包scripts下，只写本包。先执行convert_masters.py、convert_sales.py、convert_movements.py，再执行build_inventory.py、validate_package.py，随后执行build_control_reports.py、build_inventory_report.py、build_delivery.py。原始文件和最终裁决不得改写。

运行环境为已提供的只读Excel读取能力与Python标准库，详细字段见SCHEMA_CONTRACT.md。金额/数量为十进制字符串，null与0严格区分。重现后须重新生成manifest；不能使用过期摘要。

## 已知来源差异与核验结论

主键冲突0、非空外键未解析0、拒绝0；可空历史字段仍存在源缺失，具体在控制和diagnostics。原始重复不删除。所有单据/行数和原数量金额守恒。快照差异2,291条均有快照单元与重建事件来源链；商业根因没有来源支持的部分不猜。

{link('CONTROL_TOTALS.md','控制量')} / {link('QUARANTINE.md','隔离说明')} / {link('INVENTORY_REBUILD_RECONCILIATION.md','库存对账')} / {link('controls/validation.json','完整核验结果')}。335个受保护来源、权威与当前运行文件核验未改写。
'''.replace('103k左右零行','102,508条零行')
    (OUT/'HANDOFF.md').write_text(handoff,encoding='utf-8')

    datasets=[]
    for folder in ['data','quarantine','diagnostics']:
        for path in sorted((OUT/folder).rglob('*.jsonl')):
            datasets.append({**describe_dataset(path),**fingerprint(path)})
    artifacts=[]
    for folder in ['controls','scripts','notes']:
        for path in sorted((OUT/folder).glob('*')):
            if path.is_file():artifacts.append({'path':str(path.relative_to(OUT)),**fingerprint(path),'classification':['不参与业务计算']})
    for path in sorted(OUT.glob('*.md')):
        artifacts.append({'path':path.name,**fingerprint(path),'classification':['不参与业务计算']})
    for path in [OUT/'BASELINE.json',OUT/'diagnostics/independent_identity_event_issues.json']:
        artifacts.append({'path':str(path.relative_to(OUT)),**fingerprint(path),'classification':['不参与业务计算']})
    gates={
      'all_final_decisions_applied':validation['checks']['all_user_product_assignments_applied'] and validation['checks']['masters_domain_checks'],
      'product_sku_sales_funds_transfer_conserved':all(validation['checks'][k] for k in ['masters_domain_checks','sales_domain_checks','movements_domain_checks','inventory_domain_checks','persisted_primary_identity_unique']),
      'no_unexplained_foreign_key_loss':validation['unresolved_fk_count']==0,
      'quarantine_intact':all(validation['checks'][k] for k in ['independent_receipt_documents_count','independent_receipt_lines_count','unmatched_transfer_documents_count','unmatched_transfer_lines_count','every_event_matches_trusted_source_exactly_once']),
      'zero_opening_independent_inventory_rebuilt':validation['checks']['independent_stock_key_quantities_equal'] and validation['checks']['stock_identities_units_components_match'],
      'differences_traceable_without_source_repairs':validation['checks']['all_source_authority_runtime_files_unchanged'] and validation['checks']['every_event_matches_trusted_source_exactly_once'],
    }
    assert all(gates.values())
    baseline=load_json(OUT/'BASELINE.json')
    manifest={'schemaVersion':'tplus-v2-preflight/1','batchId':os.environ.get('TPLUS_PREFLIGHT_BATCH','TPLUS-20260922-A2'),'stage':'③A-2','createdDate':date.today().isoformat(),
              'outputRoot':str(OUT),'scope':'independent conversion preflight only','executed':False,'formalImportExecuted':False,
              'demoBusinessStoreWritten':False,'runtimeAuditReplayAllowed':False,'preflightPassed':True,
              'canRecommendStage3B':True,'stage3BStarted':False,'gateChecks':gates,
              'authorityPriority':['current confirmed business baseline','CONFIRMED_DECISIONS overrides prior pending audit proposals'],
              'protectedInputFiles':baseline['protected_files'],'protectedInputsUnchanged':True,
              'inventoryPolicy':{'openingQuantity':'0','formula':'0 + signed purchases - signed sales + reliable inbound - reliable outbound',
                'cutoffSourceDate':'2026-09-10','snapshotParticipates':False,'quarantinedRowsParticipate':False,
                'adjustmentDocumentsGenerated':False,'balanceLoadedOnce':True,'replayHistoricalEffectsOnImport':False,
                'zeroRows':'only transaction-touched warehouse/SKU keys whose net is zero',
                'mixedUnitQuantityControlTotal':inventory['totals']['rebuilt_quantity_control_total'],
                'negativeInventoryRows':inventory['totals']['stock_negative_rows'],
                'unitTotals':inventory['totals']['unit_totals']},
              'historyPolicy':{'readOnly':True,'unknownAuditFieldsStayNull':True,'creatorNotFabricated':True,
                'currentFundsBalanceInitialization':False,'preserveMultiCashRecords':True,'standaloneReceiptAssociationGuessed':False,
                'skuCompleteHistoricalBarcodeBindingKnown':False},
              'identityPolicy':{'master':'original source code plus entity type','sku':'observed original product/color/size codes',
                'line':'source export SHA + sheet + row; stable only within this export batch',
                'roleProjection':'customers and suppliers attach to shared party id','cartesianProductAllowed':False},
              'datasets':datasets,'supportingArtifacts':artifacts,
              'nextStagePrerequisites':['Explicitly begin stage ③B','Verify hashes and source batch','Adapt exchange schema to target storage',
                                       'Enforce atomic/idempotent import and rollback','Resolve references in two passes without fabricating missing history'],
              'counts':{'datasets':len(datasets),'importEligibleFiles':sum(d['canImport'] for d in datasets),
                        'quarantineFiles':sum('隔离' in d['classification'] for d in datasets),
                        'nonComputationalFiles':sum('不参与业务计算' in d['classification'] for d in datasets)},
              'differenceMeaning':'Every numeric difference is source-traceable; unsupported historic business root causes are not inferred.'}
    save_json('IMPORT_MANIFEST.json',manifest)
    print(dumps({'manifestCounts':manifest['counts'],'allGatesPassed':all(gates.values()),'totalDatasetBytes':sum(d['bytes'] for d in datasets)}),flush=True)

if __name__=='__main__':main()
