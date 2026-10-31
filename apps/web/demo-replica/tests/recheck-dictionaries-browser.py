from visible_wait import keep_visible
# Recovery of bounded real-artifact smoke; not original lost test source bytes.
"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys, re, traceback
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('--category-overflow',action='store_true');p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
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
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('production-browser-fixture.mjs'))]+(['--category-overflow'] if args.category_overflow else []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
  context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
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
  page.evaluate("document.title='ERP主要页面回归 · 实产物 · 合成只读'")
  result['checks']=[]
  result['cases']=[]
  result['cases']=[]
  def snap(case,name):
   page.screenshot(path=str(out/(case+'-'+name+'.png')),full_page=True,animations='disabled');(out/(case+'-'+name+'.txt')).write_text(page.locator('#page').inner_text())
  def settle():
   page.wait_for_timeout(80);page.wait_for_load_state('networkidle')
  def choose(name):page.get_by_role('tab',name=name,exact=True).click();settle()
  def size50():
   page.get_by_label('商品设置每页条数',exact=True).click();page.get_by_role('option',name='50条/页',exact=True).click();settle()
  def current():return next(r for r in reversed(result['readResponses']) if r['path'] in ['/api/catalogue-settings-read/colors/query','/api/catalogue-settings-read/fits/query','/api/dictionary-read/size-groups/query','/api/dictionary-read/seasons/query'])
  def run(case,fn):
   item={'caseId':case,'sourceCheckpoint':manifest['sourceCheckpoint'],'status':'RUNNING'};result['cases'].append(item)
   try:fn(item);item['status']=item.get('finalStatus','PASS_LISTED_STEPS')
   except Exception as e:item.update(status='FAIL',reason=str(e),traceback=traceback.format_exc());snap(case,'failure')
   (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  page.locator('.sidebar a[data-route="product-settings"]').click();page.locator('#pc-dict-search').wait_for();settle()
  def colors(item):
   search=page.locator('#pc-dict-search');search.fill('白');settle();assert all('白' in x['name'] or '白' in x['code'] for x in current()['body']['items']);search.fill('');settle();size50();assert current()['request']['pageSize']==50
   page.get_by_role('button',name='第2页',exact=True).click();settle();assert current()['request']['page']==2;snap('RECHECK-P15','page2');page.get_by_label('目标页码',exact=True).fill('99');page.get_by_role('button',name='跳转',exact=True).click();settle();last=current();assert last['request']['page']==max(1,(last['body']['total']+49)//50);choose('尺码组');choose('颜色');assert current()['request']['pageSize']==50;item['actual']={'lastPage':last,'returned':current()};snap('RECHECK-P15','returned')
  run('RECHECK-P15',colors)
  def groups(item):
   choose('尺码组');assert page.locator('.pc-settings-body thead').inner_text().split()==['尺码组','包含尺码'];size50();choose('颜色');choose('尺码组');assert current()['request']['pageSize']==50;page.locator('#pc-dict-search').fill('男装');settle();assert all('男装' in x['name'] for x in current()['body']['items']);item['actual']=current();snap('RECHECK-P16','searched')
  run('RECHECK-P16',groups)
  def fits(item):
   choose('版型');size50();choose('季节');choose('版型');assert current()['request']['pageSize']==50;page.locator('#pc-dict-search').fill('绝无此合成版型');settle();assert current()['body']['total']==0;page.locator('#pc-dict-search').fill('');settle();assert page.get_by_role('button',name='新增版型',exact=True).is_disabled();item['actual']=current();item['finalStatus']='PARTIAL';item['remaining']='当前生产构建未启用版型维护，新增取消待合法草稿能力单独构建，不强行启用';snap('RECHECK-P17','returned')
  run('RECHECK-P17',fits)
  def seasons(item):
   choose('季节');assert current()['body']['total']==4;size50();choose('版型');choose('季节');assert current()['request']['pageSize']==50;search=page.locator('#pc-dict-search');search.fill('绝无此合成季节');settle();assert current()['body']['total']==0;search.press('Escape');settle();snap('RECHECK-P18','escape');item['actual']={'input':search.input_value(),'response':current()};assert search.input_value()=='' and current()['body']['total']==4,'第一次Esc未清空搜索'
  run('RECHECK-P18',seasons)
  result['errors']=errors;result['status']='FAIL' if errors or any(x['status']=='FAIL' for x in result['cases']) else 'PASS_LISTED_CASE_STEPS';browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error)
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS_LISTED_CASE_STEPS' else 1)
