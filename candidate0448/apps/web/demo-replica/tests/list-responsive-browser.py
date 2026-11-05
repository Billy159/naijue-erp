from visible_wait import keep_visible
# Recovery of bounded real-artifact smoke; not original lost test source bytes.
"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('--category-overflow',action='store_true');p.add_argument('--headed',action='store_true');p.add_argument('--keep-open',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
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
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('production-browser-fixture.mjs'))]+(['--category-overflow'] if args.category_overflow else []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
  context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
  errors=[];page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
  detail_mode={'next':None,'versionDelta':0}
  def respond(route):
   request=route.request;url=urlsplit(request.url);request_origin=f'{url.scheme}://{url.netloc}'
   result['requests'].append({'method':request.method,'url':request.url,'body':request.post_data})
   if request_origin!=origin:route.abort();return
   if url.path.startswith('/api/'):
    mode=detail_mode['next'] if url.path=='/api/transfers/detail/query' else None
    if mode:detail_mode['next']=None
    if mode=='fail':route.fulfill(status=503,content_type='application/json',body='{"error":{"code":"SYNTHETIC_READ_UNAVAILABLE"}}');return
    bridge.stdin.write(json.dumps({'url':request.url,'method':request.method,'headers':request.headers,'body':request.post_data})+'\n');bridge.stdin.flush();response=json.loads(bridge.stdout.readline())
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
  for route_name in ['sales','transfer']:
   page.locator(f'.sidebar a[data-route="{route_name}"]').click();page.locator('#page .tc-list-scroll tbody tr').first.wait_for();page.wait_for_load_state('networkidle')
   for width in [1440,1280,1100,900,750]:
    page.set_viewport_size({'width':width,'height':1000})
    for expanded in [False,True]:
     toggle=page.locator('.tc-filter-toggle');current=toggle.get_attribute('aria-expanded')=='true'
     if current!=expanded:toggle.click()
     actual=page.locator('.tc-filters-two-row').evaluate("el=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,controls:[...el.querySelectorAll('label,.tc-filter-actions')].map(x=>{const r=x.getBoundingClientRect();return {label:x.textContent.trim(),left:r.left,right:r.right,width:r.width};})})")
     result['checks'].append({'name':route_name+'-'+str(width)+'-'+str(expanded)+'-no-page-overflow-controls-in-viewport','pass':actual['documentWidth']<=width+1 and all(x['left']>=0 and x['right']<=width and x['width']>=70 for x in actual['controls']),'actual':actual})
     if width in [1440,900]:page.screenshot(path=str(out/(route_name+'-'+str(width)+'-'+str(expanded)+'.png')))
    before=len(result['requests']);page.get_by_role('button',name='查询',exact=True).click();page.wait_for_load_state('networkidle');result['checks'].append({'name':route_name+'-'+str(width)+'-query-reachable','pass':len(result['requests'])>before and page.locator('#page .tc-list-scroll tbody tr').count()>0})
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
