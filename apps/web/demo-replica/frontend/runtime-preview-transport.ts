import {createSyntheticUnifiedTransport} from '../../unified-browser-harness/synthetic-transport.ts';
const detailPaths=new Set(['/products/prices/query','/products/barcodes/query','/products/stock/query','/products/stock-overview/query']);
type Call={method:string;path:string;phase:'pending'|'completed'|'aborted'|'failed';started:number;finished?:number};
/** Explicit local SYNTHETIC preview only. Never selected as a production fallback. */
export function createReplicaPreviewTransport(){
 const base=createSyntheticUnifiedTransport();base.authorize();const records:Call[]=[];
 let products:Promise<Awaited<ReturnType<typeof import('./runtime/products/synthetic-preview-transport.ts')['createSyntheticProductPreviewTransport']>>>|undefined;
 let settings:Promise<ReturnType<typeof import('./runtime/settings/synthetic-preview-transport.ts')['createSettingsPreviewTransport']>>|undefined;
 let documents:Promise<ReturnType<typeof import('./runtime/documents/synthetic-preview-transport.ts')['createSyntheticDocumentPreviewTransport']>>|undefined;
 const document=()=>documents??=import('./runtime/documents/synthetic-preview-transport.ts').then(m=>m.createSyntheticDocumentPreviewTransport({syntheticOnly:true,origin:base.http.origin,existingFetch:base.http.fetch}));
 const product=()=>products??=import('./runtime/products/synthetic-preview-transport.ts').then(m=>m.createSyntheticProductPreviewTransport({origin:base.http.origin,existingFetch:base.http.fetch,snapshotVersion:1,syntheticUnboundBarcodeFixture:true}));
 const setting=()=>settings??=import('./runtime/settings/synthetic-preview-transport.ts').then(m=>m.createSettingsPreviewTransport());
 const fetch=async(input:string,init:RequestInit):Promise<Response>=>{
  const url=new URL(input);if(url.origin!==base.http.origin||url.username||url.password||!url.pathname.startsWith('/api/'))throw new TypeError('Closed synthetic preview origin');
  const path=url.pathname.slice(4),method=init.method??'GET',record:Call={method,path,phase:'pending',started:performance.now()};records.push(record);if(records.length>200)records.shift();
  const signal=init.signal;let rejectAbort:(error:Error)=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const abort=()=>{record.phase='aborted';record.finished=performance.now();rejectAbort(new DOMException('Preview read aborted','AbortError'));};
  signal?.addEventListener('abort',abort,{once:true});
  const pending=Promise.resolve().then(async()=>{
   if(signal?.aborted)throw new DOMException('Preview read aborted','AbortError');
   if(detailPaths.has(path)&&method==='POST')return(await product()).request(url,init);
   if(path.startsWith('/organization/')||path.startsWith('/organization-maintenance/')||path.startsWith('/staff/')||path.startsWith('/accounts/')||path.startsWith('/payment/')||path==='/settings/audit/query'||/^\/(customers|suppliers)(?:\/|$)/.test(path)){
    const adapter=await setting();if(adapter.canHandle(path,method))return adapter.request(url,init);
   }
   if(/^\/(?:sales|transfers|current-form|dictionary-read)(?:\/|$)/.test(path)){const adapter=await document();if(adapter.canHandle(path,method))return adapter.request(url,init);}
   return base.http.fetch(input,init);
  });
  void pending.then(response=>{if(signal?.aborted)void response.body?.cancel().catch(()=>{});},()=>{});
  try{if(signal?.aborted)abort();const response=await Promise.race([pending,aborted]);record.phase='completed';record.finished=performance.now();return response;}
  catch(error){if(record.phase!=='aborted'){record.phase='failed';record.finished=performance.now();}throw error;}
  finally{signal?.removeEventListener('abort',abort);}
 };
 return Object.freeze({http:Object.freeze({...base.http,fetch}),calls:()=>records.map(x=>({...x})),providerCalls:base.calls,setNextReadDelay:base.setNextReadDelay});
}
