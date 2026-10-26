import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import {SaleDialog} from '../documents/native-dialog.tsx';
import { LoginView } from './login-view.tsx';
import type { OwnPasswordFields, OwnPasswordErrors } from './account-menu.tsx';
import { createReadyPageMounts, type ReadyPageOptions, type MountedReplicaPage } from './ready-pages.tsx';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { ReplicaSession } from './session.ts';
import type { InventoryLedgerEntry } from '../../../../src/inventory/ledger-contracts.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';

const emptyPasswords = (): OwnPasswordFields => ({ currentPassword: '', newPassword: '', confirmation: '' });
const captions: Readonly<Record<string, string>> = {
 transfer:'库存管理 / 调拨单列表','transfer/new':'库存管理 / 新增调拨单',sales:'销售管理 / 销货单列表','sales/new':'销售管理 / 新增销货单',products:'商品管理 / 商品信息',
 inventory: '库存管理 / 库存状况表', 'product-categories': '商品管理 / 商品分类', 'product-settings': '商品管理 / 商品设置', 'barcode-schemes': '商品管理 / 条码方案',
 'settings/stores': '基础设置 / 营业厅与仓库', 'settings/warehouses': '基础设置 / 营业厅与仓库', 'settings/parties': '基础设置 / 往来单位', customers: '基础设置 / 往来单位', suppliers: '基础设置 / 往来单位',
 'settings/staff': '基础设置 / 员工与账号', 'settings/accounts': '基础设置 / 员工与账号', 'settings/payments': '基础设置 / 收款配置', 'settings/fundAccounts': '基础设置 / 收款配置',
};
function SessionChrome({ session, accountHost, mayChangeIdentity, notice }: { session: ReplicaSession; accountHost: HTMLElement; mayChangeIdentity: () => boolean; notice: (message: string) => void }) {
 const state = useSyncExternalStore(session.auth.subscribe, session.auth.getSnapshot, session.auth.getSnapshot);
 const [passwordVisible, setPasswordVisible] = useState(false), [passwordOpen, setPasswordOpen] = useState(false);
 const [fields, setFields] = useState<OwnPasswordFields>(emptyPasswords), [errors, setErrors] = useState<OwnPasswordErrors>({});
 const principal = state.principal, passwordBusy = state.phase === 'changing-password';
 const [accountAttempt,setAccountAttempt]=useState(0),[accountLoad,setAccountLoad]=useState<{principal:NonNullable<typeof principal>;views:typeof import('./account-menu.tsx')|null;failed:boolean}|null>(null);
 useEffect(()=>{
  setPasswordOpen(false);setFields(emptyPasswords());setErrors({});
 },[principal]);
 useEffect(()=>{
  if(!principal){setAccountLoad(null);return;}
  let active=true;setAccountLoad({principal,views:null,failed:false});
  void import('./account-menu.tsx').then(views=>{if(active&&session.auth.getSnapshot().principal===principal)setAccountLoad({principal,views,failed:false});},()=>{if(active&&session.auth.getSnapshot().principal===principal)setAccountLoad({principal,views:null,failed:true});});
  return()=>{active=false;};
 },[principal,accountAttempt,session]);
 const accountViews=accountLoad?.principal===principal?accountLoad.views:null;
 const accountCurrent=()=>session.auth.getSnapshot().principal===principal;
 const logout=()=>{if(!accountCurrent())return;if(mayChangeIdentity())void session.auth.logout();else notice('请先保存或取消当前业务编辑。');};
 const closePassword = () => { if (passwordBusy) return; setPasswordOpen(false); setFields(emptyPasswords()); setErrors({}); queueMicrotask(() => accountHost.querySelector<HTMLButtonElement>('button')?.focus()); };
 const submitPassword = async () => {
  if (session.auth.busy) return;
  const next: { currentPassword?: string; newPassword?: string; confirmation?: string } = {};
  if (!fields.currentPassword) next.currentPassword = '请输入原密码';
  if (!fields.newPassword) next.newPassword = '请输入新密码';
  else if (fields.newPassword.length < 8 || new TextEncoder().encode(fields.newPassword).length > 1024) next.newPassword = '新密码至少 8 位且不超过 1024 字节';
  if (!fields.confirmation) next.confirmation = '请再次输入新密码';
  else if (fields.confirmation !== fields.newPassword) next.confirmation = '两次新密码不一致';
  if (Object.keys(next).length) { setErrors(next); return; }
  if (!mayChangeIdentity()) { setErrors({ form: '请先保存或取消当前业务编辑，再修改密码。' }); return; }
  setErrors({});
  const ok = await session.auth.changeOwnPassword({ currentPassword: fields.currentPassword, newPassword: fields.newPassword });
  setFields(emptyPasswords());
  if(!accountCurrent())return;
  if (ok) setPasswordOpen(false);
  else setErrors({ form: session.auth.getSnapshot().notice === 'uncertain' ? '修改结果未确认，请恢复连接后使用新密码验证登录；请勿立即重复提交。' : session.auth.getSnapshot().error?.message ?? '修改未完成，请稍后重试' });
 };
 if(principal&&!accountViews)return createPortal(<div role={accountLoad?.failed?'alert':'status'}>{accountLoad?.failed?<><span>账号菜单加载失败。</span><button className="btn" onClick={()=>setAccountAttempt(value=>value+1)}>重试账号菜单</button><button className="btn" onClick={logout}>退出登录</button></>:<span>正在加载账号菜单…</span>}</div>,accountHost);
 if (principal&&accountViews) {const {AccountMenuView,ChangeOwnPasswordDialogView}=accountViews;return <>
  {createPortal(<AccountMenuView employee={{ id: principal.accountId, name: principal.staffName ?? principal.loginName, role: principal.role }} onChangePassword={() => { if(!accountCurrent())return;setFields(emptyPasswords()); setErrors({}); setPasswordOpen(true); }} onLogout={logout} />, accountHost)}
  {passwordOpen && <ChangeOwnPasswordDialogView visible submitting={passwordBusy} fields={fields} errors={errors} onCancel={closePassword} onSubmit={() => void submitPassword()} onFieldChange={(key, value) => { setFields(old => ({ ...old, [key]: value })); setErrors({}); }} onAfterOpen={() => document.querySelector<HTMLInputElement>('.account-password-modal input[data-account-password="currentPassword"]')?.focus()} />}
 </>;}
 if (state.phase === 'unresolved' || state.phase === 'resolving' || state.phase === 'logging-out') return <section className="login-overlay iw-arco-controls"><div className="login-panel" role="status">正在核对登录状态…</div></section>;
 let remembered = ''; try { remembered = localStorage.getItem('erp-remember-name') ?? ''; } catch { /* Display preference only. */ }
 const message = state.notice === 'password-changed' ? '密码已修改，请使用新密码重新登录' : state.notice === 'uncertain' ? '操作结果未确认，请核验登录状态。' : state.error?.message ?? (state.notice === 'expired' ? '登录已失效，请重新登录' : '');
 return <><LoginView username={remembered} remembered={!!remembered} message={message} passwordVisible={passwordVisible} busy={session.auth.busy} onTogglePassword={() => setPasswordVisible(value => !value)} onSubmit={event => {
  event.preventDefault(); if (session.auth.busy) return;
  const form = event.currentTarget, data = new FormData(form), loginName = String(data.get('username') ?? '').trim(), password = String(data.get('password') ?? ''), remember = data.get('remember') === 'on';
  const input = form.elements.namedItem('password'); if (input instanceof HTMLInputElement) input.value = '';
  void session.auth.login({ loginName, password }).then(ok => { if (ok) try { if (remember) localStorage.setItem('erp-remember-name', loginName); else localStorage.removeItem('erp-remember-name'); } catch { /* Display preference only. */ } });
 }} />{state.notice === 'uncertain' && <button className="btn" style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 20000 }} onClick={() => void session.auth.resolveSession()}>核验登录状态</button>}</>;
}

