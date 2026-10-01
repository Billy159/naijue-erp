import json,time,base64
from pathlib import Path
from browser_harness.helpers import js,cdp,current_tab,switch_tab,capture_screenshot,click_at_xy,type_text,press_key,wait_for_load
SMOKE_OUT=Path('/Users/billy/Desktop/Workspace/project-007/奈爵服饰-8877-Demo/data-cleaning/verification/final-smoke-20261001')
SMOKE_URL='http://127.0.0.1:8877/?basic-demo=1&tr-space=account-qa-smoke-20261001&account-api=8880'
DEEP_JS="""window.sq=(selector)=>{let parts=selector.split('>>>'),root=document;for(let i=0;i<parts.length-1;i++){root=root.querySelector(parts[i].trim())?.shadowRoot;if(!root)return null;}return root.querySelector(parts.at(-1).trim())};window.sqa=(selector)=>{let parts=selector.split('>>>'),root=document;for(let i=0;i<parts.length-1;i++){root=root.querySelector(parts[i].trim())?.shadowRoot;if(!root)return [];}return [...root.querySelectorAll(parts.at(-1).trim())]};"""
def smoke_attach():
 p=SMOKE_OUT/'smoke-tab.json'
 if p.exists():
  target=json.loads(p.read_text())['targetId']
  if current_tab()['targetId']!=target:switch_tab(target)
 else:p.write_text(json.dumps(current_tab()))
 js(DEEP_JS);time.sleep(.25)
def smoke_assert(label,condition,detail=None):
 item={'time':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'label':label,'pass':bool(condition),'detail':detail}
 with (SMOKE_OUT/'assertions.jsonl').open('a') as f:f.write(json.dumps(item,ensure_ascii=False)+'\n')
 print(('PASS' if condition else 'FAIL')+' '+label,flush=True)
 if not condition:raise AssertionError(label+': '+str(detail))
def smoke_snap(label):
 path=SMOKE_OUT/(label+'.png');capture_screenshot(str(path),max_dim=1600)
 state=js("JSON.stringify({url:location.href,text:document.body.innerText,employee:window.MASTER_DATA?.current(),errors:window.__smoke?.errors,requests:window.__smoke?.requests})")
 (SMOKE_OUT/(label+'.json')).write_text(state or '{}')
 return str(path)
def smoke_wait(predicate='window.LEGACY_REAL?.loaded && !window.LEGACY_REAL.error',timeout=35):
 start=time.time()
 while time.time()-start<timeout:
  if js(predicate):return True
  time.sleep(.25)
 raise TimeoutError(predicate+': '+str(js('document.body.innerText.slice(-500)')))
def smoke_nav(route):
 js('location.hash='+json.dumps('#'+route))
 time.sleep(.4);js(DEEP_JS)
 smoke_wait("window.LEGACY_REAL?.loaded && !/正在读取|正在准备商品库存/.test(document.querySelector('#page')?.innerText||'')")
 return js("document.querySelector('#page').innerText.slice(0,400)")
def smoke_click(selector):
 js(DEEP_JS)
 rect=js("(()=>{const e=sq("+json.dumps(selector)+");if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,disabled:e.disabled,text:e.innerText}})()")
 if not rect or not rect['w'] or not rect['h']:raise ValueError('Invisible '+selector+' '+str(rect))
 click_at_xy(rect['x'],rect['y']);time.sleep(.22)
 return rect

def smoke_text(text,scope='document',exact=True):
 js(DEEP_JS)
 selector=js("(()=>{const root="+scope+",es=[...root.querySelectorAll('button,a,[role=button],.arco-select-option,.arco-select-option-wrapper,.arco-transfer-view-item,.arco-tabs-header-title,.arco-dropdown-menu-item,.arco-menu-item')].filter(e=>{let r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'&&"+("e.innerText.trim()===" if exact else "e.innerText.includes(")+json.dumps(text)+('' if exact else ')')+"});const e=es.at(-1);if(!e)return null;e.setAttribute('data-smoke-click','yes');return '[data-smoke-click=yes]'})()")
 if not selector:raise ValueError('Text not found: '+text)
 rect=smoke_click(selector);js("sqa('[data-smoke-click=yes]').forEach(e=>e.removeAttribute('data-smoke-click'))");return rect

