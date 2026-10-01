"""Read-only purchase/transfer extraction into the A2 preflight exchange package."""
from collections import Counter, defaultdict, deque
from decimal import Decimal
from functools import lru_cache
import json
import os
from common import (OUT, SRC, stable_id, raw_row_id, historical, lineage, source_rows,
                    SpecResolver, control, decimal_text, dec, text, JsonlWriter, save_json)

PURCHASE='单据数据/进货单.xlsx'; OUTBOUND='单据数据/其他出库单.xlsx'; INBOUND='单据数据/其他入库单.xlsx'
HIST=historical()
resolver=SpecResolver()
resolve=lru_cache(maxsize=None)(resolver.resolve)
sid=lru_cache(maxsize=None)(stable_id)
masters={}
for kind,rel,sheet,header in [
    ('product','基础档案/存货.xlsx','存货',2),('warehouse','基础档案/仓库.xlsx','仓库',1),
    ('party','基础档案/往来单位.xlsx','往来单位',2),('department','基础档案/部门.xlsx','部门',1),
    ('employee','基础档案/员工.xlsx','员工',2)]:
    masters[kind]={text(v[0]) for _,v,_ in source_rows(rel,sheet,header)}
print('master keys and exact color/size dictionaries read',flush=True)

fk_diag=JsonlWriter('diagnostics/movement_missing_fk.jsonl')
pair_diag=JsonlWriter('diagnostics/movement_pair_validation.jsonl')
missing_fk=Counter(); optional_absent=Counter(); duplicates={}; controls={}

def fk(kind, raw, scope, lin, required=False):
    code=text(raw)
    if not code:
        if required:raise ValueError(('required_source_fk_empty',scope,kind,lin))
        optional_absent[(scope,kind)]+=1
        return None
    if code not in masters[kind]:
        missing_fk[scope]+=1
        fk_diag.write({'scope':scope,'kind':kind,'sourceCode':code,'lineage':lin,'required':required,'resolution':'null; source retained'})
        if required:raise ValueError(('required_source_fk_missing',scope,kind,code,lin))
        return None
    return sid(kind,code)

def spec(p,c,s,scope,lin):
    fk('product',p,scope,lin,True)
    return dict(resolve(text(p),text(c),text(s)))

def dtext(v):return decimal_text(v)
def sum_dec(rows,index):return sum((dec(r[index]) for _,r in rows),Decimal(0))
def snap(headers,values):return dict(zip(headers,values))
def unique_headers(rows,indices):return {tuple(text(r[i]) for i in indices) for _,r in rows}
def read_grouped(rel,sheet):
    groups={};headers=None;count=0
    for row,v,s in source_rows(rel,sheet,2):
        if headers is None:headers=list(s)
        if not text(v[1]):raise ValueError(('missing_document_number',rel,row))
        groups.setdefault(text(v[1]),[]).append((row,v));count+=1
        if count%50000==0:print(sheet,'source rows reread',count,flush=True)
    print(sheet,'source reread complete',count,'rows',len(groups),'documents',flush=True)
    return groups,headers,count

# Purchases are signed historical receipts; no audit command or runtime storage is involved.
pd,ph,pc=read_grouped(PURCHASE,'进货单')
if not os.environ.get('TPLUS_DYNAMIC_COUNTS'):
    assert pc==49127 and len(pd)==2172,(pc,len(pd))
