from visible_wait import keep_visible
# Recovery of bounded real-artifact smoke; not original lost test source bytes.
"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
build=Path(args.build).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
manifest=json.loads((build/'production-build.json').read_text());config=manifest['configuration'];origin=config['http']['origin'];base=config['assets']['basePath']
if origin!='https://synthetic-management.invalid':raise SystemExit('Smoke requires the declared synthetic-only build configuration')
allowed={x['path'] for x in manifest['outputs']};allowed.add('index.html')
result={'sourceCheckpoint':manifest['sourceCheckpoint'],'syntheticOnly':True,'status':'BLOCKED_ENV','checks':[],'screens':[],'requests':[]}
bridge=None;browser=None
try:
 from playwright.sync_api import sync_playwright
 with sync_playwright() as pw:
  try:browser=pw.chromium.launch(executable_path=args.chromium,headless=not args.headed,chromium_sandbox=True)
  except Exception as error:
   result['reason']=str(error);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('BLOCKED_ENV: Chromium could not start with its sandbox enabled');sys.exit(2)
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('production-browser-fixture.mjs'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
  context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
  errors=[];page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
  def respond(route):
   request=route.request;url=urlsplit(request.url);request_origin=f'{url.scheme}://{url.netloc}'
   result['requests'].append({'method':request.method,'url':request.url})
   if request_origin!=origin:route.abort();return
   if url.path.startswith('/api/'):
    bridge.stdin.write(json.dumps({'url':request.url,'method':request.method,'headers':request.headers,'body':request.post_data})+'\n');bridge.stdin.flush();response=json.loads(bridge.stdout.readline());route.fulfill(status=response['status'],headers=response['headers'],body=response['body']);return
   relative='index.html' if url.path=='/' else unquote(url.path[len(base):]) if url.path.startswith(base) else ''
   if relative not in allowed:route.fulfill(status=404,body='Not in fixed build manifest');return
   filename=build/relative;mime=mimetypes.guess_type(filename)[0] or 'application/octet-stream'
   if relative.endswith('.js'):mime='application/javascript'
   route.fulfill(status=200,content_type=mime,body=filename.read_bytes())
  context.route('**/*',respond)
  try:
   page.bring_to_front();page.goto(origin+'/#inventory');page.locator('#page .iw-query').wait_for();page.wait_for_load_state('networkidle')
   page.evaluate("document.title='ERP恢复候选 · 实际前台测试 · 合成只读'")
   scenes=[('inventory','#page .iw-query'),('products','#page .pc-products'),('sales','#page [data-document-list="sales"]'),('transfer','#page .tc-workbench'),('product-settings','#page .pc-workbench'),('settings/stores','#page .bs-page')]
   for width in [1440,900]:
    page.set_viewport_size({'width':width,'height':1000})
    for name,selector in scenes:
     page.locator(f'.sidebar a[data-route="{name}"]').click();page.locator(selector).wait_for();page.wait_for_load_state('networkidle');page.evaluate('document.fonts.ready')
     if name in ['sales','transfer']:assert not page.evaluate("document.body.classList.contains('pc-mode')")
     label=f'{width}-{name.replace("/","-")}';page.screenshot(path=str(out/(label+'.png')),full_page=True,animations='disabled');result['screens'].append(label)
     styles=page.locator('#page').evaluate("el=>[el,...el.querySelectorAll('h1,table,th,td,input,button,.table-scroll,.pc-filter-row,.iw-pagination')].slice(0,250).map(n=>({tag:n.tagName,id:n.id,classes:n.className,text:(n.textContent||'').slice(0,80),rect:n.getBoundingClientRect().toJSON(),style:Object.fromEntries(['display','position','fontSize','lineHeight','color','backgroundColor','borderRadius','padding'].map(k=>[k,getComputedStyle(n)[k]]))}))")
     (out/(label+'.json')).write_text(json.dumps(styles,ensure_ascii=False,indent=2))
   result['checks'].append('six real production routes at 1440/900 with screenshots/computed styles; no product mode leakage into document lists')
   page.locator('.sidebar a[data-route="sales/new"]').click();note=page.get_by_label('备注',exact=True);note.wait_for();note.fill('SYNTHETIC draft survives cancelled navigation');page.screenshot(path=str(out/'900-sales-new.png'),full_page=True,animations='disabled')
   page.locator('.sidebar a[data-route="products"]').click();page.get_by_role('button',name='继续编辑',exact=True).wait_for();page.screenshot(path=str(out/'900-sales-leave-confirmation.png'),full_page=True,animations='disabled');page.get_by_role('button',name='继续编辑',exact=True).click();assert note.input_value()=='SYNTHETIC draft survives cancelled navigation'
   page.locator('.sidebar a[data-route="products"]').click();page.get_by_role('button',name='放弃修改并离开',exact=True).click();page.locator('#page .pc-products').wait_for();result['checks'].append('cancel preserves actual draft; explicit discard leaves without a business write');result['screens']+=['900-sales-new','900-sales-leave-confirmation']
   # Document 查看 must reuse inventory's read-only three-tab drawer, never a new page.
   opened_pages=[];context.on('page',lambda opened:opened_pages.append(opened))
   document_snapshot="el=>({text:el.innerText,values:[...el.querySelectorAll('input,textarea,select')].map(n=>n.value),top:el.scrollTop,left:el.scrollLeft})"
   for route_name,list_selector,lines_selector in [('sales','#sale-list-scroll','#sale-lines'),('transfer','#page .tc-list-scroll','#tc-lines')]:
    page.locator(f'.sidebar a[data-route="{route_name}"]').click();page.locator(list_selector).get_by_role('button',name='查看',exact=True).first.click()
    anchor=page.locator(lines_selector+' [data-document-product]').first;anchor.wait_for();anchor.scroll_into_view_if_needed();owner=page.locator(lines_selector).element_handle();parent_url=page.url;page_count=len(context.pages);before=owner.evaluate(document_snapshot)
    anchor.click();drawer=page.locator('.pc-product-drawer');drawer.wait_for();drawer.locator('.pc-base-grid').wait_for();page.wait_for_load_state('networkidle')
    assert page.url==parent_url and len(context.pages)==page_count and not opened_pages
    assert owner.evaluate('(el,selector)=>el.isConnected&&el===document.querySelector(selector)',lines_selector)
    assert drawer.get_by_role('tab').all_text_contents()==['基础资料','规格','图片']
    assert drawer.locator('.pc-base-grid .field').count()==9 and '只读' in drawer.locator('.pc-product-drawer-title').inner_text()
    assert drawer.locator('input,textarea,select').count()==0
    for tab_name,body_selector,key in [('基础资料','.pc-base-grid','base'),('规格','.pc-spec-stack','specs'),('图片','.pc-arco-photos','images')]:
     tab=drawer.get_by_role('tab',name=tab_name,exact=True);tab.click();drawer.locator(body_selector).wait_for();page.wait_for_load_state('networkidle');assert tab.get_attribute('aria-selected')=='true'
     assert page.url==parent_url and len(context.pages)==page_count and not opened_pages
     label=f'document-{route_name}-product-{key}';page.screenshot(path=str(out/(label+'.png')),full_page=True,animations='disabled');result['screens'].append(label)
    drawer.locator('.arco-drawer-close-icon').click();drawer.wait_for(state='detached')
    assert page.url==parent_url and len(context.pages)==page_count and not opened_pages
    assert owner.evaluate('(el,selector)=>el.isConnected&&el===document.querySelector(selector)',lines_selector)
    assert owner.evaluate(document_snapshot)==before and anchor.evaluate('el=>document.activeElement===el')
    result['checks'].append(route_name+' product 查看: inventory three-tab read-only drawer; every tab clicked; no new page/route; owner, values, viewport and focus preserved')
   assert not errors,errors
   assert all('/api/' not in q['url'] or q['method']=='GET' and q['url'].endswith('/auth/session') or q['method']=='POST' and q['url'].endswith('/query') for q in result['requests'])
   result['checks'].append('all API requests confined to synthetic session/query; no business write attempt');result['status']='PASS'
  except Exception as error:
   result['status']='FAIL';result['reason']=str(error)
   try:
    live=context.pages[-1];live.bring_to_front();live.screenshot(path=str(out/'failure-live.png'),full_page=True);(out/'failure-live.html').write_text(live.content())
   except Exception as capture_error:result['captureError']=str(capture_error)
  (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'status':result['status'],'checks':result['checks'],'reason':result.get('reason')},ensure_ascii=False),flush=True)
  if args.headed and args.keep_open:
   print('Actual test page remains visible; result is saved. Press Enter to close.',flush=True)
   keep_visible(page)
  browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error);print('FAIL:',error,flush=True)
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS' else 1)
