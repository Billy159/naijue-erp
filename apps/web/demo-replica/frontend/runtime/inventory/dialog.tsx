import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
/** Source native dialog lifecycle, with one original return-focus anchor. */
export function SourceDialog(p:{className:string;label:string;existing?:HTMLDialogElement;close:()=>void;children:ReactNode}){
 const [target,setTarget]=useState<HTMLElement|null>(null),close=useRef(p.close);close.current=p.close;
 useLayoutEffect(()=>{const anchor=document.activeElement as HTMLElement|null,dialog=p.existing??document.createElement('dialog');if(!p.existing)document.body.append(dialog);const target=p.existing?.querySelector<HTMLElement>('#gold-drawer-content')??dialog;if(p.existing)target.replaceChildren();const oldClass=dialog.className,oldLabel=dialog.getAttribute('aria-label');dialog.className=p.className;dialog.setAttribute('aria-label',p.label);const cancel=(e:Event)=>{e.preventDefault();close.current();};dialog.addEventListener('cancel',cancel);setTarget(target);if(!dialog.open)dialog.showModal();return()=>{dialog.removeEventListener('cancel',cancel);if(dialog.open)dialog.close();dialog.className=oldClass;if(oldLabel===null)dialog.removeAttribute('aria-label');else dialog.setAttribute('aria-label',oldLabel);if(!p.existing)dialog.remove();if(anchor?.isConnected)anchor.focus({preventScroll:true});};},[p.existing,p.className,p.label]);
 return target?createPortal(p.children,target):null;
}
