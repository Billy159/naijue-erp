"""Exact bounded original A02/I01, candidate-side native bytes. Native execution recorded in DOT-NAVIGATION-INVENTORY-RECHECK-20261029.md.
Root alone executes headed Chromium. Unchanged foundation-readonly-fixture.mjs;
no successful response edits, no injected delays, no business writes, no live data.
"""
import argparse, hashlib, json, mimetypes, re, select, subprocess, sys, time, traceback
from pathlib import Path
from urllib.parse import urlsplit, unquote

REPO=Path(__file__).resolve().parents[4]
BRIDGE=REPO/'apps/web/demo-replica/tests/foundation-readonly-fixture.mjs'
sys.path.insert(0,str(BRIDGE.parent))
from visible_wait import keep_visible
p=argparse.ArgumentParser()
p.add_argument('build');p.add_argument('out');p.add_argument('--expected-checkpoint',required=True)
p.add_argument('--case',action='append',choices=['RECHECK-A02','RECHECK-I01'])
p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium')
p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true')
a=p.parse_args()
if not a.headed:p.error('Root-owned headed execution is required.')
build=Path(a.build).resolve();out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False)
result={'status':'RUNNING','syntheticOnly':True,'wholePass':False,'cases':[],'screens':[],
 'requests':[],'readResponses':[],'forbiddenCommands':[],'externalRequests':[],
 'scope':'Original A02 five representative routes and I01 query/1440+900 scroll/fold/reset only'}
bridge=None;browser=None;page=None;errors=[]
FIELDS=['products','categories','warehouses','suppliers','fits','seasons']
ROUTES={'inventory':('库存状况表','库存管理 / 库存状况表',None),
 'sales':('销货单列表','销售管理 / 销货单列表','/api/sales/query'),
 'transfer':('调拨单列表','库存管理 / 调拨单列表','/api/transfers/query'),
 'products':('商品信息','商品管理 / 商品信息','/api/product-management/query'),
 'settings/staff':('员工与账号','基础设置 / 员工与账号','/api/staff/query')}

def persist():
 result['errors']=errors
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def blank():return {'filter':{k:[] for k in FIELDS},'page':1,'pageSize':100}
def fmt(value):
 assert isinstance(value,str) and re.fullmatch(r'(0|[1-9]\d*|-[1-9]\d*)',value),value
 return format(int(value),',')
def bridge_read(path,body=None,method='POST',headers=None,source='browser'):
 request={'url':'https://synthetic-management.invalid'+path,'method':method,'headers':headers or {},'body':None if body is None else json.dumps(body)}
 bridge.stdin.write(json.dumps(request)+'\n');bridge.stdin.flush()
 if not select.select([bridge.stdout],[],[],45)[0]:raise TimeoutError('Unchanged readonly bridge timed out: '+path)
 line=bridge.stdout.readline()
 if not line:raise RuntimeError('Unchanged readonly bridge ended: '+path)
 response=json.loads(line);payload=json.loads(response['body'])
 result['readResponses'].append({'source':source,'path':path,'method':method,'request':body or {},'headers':headers or {},'status':response['status'],'body':payload})
 return response
def validate_dto(data,parameters):
 assert data['page']==parameters['page'] and data['pageSize']==parameters['pageSize']
 assert data['readReference'] and isinstance(data['exactTotalProducts'],int)
 assert len(data['products'])==min(parameters['pageSize'],max(0,data['exactTotalProducts']-(parameters['page']-1)*parameters['pageSize']))
 assert len({v['id'] for v in data['products']})==len(data['products'])
 def total(actual,values):
  fmt(actual['knownQuantity']);assert actual['completeness']=='complete' and actual['unknownCells']==0
  assert int(actual['knownQuantity'])==sum(values),(actual,values)
 for product in data['products']:
  sizes=[s['id'] for s in product['sizes']];assert sizes and len(set(sizes))==len(sizes)
  for group in product['colorFits']:
   for row in group['rows']:
    assert set(row['cells'])==set(sizes)
    for cell in row['cells'].values():
     assert cell['state'] in ['known','not-applicable']
     if cell['state']=='known':assert cell['skuId'];fmt(cell['quantity'])
    total(row['total'],[int(c['quantity']) for c in row['cells'].values() if c['state']=='known'])
   total(group['total'],[int(r['total']['knownQuantity']) for r in group['rows']])
   for sid in sizes:total(group['sizeTotals'][sid],[int(r['cells'][sid]['quantity']) for r in group['rows'] if r['cells'][sid]['state']=='known'])
  total(product['total'],[int(g['total']['knownQuantity']) for g in product['colorFits']])
  for sid in sizes:total(product['sizeTotals'][sid],[int(g['sizeTotals'][sid]['knownQuantity']) for g in product['colorFits']])
 if data['exactTotalProducts']==len(data['products']):total(data['allMatchesTotal'],[int(v['total']['knownQuantity']) for v in data['products']])
