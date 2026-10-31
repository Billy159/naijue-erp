from visible_wait import keep_visible
# Recovery of bounded real-artifact smoke; not original lost test source bytes.
"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python product-edit-browser.py BUILD OUT --node NODE --chromium CHROMIUM
New service profile: add --product-entry-service --headed [--keep-open]; requires the C-owned product-entry-service-public-config.json build.
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, base64, json, mimetypes, subprocess, sys, re, struct, zlib
from pathlib import Path
from urllib.parse import urlsplit, unquote
def normalized_declared_configuration(declared, node):
 # Use the producer's parser, including its defaults; do not maintain a second schema here.
 parser=(Path(__file__).resolve().parents[2]/'src/production-host/configuration.ts').as_uri()
 script="import {readFileSync} from 'node:fs';import {parseProductionHostConfiguration} from "+json.dumps(parser)+";process.stdout.write(JSON.stringify(parseProductionHostConfiguration(JSON.parse(readFileSync(0,'utf8')))));"
 result=subprocess.run([node,'--experimental-transform-types','--input-type=module','-e',script],input=json.dumps(declared),text=True,capture_output=True,check=True,timeout=30)
 return json.loads(result.stdout)

def bridge_request(url, method, headers, raw):
 payload={'url':url,'method':method,'headers':dict(headers)}
 if raw is not None:
  content_type=headers.get('content-type','').lower()
  if content_type.startswith('text/') or content_type.split(';')[0]=='application/json':payload['body']=raw.decode('utf-8')
  else:payload['binaryBase64']=base64.b64encode(raw).decode('ascii')
 return payload

def bridge_response_bytes(response):
 if 'binaryBase64' in response:
  if 'body' in response:raise ValueError('Ambiguous stdio response')
  return base64.b64decode(response['binaryBase64'],validate=True)
 return response['body'].encode('utf-8')

def synthetic_png():
 def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',8,4,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\x12\x34\x56'*8)*4))+chunk(b'IEND',b'')

p=argparse.ArgumentParser();p.add_argument('--product-entry-service',action='store_true');p.add_argument('--width',type=int,default=1440);p.add_argument('--category-overflow',action='store_true');p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
build=Path(args.build).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
manifest=json.loads((build/'production-build.json').read_text());config=manifest['configuration'];origin=config['http']['origin'];base=config['assets']['basePath']
if args.product_entry_service and (not args.headed or args.category_overflow):raise SystemExit('Service profile requires --headed and no legacy variants')
expected_origin='https://synthetic-product-entry.invalid' if args.product_entry_service else 'https://synthetic-management.invalid'
if origin!=expected_origin:raise SystemExit('Smoke requires the declared synthetic-only build configuration')
if args.product_entry_service:
 declared=json.loads(Path(__file__).with_name('product-entry-service-public-config.json').read_text())
 if config!=normalized_declared_configuration(declared,args.node):raise SystemExit('Service profile build must use the declared C-owned public config')
