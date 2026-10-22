import {createApplication,createDemoFrameWorkspaceRenderer} from '../src/application/index.tsx';
import type {ApplicationRoute,RouteStylesheet} from '../src/application/contracts.ts';
import {installManagementSyntheticAuthNotice} from '../management-browser-harness/synthetic-auth-notice.ts';
import {createSyntheticUnifiedTransport} from './synthetic-transport.ts';
import type {SyntheticCall} from './types.ts';
import {createProductHttpReader} from '../src/transport/product-http-reader.ts';
import {existingProductFullPageReader} from '../src/products/product-page-contracts.ts';
import {reviewProfile,type UnifiedReviewProfile} from './review-profile.ts';
/** A single actual Application/root/controller/session across all explicitly enabled routes.
 * Only this deliberately synthetic host injects the in-memory transport. */
export function mountUnifiedHarness(root:HTMLElement,onCall?:(call:SyntheticCall)=>void,profile:UnifiedReviewProfile='standard'){
 const selected=reviewProfile(profile);
 const document=root.ownerDocument,transport=createSyntheticUnifiedTransport(onCall,selected);
 const stylesheet=():RouteStylesheet=>({async load(){if(!document.querySelector('style[data-unified-harness-style]'))throw new Error('Synthetic bundled styles not ready');},dispose(){}});
 const app=createApplication({http:transport.http,presentation:{renderWorkspace:createDemoFrameWorkspaceRenderer(),renderRouteState:({controller,state})=><section className="unified-route-state" aria-label="验收版路由状态"><p>{state.phase==='home'?'请从左侧选择页面。当前为统一验收版，全部数据均为合成数据。':`页面状态：${state.phase}`}</p>{state.phase==='loading'&&<button type="button" onClick={()=>controller.cancelRoute()}>取消页面加载</button>}{['error','cancelled'].includes(state.phase)&&<button type="button" onClick={()=>{void controller.navigate(state.route);}}>重试当前页面</button>}</section>},routes:{
  inventory:{stylesheet:stylesheet(),actions:{}},
  sales:{stylesheet:stylesheet(),detailStylesheet:stylesheet(),commands:{newRequestKey:()=>crypto.randomUUID(),manualCreate:true}},
  transfers:{stylesheet:stylesheet(),detailStylesheet:stylesheet(),...(selected==='standard'?{commands:{newRequestKey:()=>crypto.randomUUID(),manualCreate:true}}:{product:{stylesheet:stylesheet()}})},
  parties:{stylesheet:stylesheet(),newRequestKey:()=>crypto.randomUUID(),readOnly:true},
  products:{stylesheet:stylesheet(),product:{stylesheet:stylesheet()},fullPage:{stylesheet:stylesheet(),allowedTabs:['base','specs','barcodes','prices','images','stock'],initialTab:'base',reader:existingProductFullPageReader(createProductHttpReader(transport.http))}},productCategories:{stylesheet:stylesheet()},
  productSettings:{stylesheet:stylesheet(),allowedTabs:['colors','groups','fits','seasons'],initialTab:'groups'},barcodeSchemes:{stylesheet:stylesheet()},
  storeSettings:{stylesheet:stylesheet(),allowedTabs:['stores','warehouses'],initialTab:'stores',allowHallDirectoryRead:true},
 }});
 const detach=installManagementSyntheticAuthNotice(root);app.mount(root);
 return Object.freeze({app,transport,async enter(route:ApplicationRoute|null=null){transport.authorize();await app.controller.authentication.resolveSession();return app.controller.navigate(route);},async revoke(){transport.revoke();await app.controller.authentication.resolveSession();},dispose(){app.dispose();detach();}});
}