def projection(product):
 colors={}
 for group in product['colorFits']:
  color=colors.setdefault(group['color']['label'],{'total':0,'sizes':{},'rows':{}})
  color['total']+=int(group['total']['knownQuantity'])
  for sid,t in group['sizeTotals'].items():color['sizes'][sid]=color['sizes'].get(sid,0)+int(t['knownQuantity'])
  for row in group['rows']:
   target=color['rows'].setdefault(row['warehouse']['label'],{'total':0,'sizes':{}});target['total']+=int(row['total']['knownQuantity'])
   for sid,cell in row['cells'].items():
    if cell['state']=='known':target['sizes'][sid]=target['sizes'].get(sid,0)+int(cell['quantity'])
 return colors

try:
 manifest=json.loads((build/'production-build.json').read_text());cfg=manifest['configuration'];origin=cfg['http']['origin'];base=cfg['assets']['basePath']
 assert origin=='https://synthetic-management.invalid','Synthetic origin required'
 assert manifest['sourceCheckpoint']==a.expected_checkpoint,'Native build checkpoint mismatch'
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()==a.expected_checkpoint,'Current-source readonly fixture HEAD differs from native build'
 for item in manifest['outputs']:
  file=build/item['path'];assert file.is_file() and sha(file)==item['sha256'],'Build output mismatch: '+item['path']
 for item in manifest['inputs']:
  file=REPO/item['path'];assert file.is_file() and sha(file)==item['sha256'],'Build input mismatch: '+item['path']
 assert all(cfg['routes'].get(k) for k in ['inventory','sales','transfers','products','staffSettings'])
 result.update(sourceCheckpoint=manifest['sourceCheckpoint'],buildManifestSha256=sha(build/'production-build.json'),configuration=cfg,builtAt=manifest['builtAt'],sourceBinding='Every native manifest input/output hash verified; actual current-source readonly bridge')
 references=json.loads(Path(__file__).with_name('SOURCE-REFERENCES.json').read_text())
 result['fixtureAndSourceHashes']=[{'path':r['path'],'sha256':sha(REPO/r['path'])} for r in references['sourceReferences']]
 result['preparationReferenceCheckpoint']=references['preparedAgainstCheckpoint']
 allowed={v['path'] for v in manifest['outputs']}|{'index.html'}
 bridge=subprocess.Popen([a.node,'--experimental-transform-types',str(BRIDGE)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
 auth=bridge_read('/api/auth/session',method='GET',source='preflight');assert auth['status']==200
 principal=json.loads(auth['body'])['principal'];assert principal['role']=='ADMIN','Declared finite ADMIN profile required; do not replace identity'
 raw=bridge_read('/api/inventory/query',blank(),source='preflight');assert raw['status']==200
 baseline=json.loads(raw['body']);validate_dto(baseline,blank())
 assert [v['code'] for v in baseline['products']]==['M26001','M26004','QA-W01','QA-S01','QA-K01','QA-F01'],'Declared finite QA specimen changed'
 assert baseline['exactTotalProducts']==6 and baseline['allMatchesTotal']['knownQuantity']=='1504'
 assert len(baseline['warehouseLabels'])==4 and len(set(baseline['warehouseLabels']))==4
 result['fixtureInventory']={'codes':[v['code'] for v in baseline['products']],'total':baseline['allMatchesTotal'],'warehouseLabels':baseline['warehouseLabels'],'readReference':baseline['readReference']};persist()
 from playwright.sync_api import sync_playwright, expect
 with sync_playwright() as pw:
  try:browser=pw.chromium.launch(executable_path=a.chromium,headless=False,chromium_sandbox=True)
  except Exception as e:result.update(status='BLOCKED_ENV',reason=str(e));persist();raise SystemExit(2)
  context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
  context.set_default_timeout(15000);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  def respond(route):
   request=route.request;u=urlsplit(request.url)
   result['requests'].append({'method':request.method,'url':request.url,'body':request.post_data,'headers':request.headers})
   if f'{u.scheme}://{u.netloc}'!=origin:result['externalRequests'].append(request.url);route.abort();return
   if u.path.startswith('/api/'):
    if not (request.method=='GET' and u.path=='/api/auth/session' or request.method=='POST' and u.path.endswith('/query')):
     result['forbiddenCommands'].append({'method':request.method,'path':u.path});route.abort();return
    r=bridge_read(u.path,json.loads(request.post_data or '{}') if request.method=='POST' else None,request.method,request.headers)
    route.fulfill(status=r['status'],headers=r['headers'],body=r['body']);return
   relative='index.html' if u.path=='/' else unquote(u.path[len(base):]) if u.path.startswith(base) else ''
   if relative not in allowed:route.fulfill(status=404,body='Not in fixed native manifest');return
   file=build/relative;mime='application/javascript' if relative.endswith('.js') else mimetypes.guess_type(file)[0] or 'application/octet-stream'
   route.fulfill(status=200,content_type=mime,body=file.read_bytes())
  context.route('**/*',respond)
  # Passive observer only: no app hooks, global replacements, animation suppression or response changes.
  page.add_init_script("""window.__niStates=[];new MutationObserver(()=>{const e=document.querySelector('#iw-results');if(!e)return;const v={busy:e.getAttribute('aria-busy'),loading:!!e.querySelector('.iw-loading'),measured:e.querySelectorAll('[data-inventory-windowed]').length,status:[...e.querySelectorAll('[role=status]')].map(x=>x.textContent)};const text=JSON.stringify(v);if(window.__niLast!==text){window.__niLast=text;window.__niStates.push({...v,ms:performance.now()});}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-busy']});""")
  def current(path):return next(r for r in reversed(result['readResponses']) if r['source']=='browser' and r['path']==path)
  def count(path):return sum(r['source']=='browser' and r['path']==path for r in result['readResponses'])
  def healthy():
   assert not errors,errors
   assert not result['forbiddenCommands'],result['forbiddenCommands']
   assert not result['externalRequests'],result['externalRequests']
   visible=[e.inner_text().strip() for e in page.get_by_role('alert').all() if e.is_visible() and e.inner_text().strip()]
   assert not visible,visible  # No global expected-error exemptions in these two read-only cases.
  def shot(case,name):
   name=case+'-'+str(name);page.screenshot(path=str(out/(name+'.png')),full_page=True)
   (out/(name+'.txt')).write_text(page.locator('body').inner_text())
   result['screens'].append({'path':name+'.png','url':page.url,'viewport':page.viewport_size,'sourceCheckpoint':manifest['sourceCheckpoint']})
  def partial(item,reason):
   if reason not in item['missingSteps']:item['missingSteps'].append(reason)
   persist()
  def step(item,name,fn):
   rec={'name':name,'status':'RUNNING','requestStart':len(result['requests']),'startedUtc':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()};item['steps'].append(rec);persist();start=time.monotonic()
   try:fn();healthy();rec.update(status='PASS',requestEnd=len(result['requests']),elapsedMs=round((time.monotonic()-start)*1000));shot(item['caseId'],len(item['steps']))
   except Exception as e:rec.update(status='FAIL',reason=str(e));persist();raise
   persist()
  def run(case,fn):
   if a.case and case not in a.case:return
   item={'caseId':case,'status':'RUNNING','wholePass':False,'sourceCheckpoint':manifest['sourceCheckpoint'],'originalSource':'ORIGINAL-A02-I01.json','steps':[],'missingSteps':[]};result['cases'].append(item);persist()
   try:fn(item);healthy();assert item['steps'];item['status']='PARTIAL' if item['missingSteps'] else 'PASS_LISTED_STEPS'
   except Exception as e:
    item.update(status='FAIL',reason=str(e),traceback=traceback.format_exc())
    try:shot(case,'failure')
    except Exception:pass
   persist()
  def frame():page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  def settled_inventory():
   expect(page.locator('#iw-results')).to_have_attribute('aria-busy','false')
   expect(page.locator('#iw-results .iw-loading')).to_have_count(0)
   expect(page.locator('#iw-results [data-inventory-windowed="measured"]')).to_be_visible()
   expect(page.locator('#iw-results [data-probe-section]')).to_have_count(0)
   expect(page.locator('#iw-results [role=status]')).to_have_count(0)
   expect(page.get_by_role('button',name='查询',exact=True)).to_be_enabled()
  def summary_ok(data):
   expect(page.locator('.iw-stats')).to_contain_text(str(data['exactTotalProducts'])+' 款商品 · '+str(len(data['warehouseLabels']))+' 个仓库 · 库存 '+fmt(data['allMatchesTotal']['knownQuantity']))
   expect(page.locator('.iw-pagination')).to_contain_text('共 '+str(data['exactTotalProducts'])+' 款')
  def inventory_ok(ids=None):
   r=current('/api/inventory/query');assert r['status']==200,r;data=r['body'];q=r['request'];validate_dto(data,q)
   assert all(not q['filter'][k] for k in FIELDS if k!='products'),q
   wanted=ids if ids is not None else [v['id'] for v in baseline['products']]
   assert [v['id'] for v in q['filter']['products']]==([] if ids is None else ids),q
   expected=[v for v in baseline['products'] if v['id'] in wanted]
   assert data['products']==expected and data['exactTotalProducts']==len(expected),(data,expected)
   settled_inventory();summary_ok(data)
   expect(page.locator('#iw-draft-note')).to_have_text('')
   result['inventoryStateTransitions']=page.evaluate('window.__niStates');return data
  def query_inventory(ids=None,button='查询'):
   before=count('/api/inventory/query');start=time.monotonic()
   with page.expect_response(lambda r:urlsplit(r.url).path=='/api/inventory/query'):page.get_by_role('button',name=button,exact=True).click()
   assert count('/api/inventory/query')==before+1
   data=inventory_ok(ids);result.setdefault('syntheticQueryTimings',[]).append({'button':button,'elapsedMs':round((time.monotonic()-start)*1000),'qualification':'Closed local fixture + native UI; not production server latency'});return data
  def inventory_idle():
   expect(page.locator('#iw-results')).to_have_attribute('aria-busy','false');expect(page.locator('#iw-results [data-inventory-windowed]')).to_have_count(0)
   expect(page.locator('#iw-results').get_by_text('等待查询',exact=True)).to_be_visible();expect(page.get_by_role('button',name='查询',exact=True)).to_be_enabled()
  def open_inventory():
   page.goto(origin+'/#inventory');page.bring_to_front();expect(page.get_by_role('heading',name='库存状况表',exact=True)).to_be_visible();inventory_idle()
   page.evaluate('(s)=>document.title="合成只读 A02/I01 · "+s',manifest['sourceCheckpoint'])
  def shell_ok(route):
   heading,crumb,path=ROUTES[route];expect(page.get_by_role('heading',name=heading,exact=True)).to_be_visible()
   expect(page).to_have_url(origin+'/#'+route);expect(page.locator('#page')).to_have_attribute('data-replica-route',route)
   expect(page.locator('#breadcrumb')).to_have_text(crumb)
   selected=page.locator('.sidebar a[aria-current="page"]');expect(selected).to_have_count(1);expect(selected).to_have_attribute('data-route',route);expect(selected).to_have_class(re.compile(r'\bselected\b'))
   expect(page.get_by_text('正在加载页面…',exact=True)).to_have_count(0)
   account=page.locator('.basic-account button[aria-label^="当前员工："]');expect(account).to_be_visible()
   geometry=page.locator('.topbar').evaluate('e=>{const h=e.getBoundingClientRect(),a=e.querySelector(".basic-account").getBoundingClientRect(),b=e.querySelector("#breadcrumb").getBoundingClientRect();return {header:{left:h.left,right:h.right,top:h.top,bottom:h.bottom},account:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},breadcrumbRight:b.right}}')
   g=geometry;assert g['account']['left']>=g['breadcrumbRight'] and g['account']['right']<=g['header']['right']+1 and g['account']['top']>=g['header']['top']-1 and g['account']['bottom']<=g['header']['bottom']+1,g
   result.setdefault('shellGeometry',[]).append({'route':route,'facts':g})
   if path:
    expect(page.get_by_role('button',name='查询',exact=True)).to_be_enabled();r=current(path);assert r['status']==200,r;rows=r['body']['items']
    table='#sale-list-scroll' if route=='sales' else '.tc-list-scroll' if route=='transfer' else '.pc-list-table' if route=='products' else '.runtime-settings'
    expect(page.locator(table+' tbody tr')).to_have_count(len(rows))
    for row in rows:
     word=row.get('number') or row.get('code') or row['name'];expect(page.locator(table+' tbody')).to_contain_text(word)
   healthy()
  def nav(route):
   link=page.locator('.sidebar a[data-route="'+route+'"]');start=time.monotonic();before=len(result['requests']);link.click();shell_ok(route)
   result.setdefault('syntheticNavigationTimings',[]).append({'route':route,'elapsedMs':round((time.monotonic()-start)*1000),'requestStart':before,'requestEnd':len(result['requests']),'qualification':'Synthetic native route readiness, no production latency claim'})
   focus=page.evaluate('()=>{const e=document.activeElement;return {tag:e?.tagName,route:e?.dataset.route||null,connected:!!e?.isConnected,inert:!!e?.closest("[inert]")}}');assert focus['connected'] and not focus['inert'];result.setdefault('navigationFocus',[]).append({'route':route,'actual':focus})
  def groups(opened,keyboard=False):
   for cls in ['.tc-nav-group:not(.sale-nav-group)','.sale-nav-group']:
    group=page.locator('.sidebar '+cls);summary=group.locator('summary');expect(summary).to_be_visible()
    if group.evaluate('e=>e.open')!=opened:
     if keyboard:summary.focus();summary.press('Enter')
     else:summary.click()
    assert group.evaluate('e=>e.open')==opened
    expect(summary).to_be_focused()
    for child in group.locator('a').all():expect(child).to_be_visible() if opened else expect(child).not_to_be_visible()
  def a02(item):
   step(item,'库存初始真实会话/主框架/菜单/面包屑/账户几何',lambda:(open_inventory(),shell_ok('inventory')))
   for route in ['sales','transfer','products','settings/staff']:
    step(item,ROUTES[route][0]+'实际侧栏点击→已加载结果/选中项/面包屑/账号位置',lambda route=route:nav(route))
   step(item,'主框架调拨/销货组鼠标折叠并展开，焦点不丢',lambda:(groups(False),groups(True)))
   step(item,'同两组Enter折叠/展开，焦点留在summary',lambda:(groups(False,True),groups(True,True)))
   def back_forward():
    page.go_back();shell_ok('products');page.go_forward();shell_ok('settings/staff')
   step(item,'浏览器Back商品→Forward设置，路由/选中项/面包屑与真实结果一致',back_forward)
   def back_inventory():
    nav('inventory');inventory_idle();query_inventory();shell_ok('inventory')
   step(item,'返回库存遵守普通路由重挂载idle合同，再真实全部查询完成无卡住',back_inventory)
   def supersede():
    for route in ['products','sales','transfer','inventory']:page.locator('.sidebar a[data-route="'+route+'"]').click()
    shell_ok('inventory');inventory_idle();query_inventory();assert len(context.pages)==1
   step(item,'有界连续切换后最后库存意图胜出，无旧页覆盖/新tab/卡加载',supersede)
   partial(item,'本轮仅候选原生构建、合成ADMIN、五代表路由；未配对冻结Demo、其他角色/退出/改密写入与其余设置入口。不冒整页/全系统通过。')
   partial(item,'普通侧栏返回按现源码重新idle，不主张恢复库存草稿/折叠/滚动；显式商品→详细库存→返回原查询另见既有P13证据，不重复。')
  def rendered_values(data):
   # Validate only genuinely mounted window rows against the complete canonical DTO;
   # never equate current window row count to all business rows.
   captured=page.locator('#iw-results [data-inventory-windowed] .mx-table').evaluate_all('''tables=>tables.flatMap(t=>{const heads=[...t.querySelectorAll('thead th')].map(x=>x.dataset.sizeId||null);const clean=e=>{let c=e.cloneNode(true);c.querySelectorAll('button').forEach(x=>x.remove());return c.textContent.trim()};return [...t.querySelectorAll('tbody tr[data-inventory-product]')].map(r=>({product:r.dataset.inventoryProduct,classes:r.className,color:clean(r.querySelector('.mx-color')),warehouse:clean(r.querySelector('.mx-warehouse')),total:r.querySelector('.mx-total-cell').textContent.trim(),sizes:[...r.cells].flatMap((c,i)=>heads[i]?[{id:heads[i],text:c.textContent.trim(),zero:c.classList.contains('mx-zero'),negative:c.classList.contains('minus')}]:[])}))})''')
   assert captured,'No actual rendered rows';by_id={v['id']:v for v in data['products']}
   for row in captured:
    product=by_id[row['product']];colors=projection(product)
    if 'mx-total' in row['classes']:total=int(product['total']['knownQuantity']);sizes={k:int(v['knownQuantity']) for k,v in product['sizeTotals'].items()}
    elif 'mx-subtotal' in row['classes']:part=colors[row['color']];total=part['total'];sizes=part['sizes']
    else:part=colors[row['color']]['rows'][row['warehouse']];total=part['total'];sizes=part['sizes']
    assert row['total']==format(total,','),row
    for cell in row['sizes']:
     value=sizes.get(cell['id']);assert cell['text']==('—' if value is None else format(value,',')),(row,cell,value)
     if 'mx-total' not in row['classes'] and 'mx-subtotal' not in row['classes'] and value is not None:assert cell['zero']==(value==0) and cell['negative']==(value<0)
   result.setdefault('renderedInventoryChecks',[]).append({'viewport':page.viewport_size,'scroll':page.locator('#iw-results').evaluate('e=>({left:e.scrollLeft,top:e.scrollTop})'),'rows':captured})
  def geometry(item,width,height):
   page.set_viewport_size({'width':width,'height':height});settled_inventory();frame();box=page.locator('#iw-results')
   for left,top,label in [(0,0,'origin'),(1,0,'right'),(1,1,'right-bottom'),(0,.5,'left-middle')]:
    box.evaluate('(e,p)=>e.scrollTo({left:p[0]*(e.scrollWidth-e.clientWidth),top:p[1]*(e.scrollHeight-e.clientHeight)})',[left,top]);frame();settled_inventory()
    facts=box.evaluate('''e=>{const host=e.querySelector('[data-inventory-windowed]'),tables=[...host.querySelectorAll('table')];return {width:e.clientWidth,height:e.clientHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,left:e.scrollLeft,top:e.scrollTop,headers:tables.map(t=>{const cells=[...t.querySelectorAll('thead th')],rect=x=>{let r=x.getBoundingClientRect(),s=getComputedStyle(x);return {left:r.left,right:r.right,width:r.width,position:s.position,rightCss:s.right}};return {leading:cells.slice(0,3).map(rect),total:rect(cells.at(-2)),action:rect(cells.at(-1))}})}}''')
    assert facts['headers'],facts
    for h in facts['headers']:
     for cell,expected in zip(h['leading']+[h['total'],h['action']],[300,116,152,76,70]):assert abs(cell['width']-expected)<2,(width,facts)
     assert h['total']['right']<=h['action']['left']+1,(width,'合计/操作重叠',facts)
     assert h['total']['position']==h['action']['position']=='sticky' and h['total']['rightCss']=='70px' and h['action']['rightCss']=='0px',facts
    result.setdefault('inventoryGeometry',[]).append({'viewport':page.viewport_size,'position':label,'facts':facts});rendered_values(current('/api/inventory/query')['body']);shot(item['caseId'],str(width)+'-'+str(height)+'-'+label)
    if width==900 and facts['width']<714:partial(item,'900px保留原窄屏固定前列与后列空间冲突基线；只核列宽、合计/操作无互遮及真实滚动，不判窄屏完整布局已修。')
   assert facts['scrollWidth']>facts['width'],'Real fixture does not exercise horizontal scrolling'
   if facts['scrollHeight']<=facts['height']:partial(item,str(width)+'px实际fixture不溢出纵向，纵向滚动路径未覆盖，不造行')
   box.evaluate('e=>e.scrollTo({left:0,top:0})');frame()
  def select_product(product):
   host=page.locator('#inventory-arco-select');search=host.locator('input');expect(search).to_have_count(1)
   with page.expect_response(lambda r:urlsplit(r.url).path=='/api/inventory/candidates/query' and json.loads(r.request.post_data or '{}').get('search')==product['code']):search.fill(product['code'])
   response=current('/api/inventory/candidates/query');assert response['status']==200 and any(r['id']==product['id'] and r['code']==product['code'] for r in response['body']['items'])
   option=host.locator('.arco-select-option').filter(has=page.locator('.inv-option-code').filter(has_text=re.compile('^'+re.escape(product['code'])+'$')));expect(option).to_have_count(1);option.click();page.get_by_role('heading',name='库存状况表',exact=True).click()
   expect(host.locator('.inv-tag-copy').filter(has_text=re.compile('^'+re.escape(product['code'])+'$'))).to_be_visible()
  def fold_product(product,opened):
   button=page.locator('#iw-results [data-inventory-windowed] [data-runtime-fold="p:'+product['id']+'"]');expect(button).to_have_count(1);button.click();frame();settled_inventory();expect(button).to_have_attribute('aria-expanded',str(opened).lower());expect(button).to_be_focused()
  def i01(item):
   step(item,'新入口初始idle、查询控件就绪；没有伪造自动库存结果',open_inventory)
   step(item,'全部真实查询：六款四仓1504、完整数量/汇总合同和实际挂载单元格',lambda:rendered_values(query_inventory()))
   for width,height in [(1440,1000),(900,1000),(1470,668)]:
    step(item,str(width)+'×'+str(height)+'真实横纵滚动/虚拟窗口/固定列宽/合计操作边界',lambda width=width,height=height:geometry(item,width,height))
   step(item,'回1440原视口、矩阵重新稳定且原全部结果保持',lambda:(page.set_viewport_size({'width':1440,'height':1000}),settled_inventory(),inventory_ok()))
   first,second=baseline['products'][:2]
   def single():
    before=count('/api/inventory/query');select_product(first);assert count('/api/inventory/query')==before
    expect(page.locator('#iw-draft-note')).to_have_text('条件已修改，点击“查询”更新结果。');summary_ok(baseline)
    rendered_values(query_inventory([first['id']]))
   step(item,'原单款草稿不冒已执行结果→真实查询仅该款',single)
   def two():
    select_product(second);data=query_inventory([first['id'],second['id']]);rendered_values(data)
   step(item,'原两款逐个选择并查询，只返回两款实际身份/数量',two)
   def one_fold():
    fold_product(first,False);rows=page.locator('#iw-results [data-inventory-windowed] tr[data-inventory-product="'+first['id']+'"]');expect(rows).to_have_count(1);expect(rows.locator('.mx-color')).to_contain_text('所有颜色');expect(rows.locator('.mx-warehouse')).to_contain_text('所有库存')
    expect(page.locator('#iw-results [data-runtime-fold="p:'+second['id']+'"]')).to_have_attribute('aria-expanded','true');assert page.locator('#iw-results tr[data-inventory-product="'+second['id']+'"] .iw-number').count()>0
    rendered_values(current('/api/inventory/query')['body']);fold_product(first,True);rendered_values(current('/api/inventory/query')['body'])
   step(item,'原单款折叠→另款仍明细→恢复；总数及焦点正确',one_fold)
   def color_fold():
    controls=page.locator('#iw-results [data-inventory-windowed] tr[data-inventory-product="'+first['id']+'"] [data-runtime-fold^="c:"]');button=controls.first;expect(button).to_have_attribute('aria-expanded','true');key=button.get_attribute('data-runtime-fold');button.click();frame();settled_inventory()
    button=page.locator('#iw-results [data-inventory-windowed] [data-runtime-fold='+json.dumps(key)+']')
    expect(button).to_have_attribute('aria-expanded','false');expect(button).to_be_focused();row=page.locator('#iw-results [data-inventory-windowed] tr.mx-subtotal.mx-folded[data-inventory-product="'+first['id']+'"]');expect(row).to_have_count(1);expect(row.locator('.mx-warehouse')).to_contain_text('所有库存');rendered_values(current('/api/inventory/query')['body'])
    button.click();frame();settled_inventory();expect(page.locator('#iw-results [data-inventory-windowed] [data-runtime-fold='+json.dumps(key)+']')).to_have_attribute('aria-expanded','true');rendered_values(current('/api/inventory/query')['body'])
   step(item,'原单颜色仓明细折叠→所有库存真实汇总→展开，焦点与值一致',color_fold)
   def all_fold():
    page.get_by_role('button',name='折叠',exact=True).click();frame();settled_inventory();expect(page.locator('#iw-results [data-inventory-windowed] .iw-number')).to_have_count(0)
    for product in [first,second]:expect(page.locator('#iw-results [data-runtime-fold="p:'+product['id']+'"]')).to_have_attribute('aria-expanded','false')
    rendered_values(current('/api/inventory/query')['body']);page.get_by_role('button',name='展开',exact=True).click();frame();settled_inventory();rendered_values(current('/api/inventory/query')['body'])
   step(item,'原全部折叠→所有颜色/库存两款汇总→展开还原实际明细',all_fold)
   def advanced_reset():
    toggle=page.locator('button.iw-filter-toggle');expect(toggle).to_have_attribute('aria-expanded','false');toggle.click();expect(toggle).to_have_attribute('aria-expanded','true')
    for ident in ['suppliers','fits','seasons']:expect(page.locator('#inventory-arco-'+ident)).to_be_visible()
    toggle.click();expect(toggle).to_have_attribute('aria-expanded','false');data=query_inventory(button='重置');rendered_values(data)
    expect(page.locator('#inventory-arco-select .inv-tag-copy')).to_have_count(0);expect(page.locator('#iw-results')).to_have_js_property('scrollTop',0);expect(page.locator('#iw-results')).to_have_js_property('scrollLeft',0)
   step(item,'高级条件真实开合→原重置立即查询全部并清商品/脏提示/折叠/滚动',advanced_reset)
   partial(item,'仅候选原生构建及未改QA合成读取；未本轮配对冻结Demo、生产/PG/其他角色；全量DTO精确验证不等于所有离屏单元格视觉验收。')
   partial(item,'分类/季节/供应商无匹配与上下键预览已有独立范围证据，本脚本不重复；库存流水、查看商品、显示设置、导出/打印、故障重试不属于本次I01原有界步骤，均不冒通过。')
   if not any(v.get('busy')=='true' for v in result.get('inventoryStateTransitions',[])):partial(item,'未改fixture响应过快，未观测到忙态；已证明最终非busy，不制造延迟冒真实loading覆盖。')
  run('RECHECK-A02',a02);run('RECHECK-I01',i01)
  assert result['cases'],'NO_REQUESTED_CASE_EXECUTED'
  healthy();result['status']='FAIL' if any(x['status']=='FAIL' for x in result['cases']) else 'PARTIAL' if any(x['status']=='PARTIAL' for x in result['cases']) else 'PASS_LISTED_CASE_STEPS';persist()
  if a.keep_open:keep_visible(page)
  browser.close();browser=None
except SystemExit:raise
except Exception as e:result.update(status='FAIL',reason=str(e),traceback=traceback.format_exc())
finally:
 if browser:browser.close()
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 persist()
sys.exit(0 if result['status'] in ['PARTIAL','PASS_LISTED_CASE_STEPS'] else 1)
