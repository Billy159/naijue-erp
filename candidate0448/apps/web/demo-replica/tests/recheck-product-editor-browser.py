from visible_wait import keep_visible
# Recovery of bounded real-artifact smoke; not original lost test source bytes.
"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys, re
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('--width',type=int,default=1440);p.add_argument('--category-overflow',action='store_true');p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
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
  page.evaluate("document.title='ERP主要页面回归 · 实产物 · 合成只读'")
  result['checks']=[]
  result['cases']=[]
  result['cases']=[]
  def shot(case,name):
   page.screenshot(path=str(out/(case+'-'+name+'.png')),full_page=True,animations='disabled');(out/(case+'-'+name+'.txt')).write_text(page.locator('#page').inner_text())
  def run(case,fn):
   item={'caseId':case,'sourceCheckpoint':manifest['sourceCheckpoint'],'status':'RUNNING'};result['cases'].append(item)
   try:fn(item);item['status']=item.get('finalStatus','PASS_LISTED_STEPS')
   except Exception as e:
    import traceback
    item.update(status='FAIL',reason=str(e),traceback=traceback.format_exc());shot(case,'failure')
   (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  target='00000000-0000-4000-8000-000000004000'
  page.goto(origin+'/#products/edit/'+target);page.get_by_label('商品名称',exact=True).wait_for();page.wait_for_function("document.querySelector('input[aria-label=商品名称]')?.value==='商务免烫衬衫'")
  def basics(item):
   assert page.get_by_label('款号',exact=True).input_value()=='M26001';assert page.get_by_role('button',name='保存',exact=True).is_disabled();page.get_by_label('商品名称',exact=True).fill('仅本地草稿检查')
   for tab in ['规格','条码','价格','图片','库存','基础资料']:
    page.get_by_role('tab',name=tab,exact=True).click();page.wait_for_load_state('networkidle');shot('RECHECK-P02',tab)
   assert page.get_by_label('商品名称',exact=True).input_value()=='仅本地草稿检查';item['actual']='正式V2 service读取，六tab返回草稿保留，保存无权限禁用';item['finalStatus']='PARTIAL';item['remaining']='各字典选择/取消随后逐项，非保存通过'
  run('RECHECK-P02',basics)
  def specs(item):
   page.get_by_role('tab',name='规格',exact=True).click();page.wait_for_load_state('networkidle')
   for label in ['颜色','版型']:
    before=page.locator('.pc-spec-stack').inner_text();page.get_by_role('button',name='编辑'+label,exact=True).click();page.locator('.arco-transfer').wait_for();page.wait_for_load_state('networkidle');shot('RECHECK-P03',label);geometry=page.get_by_role('dialog').evaluate('(el)=>({width:el.getBoundingClientRect().width,client:el.clientWidth,scroll:el.scrollWidth})');item.setdefault('geometry',[]).append(geometry);assert geometry['width']>=min(700,args.width*.9) and geometry['scroll']<=geometry['client']+1,geometry;page.get_by_role('dialog').get_by_role('button',name='取消',exact=True).click();page.locator('.arco-transfer').wait_for(state='detached');assert page.locator('.pc-spec-stack').inner_text()==before
   item['actual']='颜色/版型穿梭框实际打开取消且不改变原规格';item['finalStatus']='PARTIAL';item['remaining']='加入移除/搜索/确认/sizegroup guard仍待实际步骤'
  run('RECHECK-P03',specs)
  def prices(item):
   page.get_by_role('tab',name='价格',exact=True).click();fields=page.locator('[data-price-field]');assert fields.count()==9
   def paste(text):
    fields.first.evaluate("(el,text)=>{const data=new DataTransfer();data.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));}",text)
    page.wait_for_timeout(50)
   paste('1\t0\t2.30\t\t4\t5\t6\t7\t8\n');values=fields.evaluate_all('(els)=>els.map(e=>e.value)');assert values==['1','0','2.30','','4','5','6','7','8']
   for text in ['abc\n2','1\n2\n3\n4\n5\n6\n7\n8\n9\n10']:
    paste(text);assert fields.evaluate_all('(els)=>els.map(e=>e.value)')==values;assert page.locator('#pc-editor-error').inner_text()
   paste('11\n0\n12.30\n\n14\n15\n16\n17\n18\n');assert fields.nth(3).input_value()=='';assert fields.nth(8).input_value()=='18';assert page.locator('#pc-editor-error').inner_text()=='';shot('RECHECK-P05','paste');item['actual']='九格Tab/换行/末尾空换行；abc与10项拒绝不改原值，内部空格保留未设置。真实DOM ClipboardEvent，非系统剪贴板权限验收。'
  run('RECHECK-P05',prices)
  def cancel(item):
   page.locator('#page').get_by_role('button',name='取消',exact=True).click();page.get_by_role('button',name='继续编辑',exact=True).click();assert page.url.endswith(target);page.locator('#page').get_by_role('button',name='取消',exact=True).click();page.get_by_role('button',name='放弃修改并离开',exact=True).click();page.wait_for_url(origin+'/#products');page.goto(origin+'/#products/edit/'+target);page.wait_for_function("document.querySelector('input[aria-label=商品名称]')?.value==='商务免烫衬衫'");assert page.get_by_role('button',name='保存',exact=True).is_disabled();shot('RECHECK-P02','discard-reopen');item['actual']='继续编辑保留页，明确放弃才离开；重新打开读原值，未发送商品写入';item['finalStatus']='PARTIAL'
  run('RECHECK-P02-DISCARD',cancel)
  result['errors']=errors;result['status']='FAIL' if errors or any(x['status']=='FAIL' for x in result['cases']) else 'PASS_LISTED_CASE_STEPS';browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error)
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS_LISTED_CASE_STEPS' else 1)
