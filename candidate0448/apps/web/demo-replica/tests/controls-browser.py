"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys, time, re
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('--staff-edit',action='store_true');p.add_argument('--keyboard-preview',action='store_true');p.add_argument('--draft-money',action='store_true');p.add_argument('--customer-recommendation',action='store_true');p.add_argument('--hall-confirm',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
build=Path(args.build).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
manifest=json.loads((build/'production-build.json').read_text());config=manifest['configuration'];origin=config['http']['origin'];base=config['assets']['basePath']
if origin!='https://synthetic-management.invalid':raise SystemExit('Smoke requires the declared synthetic-only build configuration')
allowed={x['path'] for x in manifest['outputs']};allowed.add('index.html')
result={'sourceCheckpoint':manifest['sourceCheckpoint'],'syntheticOnly':True,'status':'BLOCKED_ENV','checks':[],'screens':[],'requests':[],'categoryResponses':[]}
bridge=None;browser=None
try:
 from playwright.sync_api import sync_playwright
 with sync_playwright() as pw:
  try:browser=pw.chromium.launch(executable_path=args.chromium,headless=False,chromium_sandbox=True)
  except Exception as error:
   result['reason']=str(error);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('BLOCKED_ENV: Chromium could not start with its sandbox enabled');sys.exit(2)
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('production-browser-fixture.mjs'))]+(['--staff-edit'] if args.staff_edit else [])+(['--customer-recommendation'] if args.customer_recommendation else []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
  context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
  errors=[];page=context.new_page()
  def page_error(error):
   errors.append(str(error));print(json.dumps({'event':'pageerror','message':str(error)[:300]},ensure_ascii=False),flush=True)
  page.on('pageerror',page_error)
  def respond(route):
   request=route.request;url=urlsplit(request.url);request_origin=f'{url.scheme}://{url.netloc}'
   result['requests'].append({'method':request.method,'url':request.url,**({'query':json.loads(request.post_data)} if url.path in ['/api/inventory/query','/api/product-management/query'] and request.post_data else {})})
   if request_origin!=origin:route.abort();return
   if url.path.startswith('/api/'):
    bridge.stdin.write(json.dumps({'url':request.url,'method':request.method,'headers':request.headers,'body':request.post_data})+'\n');bridge.stdin.flush();response=json.loads(bridge.stdout.readline())
    if url.path in ['/api/inventory/query','/api/product-management/query'] and response['status']==200:
     payload=json.loads(response['body']);products=payload.get('products',payload.get('items',[]));result['categoryResponses'].append({'path':url.path,'products':[{'id':x['id'],'code':x['code'],'categoryLabel':x.get('categoryLabel'),'total':x.get('total',x.get('totalStock'))} for x in products]})
    event={'event':'api','method':request.method,'path':url.path,'status':response['status']}
    if response['status']>=400:
     try:
      failure=json.loads(response['body']).get('error');event['errorType']=failure.get('code') if isinstance(failure,dict) else str(failure)[:160]
     except Exception:event['errorType']='unparsed synthetic response'
    print(json.dumps(event,ensure_ascii=False),flush=True);route.fulfill(status=response['status'],headers=response['headers'],body=response['body']);return
   relative='index.html' if url.path=='/' else unquote(url.path[len(base):]) if url.path.startswith(base) else ''
   if relative not in allowed:route.fulfill(status=404,body='Not in fixed build manifest');return
   filename=build/relative;mime=mimetypes.guess_type(filename)[0] or 'application/octet-stream'
   if relative.endswith('.js'):mime='application/javascript'
   route.fulfill(status=200,content_type=mime,body=filename.read_bytes())
  context.route('**/*',respond)
  page.goto(origin+'/#inventory');page.locator('.basic-account button').first.wait_for();page.locator('#page .iw-workbench, #page .iw-query').first.wait_for()
  page.bring_to_front();page.evaluate('(sha)=>document.title="候选 "+sha.slice(0,8)+" · 持续事件泵 · 合成只读"',manifest['sourceCheckpoint'])
  observations=[]
  def category_roundtrip(label,category,path):
   page.locator('.arco-tree-node-title').get_by_text('T恤',exact=True).click();page.keyboard.press('Escape');page.get_by_role('button',name='查询',exact=True).click();page.wait_for_load_state('networkidle')
   query=next(r['query'] for r in reversed(result['requests']) if urlsplit(r['url']).path==path);selected=query['filter'].get('categoryIds',query['filter'].get('categories'));assert len(selected)==1,query
   assert 'T恤' in category.inner_text();inspect(label+'-tshirt-queried')
   category.click();page.locator('.arco-tree-node-title').get_by_text('全部分类',exact=True).click();page.keyboard.press('Escape');page.get_by_role('button',name='查询',exact=True).click();page.wait_for_load_state('networkidle')
   query=next(r['query'] for r in reversed(result['requests']) if urlsplit(r['url']).path==path);selected=query['filter'].get('categoryIds',query['filter'].get('categories'));assert selected==[],query
   inspect(label+'-all-queried');assert len(result['categoryResponses'][-1]['products'])==6
   category.click();category.locator('input').fill('衬衫');page.locator('.arco-tree-node-title').get_by_text('衬衫',exact=True).wait_for();page.locator('.arco-tree-node-title').get_by_text('衬衫',exact=True).click();page.keyboard.press('Escape');page.get_by_role('button',name='查询',exact=True).click();page.wait_for_load_state('networkidle')
   products=result['categoryResponses'][-1]['products'];assert {x['code'] for x in products}=={'M26001','QA-W01','QA-K01'},products;assert all(x['categoryLabel']=='衬衫' for x in products);assert all(int(x['total']['knownQuantity'] if isinstance(x['total'],dict) else x['total'])>0 for x in products);inspect(label+'-shirts-nonzero-queried')
   for code in ['M26001','QA-W01','QA-K01']:assert page.locator('#page').get_by_text(code,exact=False).count()>0
   assert page.locator('#page').get_by_text('M26004',exact=False).count()==0
   category.click();page.locator('.arco-tree-node-title').get_by_text('全部分类',exact=True).click();page.keyboard.press('Escape');page.get_by_role('button',name='查询',exact=True).click();page.wait_for_load_state('networkidle');assert len(result['categoryResponses'][-1]['products'])==6
   observations.append({'label':label+'-all-child-all','tags':[],'inputs':[],'oneSelectedThenAll':True})
  def inspect(label):
   tags=page.locator('.arco-input-tag-tag').evaluate_all("nodes=>nodes.map(n=>({text:n.textContent,background:getComputedStyle(n).backgroundColor,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,display:getComputedStyle(n).display}))")
   inputs=page.locator('.arco-tree-select-view input,.arco-select-view input').evaluate_all("nodes=>nodes.map(n=>({background:getComputedStyle(n).backgroundColor,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))")
   observations.append({'label':label,'tags':tags,'inputs':inputs});page.screenshot(path=str(out/(label+'.png')),full_page=True)
  if not args.customer_recommendation:
   page.get_by_role('button',name='查询',exact=True).click();page.locator('#iw-results tbody tr[data-inventory-product]').first.wait_for(timeout=15000)
   if args.keyboard_preview:
    search=page.get_by_placeholder('商品款号 / 名称 / 系统货号',exact=True);search.fill('M26');page.locator('.inv-option-code').nth(1).wait_for();page.wait_for_load_state('networkidle')
    first=page.locator('.inv-option-code').first.inner_text();search.press('ArrowDown');page.wait_for_timeout(150);page.wait_for_load_state('networkidle')
    active=page.locator('.arco-select-option-hover .inv-option-code').inner_text();assert active!=first,(first,active);page.screenshot(path=str(out/'inventory-keyboard-preview-down.png'),full_page=True)
    assert active in page.locator('.inv-preview-info').inner_text(),{'active':active,'preview':page.locator('.inv-preview-info').inner_text()}
    search.press('ArrowUp');page.wait_for_timeout(150);page.wait_for_load_state('networkidle');assert first in page.locator('.inv-preview-info').inner_text();search.press('Escape');search.fill('');observations.append({'label':'keyboard-active-product-preview','tags':[],'inputs':[]})
   category=page.locator('.arco-tree-select').filter(has=page.locator('input')).first
   category.click();page.wait_for_load_state('networkidle');page.wait_for_timeout(300);inspect('inventory-category-open');category_roundtrip('inventory',category,'/api/inventory/query')
   page.locator('.sidebar a[data-route="products"]').click();page.locator('#page .pc-products').wait_for();page.wait_for_load_state('networkidle')
   category=page.locator('.arco-tree-select').first;category.click();page.wait_for_load_state('networkidle');page.wait_for_timeout(300);inspect('product-category-open');category_roundtrip('product',category,'/api/product-management/query')
   page.locator('.sidebar a[data-route="settings/staff"]').click();page.locator('#page .bs-page').wait_for();page.wait_for_load_state('networkidle');inspect('staff-closed')
   controls=page.locator('.bs-filter .arco-select-view')
   for index in range(controls.count()):
    control=controls.nth(index);control.click();page.wait_for_timeout(150);inspect('staff-control-'+str(index));page.keyboard.press('Escape')
   if args.staff_edit:
    row=page.locator('.bs-page tbody tr').filter(has_text='测试仓库员');row.get_by_role('button',name='编辑',exact=True).click();modal=page.locator('.bs-modal');modal.wait_for()
    modal.get_by_role('textbox',name='姓名',exact=True).fill('测试仓库员 前台已编辑');modal.get_by_role('textbox',name='联系方式',exact=True).fill('合成联系方式-浏览器');page.screenshot(path=str(out/'staff-edit-before-save.png'),full_page=True)
    modal.get_by_role('button',name='确定',exact=True).click();modal.wait_for(state='detached',timeout=15000);page.locator('.bs-page tbody tr').filter(has_text='测试仓库员 前台已编辑').wait_for();page.screenshot(path=str(out/'staff-edit-saved.png'),full_page=True)
    page.locator('.bs-page tbody tr').filter(has_text='测试仓库员 前台已编辑').get_by_role('button',name='编辑',exact=True).click();modal.wait_for();assert modal.get_by_role('textbox',name='联系方式',exact=True).input_value()=='合成联系方式-浏览器';modal.get_by_role('button',name='取消',exact=True).click();modal.wait_for(state='detached')
    observations.append({'label':'staff-real-service-basic-edit-readback','tags':[],'inputs':[],'nameAndContactReadback':True})
   for route_name,table in [('sales','#sale-list-scroll tbody tr'),('transfer','#page .tc-list-scroll tbody tr')]:
    page.locator(f'.sidebar a[data-route="{route_name}"]').click();page.locator(table).first.wait_for(timeout=15000);page.locator(table).first.locator('button').first.click();page.locator('button[data-document-product]').first.wait_for(timeout=15000)
    anchor=page.locator('button[data-document-product]').first;before=page.url;tabs=len(context.pages);anchor.click();page.locator('.pc-product-drawer').wait_for(timeout=15000);page.wait_for_load_state('networkidle');page.screenshot(path=str(out/(route_name+'-product-drawer.png')),full_page=True)
    assert page.url==before and len(context.pages)==tabs
    for label in ['规格','图片','基础资料']:
     tab=page.locator('.pc-product-drawer').get_by_role('tab',name=label,exact=True)
     if tab.count():tab.click();page.wait_for_load_state('networkidle')
    page.locator('.arco-drawer-close-icon').click();page.locator('.pc-product-drawer').wait_for(state='detached',timeout=15000);assert page.url==before and len(context.pages)==tabs;assert anchor.evaluate('el=>document.activeElement===el')
    observations.append({'label':route_name+'-same-page-product','sameRoute':True,'noNewTab':True,'focusRestored':True,'tags':[],'inputs':[]})
   page.evaluate("location.hash='products/view/not-a-uuid'");page.get_by_text('商品链接无效，请返回商品列表。',exact=False).wait_for();page.get_by_role('button',name='返回商品列表',exact=True).click();page.locator('#page .pc-products').wait_for();observations.append({'label':'invalid-product-route-recovered','tags':[],'inputs':[]})
  if args.customer_recommendation:
   page.locator('.sidebar a[data-route="sales/new"]').click();page.get_by_role('textbox',name='整单优惠 / 抹零',exact=True).wait_for()
   for hall_name,customer_name in [('网点营业厅','零售客户'),('推荐测试二厅','具名客户（演示）')]:
    if hall_name=='推荐测试二厅' and not args.hall_confirm:
     salesperson=page.get_by_role('combobox',name='营业员',exact=True);salesperson.hover();salesperson.locator('.arco-select-clear-icon').click()
    page.get_by_role('combobox',name='营业厅',exact=True).click();page.get_by_role('option',name=hall_name,exact=True).click();page.wait_for_load_state('networkidle')
    if hall_name=='推荐测试二厅' and args.hall_confirm:
     dialog=page.get_by_role('dialog',name='切换营业厅',exact=True);dialog.wait_for();dialog.get_by_role('button',name='取消',exact=True).click();assert '网点营业厅' in page.get_by_role('combobox',name='营业厅',exact=True).inner_text();assert '测试管理员' in page.get_by_role('combobox',name='营业员',exact=True).inner_text()
     page.get_by_role('combobox',name='营业厅',exact=True).click();page.get_by_role('option',name=hall_name,exact=True).click();dialog.wait_for();page.screenshot(path=str(out/'hall-confirm-before.png'),full_page=True);dialog.get_by_role('button',name='确定',exact=True).click();dialog.wait_for(state='detached');page.wait_for_load_state('networkidle');assert hall_name in page.get_by_role('combobox',name='营业厅',exact=True).inner_text()
    customer=page.get_by_role('combobox',name='客户',exact=True);customer.click();page.get_by_text('推荐客户',exact=True).wait_for();page.wait_for_load_state('networkidle')
    assert page.locator('.arco-select-group-title').filter(has_text='推荐客户').count()==1
    page.screenshot(path=str(out/'customer-current-before-assert.png'),full_page=True);assert page.get_by_role('option').first.inner_text()==customer_name,{'hall':hall_name,'options':page.get_by_role('option').all_inner_texts()}
    page.screenshot(path=str(out/('customer-'+('first' if hall_name=='网点营业厅' else 'second')+'-hall.png')),full_page=True)
    page.keyboard.press('Escape');assert customer.locator('input').input_value()=='';assert customer.locator('.ui-single-tag').count()==0
   observations.append({'label':'customer-real-hall-default-no-auto-select','tags':[],'inputs':[]})
  if args.draft_money:
   page.locator('.sidebar a[data-route="sales/new"]').click();discount=page.get_by_role('textbox',name='整单优惠 / 抹零',exact=True);discount.wait_for();discount.fill('10');assert discount.input_value()=='10';page.locator('#page h1').click();assert discount.input_value()=='-10.00';page.screenshot(path=str(out/'sales-discount-blurred.png'),full_page=True)
   discount.fill('10.');page.locator('#page h1').click();assert discount.input_value()=='10.';observations.append({'label':'sales-discount-exact-blur-invalid-retained','tags':[],'inputs':[]})
  result['observations']=observations;result['errors']=errors;result['emptyVisibleTags']=[{'label':row['label'],'tag':tag} for row in observations for tag in row['tags'] if not tag['text'].strip() and tag['width']>0 and tag['display']!='none'];result['status']='FAIL_EMPTY_TAG' if result['emptyVisibleTags'] else 'FAIL_PAGE_ERROR' if errors else 'PASS'
  browser.close();browser=None
  (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'status':result['status'],'emptyVisibleTags':result['emptyVisibleTags'],'errors':errors},ensure_ascii=False),flush=True)
  if result['status']!='PASS':raise AssertionError(result['status'])
except KeyboardInterrupt:
 raise
except Exception as error:
 result['status']='FAIL';result['reason']=str(error);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));raise
finally:
 # sync_playwright context owns browser teardown, including failed assertions.
 if bridge: bridge.terminate(); bridge.wait(timeout=5)
