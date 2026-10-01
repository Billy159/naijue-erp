from browser_harness import helpers as h
import json as _json, time as _time
from pathlib import Path as _Path
QA_DIR=_Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-final-baseline-20261001')
def qa_pin(target=None):
 from browser_harness import helpers as h
 if target:(QA_DIR/'browser-target.txt').write_text(target)
 h.switch_tab((QA_DIR/'browser-target.txt').read_text().strip())
def qa_record(action,data):
 with (QA_DIR/'browser-actions.jsonl').open('a') as f:f.write(_json.dumps({'time':_time.time(),'action':action,'data':data},ensure_ascii=False)+'\n')
def qa_click(selector,text=None,index=0):
 from browser_harness import helpers as h
 expr="""(()=>{function qaNodes(selector){let roots=[document];const parts=selector.split(" >>> ");let es=[];for(let i=0;i<parts.length;i++){es=roots.flatMap(r=>Array.from(r.querySelectorAll(parts[i])));roots=es.map(e=>e.shadowRoot).filter(Boolean)}return es;}let es=qaNodes(SEL).filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');if(TXT!==null)es=es.filter(e=>e.textContent.trim()===TXT);const e=es[IDX];if(!e)throw Error('Click target absent: '+SEL+' '+TXT);e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,text:e.textContent.trim().slice(0,160),disabled:!!e.disabled})})()""".replace('SEL',_json.dumps(selector)).replace('TXT',_json.dumps(text)).replace('IDX',str(index))
 for attempt in range(8):
  try:pt=_json.loads(h.js(expr));break
  except RuntimeError:
   if attempt==7:raise
   _time.sleep(.2)
 h.click_at_xy(pt['x'],pt['y']);qa_record('click',{'selector':selector,**pt});_time.sleep(.45);return pt
 def_unused=0
def qa_fill(selector,value):
 from browser_harness import helpers as h
 qa_click(selector)
 expr="""(()=>{let roots=[document],es=[];const parts=SEL.split(' >>> ');for(let i=0;i<parts.length;i++){es=roots.flatMap(r=>Array.from(r.querySelectorAll(parts[i])));roots=es.map(e=>e.shadowRoot).filter(Boolean)}const e=es.find(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');e.focus();return e.value})()""".replace('SEL',_json.dumps(selector))
 h.js(expr)
 h.press_key('Home');h.press_key('End',modifiers=8);h.press_key('Backspace');h.type_text(str(value))
 actual=h.js(expr)
 if actual!=str(value):raise RuntimeError('Input did not accept exact value: '+selector)
 qa_record('fill',{'selector':selector,'value':str(value) if ('password' not in selector.lower() and '密码' not in selector) else '[synthetic fixture]'})
def qa_shot(name):
 from browser_harness import helpers as h
 path=str(QA_DIR/'evidence'/(name+'.png'));h.capture_screenshot(path,max_dim=1800);qa_record('screenshot',{'name':name,'url':h.page_info().get('url')});return path
def qa_text(limit=7000):
 from browser_harness import helpers as h
 return h.js('document.body.innerText.slice(0,'+str(limit)+')')
def qa_wait(expression,timeout=15):
 from browser_harness import helpers as h
 expression=expression.replace('document.querySelector(".arco-modal")','Array.from(document.querySelectorAll(".arco-modal")).find(e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=="hidden")')
 until=_time.time()+timeout
 while _time.time()<until:
  result=h.js("Boolean("+expression+")")
  if result:return result
  _time.sleep(.25)
 raise RuntimeError('Timeout: '+expression)
def qa_checks(label,expression):
 from browser_harness import helpers as h
 result=h.js("Boolean("+expression+")");qa_record('check',{'label':label,'result':result});print(label,result);return result

def qa_shadow_fill(host,value):
 qa_fill(host+' >>> input',value)
def qa_require(label,expression):
 if not qa_checks(label,expression):raise AssertionError(label)
def qa_logout():
 if h.js("!!document.querySelector('.login-overlay')"):return
 qa_wait("!Array.from(document.querySelectorAll('.bs-modal')).some(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')",20)
 _time.sleep(.4)
 qa_click('button[aria-label^="当前员工："]')
 if not h.js("Array.from(document.querySelectorAll('.arco-dropdown-menu-item')).some(e=>e.getClientRects().length&&e.innerText.trim()==='退出登录')"):
  _time.sleep(.4);qa_click('button[aria-label^="当前员工："]')
 qa_click('.arco-dropdown-menu-item','退出登录')
 _time.sleep(1)
 qa_wait("!!document.querySelector('.login-overlay')",20)
def qa_login(name):
 qa_fill('.login-panel [name=username]',name)
 qa_fill('.login-panel [name=password]','FinalBaselineFixture123')
 qa_click('.login-panel .primary')
 _time.sleep(1)
 qa_wait("!document.querySelector('.login-overlay')&&window.MASTER_DATA?.current()&&window.LEGACY_REAL?.loaded&&!!document.querySelector('button[aria-label^=\"当前员工：\"]')",30)
 qa_record('login-completed',{'syntheticAccount':name,'employee':h.js("MASTER_DATA.current().name"),'role':h.js("MASTER_DATA.current().role")})
def qa_controls(selector='#page'):
 from browser_harness import helpers as h
 expr="""(()=>{const start=document.querySelector(SEL);let out=[];function walk(root,path){if(!root)return;for(const e of root.querySelectorAll('input,select,button,[role=combobox],summary,[role=tab]')){if(!e.getClientRects().length)continue;const r=e.getBoundingClientRect();out.push({path,id:e.id,name:e.name,tag:e.tagName,type:e.type,text:(e.textContent||e.getAttribute('aria-label')||e.placeholder||'').trim().slice(0,90),cls:typeof e.className==='string'?e.className:'',x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height})}for(const e of root.querySelectorAll('*'))if(e.shadowRoot)walk(e.shadowRoot,path+' > '+(e.id||e.className))}walk(start,SEL);return JSON.stringify(out)})()""".replace('SEL',_json.dumps(selector))
 return _json.loads(h.js(expr))

exec(compile(_Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-performance-20261001/browser-measure.py').read_text(), 'performance-task-helpers', 'exec'))

exec(compile(_Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/ERP-V2-ui-and-consolidation-20261001/browser-ui.py').read_text(), 'ui-consolidation-task-helpers', 'exec'))
