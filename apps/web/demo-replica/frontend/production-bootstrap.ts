import sharedArcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
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
 const style=document.createElement('style');style.dataset.sharedArco='2.66.16';style.textContent=sharedArcoCss;document.head.prepend(style);
 const startup=new AbortController();let owner:ReturnType<typeof mountNormalReplica>|undefined,disposed=false;
 const required=(selector:string)=>{const node=document.querySelector<HTMLElement>(selector);if(!node)throw new Error('Missing copied host '+selector);return node;};
 const ledger=document.getElementById('gold-drawer');if(!(ledger instanceof HTMLDialogElement))throw new Error('Missing native ledger host.');
 const mount=()=>{const session=createReplicaSession({...configuration.http,fetch:globalThis.fetch.bind(globalThis)});return mountNormalReplica({session,routes:configuration.routes,newRequestKey:()=>crypto.randomUUID(),inventory:{ledgerDialog:ledger,createWorkbook:createReplicaWorkbook},catalogue:{onChanged:()=>{}},page:required('#page'),accountHost:required('.basic-account'),app:required('.app'),breadcrumb:required('#breadcrumb'),transportMode:'same-origin-https',prepareRoute:prepareReplicaStyles});};
 const hide=()=>{startup.abort();owner?.dispose();owner=undefined;};
 const show=(event:PageTransitionEvent)=>{if(!disposed&&event.persisted&&!owner)owner=mount();};
 window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
 try {await prepareReplicaCommonStyles(startup.signal);if(!startup.signal.aborted)owner=mount();}
 catch(error){window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);style.remove();throw error;}
 return {dispose(){if(disposed)return;disposed=true;window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);hide();style.remove();}};
}
void startReplicaProductionHost().catch(()=>{const page=document.getElementById('page');if(page){page.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='系统未能启动，请检查访问地址和页面资源后重试。';page.append(message);}});
