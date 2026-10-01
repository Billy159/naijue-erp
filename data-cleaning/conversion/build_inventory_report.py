"""Build a reconciliation explanation and trace index from the stable A2 outputs only."""
from pathlib import Path
import os
from collections import Counter,defaultdict
from decimal import Decimal
import json

BASE=Path(os.environ['TPLUS_OUT_DIR']).resolve() if os.environ.get('TPLUS_OUT_DIR') else Path(__file__).resolve().parents[1]
def read(rel):
    with (BASE/rel).open() as f:
        for i,line in enumerate(f,1):
            if line.strip():yield i,json.loads(line)
def D(v):return Decimal(str(v))
def f(v):return f'{D(v):,f}' if v is not None else '无记录'
def esc(v):return str(v).replace('|','\\|').replace('\n',' ')
def link(label,rel,line=None):return f'[{label}]({BASE/rel}{":"+str(line) if line else ""})'
def ranges(nums):
    out=[]
    for n in nums:
        if out and out[-1][1]+1==n:out[-1][1]=n
        else:out.append([n,n])
    return out

c=json.loads((BASE/'controls/inventory.json').read_text())
warehouses=[r for _,r in read('data/inventory/warehouse_totals.jsonl')]
warehouse_recs={r['warehouseId']:r for _,r in read('diagnostics/warehouse_reconciliation.jsonl')}
assert len(warehouses)==len(warehouse_recs)==51
assert c['all_pass'] is True
assert sum(D(w['quantityControlTotal']) for w in warehouses)==D(80794)
assert tuple(sum(w[k] for w in warehouses) for k in ['positiveRows','negativeRows','zeroRows'])==(34201,1231,102508)
assert tuple(sum(D(w['components'][k]) for w in warehouses) for k in ['purchase','sales','transferIn','transferOut'])==(D(151786),D(-70992),D(283423),D(-283423))
warehouse_names={r['warehouseId']:r['name'] for r in warehouses}
snapshots={};snap_unit=defaultdict(Decimal);snap_wh=set();snap_qty=Decimal(0)
for n,r in read('diagnostics/snapshot_stock.jsonl'):
    snapshots[r['id']]={'jsonlLine':n,**r};snap_unit[r['unit']]+=D(r['quantity']);snap_wh.add(r['warehouseId']);snap_qty+=D(r['quantity'])
assert len(snapshots)==32430 and len(snap_wh)==24 and snap_qty==D(80776)

coverage=Counter();sums=defaultdict(Decimal);diffs={};equal=0;rebuild_only_nonzero=0
for n,r in read('diagnostics/inventory_reconciliation.jsonl'):
    coverage[r['coverage']]+=1
    if r['coverage']=='rebuild_only':
        sums['rebuild_only']+=D(r['rebuiltQuantity']);rebuild_only_nonzero+=D(r['rebuiltQuantity'])!=0
    else:
        sums['snapshot_covered_rebuild']+=D(r['rebuiltQuantity']);sums['snapshot_covered_snapshot']+=D(r['snapshotQuantity'])
        if D(r['snapshotMinusRebuilt'])!=0:
            k=(r['warehouseId'],r['skuId']);diffs[k]={'jsonlLine':n,**r};sums['compared_difference']+=D(r['snapshotMinusRebuilt'])
        else:equal+=1
assert coverage==Counter({'rebuild_only':105806,'both':32134,'snapshot_only':296})
assert len(diffs)==2291 and equal==30139 and sums['compared_difference']==D(2501)
assert sums['rebuild_only']==D(2519) and sums['snapshot_covered_rebuild']==D(78275)

chains=defaultdict(list);chain_sums=defaultdict(Decimal);all_event_count=0
for n,e in read('data/inventory/rebuild_events.jsonl'):
    all_event_count+=1;k=(e['warehouseId'],e['skuId'])
    if k in diffs:
        chains[k].append({'eventLine':n,'eventId':e['id'],'quantityDelta':e['quantityDelta'],
                          'originType':e['originType'],'component':e['component'],'sourceReference':e['sourceReference']})
        chain_sums[k]+=D(e['quantityDelta'])
assert all_event_count==637673

