import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import Empty from '@arco-design/web-react/es/Empty';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import {emptyCss} from './control-css.ts';

const sourceArcoCss=arcoCss.replace(/\bbody\s*\{/g,':host {');
const sourceSheets=new WeakMap<Document,Map<string,CSSStyleSheet>>();
function sharedSourceSheet(doc:Document,css:string):CSSStyleSheet {
 let sheets=sourceSheets.get(doc);if(!sheets){sheets=new Map();sourceSheets.set(doc,sheets);}
 let sheet=sheets.get(css);if(!sheet){sheet=new doc.defaultView!.CSSStyleSheet();sheet.replaceSync(css);sheets.set(css,sheet);}return sheet;
}
/** The source shadow host is retained; portals belong to the SAME React root. */
export function SourceControl(p:{css:string;attributes?:Record<string,string>;children:(portal:HTMLElement,host:HTMLElement)=>ReactNode}) {
 const host=useRef<HTMLDivElement>(null),[nodes,setNodes]=useState<{app:HTMLElement;portal:HTMLElement;host:HTMLElement}|null>(null);
 useLayoutEffect(()=>{
  const el=host.current!,doc=el.ownerDocument,shadow=el.shadowRoot??el.attachShadow({mode:'open'}),app=doc.createElement('div'),portal=doc.createElement('div');
  let releaseStyles:()=>void;
  if('adoptedStyleSheets' in shadow&&typeof doc.defaultView?.CSSStyleSheet.prototype.replaceSync==='function'){
   // Adopt both layers: adopted sheets follow style elements, so mixing the two would reverse Demo overrides.
   const sheets=[sharedSourceSheet(doc,sourceArcoCss),sharedSourceSheet(doc,p.css)];
   shadow.adoptedStyleSheets=[...shadow.adoptedStyleSheets,...sheets];
   releaseStyles=()=>{shadow.adoptedStyleSheets=shadow.adoptedStyleSheets.filter(sheet=>!sheets.includes(sheet));};
  }else{
   const style=doc.createElement('style'),local=doc.createElement('style');style.textContent=sourceArcoCss;local.textContent=p.css;shadow.append(style,local);releaseStyles=()=>{style.remove();local.remove();};
  }
  app.id='root';portal.id='portal';shadow.append(app,portal);setNodes({app,portal,host:el});
  return()=>{releaseStyles();app.remove();portal.remove();};
 },[p.css]);
 return <div ref={host} {...p.attributes}>{nodes&&createPortal(p.children(nodes.portal,nodes.host),nodes.app)}</div>;
}
export function SourceEmpty(p:{title:string;description:string}) {return <div id="inventory-arco-empty" className="iw-empty-host"><SourceControl css={emptyCss}>{()=> <Empty description={<div className="inv-empty-copy"><strong>{p.title}</strong><span>{p.description}</span></div>}/>}</SourceControl></div>;}