pw=JsonlWriter('data/history/purchase_documents.jsonl');plw=JsonlWriter('data/history/purchase_lines.jsonl')
pq=Decimal(0);pa=Decimal(0);purchase_duplicate=0;purchase_same_sku_extra=0
purchase_negative=0;purchase_dates=[];purchase_types=Counter();purchase_header_variants=0
for number,rr in pd.items():
    firstrow,v=rr[0];lin=lineage(PURCHASE,'进货单',firstrow);docid=stable_id('purchase',number)
    headersets=unique_headers(rr,list(range(23)))
    if len(headersets)!=1:
        purchase_header_variants+=1
        pair_diag.write({'kind':'purchase_header_variants','sourceNumber':number,'variants':len(headersets),'lineage':lin})
    doc={'id':docid,**HIST,'documentType':'historical_purchase','sourceNumber':number,
         'businessDate':text(v[0])[:10],'sourceDate':v[0],'sourceBusinessTypeCode':v[2],'sourceBusinessType':v[3],
         'partyId':fk('party',v[6],'purchase_documents',lin,True),
         'departmentId':fk('department',v[8],'purchase_documents',lin),
         'employeeId':fk('employee',v[10],'purchase_documents',lin),
         'sourcePartyCode':v[6],'sourceDepartmentCode':v[8],'sourceEmployeeCode':v[10],
         'lineCount':len(rr),'quantityTotalFromSourceLines':dtext(sum_dec(rr,30)),
         'amountTotalFromSourceLines':dtext(sum_dec(rr,35)),
         'stockEffect':True,'stockCalculationBasis':'user-approved signed source receipt quantities; original audit status unknown',
         'lineage':lin,'sourceLineRows':[row for row,_ in rr],
         'source':{k:v[j] for j,k in enumerate(ph[:23])},'headerVariantCount':len(headersets)}
    pw.write(doc)
    seen=set();sku_seen=set()
    for row,r in rr:
        lin=lineage(PURCHASE,'进货单',row);q=dec(r[30]);a=dec(r[35]);assert q is not None and a is not None
        warehouse=fk('warehouse',r[38],'purchase_lines',lin,True)
        sp=spec(r[25],r[27],r[29],'purchase_lines',lin)
        rowkey=tuple(text(x) for x in r)
        if rowkey in seen:purchase_duplicate+=1
        seen.add(rowkey)
        sk=(sp['skuId'],warehouse,text(r[28]))
        if sk in sku_seen:purchase_same_sku_extra+=1
        sku_seen.add(sk)
        plw.write({'id':raw_row_id('purchase_line',PURCHASE,'进货单',row),**HIST,'documentId':docid,**sp,
                   'warehouseId':warehouse,'sourceWarehouseCode':r[38],'sourceWarehouseName':r[39],
                   'sourceProductName':r[26],'quantity':dtext(q),'amount':dtext(a),'unit':r[28],
                   'stockEffect':True,'stockContribution':'signed_purchase_quantity',
                   'lineage':lin,'source':snap(ph,r)})
        pq+=q;pa+=a;purchase_negative+=q<0;purchase_dates.append(text(r[0]));purchase_types[text(r[3])]+=1
pw.close();plw.close()
controls['purchase_documents']=control('purchase_documents',len(pd),pw.count,duplicate_count=0,missing_fk_count=missing_fk['purchase_documents'],output_count=pw.count,count_grain='original purchase number',source_header_variant_documents=purchase_header_variants)
controls['purchase_lines']=control('purchase_lines',pc,plw.count,duplicate_count=purchase_duplicate,missing_fk_count=missing_fk['purchase_lines'],output_count=plw.count,count_grain='original source detail row',quantity_sum=dtext(pq),amount_sum=dtext(pa),negative_quantity_rows=purchase_negative,same_sku_warehouse_extra_rows=purchase_same_sku_extra,source_date_min=min(purchase_dates),source_date_max=max(purchase_dates),source_type_row_counts=dict(purchase_types))
print('purchases converted',pw.count,plw.count,'quantity',pq,'amount',pa,flush=True)
del pd

# A fresh full source read is mandatory; prior audit caches are not conversion inputs.
od,oh,oc=read_grouped(OUTBOUND,'其他出库单')
ind,ih,ic=read_grouped(INBOUND,'其他入库单')
if not os.environ.get('TPLUS_DYNAMIC_COUNTS'):
    assert (oc,len(od),ic,len(ind))==(298921,13998,298917,14025)
common=set(od)&set(ind)
if not os.environ.get('TPLUS_DYNAMIC_COUNTS'):
    assert len(common)==13946