index_path=BASE/'diagnostics/inventory_difference_trace.jsonl'
trace=[]
with index_path.open('w') as out:
    for k,r in sorted(diffs.items(),key=lambda x:(x[1]['sourceWarehouseCode'],x[1]['sourceProductCode'],x[1]['sourceColorCode'],x[1]['sourceSizeCode'])):
        snap=snapshots[r['snapshotRecordId']];events=chains.get(k,[])
        assert len(events)==r['sourceEventCount']
        assert chain_sums[k]==D(r['rebuiltQuantity'])
        assert D(snap['quantity'])-chain_sums[k]==D(r['snapshotMinusRebuilt'])
        entry={'reconciliationId':r['id'],'reconciliationDataset':'diagnostics/inventory_reconciliation.jsonl',
               'reconciliationLine':r['jsonlLine'],'warehouseId':r['warehouseId'],'skuId':r['skuId'],
               'sourceWarehouseCode':r['sourceWarehouseCode'],'warehouseName':warehouse_names[r['warehouseId']],
               'sourceProductCode':r['sourceProductCode'],'sourceColorCode':r['sourceColorCode'],
               'sourceSizeCode':r['sourceSizeCode'],'sourceColorName':snap['sourceColorName'],
               'sourceSizeName':snap['sourceSizeName'],'unit':r['unit'],'coverage':r['coverage'],
               'snapshotQuantity':r['snapshotQuantity'],'rebuiltQuantity':r['rebuiltQuantity'],
               'snapshotMinusRebuilt':r['snapshotMinusRebuilt'],'openingQuantity':'0',
               'rebuiltImplicitZero':r['rebuiltImplicitZero'],'snapshotRecordId':snap['id'],
               'snapshotDataset':'diagnostics/snapshot_stock.jsonl','snapshotDatasetLine':snap['jsonlLine'],
               'snapshotSourceLineage':snap['lineage'],'rebuildStockId':r['rebuildStockId'],
               'components':r['components'],'eventDataset':'data/inventory/rebuild_events.jsonl',
               'eventCount':len(events),'eventLineRanges':ranges([e['eventLine'] for e in events]),'events':events,
               'numericTraceVerified':True,'differenceBusinessCause':'unknown; not inferred from numeric provenance',
               'reverseAdjustmentAllowed':False}
        trace.append(entry);out.write(json.dumps(entry,ensure_ascii=False,separators=(',',':'))+'\n')

tot=c['totals'];rebuilt_unit={k:D(v) for k,v in tot['unit_totals'].items()}
unit_rows='\n'.join(f'| {u} | {f(rebuilt_unit.get(u,0))} | {f(snap_unit.get(u,0))} | {f(snap_unit.get(u,0)-rebuilt_unit.get(u,0))} |' for u in sorted(set(rebuilt_unit)|set(snap_unit)))
whrows=[]
for w in warehouses:
    rec=warehouse_recs[w['warehouseId']];cc=w['components'];tn=D(cc['transferIn'])+D(cc['transferOut'])
    whrows.append(f'| {w["sourceWarehouseCode"]} | {esc(w["name"])} | {f(cc["purchase"])} | {f(cc["sales"])} | {f(tn)} | {f(w["quantityControlTotal"])} | {w["positiveRows"]:,} / {w["negativeRows"]:,} / {w["zeroRows"]:,} | {f(rec["snapshotQuantityControlTotal"])} | {f(rec["snapshotMinusRebuiltDiagnostic"])} |')
examples=sorted(enumerate(trace,1),key=lambda x:abs(D(x[1]['snapshotMinusRebuilt'])),reverse=True)[:8]
only=next((x for x in enumerate(trace,1) if x[1]['coverage']=='snapshot_only'),None)
if only and all(x[0]!=only[0] for x in examples):examples.append(only)
exrows=[]
for trace_no,r in examples:
    cell=r['snapshotSourceLineage']['cell'];coord='第一页!'+cell
    display=f'{esc(r["sourceProductCode"])} / {esc(r["sourceColorName"])} / {esc(r["sourceSizeName"])}'
    exrows.append(f'| {r["sourceWarehouseCode"]} | {display} | {r["unit"]} | {coord} | {f(r["snapshotQuantity"])} | {f(r["rebuiltQuantity"])} | {f(r["snapshotMinusRebuilt"])} | {r["eventCount"]:,} | {link("索引行"+str(trace_no),"diagnostics/inventory_difference_trace.jsonl",trace_no)} |')

