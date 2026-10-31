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
  page.evaluate("title=>document.title=title",'测试 '+manifest['sourceCheckpoint']+' · 商品控件合成只读')
  result['checks']=[]
  result['cases']=[]
  def shot(case,name):
   page.screenshot(path=str(out/(case+'-'+name+'.png')),full_page=True,animations='disabled');(out/(case+'-'+name+'.txt')).write_text(page.locator('#page').inner_text())
  def run(case,fn):
   if args.case and case not in args.case:return
   item={'caseId':case,'sourceCheckpoint':manifest['sourceCheckpoint'],'status':'RUNNING'};result['cases'].append(item)
   try:fn(item);item['status']=item.get('finalStatus','PASS_LISTED_STEPS')
   except Exception as e:
    import traceback
    item.update(status='FAIL',reason=str(e),traceback=traceback.format_exc());shot(case,'failure')
   (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  target='00000000-0000-4000-8000-000000004000'
  page.goto(origin+'/#products/edit/'+target);page.get_by_label('商品名称',exact=True).wait_for();page.wait_for_function("document.querySelector('input[aria-label=商品名称]')?.value==='商务免烫衬衫'")
  def basics(item):
   item['controls']=[]
   for suffix,label,kind in [('category','商品分类','categories'),('year','年份','years'),('season','季节','seasons'),('supplier','供应商','suppliers'),('thickness','厚薄','thicknesses'),('shape','领型 / 裤型','collar-pants-types')]:
    host=page.locator('#pc-detail-'+suffix);before=host.locator('input').evaluate_all('(els)=>els.map(e=>e.value)');host.locator('.arco-cascader-view' if suffix=='category' else '.arco-select-view').click()
    page.wait_for_timeout(350);page.wait_for_load_state('networkidle')
    candidates=host.locator('.arco-cascader-list-item' if suffix=='category' else '.arco-select-option');record={'kind':kind,'before':before,'options':candidates.all_text_contents()};item['controls'].append(record);shot('RECHECK-P02-CONTROLS',suffix)
    if kind=='collar-pants-types':
     assert host.get_by_role('button',name='读取失败，重试',exact=True).is_visible();host.get_by_role('button',name='读取失败，重试',exact=True).click();page.wait_for_timeout(200);record['boundary']='已声明fixture501，实际错误和重试保留；非成功候选通过'
    elif candidates.count():
     expected=candidates.first.inner_text();candidates.first.click();page.locator('h1').click();record['expectedSelected']=expected;record['selected']=host.locator('input').evaluate_all('(els)=>els.map(e=>e.value)');record['visibleSelected']=host.locator('.arco-select-view-value,.arco-cascader-view,.arco-tag-content').all_text_contents();assert any(expected in value for value in record['selected']+record['visibleSelected']), record;record['actual']='实际选候选后外部关闭，文本保留'
    else:
     record['boundary']='已声明合成属性无值，空候选非有值选择通过'
    page.locator('h1').click()
   item['actual']='六控件逐一实际开合；基础缺省厚薄无值/领型501分别记录';item['finalStatus']='PARTIAL';item['remaining']='新增态与领型/厚薄有效数据选择待补，不将fixture缺数据冒业务失败'
  run('RECHECK-P02-CONTROLS',basics)
  def fits(item):
   page.get_by_role('tab',name='规格',exact=True).click();page.wait_for_load_state('networkidle');page.locator('.pc-spec-stack').get_by_text('Y版（修身）',exact=True).wait_for();before=page.locator('.pc-spec-stack').inner_text();page.get_by_role('button',name='编辑版型',exact=True).click();dialog=page.get_by_role('dialog');dialog.locator('.arco-transfer').wait_for();search=dialog.get_by_placeholder('搜索名称或编码',exact=True)
   with page.expect_response(lambda r:r.url.endswith('/products/maintenance/candidates/query') and json.loads(r.request.post_data or '{}').get('search')=='B'):
    search.fill('B')
   left=dialog.locator('.arco-transfer-view').first;right=dialog.locator('.arco-transfer-view').nth(1);left.get_by_text('B版（宽松）',exact=True).click();dialog.get_by_role('button',name='move selected right',exact=True).click();right.get_by_placeholder('搜索已选',exact=True).fill('B');assert right.locator('.arco-transfer-view-item').all_text_contents()==['B版（宽松）'];shot('RECHECK-P03-FITS','selected');right.get_by_text('B版（宽松）',exact=True).click();dialog.get_by_role('button',name='move selected left',exact=True).click();right.locator('.arco-transfer-view-item').wait_for(state='detached');dialog.get_by_role('button',name='取消',exact=True).click();item['before']=before;item['after']=page.locator('.pc-spec-stack').inner_text();assert item['after']==before
   assert page.locator('#pc-detail-group .arco-select').get_attribute('class').find('disabled')>=0;item['actual']='版型B搜索加入、已选侧编码搜索、移除、取消原规格保持；既有商品尺码组禁用保护';item['finalStatus']='PARTIAL';item['remaining']='新增版型取消未提供维护能力，不计通过；新商品尺码组切换待补'
  run('RECHECK-P03-FITS',fits)
  def stock(item):
   variant['stockFail']=True;page.get_by_role('tab',name='库存',exact=True).click();page.get_by_role('button',name='重试',exact=True).wait_for();shot('RECHECK-P07','first-failure');page.get_by_role('button',name='重试',exact=True).click();page.locator('.pc-stock-overview').wait_for();table=page.locator('.pc-stock-overview').inner_text();assert '总仓' in table;page.get_by_role('button',name='查看全部仓库',exact=True).click();page.get_by_role('button',name='仅看有库存',exact=True).wait_for();page.get_by_role('tab',name='基础资料',exact=True).click()
   with page.expect_response(lambda r:r.url.endswith('/products/stock-overview/query')):
    page.get_by_role('tab',name='库存',exact=True).click()
   page.locator('.pc-stock-overview').wait_for();assert page.get_by_role('button',name='仅看有库存',exact=True).is_visible();assert not page.locator('.pc-stock-overview input').count();shot('RECHECK-P07','retry-return');item['actual']='编辑库存首次500→点击重试成功→全部仓→切离重入刷新保留全部仓；只读无编辑输入'
  run('RECHECK-P07',stock)
  def newdraft(item):
   page.goto(origin+'/?case=new-draft#products/new');page.get_by_label('商品名称',exact=True).wait_for();page.get_by_label('款号',exact=True).fill('QA-DRAFT-ONLY');page.get_by_label('商品名称',exact=True).fill('合成未保存商品');item['choices']=[]
   for suffix,expected in [('category','T恤'),('year','2026'),('season','春季'),('supplier','示例供应商 · 华成服饰')]:
    host=page.locator('#pc-detail-'+suffix);host.locator('.arco-cascader-view' if suffix=='category' else '.arco-select-view').click();candidate=host.locator('.arco-cascader-list-item' if suffix=='category' else '.arco-select-option').filter(has_text=expected).first;candidate.wait_for();candidate.click();page.locator('h1').click();visible=host.locator('.arco-select-view-value,.arco-cascader-view,.arco-tag-content').all_text_contents();assert expected in visible;item['choices'].append({'field':suffix,'selected':visible})
   # Multi-select changes and dismissal must not collapse the existing selected season.
   seasons=page.locator('#pc-detail-season');seasons.locator('.arco-select-view').click();seasons.locator('.arco-select-option').filter(has_text='夏季').click();page.locator('h1').click();assert seasons.locator('.arco-tag-content').all_text_contents()==['春季','夏季']
   before={suffix:page.locator('#pc-detail-'+suffix).locator('.arco-select-view-value,.arco-cascader-view,.arco-tag-content').all_text_contents() for suffix in ['category','year','season','supplier']}
   page.get_by_role('tab',name='规格',exact=True).click();page.get_by_role('tab',name='基础资料',exact=True).click();assert page.get_by_label('款号',exact=True).input_value()=='QA-DRAFT-ONLY';assert page.get_by_label('商品名称',exact=True).input_value()=='合成未保存商品'
   assert before=={suffix:page.locator('#pc-detail-'+suffix).locator('.arco-select-view-value,.arco-cascader-view,.arco-tag-content').all_text_contents() for suffix in before}
   page.get_by_role('button',name='取消',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_role('button',name='继续编辑',exact=True).wait_for();shot('RECHECK-P02-NEW','discard-prompt');dialog.get_by_role('button',name='继续编辑',exact=True).click();dialog.wait_for(state='detached');page.get_by_role('button',name='取消',exact=True).click();page.get_by_role('dialog').wait_for();page.keyboard.press('Escape');page.get_by_role('dialog').wait_for(state='detached');assert page.get_by_label('款号',exact=True).input_value()=='QA-DRAFT-ONLY';assert page.get_by_label('商品名称',exact=True).input_value()=='合成未保存商品';shot('RECHECK-P02-NEW','retained');item['actual']='新增分类/年份/季节春夏/供应商选择、切页保留；取消→继续编辑与Esc均保留款号名称';item['finalStatus']='PARTIAL';item['remaining']='厚薄和领型仍仅缺数据/501边界，不计有效候选通过'
  run('RECHECK-P02-NEW',newdraft)
  def new_specs(item):
   page.goto(origin+'/?case=new-specs#products/new');page.get_by_label('商品名称',exact=True).wait_for();page.get_by_role('tab',name='规格',exact=True).click();before=page.locator('.pc-spec-stack').inner_text();page.get_by_role('button',name='编辑颜色',exact=True).click();dialog=page.get_by_role('dialog');search=dialog.get_by_placeholder('搜索名称或编码',exact=True)
   with page.expect_response(lambda r:r.url.endswith('/products/maintenance/candidates/query') and json.loads(r.request.post_data or '{}').get('search')=='001'):search.fill('001')
   left=dialog.locator('.arco-transfer-view').first;right=dialog.locator('.arco-transfer-view').nth(1);left.get_by_text('A',exact=True).click();dialog.get_by_role('button',name='move selected right',exact=True).click();right.get_by_text('A',exact=True).wait_for();right.get_by_text('A',exact=True).click();dialog.get_by_role('button',name='move selected left',exact=True).click();right.locator('.arco-transfer-view-item').wait_for(state='detached');dialog.get_by_role('button',name='取消',exact=True).click();dialog.wait_for(state='detached');assert page.locator('.pc-spec-stack').inner_text()==before
   group=page.locator('#pc-detail-group');item['groups']=[]
   for label,expected in [('男装上衣尺码','160/XS / 165/S'),('男装裤子尺码','29 / 30 / 31'),('配饰均码','无尺码 / 均码')]:
    group.locator('.arco-select-view').click();group.locator('.arco-select-option').filter(has_text=label).click();page.locator('h1').click();page.locator('.pc-spec-stack').get_by_text(re.compile(re.escape(expected))).wait_for();text=page.locator('.pc-spec-stack').inner_text();assert expected in text;item['groups'].append({'selected':label,'members':text})
   page.get_by_role('tab',name='基础资料',exact=True).click();page.get_by_role('tab',name='规格',exact=True).click();group.locator('.arco-select-view-value').get_by_text('配饰均码',exact=True).wait_for();page.locator('.pc-spec-stack').get_by_text('无尺码 / 均码',exact=True).wait_for();shot('RECHECK-P03-NEW','group-retained');item['actual']='颜色001搜索→加入A→移除→取消无原规格改变；新增尺码组上衣→裤子→配饰切换，每组成员按返回资料显示；切页保留配饰组';item['finalStatus']='PASS_LISTED_STEPS'
  run('RECHECK-P03-NEW',new_specs)
  result['errors']=errors;result['status']='FAIL' if errors or any(x['status']=='FAIL' for x in result['cases']) else 'PASS_LISTED_CASE_STEPS';browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error)
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS_LISTED_CASE_STEPS' else 1)