def signature(r):
    # Original project/product/name/model/color/size/unit plus exact decimal quantity/amount.
    return (tuple(text(x) for x in r[15:23]),dec(r[23]),dec(r[24]))

verified=[];source_type_diff=0;line_multiset_duplicate=0;same_sku_extra=0
for number in sorted(common):
    aa,bb=od[number],ind[number]
    ah=unique_headers(aa,[0,1,2,3,6,7,8,9,10,11,12]);bh=unique_headers(bb,[0,1,2,3,6,7,8,9,10,11,12])
    aw={text(r[13]) for _,r in aa};bw={text(r[13]) for _,r in bb}
    ca,cb=Counter(signature(r) for _,r in aa),Counter(signature(r) for _,r in bb)
    checks={'same_unique_header':ah==bh and len(ah)==1,'same_detail_multiset':ca==cb,
            'one_warehouse_per_side':len(aw)==len(bw)==1,'distinct_warehouses':not bool(aw&bw),
            'known_warehouses':all(w in masters['warehouse'] for w in aw|bw)}
    if not all(checks.values()):
        pair_diag.write({'kind':'pair_validation_failed','sourceNumber':number,'checks':checks,'outRows':[r for r,_ in aa],'inRows':[r for r,_ in bb]})
        pair_diag.close();raise ValueError(('pair_validation_failed',number,checks))
    if aa[0][1][3]!='同价调拨':source_type_diff+=1
    line_multiset_duplicate+=sum(n-1 for n in ca.values())
    same_sku_extra+=len(aa)-len({(text(r[17]),text(r[20]),text(r[21]),text(r[22])) for _,r in aa})
    verified.append(number)
print('all transfer pairs independently revalidated',len(verified),'source type subset',source_type_diff,flush=True)

tw=JsonlWriter('data/history/transfer_documents.jsonl');tlw=JsonlWriter('data/history/transfer_lines.jsonl')
qtw=JsonlWriter('quarantine/unmatched_transfer_documents.jsonl');qtlw=JsonlWriter('quarantine/unmatched_transfer_lines.jsonl')
tq=Decimal(0);ta=Decimal(0);matched_source_rows=0;matched_ordinal_rows=0
for di,number in enumerate(verified,1):
    aa,bb=od[number],ind[number];r0,a0=aa[0];r1,b0=bb[0];lo=lineage(OUTBOUND,'其他出库单',r0);li=lineage(INBOUND,'其他入库单',r1)
    docid=stable_id('transfer',number);fromw=fk('warehouse',a0[13],'transfer_documents',lo,True);tow=fk('warehouse',b0[13],'transfer_documents',li,True)
    quantity=sum_dec(aa,23);amount=sum_dec(aa,24)
    tw.write({'id':docid,**HIST,'documentType':'historical_same_price_transfer','sourceNumber':number,
              'businessDate':text(a0[0])[:10],'sourceDate':a0[0],
              'fromWarehouseId':fromw,'toWarehouseId':tow,'sourceFromWarehouseCode':a0[13],'sourceToWarehouseCode':b0[13],
              'departmentId':fk('department',a0[6],'transfer_documents',lo),'employeeId':fk('employee',a0[8],'transfer_documents',lo),
              'partyId':fk('party',a0[10],'transfer_documents',lo),
              'sourceDepartmentCode':a0[6],'sourceEmployeeCode':a0[8],'sourcePartyCode':a0[10],
              'lineCount':len(aa),'quantityTotalFromSourceLines':dtext(quantity),'amountTotalFromSourceLines':dtext(amount),
              'pairEvidence':'exact source number + unique matching header + complete detail multiset + distinct known warehouses',
              'sourceTypeDiffersFromTarget':a0[3]!='同价调拨','stockEffect':True,
              'lineage':lo,'sourceLineage':[{'side':'out',**lo},{'side':'in',**li}],
              'sourceLineRows':{'out':[r for r,_ in aa],'in':[r for r,_ in bb]},
              'source':{'out':{oh[j]:a0[j] for j in range(17)},'in':{ih[j]:b0[j] for j in range(17)}}})
    buckets=defaultdict(deque);multiplicity=Counter(signature(r) for _,r in aa)
    for row,r in bb:buckets[signature(r)].append((row,r))
    ordinals=Counter()
    for row,a in aa:
        sig=signature(a);inrow,b=buckets[sig].popleft();ordinals[sig]+=1
        lo=lineage(OUTBOUND,'其他出库单',row);li=lineage(INBOUND,'其他入库单',inrow)
        sp=spec(a[17],a[20],a[21],'transfer_lines',lo);q=dec(a[23]);amount=dec(a[24]);assert q is not None and amount is not None
        assert text(a[14])==text(a0[14]) and text(b[14])==text(b0[14])
        if multiplicity[sig]>1:matched_ordinal_rows+=1
        tlw.write({'id':raw_row_id('transfer_line',OUTBOUND,'其他出库单',row),**HIST,'documentId':docid,**sp,
                   'fromWarehouseId':fromw,'toWarehouseId':tow,'sourceFromWarehouseCode':a[13],'sourceToWarehouseCode':b[13],
                   'sourceFromWarehouseName':a[14],'sourceToWarehouseName':b[14],
                   'sourceProductName':a[18],'quantity':dtext(q),'amount':dtext(amount),'unit':a[22],
                   'stockEffect':True,'stockContribution':'subtract fromWarehouseId and add toWarehouseId once',
                   'linePairingMethod':'same_signature_nth_occurrence' if multiplicity[sig]>1 else 'unique_exact_signature',
                   'linePairingOccurrence':ordinals[sig],'sourceLineForeignKeyKnown':False,
                   'lineage':lo,'sourceLineage':[{'side':'out',**lo},{'side':'in',**li}],
                   'source':{'out':snap(oh,a),'in':snap(ih,b)}})
        tq+=q;ta+=amount;matched_source_rows+=2
    assert all(not q for q in buckets.values())
    if di%2000==0:print('transfer documents/derived lines written',di,tlw.count,flush=True)