report=f'''# 零期初库存重建与快照差异说明

本说明使用③A-2已经稳定的转换包和控制量，不重新读取或转换原业务，不修改任何数量、单据或审核状态。范围为已提供历史数据，截至源记录2026-09-10；这不是2026-09-22实时库存声明。

## 重建结果与计算规则

[COMPUTED|HIGH] 按用户已裁定的**期初全0**，仅累计进货、销货、13,946对可靠调拨，得到 **80,794** 的混合主计量控制数：

`0 + 151,786 − 70,992 + 283,423 − 283,423 = 80,794`

- 进货49,127行贡献原始有符号数量；销货79,508行贡献原始有符号数量的相反数。原值已经含退货或负数量，不能按单据类型再翻一次符号。
- 可靠调拨254,519条双来源明细，每条只减调出仓一次、增调入仓一次；全仓及每个SKU净变动都是0。它改变分仓分布，不创造商品总体库存。
- 131张未配单、88,800行保持只读隔离，出库50,050、入库51,645，净差+1,595不进入重建。也不把它们改造成库存调整单。
- 637,673条重建事件 = 49,127进货影响 + 79,508销货影响 + 254,519×2调拨影响。事件为本转换包的数值追溯证据，`applyOnImport=false`，不能在载入重建余额后又重复执行这些影响。
- 原审核状态、审核人及制单时刻仍未知；没有逐单假审核、没有补造操作人。期初0是用户的本次口径，不是从空期初表推断出的事实。

本包只写出可信交易实际触达的 **137,940个仓库×SKU键**：正库存34,201个，负库存1,231个，累计净零102,508个。净零是“发生过所选交易，累计后恰好为0”，不是把空白快照或所有仓库×SKU组合批量补零。没有交易触达的组合按已裁定零期初隐含为0，不展开笛卡尔积。

基础档案有51仓，其中49仓有可信交易。SKU共14,864个，14,851个由纳入计算的交易观察到；其余13个仅来自隔离/快照等非计算证据，不因为被观察到就产生库存。

## 分单位控制量

80,794跨件、条、双、套、张、次、把、个，仅用于来源守恒，不能称为“80,794件”。下表末列只比较相同计量单位，仍然是诊断差额，不是修正量。

| 原主单位 | 重建合计 | 快照已显示合计 | 快照－重建 |
| --- | ---: | ---: | ---: |
{unit_rows}

## 51仓汇总

“销货影响”已带库存方向；调拨净影响=调入+带负号调出。各仓期初均0。正/负/净零列是库存键的个数，其他数字是混合主计量控制数。快照没有记录显示“无记录”，不能读成快照库存为0；即使一个仓有快照，快照也只显示其中非空SKU单元，范围并不自动等于该仓全部SKU。

| 仓库码 | 仓库 | 进货影响 | 销货影响 | 调拨净影响 | 重建合计 | 正 / 负 / 净零键 | 快照显示合计 | 快照－重建诊断 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(whrows)}

全量结构化汇总见 {link('warehouse_totals.jsonl','data/inventory/warehouse_totals.jsonl')}；快照分仓对照见 {link('warehouse_reconciliation.jsonl','diagnostics/warehouse_reconciliation.jsonl')}。有快照仓的末列不得简单相加后当作全局差额，未显示仓仍有重建数量。

## 快照只用于诊断

`库存状况表.xlsx/第一页`第9:8610行，是8,602个仓库×商品×颜色矩阵行，O:DI为99个历史尺码列；F8612打印日期为2026-09-10。快照覆盖24仓、32,430个非空数量单元，混合合计80,776；819,168个空格仍是缺少快照值，不填成0。

用户已明确不用这份快照作为库存权威，也不要求上线前重新导出。快照打印时点/筛选范围不再成为本次零期初累计的前置条件；仅保留它作为独立来源供诊断，`participatesInStockRebuild=false`，绝不回填或覆盖重建值。

| 仓库×SKU覆盖关系 | 键数 | 比较方式 |
| --- | ---: | --- |
| 只有重建 | 105,806 | 快照值null；不按快照0算差异 |
| 两边都有 | 32,134 | 比较两边已知数值：30,139相等、1,995不同 |
| 只有快照 | 296 | 所选可信交易未触达，重建为用户零期初下的隐含0；快照原值保留 |
| 已知快照单元比较 | 32,430 | 30,139相等、2,291不同；后者=1,995+296 |

比较联合域为138,236个键。重建独有105,806个键中{rebuild_only_nonzero:,}个为非0；它们没有快照值，不能算“快照与重建不相等”的2,291个差异单元，也不能因缺少快照而删除。

## 为什么单元差额+2,501与全局差额−18同时成立

两者计算域不同：

| 口径 | 快照已知量 | 重建量 | 快照－重建 |
| --- | ---: | ---: | ---: |
| 仅32,430个已知快照单元对应的键 | 80,776 | 78,275 | **+2,501** |
| 重建独有的105,806个键 | 不存在，保留null | 2,519 | 不做逐键快照比较 |
| 两份文件各自的全局控制数 | 80,776 | 80,794 | **−18** |

因此 `80,794 = 78,275 + 2,519`，而全局控制差 `−18 = 2,501 − 2,519`。这只是两个不同覆盖域总数的代数关系，**没有把缺少快照的键当成真实0库存**。+2,501是所有已知快照比较单元的有符号差额之和，不是绝对差总量；−18也不是“只差18即可验收”或“应补18”的结论。不得用全局正负抵消掩盖逐SKU差异。

## 差异的逐条可追溯路径

全部2,291个差异的索引在 {link('inventory_difference_trace.jsonl','diagnostics/inventory_difference_trace.jsonl')}；正文只列代表例，完整记录没有截断。

每条索引保存原仓库码、商品码、颜色/尺码原码和名称、单位、两边数量、有符号差额，及以下完整链路：

1. `snapshotSourceLineage`给出原xlsx路径、SHA256、Sheet、原行号和精确单元格；`snapshotDatasetLine`直达本包的快照记录。
2. `reconciliationLine`指向 {link('inventory_reconciliation.jsonl','diagnostics/inventory_reconciliation.jsonl')} 对应比较记录；可信交易触达时，`rebuildStockId`指向 {link('rebuilt_stock.jsonl','data/inventory/rebuilt_stock.jsonl')} 的重建余额。快照独有键没有显式余额行，`rebuildStockId=null`且标记隐含0。
3. `eventLineRanges`及`events[]`穷尽这个`warehouseId+skuId`在 {link('rebuild_events.jsonl','data/inventory/rebuild_events.jsonl')} 的所有事件文件行号、事件ID、原符号影响、来源类型；各事件的`sourceReference`再指向历史明细的dataset、recordId、documentId。历史明细的`lineage/sourceLineage`能回到原Excel行；调拨保留原出入两侧。
4. 索引生成时逐键复核：事件数量等于比较记录的`sourceEventCount`，所有事件`quantityDelta`之和等于重建量，快照原单元格值减该和等于差额。快照独有296键明确0事件、重建隐含0，不伪造期初行或交易。

事件链是数值依赖链，文件排列次序不是已证明的原业务发生顺序；原来源无审核历史，不能据此编造生命周期。

| 仓库码 | 原商品 / 颜色 / 尺码 | 单位 | 原快照单元 | 快照 | 重建 | 差额 | 事件数 | 完整索引 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
{chr(10).join(exrows)}

## 可以证明与不能证明的事项

[COMPUTED|HIGH] 本包可以证明在“零期初＋已提供进货−销货＋可靠调拨”的既定口径下，转换行、原符号、库存键和数值累计守恒；2,291个快照差异都可回到精确单元及完整重建事件链。

[UNKNOWN|LOW] **这些差异为何在真实经营中形成，当前没有足够可验证信息准确回答。** 数值溯源不等于业务根因证明。不能把某笔源记录、空白、隔离单或来源类型标签自动解释为漏单、丢货、盘点、调价、跨期或审核错误；不能用统计抵消把它们认作已对账。

本次保留原负数、原数量/金额、重复明细和历史未知审核状态。没有修改交易、没有生成补差或库存调整单、没有依据快照修平、没有写入任何正式库存或运行存储。所有结论只适用于本次固定来源与用户已裁定口径。

控制证据：{link('controls/inventory.json','controls/inventory.json')}，其中现有检查all_pass=true；本报告构建另完成全2,291差异的快照单元与事件合计复核，数值追溯全部通过。
'''
(BASE/'INVENTORY_REBUILD_RECONCILIATION.md').write_text(report)
print(json.dumps({'report':'INVENTORY_REBUILD_RECONCILIATION.md','warehouses':len(warehouses),'snapshot_cells':len(snapshots),'trace_rows':len(trace),'event_links':sum(len(r['events']) for r in trace),'snapshot_compared_difference':str(sums['compared_difference']),'rebuilt_outside_snapshot':str(sums['rebuild_only']),'global_difference':str(snap_qty-D(tot['rebuilt_quantity_control_total']))},ensure_ascii=False))
