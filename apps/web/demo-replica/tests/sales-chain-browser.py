"""Real production bytes, real Chromium layout, closed synthetic network. No sandbox bypass.
Usage: python production-browser-smoke.py BUILD OUT --node NODE --chromium CHROMIUM
Exit 2: browser/environment blocked; exit 1: executed smoke failed; exit 0: listed checks passed.
"""
import argparse, json, mimetypes, subprocess, sys, time, re
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit, unquote
p=argparse.ArgumentParser();p.add_argument('--return-mode',action='store_true');p.add_argument('--exchange-mode',action='store_true');p.add_argument('--staff-edit',action='store_true');p.add_argument('--keyboard-preview',action='store_true');p.add_argument('--draft-money',action='store_true');p.add_argument('--customer-recommendation',action='store_true');p.add_argument('--hall-confirm',action='store_true');p.add_argument('--drop-save-response',action='store_true');p.add_argument('--drop-unapprove-response',action='store_true');p.add_argument('build');p.add_argument('out');p.add_argument('--node',default='node');p.add_argument('--chromium',default='/usr/bin/chromium');p.add_argument('--existing-fields',action='store_true');args=p.parse_args()
if args.existing_fields and (args.return_mode or args.exchange_mode or args.drop_save_response or args.drop_unapprove_response):p.error('--existing-fields is an independent SALE/DRAFT edit case; do not combine lifecycle variants')
build=Path(args.build).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=False)
manifest=json.loads((build/'production-build.json').read_text());config=manifest['configuration'];origin=config['http']['origin'];base=config['assets']['basePath']
if origin!='https://synthetic-management.invalid':raise SystemExit('Smoke requires the declared synthetic-only build configuration')
allowed={x['path'] for x in manifest['outputs']};allowed.add('index.html')
result={'commands':[],'sourceCheckpoint':manifest['sourceCheckpoint'],'syntheticOnly':True,'status':'BLOCKED_ENV','checks':[],'screens':[],'requests':[],'categoryResponses':[],'case':'existing-fields' if args.existing_fields else 'original-lifecycle','readbacks':[]}
bridge=None;browser=None;page=None
@contextmanager
def failure_evidence():
 try:yield
 except Exception:
  capture=result.setdefault('failureCapture',{})
  for key,action in [('screenshot',lambda:page.screenshot(path=str(out/'failure.png'),full_page=True)),('dom',lambda:(out/'failure-dom.txt').write_text(page.locator('body').inner_text()))]:
   try:
    if page is None or page.is_closed():raise RuntimeError('Page unavailable before runtime exit')
    action();capture[key]={'status':'CAPTURED'}
   except Exception as capture_error:capture[key]={'status':'FAILED','errorType':type(capture_error).__name__}
  raise

