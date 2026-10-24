import { useLayoutEffect, useRef, type ReactNode } from 'react';
/** The original sale-current native dialog markup and focus return. */
export function SaleDialog(p:{title:string;children:ReactNode;footer?:ReactNode;close:()=>void;className?:string}) {
 const node=useRef<HTMLDialogElement>(null),origin=useRef<Element|null>(null);
 useLayoutEffect(()=>{origin.current=document.activeElement;const dialog=node.current!;dialog.showModal();return()=>{if(dialog.open)dialog.close();if(origin.current instanceof HTMLElement&&origin.current.isConnected)origin.current.focus({preventScroll:true});};},[]);
 return <dialog ref={node} id="sale-dialog" className={p.className??''} aria-labelledby="sale-dialog-title" onCancel={event=>{event.preventDefault();p.close();}}><header><h2 id="sale-dialog-title">{p.title}</h2><button type="button" className="btn" onClick={p.close}>关闭</button></header><div className="sale-dialog-body">{p.children}</div>{p.footer&&<footer>{p.footer}</footer>}</dialog>;
}
