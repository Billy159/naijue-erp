import { createReplicaSession, mountNormalReplica, createReplicaWorkbook } from './runtime/entry.tsx';
import { configureReplicaStyleAssetBase, prepareReplicaCommonStyles, prepareReplicaStyles } from './runtime-styles.ts';
import { parseProductionHostAssets, parseProductionHostConfiguration } from '../../src/production-host/configuration.ts';

/** The copied host uses the existing real session and HTTP clients; no preview transport. */
export async function startReplicaProductionHost() {
 const element=document.getElementById('naijue-erp-production-configuration');
 if(element?.tagName!=='SCRIPT'||element.getAttribute('type')!=='application/json'||!element.textContent||element.textContent.length>16_384)throw new TypeError('Public production configuration is missing.');
 const payload:unknown=JSON.parse(element.textContent);
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==2||!Object.hasOwn(payload,'configuration')||!Object.hasOwn(payload,'assets'))throw new TypeError('Invalid public configuration.');
 const value=payload as {configuration:unknown;assets:unknown};
 const configuration=parseProductionHostConfiguration(value.configuration);parseProductionHostAssets(value.assets);
 if(location.protocol!=='https:'||location.origin!==configuration.http.origin)throw new TypeError('Production requires its configured same-origin HTTPS.');
 configureReplicaStyleAssetBase(configuration.assets.basePath);
 // The deferred module runs after the shared head stylesheet has settled.
 // Keep Arco before the copied overrides without carrying its CSS as JavaScript.
 const sharedArco=document.head.querySelector<HTMLLinkElement>('link[data-shared-arco="2.66.16"]');
 if(!sharedArco?.sheet)throw new Error('Shared interface stylesheet unavailable.');
 const startup=new AbortController();let owner:ReturnType<typeof mountNormalReplica>|undefined,disposed=false;
 const required=(selector:string)=>{const node=document.querySelector<HTMLElement>(selector);if(!node)throw new Error('Missing copied host '+selector);return node;};
 const ledger=document.getElementById('gold-drawer');if(!(ledger instanceof HTMLDialogElement))throw new Error('Missing native ledger host.');
 const mount=()=>{const session=createReplicaSession({...configuration.http,fetch:globalThis.fetch.bind(globalThis)});return mountNormalReplica({session,routes:configuration.routes,...(configuration.routes.historyRevision?{historyRevision:configuration.routes.historyRevision}:{}),newRequestKey:()=>crypto.randomUUID(),inventory:{ledgerDialog:ledger,createWorkbook:createReplicaWorkbook},catalogue:{onChanged:()=>{}},page:required('#page'),accountHost:required('.basic-account'),app:required('.app'),breadcrumb:required('#breadcrumb'),transportMode:'same-origin-https',prepareRoute:prepareReplicaStyles});};
 const hide=()=>{startup.abort();owner?.dispose();owner=undefined;};
 const show=(event:PageTransitionEvent)=>{if(!disposed&&event.persisted&&!owner)owner=mount();};
 window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
 try {await prepareReplicaCommonStyles(startup.signal);if(!startup.signal.aborted){owner=mount();document.documentElement.removeAttribute('data-replica-starting');document.getElementById('replica-startup')?.remove();document.getElementById('replica-startup-style')?.remove();}}
 catch(error){window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);throw error;}
 return {dispose(){if(disposed)return;disposed=true;window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);hide();}};
}
void startReplicaProductionHost().catch(()=>{
 const status=document.getElementById('replica-startup')??document.getElementById('page');
 if(status){status.replaceChildren();status.setAttribute('role','alert');const message=document.createElement('span');message.textContent='系统资源未能加载，请重新加载后重试。';const retry=document.createElement('a');retry.href=location.href;retry.textContent='重新加载';status.append(message,retry);}
});