/** Called by C's one normal entry after removing the original script/bootstrap owners.
 * Uses the original static shell. No old application root or body fallback. */
export function mountNormalReplica(options: ReadyPageOptions & { readonly page: HTMLElement; readonly accountHost: HTMLElement; readonly app: HTMLElement; readonly breadcrumb: HTMLElement; readonly transportMode: 'same-origin-https' | 'approved-synthetic'; readonly prepareRoute?: (route: string, signal: AbortSignal) => Promise<void> }) {
 const { session, page, app, breadcrumb } = options;
 if (options.transportMode === 'same-origin-https' && (location.protocol !== 'https:' || location.origin !== session.http.origin)) throw new TypeError('正常运行需要已配置的同源 HTTPS。');
 app.dataset.replicaTransport = options.transportMode;
 const pages = createReadyPageMounts({ ...options, inventory: { ...options.inventory, onOpenSource: options.inventory.onOpenSource ?? openInventorySource } }, next => { void navigate(next); }, options.prepareRoute), chromeHost = document.createElement('div');
 chromeHost.dataset.replicaSession = ''; document.body.append(chromeHost); const chromeRoot = createRoot(chromeHost);
 let current: MountedReplicaPage | null = null, scope: ReadScope | null = null, route = '', serial = 0, disposed = false;
 let identity: object | null = null, toastTimer: number | undefined;
 let sourceNavigation: AbortController | null = null;
 async function openInventorySource(entry: InventoryLedgerEntry): Promise<boolean> {
  const activeScope = scope, activePage = current, activeSerial = serial, principal = session.auth.getSnapshot().principal;
  const dialog = options.inventory.ledgerDialog;
  const kind = entry.source.kind === 'HISTORY_REVISION' ? entry.source.documentKind : entry.source.kind;
  if (!activeScope?.active || !activePage || route !== 'inventory' || !dialog.open || !principal
    || kind === 'SALES' && !options.routes.sales || kind === 'TRANSFER' && !options.routes.transfers || kind === 'CUTOFF_BASELINE') return false;
  sourceNavigation?.abort();
  const controller = new AbortController(); sourceNavigation = controller;
  const active = () => !disposed && !controller.signal.aborted && activeScope.active && scope === activeScope
    && current === activePage && serial === activeSerial && route === 'inventory' && dialog.open && session.auth.getSnapshot().principal === principal;
  const close = () => controller.abort();
  dialog.addEventListener('close', close, { once: true });
  try {
   const { resolveInventorySourceRoute } = await import('../documents/inventory-source-navigation.ts');
   if (!active()) return false;
   const next = await resolveInventorySourceRoute({ entry, scope: activeScope, http: session.http, signal: controller.signal });
   if (!active() || next === null) return false;
   // Successful navigation disposes the old inventory scope; retain its actual result.
   return await navigate(next);
  } catch (error) {
   if (!active()) return false;
   if (error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) session.onAccessFailure(error);
   throw error;
  } finally {
   dialog.removeEventListener('close', close);
   if (sourceNavigation === controller) sourceNavigation = null;
  }
 }
 const toast = (message: string) => { let node = document.getElementById('toast'); if (!node) { node = document.createElement('div'); node.id = 'toast'; node.setAttribute('role', 'status'); document.body.append(node); } node.textContent = message; node.style.display = 'block'; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { if (node) node.style.display = 'none'; }, 4200); };
 const canLeave = () => !pages.hasUnresolvedWrite() && (current?.canLeave() ?? true);
 const leaveHost=document.createElement('div');leaveHost.dataset.documentLeave='';document.body.append(leaveHost);const leaveRoot=createRoot(leaveHost);
 let pendingLeave:{next:string;replace:boolean;owner:MountedReplicaPage;scope:ReadScope|null}|null=null;
 const dismissLeave=()=>{pendingLeave=null;leaveRoot.render(null);};
 const askLeave=(next:string,replace:boolean)=>{
  if(pendingLeave||!current||!current.canDiscard?.()||pages.hasUnresolvedWrite())return;
  pendingLeave={next,replace,owner:current,scope};
  leaveRoot.render(<SaleDialog variant="transfer" className="tc-confirm tc-danger" title="有未保存的修改" close={dismissLeave} footer={<><button type="button" className="btn" onClick={dismissLeave}>继续编辑</button><button type="button" className="btn primary" onClick={()=>{const decision=pendingLeave;if(!decision||current!==decision.owner||scope!==decision.scope||!scope?.active){dismissLeave();return;}if(pages.hasUnresolvedWrite()||!current.canDiscard?.()||!current.discard?.()){dismissLeave();toast('当前操作尚未结束，输入已保留。');return;}dismissLeave();void navigate(decision.next,decision.replace);}}>放弃修改并离开</button></>}><p>离开后，本次未保存的修改将丢失。</p></SaleDialog>);
 };
 const clearPage = () => { sourceNavigation?.abort(); sourceNavigation = null; dismissLeave();serial++; current?.dispose(); current = null; scope?.dispose(); scope = null; page.replaceChildren(); };
 const status = (message: string, retry?: () => void, retryLabel = '重试加载资料') => { page.replaceChildren(); const box = document.createElement('div'); box.className = 'iw-state'; box.setAttribute('role', retry ? 'alert' : 'status'); box.textContent = message; if (retry) { const button = document.createElement('button'); button.className = 'btn'; button.textContent = retryLabel; button.onclick = retry; box.append(' ', button); } page.append(box); };
 async function navigate(next: string, replace = false): Promise<boolean> {
  if (disposed || !session.auth.getSnapshot().principal) return false;
  if (next === route && current && scope?.active) return true;
  if (!canLeave()) { if(!pages.hasUnresolvedWrite()&&current?.canDiscard?.())askLeave(next,replace);else toast('请先保存或取消当前编辑，当前输入已保留。');return false; }
  clearPage(); route = next; const request = serial;
  breadcrumb.textContent = captions[next] ?? (next.startsWith('transfer/')?'库存管理 / 调拨单':next.startsWith('sales/')?'销售管理 / 销货单':next.startsWith('products/')?'商品管理 / 商品信息':'业务页面');
  document.querySelectorAll<HTMLAnchorElement>('.sidebar a[data-route]').forEach(link => { const selected = link.dataset.route === next || (next === 'customers' || next === 'suppliers') && link.dataset.route === 'settings/parties' || next === 'settings/accounts' && link.dataset.route === 'settings/staff' || next.startsWith('transfer/') && next!=='transfer/new' && link.dataset.route==='transfer' || next.startsWith('sales/') && next!=='sales/new' && link.dataset.route==='sales' || next.startsWith('products/') && link.dataset.route==='products'; link.classList.toggle('selected', selected); if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  if (replace) history.replaceState(null, '', '#' + next); else if (location.hash !== '#' + next) history.pushState(null, '', '#' + next);
  status('正在加载页面…');
  try {
   scope = session.reads.createScope('replica-route:' + next + ':' + request); const active = scope;
   active.signal.addEventListener('abort', () => {
    // A permission failure clears the reader scope while retaining the signed-in identity.
    // Ordinary navigation/identity replacement already advances serial before disposal.
    queueMicrotask(() => {
     if (disposed || request !== serial || scope !== active || !session.auth.getSnapshot().principal) return;
     dismissLeave();
     current?.dispose(); current = null;
     status('当前页面的访问权限或资料范围已失效，请重新核验。', () => { void session.auth.resolveSession(); }, '重新核验访问权限');
    });
   }, { once: true });
   await options.prepareRoute?.(next, active.signal);
   if (disposed || request !== serial || !active.active) return false;
   const mounted = await pages.mount(page, next, active);
   if (disposed || request !== serial || !active.active) { mounted.dispose(); return false; }
   current = mounted; return true;
  } catch (error) {
   if (disposed || request !== serial) return false;
   status(error instanceof Error ? error.message : '页面读取失败。', () => { route = ''; if (scope?.active) void navigate(next, true); else void session.auth.resolveSession(); }); return false;
  }
 }
 // The combined menu keeps customer/supplier and account data as separate consumers.
 const click = (event: MouseEvent) => { const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.sidebar a[data-route]') : null; if (!target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); void navigate(target.dataset.route!); };
 const hash = () => { const next = location.hash.slice(1) || 'inventory'; void navigate(next, true).then(ok => { if (!ok && current) history.replaceState(null, '', '#' + route); }); };
 const beforeUnload = (event: BeforeUnloadEvent) => { if (!canLeave()) { event.preventDefault(); event.returnValue = ''; } };
 const authChanged = () => {
  const state = session.auth.getSnapshot(), principal = state.principal;
  app.inert = !principal;
  if (!principal) { identity = null; clearPage(); route = ''; return; }
  if (identity !== principal) { identity = principal; clearPage(); route = ''; void navigate(location.hash.slice(1) || 'inventory', true); }
 };
 const unsubscribe = session.auth.subscribe(authChanged);
 chromeRoot.render(<SessionChrome session={session} accountHost={options.accountHost} mayChangeIdentity={canLeave} notice={toast} />);
 document.addEventListener('click', click); window.addEventListener('hashchange', hash); window.addEventListener('beforeunload', beforeUnload);
 authChanged(); if (session.auth.getSnapshot().phase === 'unresolved') void session.auth.resolveSession();
 return { navigate, session, dispose() { if (disposed) return; disposed = true; window.clearTimeout(toastTimer); unsubscribe(); document.removeEventListener('click', click); window.removeEventListener('hashchange', hash); window.removeEventListener('beforeunload', beforeUnload); clearPage(); pages.dispose(); leaveRoot.unmount();leaveHost.remove();chromeRoot.unmount(); chromeHost.remove(); app.inert = false; session.dispose(); } };
}
