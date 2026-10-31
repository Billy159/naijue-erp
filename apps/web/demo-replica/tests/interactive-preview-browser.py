"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys, time
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');args=p.parse_args()
build=Path(args.build).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
manifest=json.loads((build/'production-build.json').read_text());config=manifest['configuration'];origin=config['http']['origin'];base=config['assets']['basePath']
if origin!='https://synthetic-management.invalid':raise SystemExit('Smoke requires the declared synthetic-only build configuration')
allowed={x['path'] for x in manifest['outputs']};allowed.add('index.html')
result={'sourceCheckpoint':manifest['sourceCheckpoint'],'syntheticOnly':True,'status':'BLOCKED_ENV','checks':[],'screens':[],'requests':[]}
bridge=None;browser=None
try:
 from playwright.sync_api import sync_playwright
 with sync_playwright() as pw:
  try:browser=pw.chromium.launch(executable_path=args.chromium,headless=False,chromium_sandbox=True)
  except Exception as error:
   result['reason']=str(error);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('BLOCKED_ENV: Chromium could not start with its sandbox enabled');sys.exit(2)
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('production-browser-fixture.mjs')),'--staff-edit','--sales-chain','--sales-preview'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
  context=browser.new_context(viewport={'width':1280,'height':850},device_scale_factor=1)
  errors=[];page=context.new_page()
  def page_error(error):
   errors.append(str(error));print(json.dumps({'event':'pageerror','message':str(error)[:300]},ensure_ascii=False),flush=True)
  page.on('pageerror',page_error)
  def respond(route):
   request=route.request;url=urlsplit(request.url);request_origin=f'{url.scheme}://{url.netloc}'
   result['requests'].append({'method':request.method,'url':request.url})
   if request_origin!=origin:route.abort();return
   if url.path.startswith('/api/'):
    bridge.stdin.write(json.dumps({'url':request.url,'method':request.method,'headers':request.headers,'body':request.post_data})+'\n');bridge.stdin.flush();response=json.loads(bridge.stdout.readline())
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
  page.bring_to_front();page.evaluate('(sha)=>document.title="测试 "+sha.slice(0,8)+" · 合成内存：员工资料/销货有限写 · 非PG非生产"',manifest['sourceCheckpoint'])
  observations=[]
  page.get_by_role('button',name='查询',exact=True).click();page.locator('#iw-results tbody tr[data-inventory-product]').first.wait_for(timeout=15000);page.wait_for_load_state('networkidle');page.wait_for_timeout(400)
  observed={'route':'inventory-query','rows':page.locator('#iw-results tbody tr[data-inventory-product]').count(),'alerts':page.locator('#page [role=alert]').all_text_contents()};observations.append(observed);page.screenshot(path=str(out/'inventory-query.png'));print(json.dumps({'event':'user-route-check',**observed},ensure_ascii=False),flush=True)
  page.locator('.sidebar a[data-route="sales"]').click();page.locator('#sale-list-scroll tbody tr').nth(5).wait_for();page.wait_for_load_state('networkidle')
  rows=page.locator('#sale-list-scroll tbody tr');assert rows.count()==6
  numbers=rows.locator('td:nth-child(2) button').all_text_contents();assert len(set(numbers))==6
  observed={'route':'sales-list','rows':rows.count(),'numbers':numbers,'statuses':rows.locator('[data-document-status]').all_text_contents(),'alerts':page.locator('#page [role=alert]').all_text_contents()};observations.append(observed);page.screenshot(path=str(out/'sales-list.png'));print(json.dumps({'event':'user-route-check',**observed},ensure_ascii=False),flush=True)
  for number in numbers:
   page.get_by_role('button',name=number,exact=True).click();page.locator('#sale-lines tbody tr').first.wait_for();page.wait_for_load_state('networkidle');observations.append({'route':'sales-detail','number':number,'rows':page.locator('#sale-lines tbody tr').count(),'alerts':page.locator('#page [role=alert]').all_text_contents()});page.locator('.sidebar a[data-route="sales"]').click();page.locator('#sale-list-scroll tbody tr').nth(5).wait_for()
  (out/'user-route-checks.json').write_text(json.dumps({'sourceCheckpoint':manifest['sourceCheckpoint'],'observations':observations,'errors':errors},ensure_ascii=False,indent=2))
  print('VISIBLE_EVENT_PUMP_READY: '+manifest['sourceCheckpoint']+'; no input blocking',flush=True)
  while not page.is_closed():
   page.wait_for_timeout(100)
   page.evaluate('(sha)=>document.title="测试 "+sha.slice(0,8)+" · 合成内存：员工资料/销货有限写 · 非PG非生产"',manifest['sourceCheckpoint'])
   (out/'live-state.json').write_text(json.dumps({'sourceCheckpoint':manifest['sourceCheckpoint'],'url':page.url,'requests':result['requests'],'errors':errors},ensure_ascii=False,indent=2))
except KeyboardInterrupt:
 pass
finally:
 if browser and browser.is_connected(): browser.close()
 if bridge: bridge.terminate(); bridge.wait(timeout=5)
