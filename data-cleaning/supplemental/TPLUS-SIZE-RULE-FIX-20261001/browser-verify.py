import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[3]
work = Path(__file__).resolve().parent
switch_tab('B6FBA2603E302A3D8BE26C2A0C9841F4')
policy = json.loads((root / 'data-cleaning/size-mapping/accepted-size-decisions.json').read_text())
ids = json.dumps([r['sku'] for r in policy['decisions']])
raw = js("JSON.stringify({url:location.href,loaded:window.LEGACY_REAL?.loaded,error:window.LEGACY_REAL?.error,skus:" + ids + ".map(id=>window.LEGACY_REAL?.rawSkuById?.get(id)),groups:window.PRODUCT_CATALOG?.groups?.map(g=>({id:g.id,name:g.name,sizes:g.sizes})),products:window.ERP_DEMO?.products?.filter(p=>['119TX5272201','503KZ3369857','649KZ6289478','753MJ5386311','000WJ9000007','040KZ5139400'].includes(p.id)).map(p=>({id:p.id,groupId:p.groupId,sizes:p.sizes,records:p.legacySizeRecords,selectedSizeIds:p.selectedSizeIds,barcodes:p.barcodes}))})")
(work / 'browser-catalog-402.json').write_text(raw)
data = json.loads(raw)
assert data['loaded'] and data['error'] == '', data
actual = {r['id']: r for r in data['skus']}
for r in policy['decisions']:
    size = actual[r['sku']]['options']['SIZE']
    assert size['currentGroupId'] == r['targetGroup'], (r, size)
    assert size['name'] == r['target'][3], (r, size)
    assert size['sourceName'] == r['source']['sourceSize'], (r, size)
    assert size['sourceCode'] == r['source']['sourceCode'], (r, size)
    expected_code = '910' if r['source']['sourceCode'] == '910' and r['source']['sourceSize'] == '无尺码' else r['target'][2]
    assert size['code'] == expected_code, (r, size)
assert [g['id'] for g in data['groups']] == ['UPPER', 'PANTS', 'WOMEN', 'SHOES', 'KIDS', 'FREE']
raw = js("""JSON.stringify([...document.querySelectorAll('.mx-section .mx-table')].map(t=>({headers:[...t.querySelectorAll('thead th')].map(x=>x.textContent.trim()),rows:[...t.querySelectorAll('tbody tr')].filter(r=>r.textContent.includes('586CS5361723')).map(r=>[...r.cells].map(c=>({text:c.textContent.trim(),values:[...c.querySelectorAll('input')].map(x=>x.value)})))})))""")
(work / 'transfer-after.json').write_text(raw)
table = next(t for t in json.loads(raw) if t['rows'])
row = table['rows'][0]
for name, quantity in [('175/L', '4'), ('185/2XL', '1'), ('190/3XL', '1')]:
    assert row[table['headers'].index(name)]['values'] == [quantity], (name, row)
assert row[table['headers'].index('小计')]['text'] == '6'
assert '#transfer/doc/ALAL-2026-09-0132' in data['url'], data['url']
shutil.copy2(capture_screenshot(), work / '调拨0132尺码修正后.png')
summary = {'url': data['url'], 'verifiedSkus': len(actual), 'groups': [g['name'] for g in data['groups']], 'transferQuantity': {'175/L': 4, '185/2XL': 1, '190/3XL': 1, 'total': 6}, 'sampleGroups': [{k:r[k] for k in ['id', 'groupId']} for r in data['products']]}
(work / 'browser-verification.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False))