tw.close();tlw.close()

quarantine_by_side={}
for side,docs,other,rel,sheet,headers in [('out',od,ind,OUTBOUND,'其他出库单',oh),('in',ind,od,INBOUND,'其他入库单',ih)]:
    dq=Decimal(0);da=Decimal(0);lines=0;doccount=0;duplicate=0
    for number in sorted(set(docs)-set(other)):
        rr=docs[number];row,v=rr[0];lin=lineage(rel,sheet,row);docid=stable_id('unmatched_transfer',side,number)
        w=fk('warehouse',v[13],'unmatched_transfer_documents',lin,True)
        qtw.write({'id':docid,**HIST,'sourceNumber':number,'sourceSide':side,
                   'businessDate':text(v[0])[:10],'sourceDate':v[0],'warehouseId':w,'sourceWarehouseCode':v[13],
                   'departmentId':fk('department',v[6],'unmatched_transfer_documents',lin),
                   'employeeId':fk('employee',v[8],'unmatched_transfer_documents',lin),
                   'partyId':fk('party',v[10],'unmatched_transfer_documents',lin),
                   'sourceDepartmentCode':v[6],'sourceEmployeeCode':v[8],'sourcePartyCode':v[10],
                   'lineCount':len(rr),'quantityTotalFromSourceLines':dtext(sum_dec(rr,23)),
                   'amountTotalFromSourceLines':dtext(sum_dec(rr,24)),
                   'stockEffect':False,'fundsEffect':False,'quarantineReason':'No verified counterpart document; no approximate pairing',
                   'lineage':lin,'sourceLineRows':[r for r,_ in rr],
                   'source':{headers[j]:v[j] for j in range(17)}})
        seen=set()
        for row,r in rr:
            lin=lineage(rel,sheet,row);q=dec(r[23]);amount=dec(r[24]);assert q is not None and amount is not None
            sp=spec(r[17],r[20],r[21],'unmatched_transfer_lines',lin)
            signature_full=tuple(text(x) for x in r)
            if signature_full in seen:duplicate+=1
            seen.add(signature_full)
            qtlw.write({'id':raw_row_id('unmatched_transfer_line',rel,sheet,row),**HIST,'documentId':docid,**sp,
                        'sourceSide':side,'warehouseId':w,'sourceWarehouseCode':r[13],'sourceWarehouseName':r[14],
                        'sourceProductName':r[18],'quantity':dtext(q),'amount':dtext(amount),'unit':r[22],
                        'stockEffect':False,'fundsEffect':False,'lineage':lin,'source':snap(headers,r)})
            dq+=q;da+=amount;lines+=1
        doccount+=1
    quarantine_by_side[side]={'documents':doccount,'lines':lines,'quantity_sum':dtext(dq),'amount_sum':dtext(da),'duplicate_rows':duplicate}