allowed={x['path'] for x in manifest['outputs']};allowed.add('index.html')
result={'sourceCheckpoint':manifest['sourceCheckpoint'],'syntheticOnly':True,'status':'BLOCKED_ENV','checks':[],'screens':[],'requests':[],'fixtureProfile':'product-entry-service' if args.product_entry_service else 'product-edit','postgres':False}
bridge=None;browser=None
variant={'nullable':False,'notSet':False,'image':False,'imageFail':False,'stockFail':False};png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOwq/78HwAFUwKs5SlCvgAAAABJRU5ErkJggg=='
try:
 from playwright.sync_api import sync_playwright, expect
 with sync_playwright() as pw:
  try:browser=pw.chromium.launch(executable_path=args.chromium,headless=not args.headed,chromium_sandbox=True)
  except Exception as error:
   result['reason']=str(error);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('BLOCKED_ENV: Chromium could not start with its sandbox enabled');sys.exit(2)
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('production-browser-fixture.mjs')),('--product-entry-service' if args.product_entry_service else '--product-edit')]+(['--category-overflow'] if args.category_overflow else []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
  context=browser.new_context(viewport={'width':args.width,'height':1000},device_scale_factor=1)
  errors=[];page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
  detail_mode={'next':None,'versionDelta':0};delivered_media=[]
  def respond(route):
   request=route.request;url=urlsplit(request.url);request_origin=f'{url.scheme}://{url.netloc}'
   wire=bridge_request(request.url,request.method,request.headers,request.post_data_buffer) if args.product_entry_service else {'url':request.url,'method':request.method,'headers':request.headers,'body':request.post_data,'schemeCapability':request.headers.get('x-naijue-scheme-detail')}
   result['requests'].append({'method':request.method,'url':request.url,**({'binaryBytes':len(request.post_data_buffer or b'')} if 'binaryBase64' in wire else {'body':wire.get('body')}),'schemeCapability':request.headers.get('x-naijue-scheme-detail')})
   if request_origin!=origin:route.abort();return
   if url.path.startswith('/api/'):
    mode=detail_mode['next'] if url.path=='/api/transfers/detail/query' else None
    if mode:detail_mode['next']=None
    if mode=='fail':route.fulfill(status=503,content_type='application/json',body='{"error":{"code":"SYNTHETIC_READ_UNAVAILABLE"}}');return
    bridge.stdin.write(json.dumps(wire)+'\n');bridge.stdin.flush();response=json.loads(bridge.stdout.readline())
    if args.product_entry_service:
     body=bridge_response_bytes(response)
     if 'binaryBase64' in response:delivered_media.append((url.path,body,response['headers']))
     try:decoded=json.loads(body)
     except (ValueError,UnicodeDecodeError):decoded=None
     result.setdefault('readResponses',[]).append({'path':url.path,'request':json.loads(wire['body']) if wire.get('body') and request.headers.get('content-type','').startswith('application/json') else {'binaryBytes':len(request.post_data_buffer or b'')},'status':response['status'],'body':decoded,'binaryBytes':len(body) if 'binaryBase64' in response else None})
     route.fulfill(status=response['status'],headers=response['headers'],body=body);return
    q=json.loads(request.post_data or '{}')
    if url.path=='/api/products/basics/query' and response['status']==200 and variant['nullable']:
     value=json.loads(response['body'])
     if value:
      for key in ['categoryLabel','yearLabel','seasonLabel','supplierLabel','systemCode','thickness','collarPantsType']:value[key]=None
      response['body']=json.dumps(value)
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
  page.bring_to_front();page.goto(origin+'/#products');page.locator('.pc-products').wait_for();page.wait_for_load_state('networkidle')
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
  if args.product_entry_service:
   page.evaluate("document.title='PRODUCT ENTRY · 原服务/事务内存/真实暂存图片 · 非PG'")
   def choose(label,text,cascader=False):
    field=page.get_by_label(label,exact=True);field.click()
    option=page.locator('.arco-cascader-list-item' if cascader else '.arco-select-option').filter(has_text=text)
    option.first.wait_for();assert option.count()==1, 'candidate must be unambiguous: '+text
    option.click();page.locator('h1').first.click()
   def service_category(item):
    item['step']='open category writer';page.goto(origin+'/#product-categories')
    page.get_by_role('button',name='新增一级分类',exact=True).click();page.locator('input[data-cat="name"]').fill('SYN DRIVER 分类')
    item['step']='category real CREATE and readback';page.get_by_role('button',name='保存',exact=True).click()
    notice=page.locator('#pc-category-error[role="status"]');notice.wait_for();assert notice.inner_text().strip();assert 'inline-error' not in (notice.get_attribute('class') or '')
    page.locator('.arco-tree-node-title').filter(has_text='SYN DRIVER 分类').wait_for();shot('PRODUCT-ENTRY-CATEGORY','success')
    writes=[x for x in result['readResponses'] if x['path']=='/api/catalogue/categories/commands'];assert len(writes)==1 and writes[0]['status']==200
    saved_id=writes[0]['body']['targetId'];assert saved_id
    item['step']='category original duplicate-name rejection';page.get_by_role('button',name='新增一级分类',exact=True).click();page.locator('input[data-cat="name"]').fill('SYN DRIVER 分类');page.get_by_role('button',name='保存',exact=True).click()
    error=page.locator('.pc-categories .pc-category-detail > div.inline-error[role="alert"]:not(#pc-category-error)');expect(error).to_have_text('名称或编码已存在。',timeout=30000)
    expect(page.locator('.pc-categories .pc-category-detail').get_by_role('button',name='读取最新目录',exact=True)).to_be_visible()
    failed=[x for x in result['readResponses'] if x['path']=='/api/catalogue/categories/commands'];assert len(failed)==2 and failed[-1]['status']==409
    shot('PRODUCT-ENTRY-CATEGORY','rejected');page.locator('#pc-category-form').get_by_role('button',name='取消',exact=True).click()
    item['step']='category fresh route readback';page.goto(origin+'/#products');page.locator('.pc-products').wait_for();page.goto(origin+'/#product-categories');page.locator('.arco-tree-node-title').filter(has_text='SYN DRIVER 分类').wait_for()
    assert page.locator('#pc-category-error.inline-error').count()==0;item['actual']={'targetId':saved_id,'successRole':'status','duplicateStatus':409,'freshReadback':True}
   run('PRODUCT-ENTRY-CATEGORY',service_category)
   def service_product(item):
    item['step']='leave category draft through original cancel'
    category_form=page.locator('.pc-categories #pc-category-form')
    if category_form.count():category_form.get_by_role('button',name='取消',exact=True).click()
    page.goto(origin+'/#products');page.locator('.pc-products').wait_for()
    item['step']='open new product';page.goto(origin+'/#products/new');page.get_by_label('商品名称',exact=True).wait_for()
    page.get_by_label('款号',exact=True).fill('SYN-DRIVER-ENTRY');page.get_by_label('商品名称',exact=True).fill('SYN DRIVER 商品');page.get_by_label('系统货号',exact=True).fill('9000053')
    choose('商品分类','SYNTHETIC 西服',True);choose('年份','2026');choose('季节','秋');choose('供应商','SYNTHETIC 供应商')
    item['step']='real default A and inline color CREATE';page.get_by_role('tab',name='规格',exact=True).click()
    fit=page.locator('.pc-spec-section').filter(has=page.get_by_role('heading',name='版型',exact=True));fit.locator('.pc-spec-values').filter(has_text='A版（标准）').wait_for()
    page.get_by_role('button',name='编辑颜色',exact=True).click();page.get_by_role('button',name='新增颜色',exact=True).click();page.locator('#pc-dict-name input').fill('SYN DRIVER 蓝');page.locator('#pc-dict-code input').fill('003');page.get_by_role('dialog').last.get_by_role('button',name='确定',exact=True).click()
    page.locator('#pc-dict-name').wait_for(state='detached');page.get_by_role('dialog').last.get_by_role('button',name='确定',exact=True).wait_for();page.get_by_role('dialog').last.get_by_role('button',name='确定',exact=True).click()
    choose('尺码组','SYNTHETIC 男装上衣尺码');page.locator('.pc-spec-section').filter(has=page.get_by_role('heading',name='颜色',exact=True)).filter(has_text='SYN DRIVER 蓝').wait_for()
    item['step']='2026 scheme and whole-group draft preview';page.get_by_role('tab',name='条码',exact=True).click();scheme=page.get_by_label('主条码默认方案',exact=True);scheme.filter(has_text='2026年条码方案').wait_for()
    page.wait_for_function("document.querySelectorAll('.pc-barcode-table tbody tr').length===11")
    item['step']='real PNG upload';page.get_by_role('tab',name='图片',exact=True).click();image=synthetic_png();page.locator('.pc-photo-section').filter(has=page.get_by_role('heading',name='主图',exact=True)).locator('input[type=file]').set_input_files({'name':'synthetic-driver.png','mimeType':'image/png','buffer':image})
    page.get_by_role('button',name='保存',exact=True).wait_for(state='visible');page.wait_for_function("[...document.querySelectorAll('button')].some(b=>b.textContent==='保存'&&!b.disabled)")
    uploads=[x for x in result['readResponses'] if x['path']=='/api/products/media/uploads'];assert len(uploads)==1 and uploads[0]['status']==200 and uploads[0]['body']['uploadId'];assert uploads[0]['request']['binaryBytes']==len(image)
    item['step']='original V2 SAVE and detail readback';page.get_by_role('button',name='保存',exact=True).click();page.wait_for_url(re.compile(re.escape(origin)+r'/#products/view/[0-9a-f-]+$'))
    product_id=page.url.rsplit('/',1)[-1];commands=[x for x in result['readResponses'] if x['path']=='/api/products/v2/commands'];assert len(commands)==1 and commands[0]['status']==200 and commands[0]['body']['targetId']==product_id
    command=commands[0]['request'];assert command['values']['defaultBarcodeSchemeId']=='0e70e45e-1a51-4d44-afe8-0002cf3fb7ef';assert len(command['skuSelection']['fitIds'])==1
    page.get_by_role('tab',name='规格',exact=True).click();page.locator('.pc-detail-workbench').filter(has_text='165/S').wait_for();page.get_by_role('tab',name='图片',exact=True).click();page.locator('.pc-arco-photo-preview').first.wait_for();page.locator('.pc-arco-photo-preview').first.click()
    page.wait_for_function("[...document.images].some(i=>i.complete&&i.naturalWidth===8)");page.wait_for_load_state('networkidle');assert any(data==image for _,data,_ in delivered_media), 'original image bytes must be delivered by the actual service'
    shot('PRODUCT-ENTRY-SAVE','saved-image');item['step']='list and fresh edit reopen';page.goto(origin+'/#products');row=page.locator('.pc-data-table tbody tr').filter(has_text='SYN-DRIVER-ENTRY');row.wait_for();assert 'SYN DRIVER 商品' in row.inner_text();row.get_by_role('button',name='编辑',exact=True).click();page.wait_for_function("document.querySelector('input[aria-label=商品名称]')?.value==='SYN DRIVER 商品'")
    page.get_by_role('tab',name='条码',exact=True).click();page.wait_for_function("document.querySelectorAll('.pc-barcode-table tbody tr').length===11");page.get_by_role('tab',name='图片',exact=True).click();page.locator('.pc-arco-photo-preview').first.wait_for()
    details=[x['body'] for x in result['readResponses'] if x['path']=='/api/products/maintenance/v2/detail/query' and x['status']==200 and x['body']];assert details and len(details[-1]['skus'])==11 and len(details[-1]['barcodes'])==11
    assert len([x for x in result['readResponses'] if x['path']=='/api/products/v2/commands'])==1
    shot('PRODUCT-ENTRY-SAVE','reopened');item['actual']={'productId':product_id,'version':details[-1]['version'],'skus':11,'barcodes':11,'originalImageBytes':len(image),'saveCalls':1}
   run('PRODUCT-ENTRY-SAVE',service_product)
  else:
   target='00000000-0000-4000-8000-000000004000'
   page.goto(origin+'/#products/edit/'+target);page.get_by_label('商品名称',exact=True).wait_for();page.wait_for_function("document.querySelector('input[aria-label=商品名称]')?.value==='商务免烫衬衫'")
   page.evaluate("document.title='PRODUCT EDIT · 合成名称九价有限写 · 非PG'")
   def save_chain(item):
    page.get_by_label('商品名称',exact=True).fill('QA实际服务保存名称');page.get_by_role('tab',name='价格',exact=True).click();page.get_by_label('采购价',exact=True).fill('0.00');page.get_by_label('零售价',exact=True).fill('123.45');page.get_by_role('button',name='保存',exact=True).click();page.wait_for_url(origin+'/#products/view/'+target);page.locator('.pc-detail-workbench h1').filter(has_text='QA实际服务保存名称').wait_for();page.get_by_role('tab',name='价格',exact=True).click();page.locator('.pc-price-table tbody td').first.wait_for();page.wait_for_load_state('networkidle');values=page.locator('.pc-price-table tbody td').all_text_contents();assert values[:3]==['0.00','123.45','—'];shot('PRODUCT-EDIT-LIFECYCLE','readonly-prices')
    writes=[r for r in result['readResponses'] if r['path']=='/api/products/v2/commands'];assert len(writes)==1 and writes[0]['status']==200 and writes[0]['body']['version']==2
    page.locator('.sidebar a[data-route="products"]').click();row=page.locator('.pc-data-table tbody tr').filter(has_text='M26001');row.wait_for();page.wait_for_load_state('networkidle');assert 'QA实际服务保存名称' in row.inner_text() and '123.45' in row.inner_text();shot('PRODUCT-EDIT-LIFECYCLE','list');row.get_by_role('button',name='编辑',exact=True).click();page.wait_for_function("document.querySelector('input[aria-label=商品名称]')?.value==='QA实际服务保存名称'");page.get_by_role('tab',name='价格',exact=True).click();assert page.get_by_label('采购价',exact=True).input_value()=='0.00';assert page.get_by_label('零售价',exact=True).input_value()=='123.45';shot('PRODUCT-EDIT-LIFECYCLE','reopen');item['actual']={'version':2,'readonlyPrices':values,'command':writes[0]['request']}
   run('PRODUCT-EDIT-LIFECYCLE',save_chain)
  result['errors']=errors;result['status']='FAIL' if errors or any(x['status']=='FAIL' for x in result['cases']) else 'PASS_LISTED_CASE_STEPS'
  if args.keep_open:
   if not args.headed:raise ValueError('--keep-open requires --headed')
   page.bring_to_front();keep_visible(page,tick=lambda:(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)))
  browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error)
finally:
 if browser:browser.close()
 if bridge:
  bridge.stdin.close()
  try:bridge.wait(timeout=5)
  except subprocess.TimeoutExpired:bridge.terminate();bridge.wait(timeout=5)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS_LISTED_CASE_STEPS' else 1)
