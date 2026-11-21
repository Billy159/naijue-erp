import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { closeNativeModal, restoreModalTrigger, showNativeModal } from '../common/native-modal-lifecycle.ts';
/** Source native dialog lifecycle, with one original return-focus anchor. */
export function SourceDialog(p:{className:string;label:string;kind?:'scope';existing?:HTMLDialogElement;close:()=>void;children:ReactNode}){
 const [target,setTarget]=useState<HTMLElement|null>(null),close=useRef(p.close);close.current=p.close;
 useLayoutEffect(()=>{const anchor=document.activeElement,dialog=p.existing??document.createElement('dialog');if(!p.existing)document.body.append(dialog);const target=p.existing?.querySelector<HTMLElement>('#gold-drawer-content')??dialog;if(p.existing)target.replaceChildren();const oldClass=dialog.className,oldLabel=dialog.getAttribute('aria-label');dialog.className=p.className;dialog.setAttribute('aria-label',p.label);if(p.kind)dialog.setAttribute('data-kind',p.kind);const cancel=(e:Event)=>{e.preventDefault();close.current();};dialog.addEventListener('cancel',cancel);setTarget(target);showNativeModal(dialog);return()=>{dialog.removeEventListener('cancel',cancel);closeNativeModal(dialog);dialog.className=oldClass;if(oldLabel===null)dialog.removeAttribute('aria-label');else dialog.setAttribute('aria-label',oldLabel);if(!p.existing)dialog.remove();restoreModalTrigger(anchor);};},[p.existing,p.className,p.label,p.kind]);
 return target?createPortal(p.children,target):null;
}
