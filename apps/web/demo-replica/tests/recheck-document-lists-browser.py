"""Bounded original T01/S01 candidate-side regression. Native dot execution recorded in DOT-DOCUMENT-LIST-RECHECK-20261029.md.
Native production manifest bytes + unchanged foundation-readonly-fixture.mjs.
No success-response substitution, business writes, external network, or animation disabling.
"""
import argparse, hashlib, json, mimetypes, re, select, subprocess, sys, traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit, unquote

REPO=Path(__file__).resolve().parents[4]
BRIDGE=REPO/'apps/web/demo-replica/tests/foundation-readonly-fixture.mjs'
sys.path.insert(0,str(BRIDGE.parent))
from visible_wait import keep_visible
p=argparse.ArgumentParser()
p.add_argument('build');p.add_argument('out');p.add_argument('--expected-checkpoint',required=True)
p.add_argument('--case',action='append',choices=['RECHECK-T01','RECHECK-S01'])
p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium')
p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true')
p.add_argument('--width',type=int,default=1440);p.add_argument('--height',type=int,default=1000)
a=p.parse_args()
if not a.headed:p.error('This prepared regression requires --headed; root owns browser execution.')
build=Path(a.build).resolve();out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=False)
result={'status':'BLOCKED_ENV','syntheticOnly':True,'wholePass':False,'cases':[],'screens':[],'requests':[],'readResponses':[],'forbiddenCommands':[],'externalRequests':[],'preparedScope':'T01/S01 exact original candidate-side reads only'}
bridge=None;browser=None;errors=[];page=None
DATE_ERROR='开始日期不能晚于结束日期。'
LABELS={'DRAFT':'未审核','APPROVED':'已审核','VOID':'已作废'}
MOD={'transfers':{'case':'RECHECK-T01','route':'transfer','heading':'调拨单列表','detail':'查看调拨单','number':'调拨单号','scroll':'.tc-list-scroll','size':'每页调拨单数量','empty':'没有符合条件的调拨单'},'sales':{'case':'RECHECK-S01','route':'sales','heading':'销货单列表','detail':'查看销货单','number':'销货单号','scroll':'#sale-list-scroll','size':'每页销货单数量','empty':'没有符合条件的销货单'}}

def persist():
 result['errors']=errors
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def bridge_read(path,body=None,method='POST',headers=None,source='browser'):
 request={'url':'https://synthetic-management.invalid'+path,'method':method,'headers':headers or {},'body':None if body is None else json.dumps(body)}
 bridge.stdin.write(json.dumps(request)+'\n');bridge.stdin.flush()
 if not select.select([bridge.stdout],[],[],45)[0]:raise TimeoutError('Unchanged readonly bridge did not answer within 45 seconds: '+path)
 line=bridge.stdout.readline()
 if not line:raise RuntimeError('Unchanged readonly bridge ended: '+path)
 response=json.loads(line);payload=json.loads(response['body'])
 result['readResponses'].append({'source':source,'path':path,'method':method,'request':body or {},'headers':headers or {},'status':response['status'],'body':payload})
 return response

def all_filter(module):
 f={'startDate':None,'endDate':None,'statuses':[],'number':None}
 f.update({'businessTypes':[],'hallIds':[],'salespersonIds':[],'customerIds':[],'warehouseIds':[]} if module=='sales' else {'fromWarehouseIds':[],'toWarehouseIds':[]})
 return f

def matches(row,f):
 for key,col in [('statuses','status'),('businessTypes','businessType'),('hallIds','hallId'),('salespersonIds','salespersonId'),('customerIds','customerId'),('warehouseIds','warehouseId'),('fromWarehouseIds','fromWarehouseId'),('toWarehouseIds','toWarehouseId')]:
  if f.get(key) and row[col] not in f[key]:return False
 return not (f.get('number') and f['number'].lower() not in row['number'].lower() or f.get('startDate') and (not row['businessDate'] or row['businessDate']<f['startDate']) or f.get('endDate') and (not row['businessDate'] or row['businessDate']>f['endDate']))
