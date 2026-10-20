from pathlib import Path
import json,re,unicodedata,openpyxl
p=Path(__file__).parent/'inventory-local-fix-evidence'
s=json.loads((p/'export-source.json').read_text()); ws=openpyxl.load_workbook(p/'inventory-browser-export.xlsx').active
actual=[]; pid=None; headers={}; zero=negative=0
for row in ws.rows:
 vals=[c.value for c in row];a,b=vals[:2]
 if a in {x['id'] for x in s['products']}:
  pid=a;assert row[0].data_type=='s'
 elif a=='颜色' and b=='仓库':headers[pid]=vals[2:-1]
 elif b in ['总仓','备货仓']:
  nums=vals[2:-1];assert all(isinstance(v,(int,float)) for v in nums);assert all(c.data_type=='n' for c in row[2:]);assert sum(nums)==vals[-1]
  actual.append((pid,a,b,nums,vals[-1]));zero+=nums.count(0);negative+=sum(n<0 for n in nums)
expected=[(r['p'],r['color'],r['warehouse'],r['values'],r['total']) for r in s['rows']]
assert actual==expected
assert sum(r[-1] for r in actual)==s['total'];assert len({(r[0],r[1],r[2]) for r in actual})==len(actual)
assert all(headers[x['id']]==x['sizes'] for x in s['products'])
assert '未执行草稿' not in ''.join(str(c.value) for row in ws.rows for c in row)
o={'source':'浏览器点击导出后实际下载文件，由 openpyxl 打开并逐行对账','baseRows':len(actual),'products':len(headers),'warehouses':['总仓','备货仓'],'sum':sum(r[-1] for r in actual),'zeroCells':zero,'negativeCells':negative,'exactOrderedRowsMatch':True,'numberTypes':True,'textProductIds':True,'allProductSizeHeadersMatch':True,'leadingZeroSample':'当前正常样本无前导零款号；另见隔离夹具测试，不能以本文件冒充通过'}
(p/'xlsx-reconciliation.json').write_text(json.dumps(o,ensure_ascii=False,indent=2));print(json.dumps(o,ensure_ascii=False))
s=json.loads((p/'all-source.json').read_text());texts=unicodedata.normalize('NFKC',(p/'pdf-text.txt').read_text()).split('\n\f\n');actual=[];bounds=[]
for i,t in enumerate(texts):
 assert f'第{i+1}/123' in t
 pid=None;n=0
 for l in t.splitlines():
  m=re.match(r'(M\d{5})\s',l)
  if m:pid=m[1]
  m=re.search(r'(总仓|网点仓|温州仓|备货仓)\s+(-?\d[\d\s,\-]*)$',l)
  if m:
   vals=[int(x.replace(',','')) for x in m[2].split()];actual.append((pid,m[1],vals[:-1],vals[-1]));assert sum(vals[:-1])==vals[-1];n+=1
 bounds.append(n)
expected=[(r['p'],r['warehouse'],r['values'],r['total']) for r in s['rows']];assert actual==expected
q=json.loads((p/'pdf-reconciliation.json').read_text());q.update(exactOrderedRowsMatch=True,eachPageHasMatchingPageNumber=True,rowsPerPage=bounds,products=len(set(r[0] for r in actual)),zeroCells=sum(r[2].count(0) for r in actual),negativeCells=sum(sum(v<0 for v in r[2]) for r in actual),sum=sum(r[3] for r in actual));(p/'pdf-reconciliation.json').write_text(json.dumps(q,ensure_ascii=False,indent=2));print('PDF exact match',len(actual),q['sum'])
# Additional actual downloads: same-snapshot all-stock workbook and restricted category workbook.
for filename,source in [('inventory-all-browser-export.xlsx','all-source.json'),('inventory-browser-category-export.xlsx','category-export-source.json')]:
 s=json.loads((p/source).read_text());book=openpyxl.load_workbook(p/filename).active;ids={r['id'] for r in s['products']};actual=[];pid=None
 for row in book.rows:
  v=[c.value for c in row]
  if v[0] in ids:pid=v[0];assert row[0].data_type=='s'
  if v[1] in ['总仓','网点仓','温州仓','备货仓']:
   assert all(c.data_type=='n' for c in row[2:]);actual.append((pid,v[0],v[1],v[2:-1],v[-1]))
 assert actual==[(r['p'],r['color'],r['warehouse'],r['values'],r['total']) for r in s['rows']]
 assert '未执行' not in ''.join(str(c.value) for row in book.rows for c in row)
 print(filename,len(actual),sum(r[-1] for r in actual),'exact match')
book=openpyxl.load_workbook(p/'inventory-browser-leading-zero-fixture.xlsx').active
ids=[c for row in book.rows for c in row if c.value in ['00000001','00000041','00000042']]
assert len(ids)==3 and all(c.data_type=='s' for c in ids)
print('Actual fixture download: leading-zero IDs retained as text')