def smoke_fill(selector,value):
 if js("(()=>{const e=sq("+json.dumps(selector)+");return e&&!e.matches(\"input,textarea\")&&!!e.querySelector(\"input,textarea\")})()"):
  selector+=" input, "+selector+" textarea"
 smoke_click(selector)
 focus_check="(()=>{let a=document.activeElement;while(a?.shadowRoot?.activeElement)a=a.shadowRoot.activeElement;const e=sq("+json.dumps(selector)+");return a===e||e?.contains(a)})()"
 if not js(focus_check):smoke_click(selector)
 if not js(focus_check):raise ValueError('Native focus failed: '+selector)
 shortcut={'key':'a','code':'KeyA','modifiers':4,'windowsVirtualKeyCode':65,'nativeVirtualKeyCode':65}
 cdp('Input.dispatchKeyEvent',type='rawKeyDown',commands=['selectAll'],**shortcut);cdp('Input.dispatchKeyEvent',type='keyUp',**shortcut)
 press_key('Backspace');type_text(str(value));time.sleep(.12)

def smoke_select(selector,text):
 smoke_click(selector);time.sleep(.15)
 return smoke_text(text,exact=False)

def smoke_login(name,password='SmkDemo20261001!'):
 smoke_wait("!!document.querySelector('.login-overlay')")
 smoke_fill('.login-overlay [name=username]',name);smoke_fill('.login-overlay [name=password]',password)
 smoke_click('.login-overlay .primary');time.sleep(.8);js(DEEP_JS)
 smoke_wait("!document.querySelector('.login-overlay') && window.LEGACY_REAL?.loaded")
 smoke_assert('真实登录 '+name,js('MASTER_DATA.current()?.loginName')==name,js('MASTER_DATA.current()'))

def smoke_logout():
 js('MASTER_DATA.logout()');time.sleep(.8);js(DEEP_JS);smoke_wait("!!document.querySelector('.login-overlay')")

def smoke_dom(scope='document'):
 js(DEEP_JS)
 return js("(()=>{const root="+scope+";return [...root.querySelectorAll('input,select,button,[role=combobox],textarea')].map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,cls:e.className,data:{...e.dataset},placeholder:e.placeholder,value:e.value,text:e.innerText?.slice(0,90),r:(()=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()}))})()")

def smoke_pick(host,text,selector='.arco-select-option,.arco-tree-node-title,.arco-cascader-list-item,.arco-transfer-view-item'):
 js(DEEP_JS)
 rect=js("(()=>{const root=sq("+json.dumps(host)+").shadowRoot;const es=[...root.querySelectorAll("+json.dumps(selector)+")].filter(e=>e.innerText.trim()==="+json.dumps(text)+");const e=es.at(-1);if(!e)return {texts:[...root.querySelectorAll("+json.dumps(selector)+")].map(x=>x.innerText)};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()")
 if 'x' not in rect:raise ValueError('Option '+text+' '+str(rect))
 click_at_xy(rect['x'],rect['y']);time.sleep(.25)
 return rect

def smoke_upload(selector,paths):
 js(DEEP_JS)
 obj=cdp('Runtime.evaluate',expression='sq('+json.dumps(selector)+')')['result']['objectId']
 cdp('DOM.setFileInputFiles',objectId=obj,files=[str(Path(p).resolve()) for p in paths]);time.sleep(.6)

def smoke_choose(host,name):
 smoke_click(host);time.sleep(.2)
 values=js("[...sq("+json.dumps(host)+").shadowRoot.querySelectorAll('.arco-select-option')].map(e=>e.innerText.trim()).filter(x=>x.includes("+json.dumps(name)+"))")
 if not values:
  inp=js("!!sq("+json.dumps(host)+").shadowRoot.querySelector('input')")
  if inp:smoke_fill(host+' >>> input',name);time.sleep(.25)
  values=js("[...sq("+json.dumps(host)+").shadowRoot.querySelectorAll('.arco-select-option')].map(e=>e.innerText.trim()).filter(x=>x.includes("+json.dumps(name)+"))")
 if not values:raise ValueError('No choice '+name)
 exact=[v for v in values if v==name]
 smoke_pick(host,exact[0] if exact else values[0])
 return values

