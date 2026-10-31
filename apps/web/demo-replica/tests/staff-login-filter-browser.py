"""Bounded headed CLOSED-B read check using exact production build bytes.
SYNTHETIC native HTTP/service/D1/read-adapter protocol; NOT PG engine evidence.
No external network, credentials, auth changes, commands, receipts, or writes.
"""
import argparse, json, mimetypes, subprocess, sys, re
from pathlib import Path
from urllib.parse import urlsplit, unquote
from visible_wait import keep_visible
p=argparse.ArgumentParser();p.add_argument('build');p.add_argument('out');p.add_argument('--node',required=True);p.add_argument('--chromium',default='/usr/bin/chromium');p.add_argument('--keep-open',action='store_true');args=p.parse_args()
build=Path(args.build).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
manifest=json.loads((build/'production-build.json').read_text());config=manifest['configuration'];origin=config['http']['origin'];base=config['assets']['basePath']
if origin!='https://synthetic-management.invalid':raise SystemExit('Only the declared synthetic origin is allowed')
if config['routes'].get('maintenance',{}).get('staffSettings') is not False:raise SystemExit('Use existing read-only document-list configuration; never enable staff writes')
allowed={x['path'] for x in manifest['outputs']};allowed.add('index.html')
result={'sourceCheckpoint':manifest['sourceCheckpoint'],'status':'BLOCKED_ENV','scope':'headed production bytes/native HTTP-service-D1-adapter scripted PG; not engine/production acceptance','checks':[],'requests':[],'staffResponses':[],'screens':[]};bridge=None;browser=None;page=None;errors=[]
try:
 from playwright.sync_api import sync_playwright
 with sync_playwright() as pw:
  try:browser=pw.chromium.launch(executable_path=args.chromium,headless=False,chromium_sandbox=True)
  except Exception as error:
   result['reason']=str(error);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('BLOCKED_ENV: native headed Chromium sandbox start failed');sys.exit(2)
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('staff-login-read-bridge.mjs'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
  context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  def persist():
   result['errors']=errors;(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
  def respond(route):
   request=route.request;url=urlsplit(request.url);result['requests'].append({'url':request.url,'method':request.method,'body':request.post_data})
   if f'{url.scheme}://{url.netloc}'!=origin:route.abort();return
   if url.path.startswith('/api/'):
    bridge.stdin.write(json.dumps({'url':request.url,'method':request.method,'headers':request.headers,'body':request.post_data})+'\n');bridge.stdin.flush();line=bridge.stdout.readline();assert line,'Fixture closed unexpectedly';response=json.loads(line)
    if url.path=='/api/staff/query':result['staffResponses'].append({'query':json.loads(request.post_data),'status':response['status'],'headers':response['headers'],'body':json.loads(response['body'])})
    route.fulfill(status=response['status'],headers=response['headers'],body=response['body']);return
   relative='index.html' if url.path=='/' else unquote(url.path[len(base):]) if url.path.startswith(base) else ''
   if relative not in allowed:route.fulfill(status=404,body='Not in fixed build manifest');return
   mime=mimetypes.guess_type(relative)[0] or 'application/octet-stream'
   if relative.endswith('.js'):mime='application/javascript'
   route.fulfill(status=200,content_type=mime,body=(build/relative).read_bytes())
  context.route('**/*',respond)
  page.bring_to_front();page.goto(origin+'/#settings/staff');page.get_by_label('搜索姓名或登录账号',exact=True).wait_for();page.wait_for_load_state('networkidle')
  page.evaluate('(sha)=>document.title="测试 CLOSED-B "+sha.slice(0,8)+" · 原生只读合成"',manifest['sourceCheckpoint'])
  def settle():page.wait_for_load_state('networkidle');page.wait_for_timeout(100)
  def host(label):return page.locator('.runtime-settings-select').filter(has=page.locator('.arco-select[aria-label="'+label+'"]'))
  def choose(label,value):
   control=host(label);control.locator('.arco-select-view').click();control.locator('.arco-select-option').filter(has_text=re.compile('^'+re.escape(value)+'$')).click();settle()
  def query():page.get_by_role('button',name='查询',exact=True).click();settle()
  def reset():page.get_by_role('button',name='重置',exact=True).click();settle()
  def current():return result['staffResponses'][-1]
  def check(names,**query_fields):
   response=current();assert response['status']==200,response;assert response['headers'].get('cache-control')=='no-store';body=response['body'];assert body['total']==len(names);assert {r['name'] for r in body['items']}==set(names),response
   for key,value in query_fields.items():assert response['query'][key]==value,response['query']
   for name in names:assert page.get_by_role('cell',name=name,exact=True).is_visible(),name
   assert not errors,errors
   return body
  def shot(name):
   page.screenshot(path=str(out/(name+'.png')),full_page=True,animations='disabled');(out/(name+'.txt')).write_text(page.locator('#page').inner_text());result['screens'].append(name+'.png');persist()
  initial=['测试管理员','闭筛A开通','闭筛B关闭','闭筛C未开通','闭筛F仓库关闭','闭筛G二厅关闭']
  check(initial,loginStatus='',status='normal',role='',hallId=None,page=1)
  assert page.locator('.bs-page tbody tr').filter(has_text='闭筛C未开通').get_by_role('cell',name='未开通',exact=True).count()==2
  assert page.locator('.bs-page tbody tr').filter(has_text='闭筛B关闭').get_by_role('cell',name='已关闭',exact=True).is_visible()
  shot('01-all-distinct-labels')
  before=len(result['staffResponses']);control=host('全部登录权限');control.locator('.arco-select-view').click();closed=control.locator('.arco-select-option').filter(has_text=re.compile('^已关闭$'));assert closed.is_visible();assert 'disabled' not in (closed.get_attribute('class') or '');closed.click();settle();assert len(result['staffResponses'])==before,'draft selection must not request';query()
  rows=check(['闭筛B关闭','闭筛F仓库关闭','闭筛G二厅关闭'],loginStatus='closed',status='normal',page=1)
  assert all(r['account'] is not None and r['account']['loginEnabled'] is False for r in rows['items']);assert not page.get_by_role('cell',name='闭筛C未开通',exact=True).count();shot('02-closed-existing-false-only')
  result['checks'].append('CLOSED enabled only through native paired reader; draft does not query; false-only membership excludes absent account and OPEN')
  before=len(result['staffResponses']);choose('全部角色','营业员');choose('全部营业厅','网点营业厅');assert len(result['staffResponses'])==before;query();check(['闭筛B关闭'],loginStatus='closed',role='SALESPERSON',hallId='00000000-0000-4000-8000-000000003200',status='normal');shot('03-closed-role-hall')
  choose('员工状态','全部');query();check(['闭筛B关闭','闭筛D离职关闭'],loginStatus='closed',status='all',role='SALESPERSON');shot('04-closed-all-employment')
  choose('员工状态','离职');query();check(['闭筛D离职关闭'],loginStatus='closed',status='disabled');shot('05-left-false-not-left-null')
  result['checks'].append('CLOSED composes with role/hall/employment; left is independent from account-disabled; left account:null excluded')
  reset();check(initial,loginStatus='',status='normal',role='',hallId=None,page=1);assert page.locator('.bs-page tbody tr').filter(has_text='闭筛C未开通').get_by_role('cell',name='未开通',exact=True).count()==2;shot('06-reset-restores-null-label')
  choose('全部登录权限','已开通');query();rows=check(['测试管理员','闭筛A开通'],loginStatus='open');assert all(r['account']['loginEnabled'] is True for r in rows['items']);shot('07-open-preserved')
  reset();choose('员工状态','全部');query();check(initial+['闭筛D离职关闭','闭筛E离职未开通'],loginStatus='',status='all');shot('08-all-includes-all-null')
  assert all(r['method']=='GET' and urlsplit(r['url']).path=='/api/auth/session' or r['method']=='POST' and urlsplit(r['url']).path.endswith('/query') for r in result['requests'] if '/api/' in r['url'])
  assert all(b.is_disabled() for b in page.get_by_role('button',name='编辑',exact=True).all());assert page.get_by_role('button',name='新增员工',exact=True).is_disabled()
  result['checks'].append('Reset restores filters/page1 and 未开通; OPEN unchanged; ALL retains both missing-account rows; readonly controls and zero command/receipt requests')
  result['status']='PASS_LISTED_STEPS';persist();print(json.dumps({'status':result['status'],'checks':result['checks']},ensure_ascii=False),flush=True)
  if args.keep_open:keep_visible(page)
  browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error)
 if page:
  try:page.screenshot(path=str(out/'failure.png'),full_page=True)
  except Exception:pass
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
 result['errors']=errors;(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['status']=='PASS_LISTED_STEPS' else 2 if result['status']=='BLOCKED_ENV' else 1)
