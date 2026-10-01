"""Derive observed SKU identities and stock strictly from converted trusted history."""
from common import *
from openpyxl.utils import get_column_letter
import os

def main():
    products = {r['id']: r for r in jsonl(OUT/'data/master/products.jsonl')}
    warehouses = {stable_id('warehouse', r[0]): {'code': text(r[0]), 'name': text(r[1])}
                  for _, r, _ in source_rows('基础档案/仓库.xlsx', '仓库')}
    warehouse_names = defaultdict(list)
    for wid, r in warehouses.items():
        warehouse_names[r['name']].append(wid)
    resolver = SpecResolver()
    skus = {}; conflicts = []; counters = Counter()
    stock = defaultdict(Decimal); components = defaultdict(lambda: defaultdict(Decimal))
    stock_events_count = Counter(); key_units = defaultdict(set); evidence_types = defaultdict(Counter)
    wh_components = defaultdict(lambda: defaultdict(Decimal)); wh_units = defaultdict(lambda: defaultdict(Decimal))
    events = JsonlWriter('data/inventory/rebuild_events.jsonl')
    observations = JsonlWriter('diagnostics/sku_observations.jsonl')
    unit_totals = defaultdict(Decimal)

    def observe(r, dataset, evidence_kind):
        sid = r['skuId']
        identity = (r['sourceProductCode'], r['sourceColorCode'], r['sourceSizeCode'])
        expected = stable_id('sku', *identity)
        assert sid == expected
        assert r['productId'] in products
        base = {'id': sid, 'productId': r['productId'], 'colorId': r['colorId'], 'sizeId': r['sizeId'],
                'fitId': products[r['productId']].get('fitId'), 'sourceProductCode': identity[0],
                'sourceColorCode': identity[1], 'sourceSizeCode': identity[2],
                'sourceColorName': r['sourceColorName'], 'sourceSizeName': r['sourceSizeName'],
                'unit': r['unit'], 'completeHistoricalBarcode': None, 'barcodeBindingKnown': False}
        if sid not in skus:
            skus[sid] = {**base, 'observedSources': Counter(), 'exampleReferences': []}
        elif any(skus[sid][f] != base[f] for f in base if f not in ['fitId']):
            conflicts.append({'skuId': sid, 'existing': {k:skus[sid][k] for k in base}, 'incoming': base,
                              'sourceDataset': dataset, 'sourceRecordId': r['id']})
        skus[sid]['observedSources'][evidence_kind] += 1
        ref = {'dataset': dataset, 'recordId': r['id']}
        if len(skus[sid]['exampleReferences']) < 4:
            skus[sid]['exampleReferences'].append(ref)
        observations.write({'id': stable_id('sku_observation', dataset, r['id']), 'skuId': sid,
                            'evidenceKind': evidence_kind, 'sourceReference': ref,
                            'participatesInStockRebuild': evidence_kind in ['purchase','sale','transfer']})
        counters['observations'] += 1

    def effect(r, dataset, origin, warehouse_id, delta, component):
        assert warehouse_id in warehouses
        key = (warehouse_id, r['skuId']); stock[key] += delta
        components[key][component] += delta; key_units[key].add(r['unit'])
        wh_components[warehouse_id][component] += delta
        wh_units[warehouse_id][r['unit']] += delta; unit_totals[r['unit']] += delta
        stock_events_count[key] += 1; evidence_types[key][origin] += 1
        events.write({'id': stable_id('rebuild_event', dataset, r['id'], component),
                      'warehouseId': warehouse_id, 'skuId': r['skuId'], 'productId': r['productId'],
                      'colorId': r['colorId'], 'sizeId': r['sizeId'], 'unit': r['unit'],
                      'quantityDelta': decimal_text(delta), 'originType': origin, 'component': component,
                      'sourceReference': {'dataset': dataset, 'recordId': r['id'], 'documentId': r.get('documentId')},
                      'readOnly': True, 'effectMode': 'preflight_reconstruction_evidence',
                      'applyOnImport': False, 'runtimeAuditReplayAllowed': False})

    for file, kind in [('purchase_lines.jsonl','purchase'),('sales_lines.jsonl','sale'),('transfer_lines.jsonl','transfer')]:
        dataset = 'data/history/'+file
        for r in jsonl(OUT/dataset):
            observe(r, dataset, kind)
            q = dec(r['quantity']); assert q is not None
            if kind == 'transfer':
                assert r['fromWarehouseId'] != r['toWarehouseId']
                effect(r, dataset, kind, r['fromWarehouseId'], -q, 'transferOut')
                effect(r, dataset, kind, r['toWarehouseId'], q, 'transferIn')
            else:
                effect(r, dataset, kind, r['warehouseId'], q if kind=='purchase' else -q,
                       'purchase' if kind=='purchase' else 'sales')
            counters[kind+'_lines'] += 1
        print(kind, counters[kind+'_lines'], 'stock_keys',len(stock), flush=True)
    events.close()
    for key, units in key_units.items():
        if len(units) != 1:
            conflicts.append({'type':'multiple_units_for_stock_key','warehouseId':key[0],'skuId':key[1],'units':sorted(units)})

    dataset = 'quarantine/unmatched_transfer_lines.jsonl'
    for r in jsonl(OUT/dataset):
        observe(r, dataset, 'quarantined_unmatched_transfer')
        counters['quarantined_lines_observed'] += 1

    # The source snapshot is read separately and NEVER passed to effect().
    snapshot = {}; snap_units = {}; snap_source = {}; snap_wh = defaultdict(Decimal)
    snapshot_writer = JsonlWriter('diagnostics/snapshot_stock.jsonl')
    rel='库存状况表.xlsx'; sheet='第一页'; book=load_workbook(SRC/rel,read_only=True,data_only=True)
    header=None; snapshot_blank=0; snapshot_matrix_rows=0; print_date=None
    for i,r in enumerate(book[sheet].iter_rows(values_only=True),1):
        if i==7:
            header=r; continue
        if i==8612:
            print_date=text(r[5]); continue
        if not 9 <= i <= 8610:
            continue
        if not r[3]:
            continue
        snapshot_matrix_rows+=1
        wids=warehouse_names[text(r[1])]; assert len(wids)==1
        wid=wids[0]
        for j in range(14,113):
            if r[j] in (None,''):
                snapshot_blank+=1; continue
            q=dec(r[j]); assert q is not None
            spec=resolver.resolve(r[3],r[7],header[j]); cell=f'{get_column_letter(j+1)}{i}'
            item={'id':stable_id('snapshot_cell',sha(SRC/rel),sheet,cell),**spec,'warehouseId':wid,
                  'unit':text(r[5]),'quantity':decimal_text(q),'isDiagnostic':True,
                  'participatesInStockRebuild':False,'lineage':lineage(rel,sheet,i,cell=cell)}
            key=(wid,spec['skuId']); assert key not in snapshot
            snapshot[key]=q; snap_units[key]=text(r[5]); snap_source[key]=item['id']; snap_wh[wid]+=q
            snapshot_writer.write(item); observe(item,'diagnostics/snapshot_stock.jsonl','diagnostic_snapshot')
    book.close(); snapshot_writer.close(); observations.close()

    sku_records=[]
    for sid,s in sorted(skus.items()):
        sources=s['observedSources']; included=any(sources[k] for k in ['purchase','sale','transfer'])
        sku_records.append({**s,'observedSources':dict(sources),'observedInIncludedTransactions':included,
                            'observedInQuarantine':bool(sources['quarantined_unmatched_transfer']),
                            'observedInSnapshot':bool(sources['diagnostic_snapshot']),
                            'onlyNonComputationalEvidence':not included,
                            'identityBasis':'original_product+original_color_code+original_size_code',
                            'generatedByCartesianProduct':False})
    save_jsonl('data/master/skus.jsonl',sku_records)
    save_jsonl('diagnostics/sku_identity_conflicts.jsonl',conflicts)

    rebuilt=JsonlWriter('data/inventory/rebuilt_stock.jsonl'); signs=Counter(); wh_signs=defaultdict(Counter)
    for (wid,sid),qty in sorted(stock.items()):
        sign='positive' if qty>0 else 'negative' if qty<0 else 'zero'; signs[sign]+=1; wh_signs[wid][sign]+=1
        s=skus[sid]; comp={k:decimal_text(components[(wid,sid)].get(k,Decimal(0))) for k in ['purchase','sales','transferIn','transferOut']}
        rebuilt.write({'id':stable_id('stock',wid,sid),'warehouseId':wid,'skuId':sid,'productId':s['productId'],
                       'colorId':s['colorId'],'sizeId':s['sizeId'],'unit':s['unit'],'quantity':decimal_text(qty),
                       'openingQuantity':'0','components':comp,'sourceEventCount':stock_events_count[(wid,sid)],
                       'origin':'trusted_historical_transactions_zero_opening','snapshotUsed':False,
                       'applyHistoricalDocumentsAgain':False,'cutoffSourceDate':'2026-09-10',
                       'zeroRowReason':'observed_transactions_net_to_zero' if qty==0 else None})
    rebuilt.close()
    warehouse_transaction_count=len({wid for wid,_ in stock})
    wh_rows=[]
    for wid,w in sorted(warehouses.items(),key=lambda x:x[1]['code']):
        wh_rows.append({'warehouseId':wid,'sourceWarehouseCode':w['code'],'name':w['name'],
                        'quantityControlTotal':decimal_text(sum(wh_units[wid].values(),Decimal(0))),
                        'quantityControlTotalIsMixedUnit':True,'byUnit':{u:decimal_text(q) for u,q in sorted(wh_units[wid].items())},
                        'components':{k:decimal_text(wh_components[wid].get(k,Decimal(0))) for k in ['purchase','sales','transferIn','transferOut']},
                        'observedStockRows':sum(wh_signs[wid].values()),'positiveRows':wh_signs[wid]['positive'],
                        'negativeRows':wh_signs[wid]['negative'],'zeroRows':wh_signs[wid]['zero'],'openingQuantity':'0'})
    save_jsonl('data/inventory/warehouse_totals.jsonl',wh_rows)

    reconciliation=JsonlWriter('diagnostics/inventory_reconciliation.jsonl'); reconciliation_counts=Counter(); overlap_delta=Decimal(0)
    for key in sorted(set(stock)|set(snapshot)):
        wid,sid=key; rq=stock.get(key,Decimal(0)); sq=snapshot.get(key)
        coverage='both' if key in stock and key in snapshot else 'snapshot_only' if key in snapshot else 'rebuild_only'
        reconciliation_counts[coverage]+=1
        difference=sq-rq if sq is not None else None
        if difference is not None:
            overlap_delta+=difference
            reconciliation_counts['compared_equal' if difference==0 else 'compared_different']+=1
        reconciliation.write({'id':stable_id('reconciliation',wid,sid),'warehouseId':wid,'skuId':sid,
                              'sourceWarehouseCode':warehouses[wid]['code'],'sourceProductCode':skus[sid]['sourceProductCode'],
                              'sourceColorCode':skus[sid]['sourceColorCode'],'sourceSizeCode':skus[sid]['sourceSizeCode'],
                              'unit':skus[sid]['unit'],'coverage':coverage,'rebuiltQuantity':decimal_text(rq),
                              'rebuiltImplicitZero':key not in stock,'snapshotQuantity':decimal_text(sq),
                              'snapshotMinusRebuilt':decimal_text(difference),'snapshotAbsenceIsZero':False,
                              'snapshotRecordId':snap_source.get(key),'rebuildStockId':stable_id('stock',wid,sid) if key in stock else None,
                              'components':{k:decimal_text(components[key].get(k,Decimal(0))) for k in ['purchase','sales','transferIn','transferOut']},
                              'sourceEventCount':stock_events_count[key],'reverseAdjustmentAllowed':False,
                              'differenceBusinessCause':'not_inferred_from_numeric_difference'})
    reconciliation.close()
    wh_reconciliation=[]
    for wr in wh_rows:
        wid=wr['warehouseId'];rq=Decimal(wr['quantityControlTotal']);sq=snap_wh.get(wid)
        wh_reconciliation.append({**wr,'snapshotQuantityControlTotal':decimal_text(sq),
                                   'snapshotMinusRebuiltDiagnostic':decimal_text(sq-rq) if sq is not None else None,
                                   'snapshotScope':'partial_sku_values_only' if sq is not None else 'warehouse_not_in_snapshot',
                                   'snapshotAbsenceIsZero':False,'adjustmentGenerated':False})
    save_jsonl('diagnostics/warehouse_reconciliation.jsonl',wh_reconciliation)
    total=sum(stock.values(),Decimal(0));snapshot_total=sum(snapshot.values(),Decimal(0))
    control_entities=[
        control('skus',len(skus),len(skus),duplicate_count=len(conflicts),missing_fk_count=0,
                grain='distinct observed original-product/color/size identities',source_observation_count=counters['observations'],
                repeated_observation_count=counters['observations']-len(skus),identity_conflict_count=len(conflicts)),
        control('reconstructed_stock',len(stock),len(stock),grain='trusted-transaction warehouse+SKU keys',
                source_event_count=events.count,positive_count=signs['positive'],negative_count=signs['negative'],zero_count=signs['zero']),
        control('rebuild_events',events.count,events.count,grain='one signed warehouse effect; transfer has exactly two legs'),
        control('inventory_snapshot_diagnostic',len(snapshot),len(snapshot),grain='nonempty source quantity cells',
                participates_in_business_calculation=False,source_matrix_rows=snapshot_matrix_rows,blank_cells=snapshot_blank),
    ]
    checks={'sku_identity_conflicts_zero':not conflicts,'purchase_lines_49127':counters['purchase_lines']==49127,
            'sales_lines_79508':counters['sale_lines']==79508,'transfer_lines_254519':counters['transfer_lines']==254519,
            'quarantined_lines_88800':counters['quarantined_lines_observed']==88800,'events_637673':events.count==637673,
            'rebuilt_total_80794':total==Decimal('80794'),'snapshot_total_80776':snapshot_total==Decimal('80776'),
            'snapshot_cells_32430':len(snapshot)==32430,'snapshot_is_excluded':True,
            'transfer_net_zero':sum((wh_components[w]['transferIn']+wh_components[w]['transferOut'] for w in warehouses),Decimal(0))==0}
    if os.environ.get('TPLUS_DYNAMIC_COUNTS'):
        movement_controls=load_json(OUT/'controls/movements.json')['controls']
        sales_controls=load_json(OUT/'controls/sales.json')
        sales_entities={item['entity']:item for item in sales_controls['entities']}
        checks={
            'sku_identity_conflicts_zero':not conflicts,
            'purchase_lines_match_converted':counters['purchase_lines']==movement_controls['purchase_lines']['converted_count'],
            'sales_lines_match_converted':counters['sale_lines']==sales_entities['sales_lines']['converted_count'],
            'transfer_lines_match_converted':counters['transfer_lines']==movement_controls['transfer_source_lines']['derived_count'],
            'quarantined_lines_match_converted':counters['quarantined_lines_observed']==movement_controls['unmatched_transfer_lines']['quarantined_count'],
            'event_count_matches_components':events.count==counters['purchase_lines']+counters['sale_lines']+2*counters['transfer_lines'],
            'rebuilt_total_matches_components':total==sum((sum(parts.values(),Decimal(0)) for parts in components.values()),Decimal(0)),
            'snapshot_is_excluded':True,
            'transfer_net_zero':sum((wh_components[w]['transferIn']+wh_components[w]['transferOut'] for w in warehouses),Decimal(0))==0,
        }
    summary={'entities':control_entities,'checks':checks,'all_pass':all(checks.values()),
             'totals':{'rebuilt_quantity_control_total':decimal_text(total),'unit_totals':{u:decimal_text(q) for u,q in sorted(unit_totals.items())},
                       'quantity_unit_note':'Mixed source main units; do not label total as pieces.',
                       'stock_keys':len(stock),'stock_positive_rows':signs['positive'],'stock_negative_rows':signs['negative'],
                       'stock_zero_rows':signs['zero'],'warehouse_count':len(warehouses),'warehouses_with_transactions':warehouse_transaction_count,
                       'snapshot_quantity_control_total':decimal_text(snapshot_total),'snapshot_minus_rebuild_global_diagnostic':decimal_text(snapshot_total-total),
                       'snapshot_print_date':print_date,'snapshot_compared_cell_difference_total':decimal_text(overlap_delta)},
             'sku_counts':{'total':len(skus),'included_transaction_observed':sum(s['observedInIncludedTransactions'] for s in sku_records),
                           'only_noncomputational_evidence':sum(s['onlyNonComputationalEvidence'] for s in sku_records)},
             'reconciliation_counts':dict(reconciliation_counts),'source_observation_counts':dict(counters),
             'zero_policy':'Only transaction-touched keys that net to zero are explicit rows; no warehouse×SKU expansion.',
             'reconciliation_policy':'Snapshot missing values remain null; comparisons never alter stock or history.'}
    save_json('controls/inventory.json',summary)
    print(dumps(summary),flush=True)
    assert all(checks.values()),checks

if __name__=='__main__':
    main()
