from pathlib import Path
import sys,json,zipfile,xml.etree.ElementTree as ET,hashlib,re
p=Path(__file__).parent/'inventory-close-evidence'
f=p/(sys.argv[1] if len(sys.argv)>1 else 'inventory-pants-two-warehouses.xlsx'); source=json.loads((p/'export-reconciliation-source.json').read_text())
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(f) as z:
 root=ET.fromstring(z.read('xl/worksheets/sheet1.xml')); assert '负库存' not in z.read('xl/worksheets/sheet1.xml').decode(); assert root.find('m:cols/m:col[@min="2"]',ns).get('width')=='20'
rows=[]; product=None
for row in root.findall('.//m:sheetData/m:row',ns):
 cells={re.sub(r'\d','',c.attrib['r']):c for c in row.findall('m:c',ns)}
 def val(c):
  if c is None:return ''
  return ''.join(c.itertext())
 a=val(cells.get('A')); b=val(cells.get('B'))
 if re.fullmatch(r'0\d{7}',a):product=a
 if b in ['演示仓库01','演示仓库02']:
  values=[]
  for col in 'CDEFGHIJKL':
   c=cells[col]; assert c.get('t') in (None,'n'); values.append(float(c.find('m:v',ns).text))
  rows.append((product,a,b,values))
expected={(r['p'],r['color'],r['warehouse']):r['values'] for r in source['baseRows']}
seen=set()
for pr,c,w,vs in rows:
 key=(pr,c,w); assert key not in seen; seen.add(key); assert vs==expected[key],key
assert seen==set(expected)
values=[v for _,_,_,vs in rows for v in vs]
result={'baseRows':len(rows),'uniqueRows':len(seen),'warehouses':sorted({r[2] for r in rows}),'total':sum(values),'negativeItems':sum(v<0 for v in values),'zeroCells':sum(v==0 for v in values),'leadingZeroProduct':rows[0][0],'duplicateRows':0,'missingRows':0,'fileBytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'verified':'独立重新打开 XLSX ZIP/XML；400 条逐行逐数量与查询快照相等'}
assert result['total']==33601 and result['negativeItems']==100 and result['zeroCells']==409
(p/('browser-xlsx-reconciliation.json' if len(sys.argv)>1 else 'xlsx-reconciliation.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)); print(json.dumps(result,ensure_ascii=False))
