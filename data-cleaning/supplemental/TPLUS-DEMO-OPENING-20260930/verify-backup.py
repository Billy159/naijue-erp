import hashlib,json,re,subprocess
from collections import Counter,defaultdict
from decimal import Decimal
from pathlib import Path

root=Path(__file__).resolve().parents[3]
out=root/'data-cleaning/verification/consolidation-20261001'
archive=root/'backup/business-management-current-20261001.dump'
import os,shutil
restore=os.environ.get('PG_RESTORE_BIN') or shutil.which('pg_restore') or str(Path.home()/'pg17/bin/pg_restore')
plan=json.loads((Path(__file__).resolve().parent/'opening-plan.json').read_text())
manifest=json.loads((root/'server/runtime/excel-barcode-authority-20260930.json').read_text())
supplement=json.loads((root/'server/runtime/barcode-scheme-supplement-20260930.json').read_text())
def records(table):
    sql=subprocess.check_output([restore,'-a','-t',table,'-f','-',str(archive)],text=True)
    lines=sql.splitlines(); columns=None; data=[]
    for line in lines:
        if line.startswith('COPY '):
            columns=re.search(r'\(([^)]+)\) FROM stdin;',line).group(1).split(', ')
        elif line=='\\.': columns=None
        elif columns: data.append(dict(zip(columns,line.split('\t'))))
    return data

cells=records('inventory_opening_cell')
assert len(cells)==32430
expected={(c['warehouseId'],c['skuId']):Decimal(c['quantity']) for c in plan['cells']}
actual={(c['warehouse_id'],c['sku_id']):Decimal(c['quantity']) for c in cells}
assert actual==expected
assert sum(Decimal(c['quantity'])<0 for c in cells)==340
units=defaultdict(Decimal)
for cell in cells: units[cell['unit']]+=Decimal(cell['quantity'])
assert dict(units)=={unit:Decimal(q) for unit,q in plan['controls']['byUnit'].items()}
runs=records('inventory_opening_run');assert len(runs)==1
assert runs[0]['id']==plan['revision'] and runs[0]['active']=='t' and runs[0]['mode']=='DEMO_ONLY'
assert runs[0]['source_sha256']==plan['sourceSha256']
codes=records('generated_barcode')
assert len(codes)==14960 and len({c['barcode'] for c in codes})==14960
expected_codes={r['skuId']:(r['productId'],r['barcode']) for r in manifest['records']+supplement['records'] if r['status']=='ACTIVE'}
assert {c['sku_id']:(c['product_id'],c['barcode']) for c in codes}==expected_codes
delta={(r['warehouse_id'],r['sku_id']):Decimal(r['quantity']) for r in records('inventory_delta')}
checkpoint={(r['warehouse_id'],r['sku_id']):Decimal(r['quantity']) for r in records('inventory_opening_delta_checkpoint')}
assert delta==checkpoint
toc=subprocess.check_output([restore,'-l',str(archive)],text=True)
assert all(name in toc for name in ['inventory_opening_run','inventory_opening_cell','inventory_opening_delta_checkpoint','inventory_opening_prior_posting','employee_login'])
assert 'v2_runtime_test_' not in toc
digest=hashlib.sha256()
with archive.open('rb') as stream:
    for chunk in iter(lambda:stream.read(1024*1024),b''): digest.update(chunk)
result={'status':'PASS','file':str(archive.relative_to(root)),'bytes':archive.stat().st_size,'sha256':digest.hexdigest(),'schemas':['tplus_demo_20260922_a2','v2_runtime_stage03c'],'openingRevision':plan['revision'],'openingCells':len(cells),'stockDifferences':0,'negativeCells':340,'uniqueBarcodes':14960,'byUnit':plan['controls']['byUnit'],'openingCheckpointMatchesExistingRuntimeDelta':True,'containsEmployeeAccountTables':True,'sourceArchiveFullyReadVerified':True,'testSchemasIncluded':False,'restoredIntoRunningDatabase':False}
(out/'backup-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
