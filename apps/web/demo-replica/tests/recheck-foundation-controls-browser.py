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
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('production-browser-fixture.mjs')),'--product-editor-read']+(['--category-overflow'] if args.category_overflow else []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
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
    q=json.loads(request.post_data or '{}')
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
   page.screenshot(path=str(out/(case+'-'+name+'.png')),full_page=True,animations='disabled');(out/(case+'-'+name+'.txt')).write_text(page.locator('#page').inner_text())
  def run(case,fn):
   if args.case and case not in args.case:return
   item={'caseId':case,'sourceCheckpoint':manifest['sourceCheckpoint'],'status':'RUNNING'};result['cases'].append(item)
   try:
    fn(item)
    alerts=[x.inner_text().strip() for x in page.get_by_role('alert').all() if x.is_visible() and x.inner_text().strip()]
    assert not alerts, str(alerts)
    item['visibleAlerts']=alerts;item['status']=item.get('finalStatus','PASS_LISTED_STEPS')
   except Exception as e:
    import traceback
    item.update(status='FAIL',reason=str(e),traceback=traceback.format_exc());shot(case,'failure')
   (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  def settle():page.wait_for_load_state('networkidle');page.wait_for_timeout(80)
  def query(label,text):
   page.get_by_label(label,exact=True).fill(text);page.get_by_role('button',name='查询',exact=True).click();settle()
  def current(path):return next(x for x in reversed(result['readResponses']) if x['path'].endswith(path))
  def select(label):return page.locator('.runtime-settings-select').filter(has=page.locator('.arco-select[aria-label="'+label+'"]'))
  def store(item):
   page.goto(origin+'/#settings/stores');page.get_by_label('搜索营业厅名称',exact=True).wait_for();settle();query('搜索营业厅名称',' 网点 ');spaced=current('/organization/halls/query');query('搜索营业厅名称','网点');trimmed=current('/organization/halls/query');assert spaced['request']['search']==trimmed['request']['search']=='网点';assert spaced['body']==trimmed['body'];assert spaced['body']['total']==1
   page.get_by_role('button',name='编辑',exact=True).first.click();dialog=page.get_by_role('dialog');dialog.get_by_role('textbox',name='名称',exact=True).wait_for();name=dialog.get_by_role('textbox',name='名称',exact=True).input_value();wh=dialog.get_by_role('group',name='默认出库仓',exact=True);wh.locator('.arco-select-view').click();wh.locator('.arco-select-option').filter(has_text='总仓').click();dialog.get_by_role('textbox',name='名称',exact=True).click();assert '总仓' in wh.locator('.ui-single-tag').all_text_contents();dialog.get_by_role('button',name='取消',exact=True).click();dialog.get_by_role('button',name='继续填写',exact=True).click();assert '总仓' in wh.locator('.ui-single-tag').all_text_contents();dialog.get_by_role('button',name='取消',exact=True).click();dialog.get_by_role('button',name='放弃本次填写',exact=True).click();dialog.wait_for(state='detached')
   page.get_by_role('button',name='编辑',exact=True).first.click();dialog.get_by_role('textbox',name='名称',exact=True).wait_for();assert dialog.get_by_role('textbox',name='名称',exact=True).input_value()==name;assert '网点仓' in dialog.get_by_role('group',name='默认出库仓',exact=True).locator('.ui-single-tag').all_text_contents();dialog.get_by_role('button',name='取消',exact=True).click();dialog.wait_for(state='detached')
   page.get_by_role('button',name='新增营业厅',exact=True).click();dialog.get_by_role('textbox',name='名称',exact=True).wait_for();assert 'arco-select-disabled' in dialog.get_by_role('group',name='默认出库仓',exact=True).locator('.arco-select').get_attribute('class');assert dialog.get_by_text('先创建营业厅及其仓库，再设置默认出库仓。',exact=True).is_visible();assert dialog.get_by_role('button',name='确定',exact=True).is_disabled();shot('RECHECK-B01','new-disabled-warehouse');dialog.get_by_role('button',name='取消',exact=True).click();dialog.wait_for(state='detached');item['actual']='带空格/去空格查询相同；编辑默认仓→取消继续保留→放弃后重新编辑恢复网点仓；新增默认仓禁用且解释明确';item['query']=trimmed
  run('RECHECK-B01',store)
  def warehouse(item):
   page.goto(origin+'/?case=warehouses#settings/warehouses');page.get_by_label('搜索仓库名称',exact=True).wait_for();settle();host=select('全部营业厅');host.locator('.arco-select-view').click();host.locator('.arco-select-option').filter(has_text='网点营业厅').click();page.get_by_role('button',name='查询',exact=True).click();settle();assert current('/organization/warehouses/query')['request']['hallId']=='00000000-0000-4000-8000-000000003200';selected=current('/organization/warehouses/query');assert selected['status']==200 and selected['body']['total']==4;assert {x['name'] for x in selected['body']['items']}=={'备货仓','总仓','温州仓','网点仓'};assert all(x['hall']['id']=='00000000-0000-4000-8000-000000003200' for x in selected['body']['items']);assert all(page.get_by_role('cell',name=x['name'],exact=True).is_visible() for x in selected['body']['items'])
   host.locator('.arco-select-view').click();host.locator('input').fill('ZZZ987');settle();assert host.locator('.arco-select-option').count()==0;assert host.locator('.arco-empty').is_visible();shot('RECHECK-B02','no-matching-hall');host.locator('input').fill('');settle();host.locator('.arco-select-option').filter(has_text='全部营业厅').click();page.get_by_role('button',name='查询',exact=True).click();settle();assert current('/organization/warehouses/query')['request']['hallId'] is None
   query('搜索仓库名称',' 总仓 ');spaced=current('/organization/warehouses/query');query('搜索仓库名称','总仓');assert spaced['body']==current('/organization/warehouses/query')['body'];assert spaced['request']['search']=='总仓';trimmed=current('/organization/warehouses/query');assert trimmed['request']['search']=='总仓' and trimmed['status']==200 and trimmed['body']['total']==1;assert trimmed['body']['items'][0]['name']=='总仓';assert page.get_by_role('cell',name='总仓',exact=True).is_visible()
   page.get_by_role('button',name='新增仓库',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_role('textbox',name='名称',exact=True).wait_for();dialog.get_by_role('textbox',name='名称',exact=True).fill('合成未提交仓库');hall=dialog.get_by_role('group',name='所属营业厅',exact=True);hall.locator('.arco-select-view').click();hall.locator('.arco-select-option').filter(has_text='网点营业厅').click();dialog.get_by_role('button',name='取消',exact=True).click();dialog.get_by_role('button',name='继续填写',exact=True).click();assert dialog.get_by_role('textbox',name='名称',exact=True).input_value()=='合成未提交仓库';assert '网点营业厅' in hall.locator('.ui-single-tag').all_text_contents();dialog.get_by_role('button',name='取消',exact=True).click();dialog.get_by_role('button',name='放弃本次填写',exact=True).click();dialog.wait_for(state='detached')
   page.get_by_role('button',name='编辑',exact=True).first.click();dialog.get_by_role('textbox',name='名称',exact=True).wait_for();switch=dialog.get_by_role('switch',name='使用状态',exact=True);assert switch.get_attribute('aria-checked')=='true';switch.click();assert switch.get_attribute('aria-checked')=='false';dialog.get_by_role('button',name='取消',exact=True).click();dialog.get_by_role('button',name='放弃本次填写',exact=True).click();dialog.wait_for(state='detached');page.get_by_role('button',name='编辑',exact=True).first.click();dialog.get_by_role('textbox',name='名称',exact=True).wait_for();assert dialog.get_by_role('switch',name='使用状态',exact=True).get_attribute('aria-checked')=='true';shot('RECHECK-B02','state-restored');dialog.get_by_role('button',name='取消',exact=True).click();dialog.wait_for(state='detached');item['actual']='仓库选厅/无匹配/全部与trim查询；新增选厅取消继续/放弃；编辑状态改停用取消后重新读取正常'
  run('RECHECK-B02',warehouse)
  assert result['cases'], 'NO_REQUESTED_CASE_EXECUTED'
  result['errors']=errors;result['status']='FAIL' if errors or any(x['status']=='FAIL' for x in result['cases']) else 'PASS_LISTED_CASE_STEPS';browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error)
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS_LISTED_CASE_STEPS' else 1)