def money(value):
 if value is None:return '—'
 v=int(value);return ('-' if v<0 else '')+str(abs(v)//100)+'.'+str(abs(v)%100).zfill(2)
def clock(row):
 if row['updatedAt']:
  return datetime.fromisoformat(row['updatedAt'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
 return row.get('updatedLocalAt') or '—'
def color(value):
 value=value.strip().lower()
 if re.fullmatch(r'#[0-9a-f]{3}',value):value='#'+''.join(c*2 for c in value[1:])
 if re.fullmatch(r'#[0-9a-f]{6}',value):return 'rgb('+', '.join(str(int(value[i:i+2],16)) for i in [1,3,5])+')'
 return re.sub(r'\s+',' ',value)

try:
 manifest=json.loads((build/'production-build.json').read_text());cfg=manifest['configuration'];origin=cfg['http']['origin'];base=cfg['assets']['basePath']
 assert origin=='https://synthetic-management.invalid','Synthetic origin required'
 assert manifest['sourceCheckpoint']==a.expected_checkpoint,'Native build checkpoint mismatch'
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()
 assert head==a.expected_checkpoint,'Fixture/current source HEAD differs from native build checkpoint'
 for item in manifest['outputs']:
  file=build/item['path'];assert file.is_file() and sha(file)==item['sha256'],'Build output hash mismatch: '+item['path']
 for item in manifest['inputs']:
  file=REPO/item['path'];assert file.is_file() and sha(file)==item['sha256'],'Build source hash mismatch: '+item['path']
 assert cfg['routes']['sales'] and cfg['routes']['transfers']
 result.update(sourceCheckpoint=manifest['sourceCheckpoint'],buildManifestSha256=sha(build/'production-build.json'),builtAt=manifest['builtAt'],configuration=cfg,viewport={'width':a.width,'height':a.height},sourceBinding='All manifest inputs/outputs verified against native build; unchanged current-source fixture')
 sources=[BRIDGE,REPO/'apps/web/demo-replica/frontend/runtime-preview-transport.ts',REPO/'apps/web/demo-replica/frontend/runtime/documents/synthetic-preview-transport.ts',REPO/'apps/web/demo-replica/frontend/qa-reference-fixtures.mts']
 result['fixtureSourceHashes']=[{'path':str(s.relative_to(REPO)),'sha256':sha(s)} for s in sources]
 allowed={x['path'] for x in manifest['outputs']}|{'index.html'}
 bridge=subprocess.Popen([a.node,'--experimental-transform-types',str(BRIDGE)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
 # Discover actual unchanged finite specimens before UI; no ID aliases, overrides, or added rows.
 auth=bridge_read('/api/auth/session',method='GET',source='preflight');assert auth['status']==200
 baseline={};result['sampleInventory']={}
 for module in MOD:
  r=bridge_read('/api/'+module+'/query',{'filter':all_filter(module),'page':1,'pageSize':200},headers={'x-naijue-document-summary':'category-v2'},source='preflight')
  assert r['status']==200,(module,r)
  data=json.loads(r['body']);rows=data['items'];assert len(rows)==int(data['exactTotal'])<=200,'Finite inventory exceeds one bounded 200-row discovery page; do not invent pages'
  assert len({(r['dataset'],r['batchId'],r['documentId'],r['effectiveVersion']) for r in rows})==len(rows)
  baseline[module]=data
  result['sampleInventory'][module]={'exactTotal':data['exactTotal'],'statusCounts':{s:sum(r['status']==s for r in rows) for s in LABELS},'businessCounts':{s:sum(r.get('businessType')==s for r in rows) for s in ['SALE','RETURN','EXCHANGE']} if module=='sales' else None,'categoryHasMore':sum(bool(r.get('categorySummary',{}).get('hasMore')) for r in rows),'specimens':[{'number':r['number'],'documentId':r['documentId'],'dataset':r['dataset'],'status':r['status'],'businessType':r.get('businessType')} for r in rows]}
 persist()
 from playwright.sync_api import sync_playwright, expect
 with sync_playwright() as pw:
  try:browser=pw.chromium.launch(executable_path=a.chromium,headless=False,chromium_sandbox=True)
  except Exception as e:result.update(reason=str(e));persist();raise SystemExit(2)
  context=browser.new_context(viewport={'width':a.width,'height':a.height},device_scale_factor=1)
  context.set_default_timeout(15000)
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  def respond(route):
   request=route.request;u=urlsplit(request.url)
   result['requests'].append({'method':request.method,'url':request.url,'body':request.post_data,'headers':request.headers})
   if f'{u.scheme}://{u.netloc}'!=origin:
    result['externalRequests'].append(request.url);route.abort();return
   if u.path.startswith('/api/'):
    if not (request.method=='GET' and u.path=='/api/auth/session' or request.method=='POST' and u.path.endswith('/query')):
     result['forbiddenCommands'].append({'method':request.method,'path':u.path});route.abort();return
    r=bridge_read(u.path,json.loads(request.post_data or '{}') if request.method=='POST' else None,request.method,request.headers)
    route.fulfill(status=r['status'],headers=r['headers'],body=r['body']);return
   relative='index.html' if u.path=='/' else unquote(u.path[len(base):]) if u.path.startswith(base) else ''
   if relative not in allowed:route.fulfill(status=404,body='Not in fixed native build manifest');return
   file=build/relative;mime='application/javascript' if relative.endswith('.js') else mimetypes.guess_type(file)[0] or 'application/octet-stream'
   route.fulfill(status=200,content_type=mime,body=file.read_bytes())
  context.route('**/*',respond)
  def current(path):return next(r for r in reversed(result['readResponses']) if r['source']=='browser' and r['path']==path)
  def alerts():return [x.inner_text().strip() for x in page.get_by_role('alert').all() if x.is_visible() and x.inner_text().strip()]
  def healthy(expected_alert=None):
   assert not errors,errors
   assert not result['forbiddenCommands'],result['forbiddenCommands']
   assert not result['externalRequests'],result['externalRequests']
   assert alerts()==([expected_alert] if expected_alert else []),alerts()
  def shot(case,name):
   file=case+'-'+str(name)+'.png';page.screenshot(path=str(out/file),full_page=True)
   (out/(file[:-4]+'.txt')).write_text(page.locator('#page').inner_text())
   result['screens'].append({'path':file,'url':page.url,'viewport':page.viewport_size,'sourceCheckpoint':manifest['sourceCheckpoint']})
  def partial(item,reason):
   if reason not in item['missingSteps']:item['missingSteps'].append(reason)
   persist()
  def step(item,name,fn,expected_alert=None):
   rec={'name':name,'status':'RUNNING','requestStart':len(result['requests'])};item['steps'].append(rec);persist()
   try:
    fn();healthy(expected_alert);rec.update(status='PASS',requestEnd=len(result['requests']));shot(item['caseId'],len(item['steps']))
   except Exception as e:
    rec.update(status='FAIL',reason=str(e));persist();raise
   persist()
  def host(label):return page.locator('form label').filter(has=page.locator('[aria-label="'+label+'，多选"]'))
  def node(h,label):return h.locator('.arco-tree-node').filter(has=page.locator('.arco-tree-node-title').filter(has_text=re.compile('^'+re.escape(label)+'$')))
  def open_multi(label,path=None):
   h=host(label);expect(h).to_have_count(1)
   if path:
    with page.expect_response(lambda r:urlsplit(r.url).path==path):h.locator('.arco-tree-select-view').click(position={'x':6,'y':16})
    response=current(path);assert response['status']==200,response
   else:h.locator('.arco-tree-select-view').click(position={'x':6,'y':16})
   expect(h.locator('.arco-tree-select-popup')).to_be_visible()
   return h
  def choose_multi(label,labels,all_label=None,path=None):
   h=open_multi(label,path);all_label=all_label or '全部'+label
   allnode=node(h,all_label);allbox=allnode.get_by_role('checkbox');expect(allnode.locator('.arco-tree-node-title')).to_be_visible()
   if not allbox.is_checked():allnode.locator('.arco-tree-node-title').click();expect(allbox).to_be_checked()
   if labels:
    allnode.locator('.arco-tree-node-title').click();expect(allbox).not_to_be_checked()
    for text in labels:
     choice=node(h,text);cb=choice.get_by_role('checkbox');expect(choice.locator('.arco-tree-node-title')).to_be_visible()
     if not cb.is_checked():choice.locator('.arco-tree-node-title').click()
     expect(cb).to_be_checked()
   page.get_by_role('heading',level=1).click()
   expect(h.locator('.arco-tree-select-popup')).not_to_be_visible()
  def advanced(module,opened=True):
   number=page.get_by_label(MOD[module]['number'],exact=True)
   if opened and not number.count():page.locator('button.tc-filter-toggle').click()
   elif not opened and number.count():page.locator('button.tc-filter-toggle').click()
   expect(number).to_be_visible() if opened else expect(number).to_have_count(0)
  def snapshot(module):
   labels=['状态','业务类型','营业厅','营业员','客户','仓库'] if module=='sales' else ['状态','调出仓库','调入仓库']
   return {'dates':[page.get_by_placeholder(x,exact=True).input_value() for x in ['开始日期','结束日期']],'number':page.get_by_label(MOD[module]['number'],exact=True).input_value() if page.get_by_label(MOD[module]['number'],exact=True).count() else None,'more':page.locator('button.tc-filter-toggle').get_attribute('aria-expanded')=='true','tags':{x:host(x).locator('.arco-tree-select-view').inner_text() for x in labels if host(x).count()},'scroll':page.locator(MOD[module]['scroll']).evaluate('(e)=>({left:e.scrollLeft,top:e.scrollTop})')}
  def category_expect(td,summary):
   if not summary:expect(td).to_have_text('分类统计未提供');return
   if summary['basis']=='UNKNOWN':expect(td).to_have_text('历史未记录分类');return
   labels=[(x['categoryName'] or '待确认分类')+' '+x['value'] for x in summary['items']]
   if summary['hasMore']:labels.append('更多分类' if summary.get('categoryCount') is None else '+'+str(int(summary['categoryCount'])-len(summary['items']))+' 更多')
   expect(td.locator('.tc-product-tag')).to_have_text(labels)
  def status_expect(tag,status):
   semantic={'DRAFT':'pending','APPROVED':'effective','VOID':'void'}[status]
   expect(tag).to_have_attribute('data-document-status',semantic);expect(tag).to_have_text(LABELS[status])
   tokens={'DRAFT':('--ca-warning','--ca-warning-soft'),'APPROVED':('--ca-success','--ca-success-soft'),'VOID':('--ca-neutral-tag-ink','--ca-neutral-tag-bg')}[status]
   actual=tag.evaluate('(el,t)=>{const s=getComputedStyle(el);return {color:s.color,background:s.backgroundColor,ink:s.getPropertyValue(t[0]),bg:s.getPropertyValue(t[1])}}',tokens)
   assert color(actual['color'])==color(actual['ink']) and color(actual['background'])==color(actual['bg']),actual
  def list_ok(module,response=None):
   response=response or current('/api/'+module+'/query');assert response['status']==200,response
   data=response['body'];query=response['request'];f=query['filter'];all_rows=[r for r in baseline[module]['items'] if matches(r,f)]
   expected=all_rows[(query['page']-1)*query['pageSize']:query['page']*query['pageSize']]
   assert data['exactTotal']==str(len(all_rows)) and data['page']==query['page'] and data['pageSize']==query['pageSize']
   assert data['items']==expected,{'actual':data['items'],'expected':expected,'query':query}
   expect(page.get_by_role('heading',name=MOD[module]['heading'],exact=True)).to_be_visible()
   expect(page.get_by_role('button',name='查询',exact=True)).to_be_enabled()
   expect(page.locator('.ui-query-note[data-pending]')).to_have_attribute('data-pending','false')
   rows=page.locator(MOD[module]['scroll']+' tbody tr');expect(rows).to_have_count(len(expected))
   for i,row in enumerate(expected):
    dom=rows.nth(i);cells=dom.locator('td');expect(cells.nth(0)).to_have_text(row['businessDate'] or '—');expect(cells.nth(1).get_by_role('button',name=row['number'],exact=True)).to_be_visible();status_expect(cells.nth(2).locator('[data-document-status]'),row['status'])
    if module=='sales':
     values={3:'销售' if row['businessType']=='SALE' else '退货/换货',4:row['hallName'] or '—',5:row['salespersonName'] or '',7:(row['quantity'] or '—') if row['businessType']=='SALE' else '退'+(row['incomingQuantity'] or '—')+' · 换'+(row['outgoingQuantity'] or '—'),8:money(row['netDue']),9:clock(row)};cat=6
    else:
     values={3:row['fromWarehouseName'] or '—',4:row['toWarehouseName'] or '—',6:'—' if row['totalQuantity'] is None else format(int(row['totalQuantity']),','),7:row['responsibleName'] or '—',8:clock(row)};cat=5
    for n,value in values.items():expect(cells.nth(n)).to_have_text(value)
    category_expect(cells.nth(cat),row.get('categorySummary'));expect(cells.last).to_have_class(re.compile('ui-action-cell'));expect(cells.last.get_by_role('button',name='查看',exact=True)).to_be_visible()
   if not expected:expect(page.get_by_text(MOD[module]['empty'],exact=True)).to_be_visible()
   total_fields=['quantity','incomingQuantity','outgoingQuantity','grossAmount','orderDiscount','netDue'] if module=='sales' else ['totalQuantity']
   assert data['totals']=={k:str(sum(int(r[k]) for r in all_rows)) for k in total_fields},data['totals']
   if module=='sales':expect(page.get_by_label('销货单筛选合计',exact=True)).to_have_text('筛选合计：数量 '+data['totals']['quantity']+' · 退回 '+data['totals']['incomingQuantity']+' · 换出 '+data['totals']['outgoingQuantity']+' · 应结 ¥'+money(data['totals']['netDue']))
   else:expect(page.get_by_text('筛选数量合计 '+data['totals']['totalQuantity'],exact=True)).to_be_visible()
   foot=page.locator('.tc-list-pagination');expect(foot).to_contain_text('共 '+data['exactTotal']+' 张')
   if int(data['exactTotal'])>0:expect(foot).to_contain_text('当前第 '+str((data['page']-1)*data['pageSize']+1)+'–'+str(min(data['page']*data['pageSize'],int(data['exactTotal']))))
   return response
  def action_query(module,action):
   with page.expect_response(lambda r:urlsplit(r.url).path=='/api/'+module+'/query'):action()
   return list_ok(module)
  def query(module):return action_query(module,lambda:page.get_by_role('button',name='查询',exact=True).click())
  def reset(module):return action_query(module,lambda:page.get_by_role('button',name='重置',exact=True).click())
  def visit(module):
   with page.expect_response(lambda r:urlsplit(r.url).path=='/api/'+module+'/query'):page.goto(origin+'/#'+MOD[module]['route'])
   page.bring_to_front();list_ok(module);page.evaluate('(s)=>document.title="合成只读 T01/S01 · "+s',manifest['sourceCheckpoint'])
  def date_pick(label,date):
   inp=page.get_by_placeholder(label,exact=True);h=page.locator('form label').filter(has=inp);inp.click();panel=h.locator('.arco-panel-date');expect(panel).to_be_visible()
   # Real calendar navigation; stop rather than assuming a different displayed month.
   for _ in range(37):
    labels=panel.locator('.arco-picker-header-label').all_text_contents();assert len(labels)==2,labels
    nums=[int(re.search(r'\d+',x).group()) for x in labels];year=next(x for x in nums if x>31);month=next(x for x in nums if x<=12)
    delta=(2026-year)*12+10-month
    if delta==0:break
    previous=panel.locator('.arco-picker-header-value').inner_text();panel.locator('.arco-picker-header-icon').nth(1 if delta<0 else 2).click();expect(panel.locator('.arco-picker-header-value')).not_to_have_text(previous)
   else:raise AssertionError('Calendar more than 36 months from October 2026; no guessed selection')
   panel.locator('.arco-picker-cell-in-view .arco-picker-date-value').filter(has_text=re.compile('^'+str(int(date[-2:]))+'$')).click();expect(inp).to_have_value(date);expect(panel).not_to_be_visible()
  def sticky(item,module,detail=False):
   original=page.viewport_size;page.set_viewport_size({'width':960,'height':a.height})
   selector=('#sale-lines' if module=='sales' else '#tc-lines') if detail else MOD[module]['scroll']
   sc=page.locator(selector);expect(sc).to_be_visible();expect(sc.locator('tbody .ui-action-cell').first).to_be_visible()
   for edge in [0,1]:
    sc.evaluate('(e,end)=>e.scrollLeft=end?e.scrollWidth-e.clientWidth:0',edge)
    # requestAnimationFrame is an explicit browser layout boundary, not an arbitrary delay.
    page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    facts=sc.evaluate('''e=>{let r=e.getBoundingClientRect(),edge=r.left+e.clientLeft+e.clientWidth;return {width:e.clientWidth,scrollWidth:e.scrollWidth,scrollLeft:e.scrollLeft,overflow:getComputedStyle(e).overflowX,cells:Array.from(e.querySelectorAll("th.ui-action-cell,tbody tr:first-child td.ui-action-cell")).map(c=>{const s=getComputedStyle(c),r=c.getBoundingClientRect(),t=c.closest("table").getBoundingClientRect();return {position:s.position,right:s.right,left:r.left,actualRight:r.right,expectedRight:Math.min(edge,t.right),last:c===c.parentElement.lastElementChild,button:c.tagName==="TH"||Array.from(c.querySelectorAll("button")).some(b=>b.textContent.trim()==="查看")}})}}''')
    assert facts['cells'],facts
    for c in facts['cells']:assert c['position']=='sticky' and c['right']=='0px' and c['last'] and c['button'] and abs(c['actualRight']-c['expectedRight'])<=3,(selector,facts)
    result.setdefault('rightFixedGeometry',[]).append({'case':item['caseId'],'detail':detail,'edge':edge,'viewport':page.viewport_size,'facts':facts});shot(item['caseId'],('detail' if detail else 'list')+'-rightfixed-'+str(len(result['rightFixedGeometry'])))
   if facts['scrollWidth']<=facts['width']:partial(item,('详情' if detail else '列表')+'960px视口无横向溢出；已验证sticky/right/末列，不能证明横滚固定路径')
   sc.evaluate('e=>e.scrollLeft=0');page.set_viewport_size(original)
  def detail_return(item,module,row=None):
   before=current('/api/'+module+'/query');rows=before['body']['items'];row=row or next((r for r in rows if r['dataset']=='LIVE'),None)
   if row is None:partial(item,'当前筛选没有LIVE详情样本；不拿未知历史详情替代');return
   saved=snapshot(module);count=len(context.pages)
   dom=page.locator(MOD[module]['scroll']+' tbody tr').filter(has=page.get_by_role('button',name=row['number'],exact=True));path='/api/'+module+'/detail/query'
   with page.expect_response(lambda r:urlsplit(r.url).path==path):dom.locator('td').last.get_by_role('button',name='查看',exact=True).click()
   response=current(path);assert response['status']==200,response;header=response['body']['document']['header']
   assert header['id']==row['documentId'] and header['number']==row['number'] and header['status']==row['status'] and header['version']==row['effectiveVersion']
   expect(page.get_by_role('heading',name=MOD[module]['detail'],exact=True)).to_be_visible();expect(page.get_by_role('button',name='返回列表',exact=True)).to_be_enabled();assert len(context.pages)==count,'Unexpected new tab'
   expect(page.locator('.tc-doc-number-value') if module=='transfers' else page.locator('.sale-doc-fields').get_by_text(row['number'],exact=True)).to_have_text(row['number'])
   status_expect(page.locator('.tc-head [data-document-status]'),row['status']);sticky(item,module,True)
   page.get_by_role('button',name='返回列表',exact=True).click();list_ok(module,before);assert snapshot(module)==saved,(snapshot(module),saved)
   after=current('/api/'+module+'/query');assert after['request']==before['request'] and after['body']==before['body'],'Return changed applied filters/page/results'
   if before['body']['page']>1:expect(page.get_by_role('button',name='第'+str(before['body']['page'])+'页',exact=True)).to_have_attribute('aria-current','page')
  def category_more(item,module):
   rows=current('/api/'+module+'/query')['body']['items'];row=next((r for r in rows if r.get('categorySummary',{}).get('hasMore')),None)
   if row is None:partial(item,'原分类+N/其余分类浮层：当前未变fixture无hasMore样本；只核实际分类汇总/历史未知，不造第四分类');return
   dom=page.locator(MOD[module]['scroll']+' tbody tr').filter(has=page.get_by_role('button',name=row['number'],exact=True));btn=dom.locator('.tc-more-tag')
   if not btn.count():partial(item,'销货列表真实+N为静态摘要，无可点more入口；不以span冒充浮层成功');return
   with page.expect_response(lambda r:urlsplit(r.url).path=='/api/transfers/detail/query'):btn.click()
   response=current('/api/transfers/detail/query');assert response['status']==200,response;summary=response['body']['categorySummary'];dialog=page.get_by_role('dialog',name='其余商品信息',exact=True)
   expect(dialog).to_be_visible();first_ids={r['categoryId'] for r in row['categorySummary']['items']};rest=[r for r in summary['items'] if r['categoryId'] not in first_ids]
   expect(dialog.locator('span')).to_have_text([(r['categoryName'] or '待确认分类')+' '+r['value'] for r in rest]);assert summary['categoryCount']==row['categorySummary']['categoryCount']
   page.keyboard.press('Escape');expect(dialog).to_have_count(0);expect(btn).to_be_focused();btn.click();expect(dialog).to_be_visible();page.get_by_role('heading',level=1).click();expect(dialog).to_have_count(0)
  def run(module):
   case=MOD[module]['case']
   if a.case and case not in a.case:return
   item={'caseId':case,'status':'RUNNING','wholePass':False,'sourceCheckpoint':manifest['sourceCheckpoint'],'originalSource':'ORIGINAL-T01-S01.json','steps':[],'missingSteps':[]};result['cases'].append(item);persist()
   try:
    step(item,'原生build/session/默认列表/实际字段与分类/汇总',lambda:visit(module))
    step(item,'列表操作末列在960px左右横滚均固定右侧',lambda:sticky(item,module))
    def page2():
     if int(current('/api/'+module+'/query')['body']['exactTotal'])<=20:partial(item,'默认条件真实数据不足21张；第2页及第2页详情返回不可执行');return
     response=action_query(module,lambda:page.get_by_role('button',name='第2页',exact=True).click());assert response['request']['page']==response['body']['page']==2
     expect(page.get_by_role('button',name='第2页',exact=True)).to_have_attribute('aria-current','page');detail_return(item,module)
    step(item,'全部条件真实第2页→查看→返回保留第2页/筛选/行',page2)
    def size50():
     if current('/api/'+module+'/query')['body']['page']!=2:partial(item,'未到第2页；原第2页改每页50回第1页不可执行');return
     select_root=page.locator('.tc-list-pagination .ui-single-host');select_root.locator('.arco-select-view').click();expect(select_root.locator('.arco-select-popup')).to_be_visible()
     response=action_query(module,lambda:select_root.locator('.arco-select-option').filter(has_text=re.compile('^50张/页$')).click());assert response['request']['page']==1 and response['request']['pageSize']==50
    if module=='sales':step(item,'原第2页每页20改50→第1页',size50)
    def restore20():
     # Reset preserves native page size. Use native page-size control, not response rewriting.
     if current('/api/'+module+'/query')['body']['pageSize']!=20:
      select_root=page.locator('.tc-list-pagination .ui-single-host');select_root.locator('.arco-select-view').click();action_query(module,lambda:select_root.locator('.arco-select-option').filter(has_text=re.compile('^20张/页$')).click())
     reset(module)
    step(item,'恢复原每页20与全部条件',restore20)
    def alltags():
     advanced(module)
     labels=['状态','业务类型','营业厅','营业员','客户','仓库'] if module=='sales' else ['状态','调出仓库','调入仓库']
     facts={}
     for label in labels:
      tags=host(label).locator('.arco-input-tag-tag').evaluate_all('(els)=>els.map(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,background:getComputedStyle(e).backgroundColor})).filter(x=>x.width>0&&x.height>0)')
      assert tags and all(x['text'] for x in tags),(label,tags)
      facts[label]=tags
     result.setdefault('allTagGeometry',[]).append({'case':item['caseId'],'tags':facts});advanced(module,False)
    step(item,'全部条件展开高级筛选：实际可见标签无空白壳，记录几何/底色',alltags)
    step(item,'实际分类+N展开/关闭，缺样本明确保留',lambda:category_more(item,module))
    for status in ['APPROVED','VOID','DRAFT']:
     def by_status(status=status):
      reset(module);choose_multi('状态',[LABELS[status]]);response=query(module);assert response['request']['filter']['statuses']==[status];assert all(r['status']==status for r in response['body']['items'])
      if not response['body']['items']:partial(item,LABELS[status]+'真实fixture无行，正向状态/详情路径未覆盖')
      if status=='VOID':detail_return(item,module)
     step(item,LABELS[status]+'单独选择→查询→严格状态/色/数据（作废详情返回）',by_status)
    def combined():
     reset(module);choose_multi('状态',['已审核','已作废']);response=query(module);assert set(response['request']['filter']['statuses'])=={'APPROVED','VOID'} and all(r['status'] in ['APPROVED','VOID'] for r in response['body']['items'])
    step(item,'已审核+已作废组合→查询，无未审核混入',combined)
    def noresult():
     reset(module);choose_multi('状态',['已作废']);advanced(module);number=page.get_by_label(MOD[module]['number'],exact=True);number.fill('ZZZ987-NO-DOCUMENT');response=query(module);assert response['request']['filter']['number']=='ZZZ987-NO-DOCUMENT' and response['body']['exactTotal']=='0'
     if module=='sales':
      nav=page.get_by_role('navigation',name='销货单列表分页',exact=True);expect(nav).to_be_visible();expect(nav.get_by_role('button',name='第1页',exact=True)).to_have_attribute('aria-current','page');expect(nav.get_by_role('button',name='上一页',exact=True)).to_be_disabled();expect(nav.get_by_role('button',name='下一页',exact=True)).to_be_disabled();expect(nav).to_contain_text('第 1 / 1 页')
     advanced(module,False);advanced(module);expect(number).to_have_value('ZZZ987-NO-DOCUMENT');list_ok(module,response)
    step(item,'已作废+不存在单号→空结果→收起展开保留；销货零页禁翻',noresult)
    def reverse():
     reset(module);old=current('/api/'+module+'/query');item['_beforeReverse']=old;date_pick('开始日期','2026-10-20');date_pick('结束日期','2026-10-15' if module=='transfers' else '2026-10-10');before=len([r for r in result['readResponses'] if r['source']=='browser' and r['path']=='/api/'+module+'/query']);page.get_by_role('button',name='查询',exact=True).click();expect(page.get_by_role('alert').filter(has_text=DATE_ERROR)).to_have_text(DATE_ERROR);assert len([r for r in result['readResponses'] if r['source']=='browser' and r['path']=='/api/'+module+'/query'])==before
     assert current('/api/'+module+'/query')==old;expect(page.locator(MOD[module]['scroll']+' tbody tr')).to_have_count(len(old['body']['items']));assert [page.locator(MOD[module]['scroll']+' tbody tr').nth(i).locator('td').nth(1).inner_text() for i in range(len(old['body']['items']))]==[r['number'] for r in old['body']['items']]
     assert snapshot(module)['dates']==['2026-10-20','2026-10-15' if module=='transfers' else '2026-10-10']
    step(item,'原日历倒序→具体日期错误，仅此步允许该非空alert；原列表保留',reverse,DATE_ERROR)
    def corrected():
     date_pick('结束日期','2026-10-20');expect(page.get_by_role('alert').filter(has_text=DATE_ERROR)).to_have_text(DATE_ERROR);response=query(module);assert response['request']['filter']['startDate']==response['request']['filter']['endDate']=='2026-10-20';expect(page.get_by_role('alert').filter(has_text=DATE_ERROR)).to_have_count(0);assert snapshot(module)['dates']==['2026-10-20','2026-10-20'];item.pop('_beforeReverse',None)
    step(item,'倒序后日历改正10月20日→重新查询→错误消失/实际当天数据',corrected)
    def number_return():
     reset(module);status='DRAFT' if module=='transfers' else 'APPROVED';known='QA-DB-0022' if module=='transfers' else 'QA-XS-0005';target=next((r for r in baseline[module]['items'] if r['number']==known and r['dataset']=='LIVE' and r['status']==status),None)
     if target is None:partial(item,'原已知单据 '+known+' 不存在或状态不符；不替造原单据详情返回通过');return
     choose_multi('状态',[LABELS[status]]);advanced(module);fragment='0022' if module=='transfers' else known;page.get_by_label(MOD[module]['number'],exact=True).fill(fragment);response=query(module);assert response['request']['filter']['number']==fragment and response['request']['filter']['statuses']==[status];assert [r['documentId'] for r in response['body']['items']]==[target['documentId']];detail_return(item,module,target)
    step(item,'原未审核0022/已审核销货单号→单条→查看返回筛选/单行保持',number_return)
    if module=='transfers':
     def warehouse():
      reset(module);choose_multi('状态',['未审核']);query(module);h=open_multi('调出仓库','/api/transfers/warehouses/query');r=current('/api/transfers/warehouses/query');rows=r['body']['items']
      if not rows:partial(item,'原调出仓候选真实为空，单仓筛选不可正向验证');page.get_by_role('heading',level=1).click();return
      assert all(node(h,row['name']).count()==1 for row in rows);page.get_by_role('heading',level=1).click();target=next((x for x in rows if any(r['status']=='DRAFT' and r['fromWarehouseId']==x['id'] for r in baseline[module]['items'])),None)
      if not target:partial(item,'没有未审核单据使用实际候选仓库，单仓正向路径不可执行');return
      choose_multi('调出仓库',[target['name']],all_label='全部仓库',path='/api/transfers/warehouses/query');response=query(module);assert response['request']['filter']['fromWarehouseIds']==[target['id']];assert response['body']['items'] and all(r['fromWarehouseId']==target['id'] and r['status']=='DRAFT' for r in response['body']['items'])
     step(item,'原未审核调出仓实际候选→单仓选择查询',warehouse)
    else:
     def staff_empty():
      reset(module);h=open_multi('营业员','/api/sales/references/query');search=h.locator('.arco-tree-select-view input');expect(search).to_have_count(1)
      with page.expect_response(lambda r:urlsplit(r.url).path=='/api/sales/references/query' and json.loads(r.request.post_data or '{}').get('search')=='ZZZ987'):search.fill('ZZZ987')
      response=current('/api/sales/references/query');assert response['request']['kind']=='salesperson' and response['request']['search']=='ZZZ987' and response['status']==200 and response['body']['exactTotal']=='0';expect(h.get_by_text('没有匹配结果',exact=True)).to_be_visible();expect(h.locator('.arco-tree-node-title')).to_have_text(['全部营业员']);page.get_by_role('heading',level=1).click()
     step(item,'原营业员ZZZ987实际搜索→明确无匹配提示，不以全部项冒结果',staff_empty)
     def returns():
      reset(module);choose_multi('业务类型',['退货/换货']);response=query(module);assert set(response['request']['filter']['businessTypes'])=={'RETURN','EXCHANGE'} and response['body']['items'] and all(r['businessType'] in ['RETURN','EXCHANGE'] for r in response['body']['items']);target=next((r for r in response['body']['items'] if r['number']=='QA-XS-0023' and r['status']=='APPROVED'),None)
      if target:detail_return(item,module,target)
      else:partial(item,'原已审核退换 QA-XS-0023 不在实际结果中，原详情返回未覆盖')
      if int(response['body']['exactTotal'])<=20:partial(item,'退换真实仅'+response['body']['exactTotal']+'张（每页20最小）；原退换第2页无数据，不能造第2页')
      else:action_query(module,lambda:page.get_by_role('button',name='第2页',exact=True).click());detail_return(item,module)
     step(item,'原退货/换货→查询→已审核退换详情返回；分页按真实容量',returns)
     for label,kind,key in [('营业厅','hall','hallIds'),('客户','customer','customerIds')]:
      def reference(label=label,kind=kind,key=key):
       reset(module)
       if label=='客户':advanced(module)
       h=open_multi(label,'/api/sales/references/query');response=current('/api/sales/references/query');assert response['request']['kind']==kind;items=response['body']['items'];page.get_by_role('heading',level=1).click();target=next((x for x in items if any(r[key[:-3]+'Id']==x['id'] for r in baseline[module]['items'])),None)
       if not target:partial(item,label+'实际无被单据引用的候选，正向筛选未覆盖');return
       # A sole candidate is semantically equivalent to All in the native control.
       choose_multi(label,[target['label']],path='/api/sales/references/query');response=query(module);actual=response['request']['filter'][key]
       if len(items)==1 and actual==[]:partial(item,label+'只有一个实际授权候选；native全选归一为空范围，不能证明多厅/多候选区分')
       else:assert actual==[target['id']]
       assert all(r[key[:-3]+'Id']==target['id'] for r in response['body']['items']);detail_return(item,module)
      step(item,label+'实际候选选择→查询→详情返回保留',reference)
    step(item,'重置全部并重读fixture无变，零写命令',lambda:(reset(module),list_ok(module)))
    partial(item,'仅候选单侧未变合成数据；未在本轮配对冻结Demo，也未验证真实角色/PG授权或生产；不声明整页/全系统验收')
    healthy();item['status']='PARTIAL' if item['missingSteps'] else 'PASS_LISTED_STEPS'
   except Exception as e:
    item.update(status='FAIL',reason=str(e),traceback=traceback.format_exc());item.pop('_beforeReverse',None)
    try:shot(case,'failure')
    except Exception:pass
   persist()
  run('transfers');run('sales')
  assert result['cases'],'NO_REQUESTED_CASE_EXECUTED'
  result['status']='FAIL' if any(x['status']=='FAIL' for x in result['cases']) else 'PARTIAL' if any(x['status']=='PARTIAL' for x in result['cases']) else 'PASS_LISTED_CASE_STEPS';persist()
  if a.keep_open:keep_visible(page)
  browser.close();browser=None
except SystemExit:
 raise
except Exception as e:
 result.update(status='FAIL',reason=str(e),traceback=traceback.format_exc())
finally:
 if browser:browser.close()
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 persist()
sys.exit(0 if result['status'] in ['PARTIAL','PASS_LISTED_CASE_STEPS'] else 1)
