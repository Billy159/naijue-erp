from visible_wait import keep_visible
# Recovery of bounded real-artifact smoke; not original lost test source bytes.
"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys, re
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('--case',action='append',choices=['RECHECK-B05','RECHECK-B06']);p.add_argument('--width',type=int,default=1440);p.add_argument('--category-overflow',action='store_true');p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
build=Path(args.build).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
manifest=json.loads((build/'production-build.json').read_text());config=manifest['configuration'];origin=config['http']['origin'];base=config['assets']['basePath']
if origin!='https://synthetic-management.invalid':raise SystemExit('Smoke requires the declared synthetic-only build configuration')
assert config['routes'].get('paymentSettings') is True and config['routes'].get('maintenance',{}).get('paymentSettings') is True, 'EXPLICIT_PAYMENT_CANCEL_TEST_PROFILE_REQUIRED'
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
  page.evaluate("title=>document.title=title",'测试 '+manifest['sourceCheckpoint']+' · B05/B06取消专用测试 非全面可用环境 禁止保存')
  result['checks']=[]
  result['cases']=[]
  def shot(case,name):
   result['screens'].append(case+'-'+name+'.png')
   page.screenshot(path=str(out/(case+'-'+name+'.png')),full_page=True,animations='disabled');(out/(case+'-'+name+'.txt')).write_text(page.locator('#page').inner_text())
  def persist():
   result['errors']=errors
   (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  def healthy():
   alerts=[x.inner_text().strip() for x in page.get_by_role('alert').all() if x.is_visible() and x.inner_text().strip()]
   assert not alerts, str(alerts)
   assert not errors, str(errors)
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
  def payment_cancel(item,kind,label):
   saved={}
   dialog=page.get_by_role('dialog')
   box=dialog.get_by_role('textbox',name=label,exact=True)
   path='/payment/'+kind+'/detail/query'
   def open_editor():
    principal=current('/auth/session')['body']['principal']
    assert principal['role']=='ADMIN' and principal['accountId']=='00000000-0000-4000-8000-000000003700',principal
    page.get_by_role('button',name='编辑',exact=True).first.click();box.wait_for();settle()
    response=current(path);assert response['status']==200 and response['body'] is not None,response
    saved['record']=response['body'];saved['name']=box.input_value();assert saved['name']==response['body']['name']
    saved['enabled']=dialog.get_by_role('switch',name='使用状态',exact=True).get_attribute('aria-checked')
    if kind=='accounts':
     assert dialog.get_by_role('group',name='所属收款方式',exact=True).get_by_text(response['body']['paymentMethod']['name'],exact=True).is_visible()
     halls=response['body']['halls'];assert len(halls)==1, 'Current approved sample must remain single-hall'
     assert dialog.locator('.runtime-payment-halls').get_by_text(halls[0]['name'],exact=True).is_visible()
   step(item,'真实合成ADMIN/读取现有详情/打开编辑',open_editor)
   step(item,'仅修改名称草稿不提交',lambda:box.fill(saved['name']+'未提交取消验证'))
   def continue_editing():
    dialog.get_by_role('button',name='取消',exact=True).click()
    prompt=dialog.get_by_role('alert').filter(has_text='放弃本次填写？');assert prompt.is_visible()
    # This expected business confirmation is not an error. Capture before resolving it.
    shot(item['caseId'],'expected-discard-prompt');persist()
    dialog.get_by_role('button',name='继续填写',exact=True).click()
    assert box.input_value()==saved['name']+'未提交取消验证'
   step(item,'取消后正常确认提示/继续填写保留草稿',continue_editing)
   def discard():
    dialog.get_by_role('button',name='取消',exact=True).click()
    dialog.get_by_role('button',name='放弃本次填写',exact=True).click();dialog.wait_for(state='detached');settle()
   step(item,'再次取消/放弃草稿/关闭',discard)
   def reopen():
    page.get_by_role('button',name='编辑',exact=True).first.click();box.wait_for();settle()
    assert box.input_value()==saved['name']
    assert current(path)['body']==saved['record'],'Detail changed after unsaved cancellation'
    assert dialog.get_by_role('switch',name='使用状态',exact=True).get_attribute('aria-checked')==saved['enabled']
    if kind=='accounts':
     assert dialog.locator('.runtime-payment-halls').get_by_text(saved['record']['halls'][0]['name'],exact=True).is_visible()
   step(item,'重开详情及名称/状态/既有厅均未改变',reopen)
   def close_clean():
    dialog.get_by_role('button',name='取消',exact=True).click();dialog.wait_for(state='detached');settle()
    assert not [r for r in result['requests'] if '/commands' in r['url'] or '/receipts/' in r['url']], 'Unexpected command or receipt request'
   step(item,'未修改取消直接关闭/未调用任何保存或回执',close_clean)
  def payments(item):
   step(item,'收款方式列表',lambda:(visit('settings/payments','搜索收款方式'),list_ok('/payment/methods/query')))
   step(item,'微信空格/去空格',lambda:trim_check('搜索收款方式','微信','/payment/methods/query'))
   def status():
    choose('状态','已停用');press_query();response=list_ok('/payment/methods/query');assert response['request']['status']=='disabled' and response['body']['total']==0
    choose('状态','全部');press_query();response=list_ok('/payment/methods/query');assert response['request']['status']=='all' and response['body']['total']==1
    reset();assert list_ok('/payment/methods/query')['body']['total']==5;assert page.get_by_label('搜索收款方式',exact=True).input_value()==''
   step(item,'状态筛选及重置清空',status)
   payment_cancel(item,'methods','名称')
  run('RECHECK-B05',payments)
  def fund(item):
   step(item,'资金账户实际路由',lambda:(visit('settings/fundAccounts','搜索账户名称'),list_ok('/payment/accounts/query')))
   def method():
    choose('全部收款方式','现金');press_query();response=list_ok('/payment/accounts/query');assert response['request']['paymentMethodId']=='00000000-0000-4000-8000-000000003400';assert response['body']['total']==1 and response['body']['items'][0]['name']=='现金测试账户'
    host=select('全部收款方式');host.locator('.arco-select-view').click();host.locator('input').fill('ZZZ987');settle();assert host.locator('.arco-select-option').count()==0;assert host.locator('.arco-empty').is_visible();host.locator('input').fill('');settle();host.locator('.arco-select-option').filter(has_text='全部收款方式').click();press_query();assert list_ok('/payment/accounts/query')['request']['paymentMethodId'] is None
   step(item,'按收款方式/无匹配/全部恢复',method)
   step(item,'现金空格/去空格',lambda:trim_check('搜索账户名称','现金','/payment/accounts/query'))
   step(item,'重置恢复列表',lambda:(reset(),list_ok('/payment/accounts/query')))
   partial(item,'现有QA账户仅单厅，列表无营业厅列；本次编辑只验证既有单厅，原多厅显示仍未覆盖。未伪造多厅历史。')
   payment_cancel(item,'accounts','账户名称')
   def tabs():
    page.get_by_role('tab',name='收款方式',exact=True).click();settle();list_ok('/payment/methods/query');page.get_by_role('tab',name='资金账户',exact=True).click();settle();list_ok('/payment/accounts/query')
   step(item,'收款方式/资金账户标签往返',tabs)
  run('RECHECK-B06',fund)
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