qtw.close();qtlw.close();fk_diag.close();pair_diag.close()
assert tw.count==len(common) and tw.count*2+qtw.count==len(od)+len(ind)
assert tlw.count*2+qtlw.count==oc+ic
if not os.environ.get('TPLUS_DYNAMIC_COUNTS'):
    assert (tw.count,tlw.count,qtw.count,qtlw.count)==(13946,254519,131,88800)
    assert tq==Decimal('283423')
controls['transfer_source_documents']=control('transfer_source_documents',len(od)+len(ind),tw.count*2,quarantined_count=qtw.count,duplicate_count=0,missing_fk_count=missing_fk['transfer_documents'],input_rows=len(od)+len(ind),converted_source_rows=tw.count*2,derived_count=tw.count,output_count=tw.count,count_grain='one document on one source side',formula='28023 = 27892 paired-side source documents + 131 quarantined; 27892 / 2 = 13946 derived transfers',source_type_differs_but_pair_matches=source_type_diff)
controls['transfer_source_lines']=control('transfer_source_lines',oc+ic,matched_source_rows,quarantined_count=qtlw.count,duplicate_count=line_multiset_duplicate*2,missing_fk_count=missing_fk['transfer_lines'],input_rows=oc+ic,converted_source_rows=matched_source_rows,derived_count=tlw.count,output_count=tlw.count,count_grain='one row on one source side',formula='597838 = 509038 converted source rows + 88800 quarantined; 509038 / 2 = 254519 derived lines',quantity_sum_one_side=dtext(tq),amount_sum_one_side=dtext(ta),global_stock_delta='0',derived_duplicate_extra_rows=line_multiset_duplicate,derived_same_sku_extra_rows=same_sku_extra,derived_lines_with_exchangeable_identical_counterparts=matched_ordinal_rows)
controls['unmatched_transfer_documents']=control('unmatched_transfer_documents',qtw.count,0,quarantined_count=qtw.count,duplicate_count=0,missing_fk_count=missing_fk['unmatched_transfer_documents'],output_count=qtw.count,count_grain='one original unmatched source document',stockEffect=False)
controls['unmatched_transfer_lines']=control('unmatched_transfer_lines',qtlw.count,0,quarantined_count=qtlw.count,duplicate_count=sum(s['duplicate_rows'] for s in quarantine_by_side.values()),missing_fk_count=missing_fk['unmatched_transfer_lines'],output_count=qtlw.count,count_grain='one original unmatched source row',stockEffect=False,by_side=quarantine_by_side)
save_json('controls/movements.json',{'executed':False,'original_sources_reread':True,'runtime_state_written':False,'controls':controls,'optional_absent_source_fk':{scope+':'+kind:n for (scope,kind),n in optional_absent.items()},'missing_fk_total':sum(missing_fk.values()),'source_row_conservation':{'purchase':pc==plw.count,'other_in_out':oc+ic==matched_source_rows+qtlw.count,'transfer_pair_2_to_1':matched_source_rows==tlw.count*2},'money_note':'Amounts are sums of original amount cells, never quantity times price. Quantities and amounts are decimal strings; source snapshots preserve original raw values.','duplicate_note':'Counts are diagnostics only; all source rows including repetitions are retained. Transfer interchangeable duplicate signatures pair by nth occurrence, without asserting an original row-level foreign key.'})
notes=f'''# ③A-2 历史进货与调拨转换

本程序本次重新只读打开三份原始xlsx，未使用原审计pickle作为转换输入。没有写入数据库、Demo、localStorage或原始资料；executed=false。

## 输出与数量

- 进货：{pw.count}单、{plw.count}原始明细；有符号数量{pq}、原含税金额合计{pa}，未按数量×单价重算。负数量{purchase_negative}行。
- 调拨：{tw.count}对单据；每侧254519原明细合并为{tlw.count}条双来源明细；单侧数量{tq}、原金额{ta}，跨全仓每SKU净库存影响为0。
- 未配隔离：{qtw.count}单、{qtlw.count}行；出库52单44402行、数量50050；入库79单44398行、数量51645。stockEffect=false、fundsEffect=false，仅可被根流程观察为真实SKU来源，不参与库存。

所有13,946对真实同号再次验证唯一一致表头、完整明细多重集（项目/商品原码/名称/规格/颜色/尺码/单位/原数量/原金额）、单侧唯一有效仓库且两仓不同，验证后才输出。不是日期金额近似匹配。

原标异价的1单保留两侧source原类型，目标仍按用户已确认的历史同价调拨；这是可靠配对子集，不是配对失败。

## 重复和来源

调拨每侧同签名重复额外{line_multiset_duplicate}行、同SKU额外{same_sku_extra}行均保留；相同签名第n次出现对应第n次出现，仅是固定导出批次的可复现配对，不能冒称原系统明细外键。明细id调用raw_row_id，包含源文件SHA、sheet、原行号。两侧sourceLineage逐行保存，source包含两侧完整原字段。

进货原始整行重复诊断为{purchase_duplicate}，同单同SKU仓库额外行{purchase_same_sku_extra}；不去重。进货表头变体单数{purchase_header_variants}；若非0详见诊断，不能默默把变体丢成一个值。每条原明细仍保留全部source字段。

## 历史与库存边界

所有对象isHistorical/readOnly=true，审核状态、审核人/时刻、创建者/时刻为null。业务日期仅取源日期日部分，源日期完整文本保留；经手人/业务员作为来源业务角色保留，不能当制单人。部门使用department稳定ID，未推为hall。

进货库存贡献使用原始有符号quantity；调拨每输出明细仅减出一次、增入一次。根流程另外读取销货并从零期初累计，不使用库存状况表修平。本程序不生成库存，不调用当前审核逻辑。

## 控制口径

controls/movements.json为六计数及钱/量控制量。多对一调拨六计数采用“单侧源记录”粒度：28,023源单=27,892可转换单侧源单+131隔离单；597,838源行=509,038可转换源行+88,800隔离源行；derived_count分别为13,946与254,519。隔离控制块是上述隔离子集，不要重复加总。

必需商品/仓库/规格外键有缺失则失败，不继续悄悄生成错误库存。可选来源部门/员工/往来为空时输出null，缺失出现次数见optional_absent_source_fk；非空但不存在的FK单列diagnostics/movement_missing_fk.jsonl。当前非空缺失FK总数{sum(missing_fk.values())}。
'''
(OUT/'notes/MOVEMENTS.md').parent.mkdir(parents=True,exist_ok=True)
(OUT/'notes/MOVEMENTS.md').write_text(notes)
print('MOVEMENTS COMPLETE',json.dumps({'purchase_documents':pw.count,'purchase_lines':plw.count,'transfer_documents':tw.count,'transfer_lines':tlw.count,'quarantine_documents':qtw.count,'quarantine_lines':qtlw.count,'missing_fk':sum(missing_fk.values())}),flush=True)
