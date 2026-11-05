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
   result['requests'].append({'method':request.method,'url':request.url,'body':request.post_data})
   if request_origin!=origin:route.abort();return
   if url.path.startswith('/api/'):
    bridge.stdin.write(json.dumps({'url':request.url,'method':request.method,'headers':request.headers,'body':request.post_data})+'\n');bridge.stdin.flush();response=json.loads(bridge.stdout.readline());route.fulfill(status=response['status'],headers=response['headers'],body=response['body']);return
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
  page.get_by_role('button',name='查询',exact=True).click()
  samples=[]
  for index in range(20):
   samples.append(page.locator('#iw-results').evaluate("el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,rows:[...el.querySelectorAll('tbody tr')].map(n=>({product:n.dataset.inventoryProduct||null,rect:n.getBoundingClientRect().toJSON(),hidden:n.closest('[aria-hidden]')!==null})),status:[...el.querySelectorAll('[role=status]')].map(n=>n.textContent)})"))
   page.wait_for_timeout(100)
  (out/'inventory-samples.json').write_text(json.dumps(samples,ensure_ascii=False,indent=2))
  page.screenshot(path=str(out/'inventory-query.png'),full_page=True)
  (out/'resize-events.json').write_text(json.dumps(page.evaluate('window.__geometryEvents'),ensure_ascii=False,indent=2))
  events=[e for batch in page.evaluate('window.__geometryEvents') for e in batch if e['id']=='iw-results']
  result['checks'].append({'name':'inventory-no-measurement-feedback-loop','pass':len(events)<12,'resizeEvents':len(events)})
  final=samples[-1];visible=[r for r in final['rows'] if r['product'] and not r['hidden']]
  result['checks'].append({'name':'inventory-visible-viewport-filled','pass':len(visible)>=10,'visibleRows':len(visible),'viewportHeight':final['height']})
  def stable_inventory(label):
   page.wait_for_timeout(400)
   start=len(page.evaluate('window.__geometryEvents'))
   page.wait_for_timeout(600)
   events=page.evaluate('window.__geometryEvents')[start:]
   count=sum(e['id']=='iw-results' for batch in events for e in batch)
   state=page.locator('#iw-results').evaluate("el=>({hosts:el.querySelectorAll('[data-inventory-windowed]').length,probes:el.querySelectorAll('[data-probe-section]').length,status:[...el.querySelectorAll('[role=status]')].map(n=>n.textContent),rows:el.querySelectorAll('[data-inventory-windowed] tr[data-inventory-product]').length,scrollTop:el.scrollTop,scrollLeft:el.scrollLeft})")
   result['checks'].append({'name':label,'pass':count==0 and state['hosts']==1 and state['probes']==0 and not state['status'] and state['rows']>0,'state':state,'lateResizeEvents':count})
   page.screenshot(path=str(out/(label+'.png')),full_page=True)
  for width in [900,1440]:
   page.set_viewport_size({'width':width,'height':1000});stable_inventory('inventory-resize-'+str(width))
   box=page.locator('#iw-results');box.evaluate('el=>el.scrollTo({left:el.scrollWidth,top:600})');stable_inventory('inventory-scroll-'+str(width))
   geometry=box.evaluate("el=>{const row=el.querySelector('[data-inventory-windowed] tr[data-inventory-product]');return ['.mx-product','.mx-color','.mx-warehouse','.mx-total-cell','.ui-action-cell'].map(s=>({selector:s,rect:row.querySelector(s).getBoundingClientRect().toJSON()}));}")
   (out/('inventory-sticky-'+str(width)+'.json')).write_text(json.dumps(geometry,indent=2))
   result['checks'].append({'name':'inventory-fixed-columns-'+str(width),'pass':all(abs(v['rect']['width']-expected)<2 for v,expected in zip(geometry,[300,116,152,76,70]))})
   box.evaluate('el=>el.scrollTo({left:0,top:0})')
  page.get_by_role('button',name='显示设置',exact=True).click();page.get_by_label('供应商',exact=True).check();page.get_by_label('颜色小计',exact=True).check();page.get_by_role('button',name='关闭',exact=True).click();stable_inventory('inventory-display-settings')
  page.get_by_role('button',name='刷新',exact=True).click();stable_inventory('inventory-refresh')
  page.get_by_role('button',name='重置',exact=True).click();stable_inventory('inventory-reset')
  for route_name in ['sales','transfer']:
   page.locator(f'.sidebar a[data-route="{route_name}"]').click();page.locator('#page .tc-list-scroll tbody tr').first.wait_for();page.wait_for_load_state('networkidle')
   tags=page.locator('#page .tc-state-tag').evaluate_all("els=>els.map(n=>({text:n.textContent,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor}))")
   (out/(route_name+'-tags.json')).write_text(json.dumps(tags,ensure_ascii=False,indent=2))
   expected={'未审核':('rgb(135, 90, 18)','rgb(255, 244, 222)'),'已审核':('rgb(36, 116, 71)','rgb(234, 247, 239)')}
   # Tokens are extracted from the frozen Demo palette; backgrounds must not stay neutral.
   for label,(color,background) in expected.items():
    found=[t for t in tags if t['text']==label]
    result['checks'].append({'name':route_name+'-'+label+'-tone','pass':bool(found) and all(t['color']==color and t['background']==background for t in found),'observed':found[:1]})
   page.screenshot(path=str(out/(route_name+'-list.png')),full_page=True)
   before=page.locator('#page .tc-list-scroll tbody tr').first.inner_text()
   page.get_by_role('button',name='下一页',exact=True).click();page.wait_for_load_state('networkidle')
   page.wait_for_function("before=>document.querySelector('#page .tc-list-scroll tbody tr')?.innerText!==before",arg=before)
   page.screenshot(path=str(out/(route_name+'-page2.png')),full_page=True)
   after=page.locator('#page .tc-list-scroll tbody tr').first.inner_text()
   result['checks'].append({'name':route_name+'-actual-next-page','pass':before!=after and page.locator('#page [role=alert]').count()==0,'before':before,'after':after,'alerts':page.locator('#page [role=alert]').all_text_contents()})
   page.locator('.sidebar a[data-route="products"]').click();page.locator('#page .pc-products').wait_for()
   page.locator(f'.sidebar a[data-route="{route_name}"]').click();page.locator('#page .tc-list-scroll tbody tr').first.wait_for();page.wait_for_load_state('networkidle')
   result['checks'].append({'name':route_name+'-return-retains-page','pass':page.locator('#page .tc-list-scroll tbody tr').first.inner_text()==after})

  result['errors']=errors;result['status']='PASS' if all(c['pass'] for c in result['checks']) and not errors else 'FAIL'
  (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result['checks'],ensure_ascii=False),flush=True)
  if args.keep_open:
   print('Result saved; actual failing or passing page remains visible. Press Enter to close.',flush=True)
   keep_visible(page)
  browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error);print('FAIL:',error,flush=True)
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS' else 1)
