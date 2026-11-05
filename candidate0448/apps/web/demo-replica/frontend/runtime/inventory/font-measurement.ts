interface ObservableFonts {
 readonly status:string;
 readonly ready:PromiseLike<unknown>;
 addEventListener(type:'loadingdone'|'loadingerror',listener:()=>void):void;
 removeEventListener(type:'loadingdone'|'loadingerror',listener:()=>void):void;
}
/** A font epoch only: arbitrary late CSS or non-loading FontFaceSet mutations
 * are intentionally NOT claimed to be covered. No layout reads here. */
export function observeInventoryFontGeometry(fonts:ObservableFonts|undefined,requestFrame:(callback:()=>void)=>number,cancelFrame:(id:number)=>void,invalidate:()=>void):()=>void {
 if(!fonts)return()=>{};
 let active=true,frame:number|undefined;
 const changed=()=>{
  if(!active||frame!==undefined)return;
  frame=requestFrame(()=>{frame=undefined;if(active)invalidate();});
 };
 fonts.addEventListener('loadingdone',changed);
 fonts.addEventListener('loadingerror',changed);
 if(fonts.status==='loading')void fonts.ready.then(changed,changed);
 return()=>{active=false;if(frame!==undefined)cancelFrame(frame);frame=undefined;fonts.removeEventListener('loadingdone',changed);fonts.removeEventListener('loadingerror',changed);};
}
