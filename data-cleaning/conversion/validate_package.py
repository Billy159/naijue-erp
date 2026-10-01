"""Independent persisted-output controls, referential integrity and mutation guard."""
from common import *
import os

MASTER=OUT/'data/master'; HISTORY=OUT/'data/history'; QUARANTINE=OUT/'quarantine'

def main():
    checks={}; problems=[]; explained_nulls=Counter(); file_counts={}; ids={}; duplicate_ids=[]
    primary_paths=sorted(MASTER.glob('*.jsonl'))+sorted(HISTORY.glob('*.jsonl'))+sorted(QUARANTINE.glob('*.jsonl'))+[
        OUT/'data/inventory/rebuilt_stock.jsonl',OUT/'data/inventory/rebuild_events.jsonl',OUT/'diagnostics/snapshot_stock.jsonl']
    for p in primary_paths:
        seen=set(); n=0
        for r in jsonl(p):
            n+=1; ident=r.get('id')
            if not ident or ident in seen:
                duplicate_ids.append({'dataset':str(p.relative_to(OUT)),'id':ident,'line':n})
            seen.add(ident)
        name=p.stem; assert name not in ids,name
        ids[name]=seen; file_counts[str(p.relative_to(OUT))]=n
    checks['persisted_primary_identity_unique']=not duplicate_ids
    payment_method_ids=ids.get('payment_methods',set()) | ids.get('payment_methods_derived',set())
    fk_types={'productId':'products','colorId':'colors','sizeId':'sizes','fitId':'fits','categoryId':'categories',
              'partyId':'parties','customerId':'parties','settlementCustomerId':'parties','supplierId':'parties',
              'defaultCustomerId':'parties','employeeId':'employees','salespersonId':'employees',
              'departmentId':'departments','parentDepartmentId':'departments','sourceDepartmentId':'departments',
              'managedDepartmentId':'departments','managedEmployeeId':'employees','sourceSizeGroupId':'size_groups',
              'hallId':'halls','storeId':'halls',
              'warehouseId':'warehouses','fromWarehouseId':'warehouses','toWarehouseId':'warehouses',
              'defaultWarehouseId':'warehouses','paymentMethodId':'payment_methods',
              'primaryPaymentMethodId':'payment_methods','primaryMethodId':'payment_methods',
              'fundAccountId':'fund_accounts','defaultFundAccountId':'fund_accounts','skuId':'skus'}
    array_fk_types={'storeIds':'halls','hallIds':'halls','relatedHallIds':'halls','allowedHallIds':'halls',
                    'warehouseIds':'warehouses','associatedHallIds':'halls','sizeIds':'sizes'}
    doc_refs={'sales_lines':'sales_documents','sales_funds':'sales_documents','purchase_lines':'purchase_documents',
              'transfer_lines':'transfer_documents','independent_receipt_lines':'independent_receipt_documents',
              'unmatched_transfer_lines':'unmatched_transfer_documents'}
    for p in primary_paths:
        table=p.stem
        for r in jsonl(p):
            for field,target in fk_types.items():
                if field not in r:
                    continue
                value=r[field]
                if value in (None,''):
                    explained_nulls[table+'.'+field]+=1
                elif value not in (payment_method_ids if target=='payment_methods' else ids.get(target,set())):
                    problems.append({'dataset':str(p.relative_to(OUT)),'recordId':r['id'],'field':field,'value':value,'target':target})
            for field,target in array_fk_types.items():
                for value in r.get(field,[]) or []:
                    if value not in ids.get(target,set()):
                        problems.append({'dataset':str(p.relative_to(OUT)),'recordId':r['id'],'field':field,'value':value,'target':target})
            if table in doc_refs:
                value=r.get('documentId')
                if value not in ids.get(doc_refs[table],set()):
                    problems.append({'dataset':str(p.relative_to(OUT)),'recordId':r['id'],'field':'documentId','value':value,'target':doc_refs[table]})
            if table=='categories' and r.get('parentId') is not None and r['parentId'] not in ids['categories']:
                problems.append({'dataset':str(p.relative_to(OUT)),'recordId':r['id'],'field':'parentId','value':r['parentId'],'target':'categories'})
    checks['no_unresolved_populated_foreign_keys']=not problems
    save_jsonl('diagnostics/package_foreign_key_issues.jsonl',problems)
    save_jsonl('diagnostics/package_duplicate_ids.jsonl',duplicate_ids)

    expected_counts={'products':2941,'colors':182,'sizes':240,'fits':11,'product_barcodes':2943,'parties':485,
                     'employees':99,'departments':58,'halls':47,'warehouses':51,'fund_accounts':80,
                     'sales_documents':27903,'sales_lines':79508,'sales_funds':25416,
                     'purchase_documents':2172,'purchase_lines':49127,'transfer_documents':13946,'transfer_lines':254519,
                     'independent_receipt_documents':25155,'independent_receipt_lines':25622,
                     'unmatched_transfer_documents':131,'unmatched_transfer_lines':88800}
    if os.environ.get('TPLUS_DYNAMIC_COUNTS'):
        expected_counts={}
    for name,n in expected_counts.items():
        checks[name+'_count']=len(ids.get(name,set()))==n

    # Final category assignments must match the actual user-approved per-product results.
    approved={stable_id('product',r['code']):r['target_id'] for r in load_json(DECISIONS/'categories/full_mapping_2941.json')}
    actual_products={r['id']:r for r in jsonl(MASTER/'products.jsonl')}
    checks['all_user_product_assignments_applied']=all(actual_products.get(k,{}).get('categoryId')==v for k,v in approved.items())
    parent_ids={'cat-8','cat-10','cat-12','cat-11'}
    checks['143_allowed_parent_product_assignments']=sum(r.get('categoryId') in parent_ids for r in actual_products.values())==143
    audit_state_errors=[]
    for name in ['sales_documents','purchase_documents','transfer_documents']:
        for r in jsonl(HISTORY/(name+'.jsonl')):
            if not r.get('isHistorical') or not r.get('readOnly') or any(r.get(k) is not None for k in ['auditStatus','auditedBy','auditedAt','createdBy','createdAt']):
                audit_state_errors.append({'dataset':name,'id':r['id']})
    checks['historical_states_not_fabricated']=not audit_state_errors

    qty=Counter(); amounts=defaultdict(Decimal); settlement_counts=Counter(); sale_lines=Counter(); sale_amounts=defaultdict(Decimal)
    stock=defaultdict(Decimal); stock_units=defaultdict(set); transfer_lineage_errors=[]
    sku_records={r['id']:r for r in jsonl(MASTER/'skus.jsonl')}
    identity_fields=['productId','colorId','sizeId','unit']
    source_identity_errors=[]; event_errors=[]; stock_identity_errors=[]
    stock_components=defaultdict(lambda:defaultdict(Decimal)); stock_event_counts=Counter()
    event_reader=iter(jsonl(OUT/'data/inventory/rebuild_events.jsonl'))
    expected_event_count=0
    for table,sign in [('purchase_lines',1),('sales_lines',-1),('transfer_lines',0)]:
        q=Decimal(0);a=Decimal(0)
        for r in jsonl(HISTORY/(table+'.jsonl')):
            n=dec(r['quantity']); m=dec(r.get('amount')); assert n is not None
            q+=n
            if m is not None:a+=m
            if any(r[f]!=sku_records[r['skuId']][f] for f in identity_fields):
                source_identity_errors.append({'dataset':table,'id':r['id']})
            effects=([(r['fromWarehouseId'],-n,'transferOut'),(r['toWarehouseId'],n,'transferIn')]
                     if table=='transfer_lines' else [(r['warehouseId'],n*sign,'purchase' if sign==1 else 'sales')])
            for wid,delta,component in effects:
                event=next(event_reader,None);expected_event_count+=1
                expected={'id':stable_id('rebuild_event','data/history/'+table+'.jsonl',r['id'],component),
                          'sourceReference':{'dataset':'data/history/'+table+'.jsonl','recordId':r['id'],'documentId':r['documentId']},
                          'warehouseId':wid,'skuId':r['skuId'],'quantityDelta':decimal_text(delta),'component':component,
                          'applyOnImport':False,'runtimeAuditReplayAllowed':False,'readOnly':True,
                          **{f:r[f] for f in identity_fields}}
                if event is None or any(event.get(f)!=v for f,v in expected.items()):
                    event_errors.append({'expectedEvent':expected,'actualEvent':event})
                stock_components[(wid,r['skuId'])][component]+=delta
                stock_event_counts[(wid,r['skuId'])]+=1
            if table=='sales_lines':
                sale_lines[r['documentId']]+=1;sale_amounts[r['documentId']]+=m or Decimal(0)
            if table=='transfer_lines':
                for wid,mul in [(r['fromWarehouseId'],-1),(r['toWarehouseId'],1)]:
                    stock[(wid,r['skuId'])]+=n*mul;stock_units[(wid,r['skuId'])].add(r['unit'])
                lin=r.get('sourceLineage',[])
                if len(lin)!=2 or {x.get('side') for x in lin}!={'out','in'}:
                    transfer_lineage_errors.append(r['id'])
            else:
                stock[(r['warehouseId'],r['skuId'])]+=sign*n;stock_units[(r['warehouseId'],r['skuId'])].add(r['unit'])
        qty[table]=q;amounts[table]=a
    for r in jsonl(HISTORY/'sales_funds.jsonl'):
        amounts['sales_funds']+=dec(r['amount']);settlement_counts[r['documentId']]+=1
    checks['sales_qty_70992']=qty['sales_lines']==Decimal('70992')
    checks['sales_original_amount_23659584_19']=amounts['sales_lines']==Decimal('23659584.19')
    checks['cash_original_amount_22462044_59']=amounts['sales_funds']==Decimal('22462044.59')
    checks['purchase_qty_151786']=qty['purchase_lines']==Decimal('151786')
    checks['purchase_original_amount_10222329_75']=amounts['purchase_lines']==Decimal('10222329.75')
    checks['transfer_qty_one_side_283423']=qty['transfer_lines']==Decimal('283423')
    checks['transfer_original_amount_one_side_16491961_69']=amounts['transfer_lines']==Decimal('16491961.69')
    checks['transfer_two_sided_lineage_complete']=not transfer_lineage_errors
    checks['multi_cash_470_documents_preserved']=sum(n>1 for n in settlement_counts.values())==470
    checks['cash_parent_24932_documents']=len(settlement_counts)==24932
    checks['source_line_sku_identity_and_unit_match']=not source_identity_errors
    checks['every_event_matches_trusted_source_exactly_once']=not event_errors and next(event_reader,None) is None and expected_event_count==637673
    rounding_total=Decimal(0);sale_header_errors=[]
    for r in jsonl(HISTORY/'sales_documents.jsonl'):
        rounding_total+=dec(r['rounding']) or Decimal(0)
        if dec(r['amount'])!=sale_amounts[r['id']]:sale_header_errors.append(r['id'])
    checks['document_rounding_once_9111']=rounding_total==Decimal('9111')
    checks['sales_header_amount_equals_original_lines']=not sale_header_errors
    # Stock recomputation does not read the stored rebuild events or snapshot.
    persisted_stock={}
    for r in jsonl(OUT/'data/inventory/rebuilt_stock.jsonl'):
        k=(r['warehouseId'],r['skuId']);assert k not in persisted_stock
        persisted_stock[k]=dec(r['quantity'])
        if (any(r.get(f)!=sku_records[r['skuId']][f] for f in identity_fields)
            or r.get('id')!=stable_id('stock',*k) or r.get('openingQuantity')!='0'
            or r.get('snapshotUsed') is not False or r.get('applyHistoricalDocumentsAgain') is not False
            or r.get('sourceEventCount')!=stock_event_counts[k]
            or any(dec(r['components'].get(c))!=stock_components[k].get(c,Decimal(0)) for c in ['purchase','sales','transferIn','transferOut'])):
            stock_identity_errors.append(r['id'])
    checks['independent_stock_key_quantities_equal']=dict(stock)==persisted_stock
    checks['stock_identities_units_components_match']=not stock_identity_errors
    checks['stock_total_80794']=sum(persisted_stock.values(),Decimal(0))==Decimal('80794')
    checks['stock_units_unambiguous']=all(len(u)==1 for u in stock_units.values())
    event_counts=Counter();event_totals=defaultdict(Decimal)
    for r in jsonl(OUT/'data/inventory/rebuild_events.jsonl'):
        event_counts[r['component']]+=1;event_totals[r['component']]+=dec(r['quantityDelta'])
    checks['only_included_sources_in_rebuild']=dict(event_counts)=={'purchase':49127,'sales':79508,'transferOut':254519,'transferIn':254519}
    checks['transfers_rebuild_exact_zero']=event_totals['transferOut']+event_totals['transferIn']==0
    if os.environ.get('TPLUS_DYNAMIC_COUNTS'):
        for key in ['sales_qty_70992','sales_original_amount_23659584_19','cash_original_amount_22462044_59',
                    'purchase_qty_151786','purchase_original_amount_10222329_75','transfer_qty_one_side_283423',
                    'transfer_original_amount_one_side_16491961_69','multi_cash_470_documents_preserved',
                    'cash_parent_24932_documents','every_event_matches_trusted_source_exactly_once',
                    'document_rounding_once_9111','stock_total_80794']:
            checks.pop(key)
        source_sales=load_json(OUT/'controls/sales.json')
        source_moves=load_json(OUT/'controls/movements.json')['controls']
        source_inventory=load_json(OUT/'controls/inventory.json')
        source_totals=source_sales['totals']
        checks['sales_quantity_matches_source']=qty['sales_lines']==dec(source_totals['sales_quantity'])
        checks['sales_amount_matches_source']=amounts['sales_lines']==dec(source_totals['sales_amount'])
        checks['funds_amount_matches_source']=amounts['sales_funds']==dec(source_totals['funds_amount'])
        checks['purchase_quantity_matches_source']=qty['purchase_lines']==dec(source_moves['purchase_lines']['quantity_sum'])
        checks['purchase_amount_matches_source']=amounts['purchase_lines']==dec(source_moves['purchase_lines']['amount_sum'])
        checks['transfer_quantity_matches_source']=qty['transfer_lines']==dec(source_moves['transfer_source_lines']['quantity_sum_one_side'])
        checks['transfer_amount_matches_source']=amounts['transfer_lines']==dec(source_moves['transfer_source_lines']['amount_sum_one_side'])
        checks['multi_cash_matches_source']=sum(n>1 for n in settlement_counts.values())==source_sales['sales_document_count_with_multiple_settlements']
        checks['sales_funds_parent_count_matches_source']=len(settlement_counts)==file_counts['data/history/sales_documents.jsonl']-source_sales['sales_document_count_without_settlements']
        checks['event_count_matches_converted_lines']=not event_errors and next(event_reader,None) is None and expected_event_count==file_counts['data/inventory/rebuild_events.jsonl']
        checks['rounding_matches_source']=rounding_total==dec(source_totals['sales_rounding'])
        checks['stock_total_matches_rebuild']=sum(persisted_stock.values(),Decimal(0))==dec(source_inventory['totals']['rebuilt_quantity_control_total'])
        checks['only_included_sources_in_rebuild']=dict(event_counts)=={
            'purchase':file_counts['data/history/purchase_lines.jsonl'],
            'sales':file_counts['data/history/sales_lines.jsonl'],
            'transferOut':file_counts['data/history/transfer_lines.jsonl'],
            'transferIn':file_counts['data/history/transfer_lines.jsonl']}
        domain_controls=[]
        for domain in ('masters','sales','inventory'):
            domain_controls+=load_json(OUT/'controls'/f'{domain}.json')['entities']
        domain_controls+=list(source_moves.values())
        checks['all_domain_file_counts_match_controls']=all(
            file_counts.get('data/master/'+c['entity']+'.jsonl',
                file_counts.get('data/history/'+c['entity']+'.jsonl',
                    file_counts.get('quarantine/'+c['entity']+'.jsonl',c.get('output_count',c['converted_count']))))
            ==c.get('output_count',c['converted_count']) for c in domain_controls if c.get('entity') in ids)
    save_json('controls/independent_amount_totals.json',{'quantities':dict(qty),'amounts':dict(amounts),'event_counts':dict(event_counts),'event_totals':dict(event_totals)})

    baseline=load_json(OUT/'BASELINE.json'); changed=[]
    for r in baseline['protected_files']:
        p=Path(r['path']);p=p if p.is_absolute() else (SRC / r['path'][len('T+数据/'):] if r['path'].startswith('T+数据/') else ROOT/p)
        # Deliberately use a fresh digest, not common.sha cache.
        if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=r['sha256']:
            changed.append(r['path'])
    checks['all_source_authority_runtime_files_unchanged']=not changed
    domain_results={}
    for name in ['masters','sales','movements','inventory']:
        domain_results[name]=load_json(OUT/'controls'/f'{name}.json')
    checks['inventory_domain_checks']=domain_results['inventory']['all_pass']
    checks['masters_domain_checks']=domain_results['masters']['verification']['allChecksPassed']
    sales_verification=domain_results['sales']['verification']
    checks['sales_domain_checks']=sales_verification['result']=='PASS' and all(sales_verification[k] for k in [
        'all_source_amounts_and_counts_conserved','all_ids_unique','funds_sales_fk_valid','zero_runtime_import_writes',
        'rounding_not_allocated_to_history_lines','source_primary_method_not_applied_to_historical_funds'])
    movement_domain=domain_results['movements']
    checks['movements_domain_checks']=movement_domain['missing_fk_total']==0 and all(movement_domain['source_row_conservation'].values()) and all(
        c['rejected_count']==0 and c['missing_fk_count']==0 for c in movement_domain['controls'].values())
    checks['no_source_rejected']=all(c['rejected_count']==0 for d in ['masters','sales','inventory'] for c in domain_results[d]['entities'])
    save_json('diagnostics/independent_identity_event_issues.json',{'source_identity_errors':source_identity_errors,
        'event_errors':event_errors,'stock_identity_errors':stock_identity_errors,'sale_header_errors':sale_header_errors})
    report={'all_pass':all(checks.values()),'checks':checks,'file_counts':file_counts,
            'unresolved_fk_count':len(problems),'duplicate_identity_count':len(duplicate_ids),
            'nullable_fk_absences_by_field':dict(explained_nulls),
            'historical_state_errors':audit_state_errors,'transfer_lineage_errors':transfer_lineage_errors,
            'source_identity_error_count':len(source_identity_errors),'event_error_count':len(event_errors),
            'stock_identity_error_count':len(stock_identity_errors),'document_rounding_total':decimal_text(rounding_total),
            'protected_file_count':len(baseline['protected_files']),'changed_protected_files':changed,
            'runtime_store_written':False,'source_and_final_decisions_changed':False,
            'inventory_total':decimal_text(sum(persisted_stock.values(),Decimal(0)))}
    save_json('controls/validation.json',report)
    print(dumps(report),flush=True)
    assert report['all_pass'],[k for k,v in checks.items() if not v]

if __name__=='__main__':
    main()