try:
 from playwright.sync_api import sync_playwright
 with sync_playwright() as pw, failure_evidence():
  try:browser=pw.chromium.launch(executable_path=args.chromium,headless=False,chromium_sandbox=True)
  except Exception as error:
   result['reason']=str(error);(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('BLOCKED_ENV: Chromium could not start with its sandbox enabled');sys.exit(2)
  bridge=subprocess.Popen([args.node,'--experimental-transform-types',str(Path(__file__).with_name('production-browser-fixture.mjs'))]+['--sales-chain'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'fixture-stderr.log').open('w'),text=True,bufsize=1)
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
    if url.path in ['/api/sales/detail/query','/api/sales/prepare-existing']:result['readbacks'].append({'path':url.path,'request':json.loads(request.post_data),'status':response['status'],'body':json.loads(response['body'])})
    if url.path=='/api/sales/commands':result['commands'].append({'input':json.loads(request.post_data),'status':response['status'],'body':json.loads(response['body'])})
    if url.path=='/api/sales/commands' and ((args.drop_save_response and json.loads(request.post_data)['action']=='SAVE') or (args.drop_unapprove_response and json.loads(request.post_data)['action']=='UNAPPROVE')) and not result.get('droppedResponse'):
     assert response['status']==200;result['droppedResponse']=True;route.abort('failed');return
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
  def shot(name):
   page.locator('#page h1').wait_for();page.wait_for_function("!document.querySelector('#page')?.innerText.includes('正在加载页面')")
   page.screenshot(path=str(out/(name+'.png')),full_page=True);result['screens'].append(name)
  def pick(label,name):
   page.get_by_role('combobox',name=label,exact=True).click();page.get_by_role('option',name=name,exact=True).click();page.locator('#page h1').click();page.wait_for_load_state('networkidle')
  if not args.existing_fields:
   page.get_by_role('button',name='查询',exact=True).click();page.locator('#iw-results tbody tr[data-inventory-product]').first.wait_for();page.wait_for_load_state('networkidle');baseline_stock=sum(int(x['total']['knownQuantity']) for x in result['categoryResponses'][-1]['products']);shot('00-stock-before')
  page.locator('.sidebar a[data-route="sales/new"]').click();page.get_by_role('textbox',name='整单优惠 / 抹零',exact=True).wait_for();shot('01-new-empty')
  pick('业务类型','退货/换货' if args.return_mode or args.exchange_mode else '销售');pick('营业厅','网点营业厅');pick('客户','零售客户');pick('出库仓','备货仓')
  search=page.get_by_role('combobox',name='商品款号 / 名称 / 条码',exact=True);search.fill('M26001');page.locator('[data-sale-candidate][data-finder-option]').filter(has_text='M26001').click();page.wait_for_load_state('networkidle')
  row=page.locator('tr[data-entry-row]').first
  for index in range(3):
   row.locator('.mx-spec-picker').nth(index).click();page.locator('.mx-spec-menu-options button').first.wait_for();page.locator('.mx-spec-menu-options button').first.click();page.wait_for_load_state('networkidle')
  row.get_by_role('textbox',name='本行数量',exact=True).fill('-1' if args.return_mode or args.exchange_mode else '1');row.get_by_role('textbox',name='本行成交单价',exact=True).fill('239')
  if args.exchange_mode:
   search=page.get_by_role('combobox',name='商品款号 / 名称 / 条码',exact=True).last;search.fill('M26001');page.locator('[data-sale-candidate][data-finder-option]').filter(has_text='M26001').click();page.wait_for_load_state('networkidle');second=page.locator('tr[data-entry-row]').nth(1)
   for index in range(3):
    second.locator('.mx-spec-picker').nth(index).click();page.locator('.mx-spec-menu-options button').first.wait_for();page.locator('.mx-spec-menu-options button').first.click();page.wait_for_load_state('networkidle')
   second.get_by_role('combobox',name='本行方向',exact=True).click();page.get_by_role('option',name='换出 ＋',exact=True).click();page.locator('#page h1').click();second.get_by_role('textbox',name='本行数量',exact=True).fill('2');second.get_by_role('textbox',name='本行成交单价',exact=True).fill('239');assert row.get_by_role('textbox',name='本行数量',exact=True).input_value()=='-1'
  pick('第1笔支付方式','现金');pick('第1笔资金账户','现金测试账户');page.get_by_role('textbox',name='第1笔收款金额',exact=True).fill('-239' if args.return_mode else '239');page.get_by_label('备注',exact=True).fill('前台真实服务生命周期');shot('02-before-save');assert ('退回 1件' if args.return_mode or args.exchange_mode else '1款 1件') in page.locator('#sale-summary').inner_text()
  if args.return_mode:
   assert page.get_by_role('combobox',name='本行方向',exact=True).count()==1;pick('本行方向','换出 ＋');assert row.get_by_role('textbox',name='本行数量',exact=True).input_value()=='1';assert page.get_by_role('textbox',name='第1笔收款金额',exact=True).input_value()=='-239';assert '应收 ¥239.00' in page.locator('#sale-summary').inner_text();shot('02-direction-out-keeps-refund');pick('本行方向','退回 −');assert row.get_by_role('textbox',name='本行数量',exact=True).input_value()=='-1';assert '应退 ¥239.00' in page.locator('#sale-summary').inner_text()
  elif args.exchange_mode:assert '换出 2件' in page.locator('#sale-summary').inner_text() and '应收 ¥239.00' in page.locator('#sale-summary').inner_text()
  else:assert '衬衫 1' in page.locator('#sale-summary').inner_text()
  page.get_by_role('button',name='保存',exact=True).click()
  if args.drop_save_response:
   recovery=page.get_by_role('dialog',name='核实原操作',exact=True);recovery.wait_for();shot('02-save-response-lost');recovery.get_by_role('button',name='查询原回执',exact=True).click()
  page.wait_for_url(re.compile(r'.*#sales/view/'));page.wait_for_load_state('networkidle');shot('03-saved');assert ('退回 1件' if args.return_mode or args.exchange_mode else '1款 1件') in page.locator('.sale-summary').inner_text();assert ('应退 ¥239.00' if args.return_mode else '应收 ¥239.00' if args.exchange_mode else '衬衫 1') in page.locator('.sale-summary').inner_text()
  assert result['commands'][-1]['status']==200,result['commands'][-1];sales_id=result['commands'][-1]['body']['salesId'];assert result['commands'][-1]['body']['version']==1;assert result['commands'][-1]['input']['draft']['header']['businessType']==('EXCHANGE' if args.exchange_mode else 'RETURN' if args.return_mode else 'SALE')
  if args.exchange_mode:assert [x['quantity'] for x in result['commands'][-1]['input']['draft']['lines']]==['-1','2']
  if args.existing_fields:
   assert config['routes'].get('salesExistingEdit') is True
   before=next(x['body'] for x in reversed(result['readbacks']) if x['path']=='/api/sales/detail/query' and x['status']==200)['document']
   page.get_by_role('button',name='修改',exact=True).click();page.wait_for_url(re.compile(r'.*#sales/edit/'));page.get_by_label('备注',exact=True).wait_for()
   date=page.locator('.tc-gold-doc-fields .arco-picker input').first;date.fill('2026-10-30');date.press('Enter');page.locator('#page h1').click()
   page.get_by_role('combobox',name='业务类型',exact=True).click();page.get_by_role('option',name='退货/换货',exact=True).click();page.get_by_role('dialog',name='切换业务类型',exact=True).get_by_role('button',name='取消',exact=True).click()
   pick('客户','具名客户（演示）');pick('营业员','测试营业员乙');pick('出库仓','总仓');page.get_by_label('备注',exact=True).fill('SYN existing sales fields')
   line=page.locator('tr[data-entry-row]').filter(has=page.locator('.sale-product-identity')).first;line_key=line.get_attribute('data-entry-row');assert line_key;line.locator('.sale-product-identity').click()
   line=page.locator('tr.sale-identity-edit').filter(has=page.get_by_role('textbox',name='修改商品款号 / 名称 / 条码',exact=True));line=line.and_(page.locator('tr[data-entry-row='+json.dumps(line_key)+']'));line.wait_for();assert line.count()==1
   for index in range(3):
    line.locator('.mx-spec-picker').nth(index).click();options=page.locator('.mx-spec-menu-options button');options.first.wait_for();options.last.click()
   line.get_by_role('textbox',name='本行数量',exact=True).fill('2');line.get_by_role('textbox',name='本行成交单价',exact=True).fill('200');line.get_by_role('button',name='确认',exact=True).click()
   line=page.locator('tr[data-entry-row]').filter(has=page.locator('.sale-product-identity')).first;line.get_by_role('button',name='赠品',exact=True).click();assert line.get_by_role('textbox',name='本行成交单价',exact=True).input_value()=='0.00';line.get_by_role('button',name='取消赠品',exact=True).click();line.get_by_role('textbox',name='本行折扣',exact=True).fill('5');assert line.get_by_role('textbox',name='本行成交单价',exact=True).input_value()=='119.50';line.get_by_role('textbox',name='本行成交单价',exact=True).fill('200')
   search=page.get_by_role('combobox',name='商品款号 / 名称 / 条码',exact=True).last;search.fill('M26004');page.locator('[data-sale-candidate][data-finder-option]').filter(has_text='M26004').click();page.wait_for_load_state('networkidle');extra=page.locator('tr[data-entry-row]').last
   for index in range(3):
    extra.locator('.mx-spec-picker').nth(index).click();page.locator('.mx-spec-menu-options button').first.wait_for();page.locator('.mx-spec-menu-options button').first.click()
   extra.get_by_role('textbox',name='本行数量',exact=True).fill('1');extra.get_by_role('button',name='赠品',exact=True).click()
   page.get_by_role('textbox',name='整单优惠 / 抹零',exact=True).fill('1');pick('第1笔支付方式','银行转账');pick('第1笔资金账户','银行转账测试账户');page.get_by_role('textbox',name='第1笔收款金额',exact=True).fill('399');shot('existing-sales-edited')
   page.get_by_role('button',name='保存',exact=True).click();page.wait_for_url(re.compile(r'.*#sales/view/'));page.wait_for_load_state('networkidle');assert len(result['commands'])==2 and result['commands'][-1]['status']==200;assert result['commands'][-1]['input']['expectedVersion']==1;assert result['commands'][-1]['body']['version']==2
   prepared=[x for x in result['readbacks'] if x['path']=='/api/sales/prepare-existing'];assert prepared and prepared[-1]['status']==200
   after=next(x['body'] for x in reversed(result['readbacks']) if x['path']=='/api/sales/detail/query' and x['status']==200)['document'];assert after['header']['note']=='SYN existing sales fields';assert after['header']['businessDate']=='2026-10-30';assert after['header']['orderDiscount']=='100'
   for key in ['id','number','createdByAccountId','createdHallId','createdAt']:assert after['header'][key]==before['header'][key]
   assert after['header']['version']==2 and after['header']['status']=='DRAFT';assert any(x['quantity']=='2' and x['dealPrice']=='20000' and not x['isGift'] for x in after['lines']);assert after['settlements'][0]['amount']=='39900';shot('existing-sales-readback')
   assert any(x['snapshot']['productCode']=='M26004' and x['isGift'] for x in after['lines'])
   page.locator('.sidebar a[data-route="sales"]').click();page.locator('#sale-list-scroll tbody tr').filter(has_text=before['header']['number']).locator('button').first.click();page.wait_for_url(re.compile(r'.*#sales/edit/'));extra=page.locator('tr[data-entry-row]').filter(has_text='M26004');extra.get_by_role('button',name='删除',exact=True).click();assert extra.count()==0;page.get_by_role('button',name='保存',exact=True).click();page.wait_for_url(re.compile(r'.*#sales/view/'));page.wait_for_load_state('networkidle');assert len(result['commands'])==3 and result['commands'][-1]['input']['expectedVersion']==2 and result['commands'][-1]['body']['version']==3
   final=next(x['body'] for x in reversed(result['readbacks']) if x['path']=='/api/sales/detail/query' and x['status']==200)['document'];assert not any(x['snapshot']['productCode']=='M26004' for x in final['lines']);assert final['header']['id']==before['header']['id'];shot('existing-sales-delete-readback')
   result['coverage']=['date','customer','salesperson','warehouse','note','color/fit/size reselection','quantity/price/discount/gift toggle','add/save/list→edit/delete/save line','order discount','payment method/account/amount','business type change cancel','actual prepare/SAVE/detail','header identity/CAS'];result['notTested']=['hall switch: original fixture only declares one hall','business type committed switch browser (cancel path and separate HTTP type change checked)','history controlled revision','existing uncertain receipt recovery browser','non-DRAFT edit rejection browser','PG'];assert not errors;result['status']='PASS_LISTED_EXISTING_STEPS';result['errors']=errors;(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));browser.close();browser=None
  else:
   def stock_readback(expected,label):
    page.locator('.sidebar a[data-route="inventory"]').click();page.get_by_role('button',name='查询',exact=True).click();page.locator('#iw-results tbody tr[data-inventory-product]').first.wait_for();page.wait_for_load_state('networkidle');total=sum(int(x['total']['knownQuantity']) for x in result['categoryResponses'][-1]['products']);assert total==expected,(label,total,expected);shot('stock-'+label)
    page.locator('.sidebar a[data-route="sales"]').click();page.locator('#sale-list-scroll tbody tr').first.wait_for();page.locator('#sale-list-scroll tbody tr').first.locator('button').first.click();page.wait_for_url(re.compile(r'.*#sales/(?:view|edit)/'+sales_id));page.wait_for_load_state('networkidle')
   for action,title,version in [('审核','审核销货单',2),('弃审','弃审销货单',3)]:
    page.get_by_role('button',name=action,exact=True).click();dialog=page.get_by_role('dialog');dialog.wait_for();shot(str(version+2)+'-'+action+'-confirm')
    if args.drop_unapprove_response and action=='弃审':
     dialog.get_by_role('button',name='确认弃审',exact=True).click();recovery=page.get_by_role('dialog',name='核实原操作',exact=True);recovery.wait_for();shot('unapprove-response-lost');recovery.get_by_role('button',name='查询原回执',exact=True).click()
    else:
     with page.expect_response(lambda response:response.url.endswith('/api/sales/commands') and response.request.post_data_json.get('action')==('APPROVE' if action=='审核' else 'UNAPPROVE')):
      dialog.get_by_role('button',name='确定' if action=='审核' else '确认弃审',exact=True).click()
    dialog.wait_for(state='detached');page.get_by_role('button',name='弃审' if action=='审核' else '修改',exact=True).wait_for();page.wait_for_load_state('networkidle');shot('after-'+action+'-response');(out/('after-'+action+'-dom.txt')).write_text(page.locator('body').inner_text());assert result['commands'][-1]['status']==200,result['commands'][-1];assert result['commands'][-1]['body']['version']==version;shot(str(version+3)+'-'+action+'-done');stock_readback(baseline_stock+(1 if args.return_mode else -1) if action=='审核' else baseline_stock,action)
   if '#sales/edit/' not in page.url:page.get_by_role('button',name='修改',exact=True).click()
   page.get_by_role('heading',name='编辑销货单',exact=True).wait_for();note=page.get_by_label('备注',exact=True);note.wait_for();note.fill('弃审后前台编辑已保存');page.get_by_role('button',name='保存',exact=True).click();page.wait_for_url(re.compile(r'.*#sales/view/'));page.wait_for_load_state('networkidle');assert result['commands'][-1]['status']==200,result['commands'][-1];assert result['commands'][-1]['body']['version']==4;page.get_by_text('弃审后前台编辑已保存',exact=True).wait_for();shot('08-edited');page.get_by_role('button',name='操作历史',exact=True).click();history=page.get_by_role('dialog',name='操作历史',exact=True);history.locator('.tc-history').nth(3).wait_for();assert history.locator('.tc-history').count()==4;assert history.locator('strong').all_inner_texts()==['保存 · v3 → v4','弃审 · v2 → v3','审核 · v1 → v2','保存 · v— → v1'];shot('08-real-operation-history');history.get_by_role('button',name='关闭',exact=True).click();stock_readback(baseline_stock,'edited')
   page.locator('.sidebar a[data-route="sales"]').click();page.wait_for_load_state('networkidle');page.locator('#sale-list-scroll tbody tr').first.wait_for();shot('09-list-readback')
   assert len(result['commands'])==4 and not errors
   result['status']='PASS';result['errors']=errors;(out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('PASS real service synthetic memory browser lifecycle',flush=True)
   browser.close();browser=None
except Exception as error:
 result['status']='FAIL';result['reason']=str(error)
 (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));raise
finally:
 if bridge:bridge.terminate();bridge.wait(timeout=5)