def smoke_single(label,name,scope='document'):
 js(DEEP_JS)
 found=js("(()=>{const e=[...("+scope+").querySelectorAll('.ui-single-host')].find(e=>e.shadowRoot?.querySelector('[aria-label='+CSS.escape("+json.dumps(label)+")+']'));if(!e)return false;e.setAttribute('data-smoke-single','active');return true})()")
 if not found:raise ValueError('Single select not found: '+label)
 result=smoke_choose('[data-smoke-single=active]',name)
 js("document.querySelector('[data-smoke-single=active]')?.removeAttribute('data-smoke-single')")
 return result

def smoke_entity(field,name):
 smoke_click('[data-sale-entity="'+field+'"]');time.sleep(.25)
 host='.ui-single-entity'
 choices=js("[...sq("+json.dumps(host)+").shadowRoot.querySelectorAll('.arco-select-option')].map(e=>e.innerText.trim()).filter(x=>x.includes("+json.dumps(name)+"))")
 if not choices:
  smoke_fill(host+' >>> input',name);time.sleep(.25)
  choices=js("[...sq("+json.dumps(host)+").shadowRoot.querySelectorAll('.arco-select-option')].map(e=>e.innerText.trim()).filter(x=>x.includes("+json.dumps(name)+"))")
 if not choices:raise ValueError('Entity '+field+' '+name)
 exact=[x for x in choices if x==name]
 return smoke_pick(host,exact[0] if exact else choices[0])

BS_SEARCH={'stores':'搜索营业厅名称','warehouses':'搜索仓库名称','parties':'搜索名称或编码','payments':'搜索收款方式','fundAccounts':'搜索账户名称','staff':'搜索姓名或登录账号'}
def smoke_bs_nav(kind):
 route='stores' if kind=='warehouses' else 'payments' if kind=='fundAccounts' else kind
 smoke_nav('settings/'+route)
 if kind in ['stores','warehouses','payments','fundAccounts']:
  label={'stores':'营业厅','warehouses':'仓库','payments':'收款方式','fundAccounts':'资金账户'}[kind]
  smoke_text(label,scope="document.querySelector('.bs-tabs')")
 return kind

def smoke_bs_search(kind,value):
 smoke_fill('.bs-toolbar [aria-label="'+BS_SEARCH[kind]+'"]',value)
 smoke_text('查询',scope="document.querySelector('.bs-toolbar')")
 time.sleep(.15)

def smoke_bs_row(name,action='编辑'):
 selector=js("(()=>{const tr=[...document.querySelectorAll('.bs-table-wrap tbody tr')].find(x=>[...x.querySelectorAll('td')].some(t=>t.textContent.trim()==="+json.dumps(name)+"));if(!tr)return false;tr.setAttribute('data-smoke-row','active');return true})()")
 if not selector:raise ValueError('Basic row missing '+name)
 smoke_text(action,scope="document.querySelector('[data-smoke-row=active]')");time.sleep(.4)
 js("document.querySelector('[data-smoke-row=active]')?.removeAttribute('data-smoke-row')")

def smoke_bs_save():
 smoke_text('确定',scope="document.querySelector('.arco-modal')")
 smoke_wait("[...document.querySelectorAll('.arco-modal')].every(e=>!e.getBoundingClientRect().width)")
 time.sleep(.4)

def smoke_tree_one(host,all_label,name):
 smoke_click(host);time.sleep(.15)
 smoke_pick(host,all_label,'.arco-tree-node-title')
 smoke_pick(host,name,'.arco-tree-node-title')
 press_key('Escape');time.sleep(.15)

def smoke_inv_search(code):
 smoke_fill('#inventory-arco-select >>> input',code);time.sleep(.4)
 smoke_click('#inventory-arco-select >>> .arco-select-option[data-product-id="'+code+'"]')
 press_key('Escape');time.sleep(.2)

def smoke_inv_query(reset=False):
 smoke_click('[data-i="reset"]' if reset else '[data-i="query"]')
 smoke_wait("INVENTORY_UI.state.status==='ready'&&!!INVENTORY_UI.state.snapshot",timeout=50)
 time.sleep(.2)
 return js("JSON.stringify({total:INVENTORY_UI.state.snapshot.total,productCount:INVENTORY_UI.state.snapshot.productCount,page:GOLD_UI.state.page,query:INVENTORY_UI.state.snapshot.query,rows:INVENTORY_UI.state.snapshot.rows})")
