import sys
from visible_wait import keep_visible
# Recovery of bounded real-artifact smoke; not original lost test source bytes.
"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys, re
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('--case',action='append');p.add_argument('--width',type=int,default=1440);p.add_argument('--category-overflow',action='store_true');p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
build=Path(args.build).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
manifest=json.loads((build/'production-build.json').read_text());config=manifest['configuration'];origin=config['http']['origin'];base=config['assets']['basePath']
if origin!='https://synthetic-management.invalid':raise SystemExit('Smoke requires the declared synthetic-only build configuration')
allowed={x['path'] for x in manifest['outputs']};allowed.add('index.html')
result={'sourceCheckpoint':manifest['sourceCheckpoint'],'syntheticOnly':True,'status':'BLOCKED_ENV','checks':[],'screens':[],'requests':[]}
bridge=None;browser=None
variant={'nullable':False,'notSet':False,'image':False,'imageFail':False,'stockFail':False};png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOwq/78HwAFUwKs5SlCvgAAAABJRU5ErkJggg=='
try:
 from playwright.sync_api import sync_playwright
 with sync_playwright() as pw:
  try:browser=pw.chromium.launch(executable_path=args.chromium,headless=not args.headed,chromium_sandbox=True)
  except Exception as error:
   result['reason']=str(error);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('BLOCKED_ENV: Chromium could not start with its sandbox enabled');sys.exit(2)
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('foundation-readonly-fixture.mjs'))]+(['--category-overflow'] if args.category_overflow else []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
  context=browser.new_context(viewport={'width':args.width,'height':1000},device_scale_factor=1)
  errors=[];page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
  detail_mode={'next':None,'versionDelta':0}
  def respond(route):
   request=route.request;url=urlsplit(request.url);request_origin=f'{url.scheme}://{url.netloc}'
   result['requests'].append({'method':request.method,'url':request.url,'body':request.post_data,'schemeCapability':request.headers.get('x-naijue-scheme-detail')})
   if request_origin!=origin:route.abort();return
   if url.path.startswith('/api/'):
    if not (request.method=='GET' and url.path=='/api/auth/session' or request.method=='POST' and url.path.endswith('/query')):
     result.setdefault('forbiddenCommands',[]).append(url.path);route.abort();return
    mode=detail_mode['next'] if url.path=='/api/transfers/detail/query' else None
    if mode:detail_mode['next']=None
    if mode=='fail':route.fulfill(status=503,content_type='application/json',body='{"error":{"code":"SYNTHETIC_READ_UNAVAILABLE"}}');return
    bridge.stdin.write(json.dumps({'url':request.url,'method':request.method,'headers':request.headers,'body':request.post_data,'schemeCapability':request.headers.get('x-naijue-scheme-detail')})+'\n');bridge.stdin.flush();response=json.loads(bridge.stdout.readline())
    q=json.loads(request.post_data or '{}') if request.method!='GET' else dict(__import__('urllib.parse',fromlist=['parse_qsl']).parse_qsl(url.query))
    if url.path=='/api/products/basics/query' and response['status']==200 and variant['nullable']:
     value=json.loads(response['body'])
     if value:
      for key in ['categoryLabel','yearLabel','seasonLabel','supplierLabel','systemCode','thickness','collarPantsType']:value[key]=None
      response['body']=json.dumps(value)
    if url.path=='/api/products/prices/query' and response['status']==200:
     value=json.loads(response['body']);value['prices'].update({'purchase_price':None,'retail_price':'0.00','wholesale5_price':'42.30'});response['body']=json.dumps(value)
    if url.path=='/api/products/barcodes/query' and response['status']==200 and variant['notSet']:
     value=json.loads(response['body']);value['defaultScheme']={'state':'NOT_SET'};response['body']=json.dumps(value)
    if url.path=='/api/products/images/query' and variant['image']:
     response={'status':200,'headers':{'content-type':'application/json'},'body':json.dumps({'productId':q['productId'],'images':[{'id':'00000000-0000-4000-8000-000000999101','label':'合成蓝色测试图','thumbnailUrl':png,'role':'MAIN','colorId':None}]})}
    if url.path=='/api/products/image/query' and variant['image']:
     response={'status':500 if variant['imageFail'] else 200,'headers':{'content-type':'application/json'},'body':json.dumps({'error':{'code':'SYNTHETIC_IMAGE_FAILURE'}} if variant['imageFail'] else {'productId':q['productId'],'imageId':q['imageId'],'url':png})}
    if url.path=='/api/products/stock-overview/query' and variant['stockFail']:
     variant['stockFail']=False;response={'status':500,'headers':{'content-type':'application/json'},'body':json.dumps({'error':{'code':'SYNTHETIC_STOCK_FAILURE'}})}
    result.setdefault('readResponses',[]).append({'path':url.path,'request':q,'status':response['status'],'body':json.loads(response['body'])})

    if url.path=='/api/inventory/query' and response['status']==200:result['observedProductId']=json.loads(response['body'])['products'][0]['id']
    # Explicit synthetic business-version transition; no write endpoint is called.
    if detail_mode['versionDelta'] and url.path in ['/api/transfers/query','/api/transfers/detail/query'] and response['status']==200:
     payload=json.loads(response['body'])
     if url.path=='/api/transfers/query':
      for item in payload['items']:
       if item['dataset']=='LIVE':
        item['version']=int(item['version'])+detail_mode['versionDelta'];item['effectiveVersion']=item['version']
     else:payload['document']['header']['version']=int(payload['document']['header']['version'])+detail_mode['versionDelta']
     response['body']=json.dumps(payload)
    if mode=='delay':page.wait_for_timeout(600)
    try:route.fulfill(status=response['status'],headers=response['headers'],body=response['body'])
    except Exception:
     if mode!='delay':raise
    return
   relative='index.html' if url.path=='/' else unquote(url.path[len(base):]) if url.path.startswith(base) else ''
   if relative not in allowed:route.fulfill(status=404,body='Not in fixed build manifest');return
   filename=build/relative;mime=mimetypes.guess_type(filename)[0] or 'application/octet-stream'
   if relative.endswith('.js'):mime='application/javascript'
   route.fulfill(status=200,content_type=mime,body=filename.read_bytes())
  page.add_init_script("""window.__geometryEvents=[];const NativeRO=window.ResizeObserver;window.ResizeObserver=class extends NativeRO{constructor(callback){super((entries,observer)=>{window.__geometryEvents.push(entries.map(e=>({id:e.target.id,rect:e.contentRect.toJSON(),height:e.target.clientHeight,width:e.target.clientWidth})));callback(entries,observer);});}};""")
  context.route('**/*',respond)
  page.bring_to_front();page.goto(origin+'/#inventory');page.locator('#page .iw-query').wait_for();page.wait_for_load_state('networkidle')
  page.evaluate("title=>document.title=title",'测试 '+manifest['sourceCheckpoint']+' · 基础设置草稿合成只读')
  result['checks']=[]
  result['cases']=[]
  def shot(case,name):
   result['screens'].append(case+'-'+name+'.png')
   page.screenshot(path=str(out/(case+'-'+name+'.png')),full_page=True);(out/(case+'-'+name+'.txt')).write_text(page.locator('#page').inner_text())
  def persist():
   result['errors']=errors
   (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  def healthy():
   alerts=[x.inner_text().strip() for x in page.get_by_role('alert').all() if x.is_visible() and x.inner_text().strip()]
   assert not alerts, str(alerts)
   assert not errors, str(errors)
   assert not result.get('forbiddenCommands'), str(result.get('forbiddenCommands'))
  def step(item,name,fn):
   record={'name':name,'status':'RUNNING'};item['steps'].append(record);persist()
   try:
    fn();healthy();record['status']='PASS';shot(item['caseId'],str(len(item['steps'])))
   except Exception as e:
    record.update(status='FAIL',reason=str(e));persist();raise
   persist()
  def partial(item,reason):
   item['missingSteps'].append(reason);persist()
  def run(case,fn):
   if args.case and case not in args.case:return
   item={'caseId':case,'sourceCheckpoint':manifest['sourceCheckpoint'],'status':'RUNNING','wholePass':False,'steps':[],'missingSteps':[]};result['cases'].append(item);persist()
   try:
    fn(item);healthy();assert item['steps'], 'ZERO_STEPS'
    item['status']='PARTIAL' if item['missingSteps'] else 'PASS_LISTED_STEPS'
   except Exception as e:
    import traceback
    item.update(status='FAIL',reason=str(e),traceback=traceback.format_exc())
    try:shot(case,'failure')
    except Exception:pass
   persist()
  def settle():page.wait_for_load_state('networkidle');page.wait_for_timeout(80)
  def query(label,text):
   page.get_by_label(label,exact=True).fill(text);page.get_by_role('button',name='查询',exact=True).click();settle()
  def current(path):return next(x for x in reversed(result['readResponses']) if x['path'].endswith(path))
  def select(label):return page.locator('.runtime-settings-select').filter(has=page.locator('.arco-select[aria-label="'+label+'"]'))
  def visit(route,label):
   page.goto(origin+'/?foundation='+route.split('/')[-1]+'#'+route);page.get_by_label(label,exact=True).wait_for();settle()
  def press_query():page.get_by_role('button',name='查询',exact=True).click();settle()
  def reset():page.get_by_role('button',name='重置',exact=True).click();settle()
  def choose(label,value):
   host=select(label);host.locator('.arco-select-view').click();host.locator('.arco-select-option').filter(has_text=re.compile('^'+re.escape(value)+'$')).click();settle()
  def list_ok(path):
   response=current(path);assert response['status']==200,response
   rows=response['body']['items']
   for row in rows:assert page.get_by_role('cell',name=row['name'],exact=True).is_visible(),row
   if not rows:assert page.get_by_text('暂无符合条件的数据',exact=True).is_visible()
   return response
  def trim_check(label,word,path):
   query(label,' '+word+' ');spaced=list_ok(path);query(label,word);plain=list_ok(path)
   assert spaced['request']['search']==plain['request']['search']==word
   assert spaced['body']==plain['body'];assert plain['body']['total']>0
  def disabled_edit(item,reason):
   edit=page.get_by_role('button',name='编辑',exact=True);assert edit.count()>0
   assert all(x.is_disabled() for x in edit.all());partial(item,reason)
  def categories(item):
   tree=page.locator('#pc-arco-tree'); search=tree.get_by_placeholder('搜索分类',exact=True)
   box=page.locator('#pc-category-form input[data-cat="name"]')
   state={}
   def titles():return tree.locator('.arco-tree-node-title').all_text_contents()
   def node(row):return tree.get_by_role('treeitem').filter(has=page.locator('.arco-tree-node-title').filter(has_text=re.compile('^'+re.escape(row['name'])+'$')))
   def pick(row):node(row).locator('.arco-tree-node-title').click();settle()
   def facts(row):
    assert box.input_value()==row['name']
    path=[];r=row
    while r is not None:
     path.insert(0,r['name']);r=state['byId'].get(r['parentId'])
    values=page.locator('.pc-category-facts .pc-text-block').all_text_contents()
    assert values==['一级分类' if row['parentId'] is None else ' / '.join(path),'未知' if row['productCount'] is None else str(row['productCount'])+' 款',str(row['childCount'])+' 个'],values
   def initial():
    page.goto(origin+'/#product-categories');search.wait_for();settle()
    response=current('/catalogue-settings-read/categories/query');assert response['status']==200,response
    rows=response['body']['items'];assert rows and response['body']['total']==len(rows)
    assert len({r['id'] for r in rows})==len(rows)
    state.update(rows=rows,byId={r['id']:r for r in rows})
    for row in rows:assert row['parentId'] is None or row['parentId'] in state['byId']
    roots=sorted((r for r in rows if r['parentId'] is None),key=lambda r:(r['displayOrder'],r['id']))
    assert titles()==[r['name'] for r in roots],titles()
    facts(roots[0])
    auth=current('/auth/session');assert auth['status']==200 and auth['body']['principal']['role']=='ADMIN'
    state['child']=next((r for r in rows if '短袖' in r['name'] and r['parentId'] is not None),None)
   step(item,'真实会话/分类查询/根节点/初选资料',initial)
   if not state['child']:
    def absent():search.fill('短袖');settle();assert titles()==[]
    step(item,'短袖真实空结果',absent);partial(item,'fixture无短袖子分类，原正向选择待料；不造数据');return
   child=state['child'];parent=state['byId'][child['parentId']]
   def expand():
    assert parent['parentId'] is None,'Fixture target parent is deeper; expand path explicitly before use'
    pick(parent);facts(parent)
    node(parent).get_by_role('button',name='expand button',exact=True).click();settle()
    assert node(parent).get_attribute('aria-expanded')=='true'
    node(child).wait_for(state='visible');facts(parent)
    state['expandedTitles']=titles()
   step(item,'展开真实父节点并保留父资料',expand)
   def short():
    search.fill('短袖');settle()
    expected=set()
    for row in state['rows']:
     path=[];r=row
     while r is not None:path.insert(0,r);r=state['byId'].get(r['parentId'])
     if '短袖' in ' / '.join(r['name'] for r in path):expected.update(r['name'] for r in path)
    assert set(titles())==expected,(titles(),expected)
    assert search.input_value()=='短袖';facts(parent)
   step(item,'搜索短袖保留命中父节点/不改选中资料',short)
   def choose_child():
    pick(child);assert search.input_value()=='';facts(child)
    assert titles()==state['expandedTitles'];assert node(parent).get_attribute('aria-expanded')=='true'
   step(item,'选择短袖自动清空搜索并恢复展开树',choose_child)
   def no_match_clear():
    search.fill('ZZZ987');settle();assert titles()==[];facts(child)
    search.press('Escape');assert search.input_value()=='ZZZ987'
    search.hover();tree.locator('.arco-input-clear-icon').wait_for(state='visible');tree.locator('.arco-input-clear-icon').click();settle()
    assert search.input_value()=='' and titles()==state['expandedTitles'];facts(child)
   step(item,'无匹配/Esc保留搜索/清空保留选择与展开',no_match_clear)
   def cancel_clean():page.locator('#pc-category-form').get_by_role('button',name='取消',exact=True).click();settle();facts(child)
   step(item,'未编辑取消保留子分类资料',cancel_clean)
   enabled=config['routes'].get('maintenance',{}).get('categories') is True
   if not enabled:
    def permissions():
     assert box.is_disabled()
     for label in ['新增一级分类','新增下级分类','保存','删除分类']:assert page.get_by_role('button',name=label,exact=True).is_disabled()
    step(item,'未启用维护时所有写入口禁用',permissions)
    partial(item,'此固定build未开启routes.maintenance.categories；已编辑取消/新增取消未执行，不绕过权限')
   else:
    def edit_cancel():
     assert box.is_enabled();box.fill(child['name']+'未提交');page.locator('#pc-category-form').get_by_role('button',name='取消',exact=True).click();settle();facts(child)
    step(item,'原生维护能力编辑草稿取消恢复',edit_cancel)
    def new_root():
     page.get_by_role('button',name='新增一级分类',exact=True).click();settle()
     assert page.get_by_role('heading',name='新增分类',exact=True).is_visible() and box.input_value()==''
     box.fill('合成未提交一级分类');page.locator('#pc-category-form').get_by_role('button',name='取消',exact=True).click();settle();facts(child)
    step(item,'新增一级填写后取消回原选中子分类',new_root)
    def new_child():
     pick(parent);page.get_by_role('button',name='新增下级分类',exact=True).click();settle();assert box.input_value()==''
     assert page.locator('.pc-category-facts .pc-text-block').first.inner_text()==parent['name']
     box.fill('合成未提交下级分类');page.locator('#pc-category-form').get_by_role('button',name='取消',exact=True).click();settle();facts(parent)
    step(item,'新增下级填写后取消回原父分类',new_child)
    def deferred_cancel():
     box.fill(parent['name']+'未提交');settle()
     (out/'dirty-tree-diagnostic.json').write_text(json.dumps({'roleCount':tree.get_by_role('treeitem').count(),'titles':titles(),'nodes':tree.locator('.arco-tree-node-title').evaluate_all('(els)=>els.map(e=>({text:e.textContent,html:e.parentElement.outerHTML,ancestors:Array.from((function*(n){while(n){yield n;n=n.parentElement}})(e)).map(n=>({tag:n.tagName,role:n.getAttribute(\"role\"),hidden:n.getAttribute(\"aria-hidden\")}))}))')},ensure_ascii=False,indent=2))
     pick(child)
     dialog=page.get_by_role('dialog');assert dialog.get_by_text('有未保存的修改',exact=True).is_visible()
     dialog.get_by_role('button',name='继续编辑',exact=True).click();settle();assert box.input_value()==parent['name']+'未提交'
     pick(child);dialog.get_by_role('button',name='放弃修改并离开',exact=True).click();dialog.wait_for(state='detached');settle();facts(child)
    step(item,'编辑后换节点继续编辑/放弃确认已解消',deferred_cancel)
   if enabled:
    def dirty_search():
     pick(parent);box.fill(parent['name']+'搜索未提交');search.fill('短袖');settle();pick(child)
     dialog=page.get_by_role('dialog');dialog.get_by_role('button',name='继续编辑',exact=True).click();settle()
     assert box.input_value()==parent['name']+'搜索未提交' and search.input_value()=='短袖'
     assert tree.locator('.arco-tree-node-selected .arco-tree-node-title').all_text_contents()==[parent['name']]
     pick(child);dialog.get_by_role('button',name='放弃修改并离开',exact=True).click();dialog.wait_for(state='detached');settle()
     facts(child);assert search.input_value()==''
     assert tree.locator('.arco-tree-node-selected .arco-tree-node-title').all_text_contents()==[child['name']]
    step(item,'编辑中搜索切换取消保留草稿与搜索且选择不漂移',dirty_search)
   def repeat_expand():
    for _ in range(3):
     node(parent).get_by_role('button',name='fold button',exact=True).click()
     node(child).wait_for(state='hidden');facts(child)
     node(parent).get_by_role('button',name='expand button',exact=True).click()
     node(child).wait_for(state='visible');facts(child)
    assert titles()==state['expandedTitles']
    assert tree.get_by_role('treeitem').count()==len(titles())
   step(item,'反复收起展开保持选择且没有隐藏动画副本',repeat_expand)
   def unchanged():
    before=state['rows'];page.reload();search.wait_for();settle()
    assert current('/catalogue-settings-read/categories/query')['body']['items']==before
    assert not result.get('forbiddenCommands')
   step(item,'重读数据未变且零写命令',unchanged)
   partial(item,'本脚本仅候选单侧合成UI；未在同轮配对冻结Demo/真实角色禁用身份/PG授权保存，不声明整页通过')
  run('RECHECK-P14',categories)
  assert result['cases'], 'NO_REQUESTED_CASE_EXECUTED'
  healthy();result['status']='FAIL' if any(x['status']=='FAIL' for x in result['cases']) else 'PARTIAL' if any(x['status']=='PARTIAL' for x in result['cases']) else 'PASS_LISTED_CASE_STEPS';persist()
  if args.keep_open:keep_visible(page)
  browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error)
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status'] in ['PARTIAL','PASS_LISTED_CASE_STEPS'] else 1)
