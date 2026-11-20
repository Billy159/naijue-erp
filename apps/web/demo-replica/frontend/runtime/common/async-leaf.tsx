import {Component,Suspense,lazy,useEffect,useState,type ComponentType,type ReactNode} from 'react';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';

interface BoundaryProps {children:ReactNode;failed:()=>void;fallback:ReactNode}
export class LeafErrorBoundary extends Component<BoundaryProps,{failed:boolean}>{
 override state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 override componentDidCatch(){this.props.failed();}
 override render(){return this.state.failed?this.props.fallback:this.props.children;}
}
/** Resource failures stay inside the leaf. Business sessions and writes belong to the caller. */
export function AsyncLeaf<P extends object>(p:{load:()=>Promise<{default:ComponentType<P>}>;scope:ReadScope;label:string;children:(Leaf:ComponentType<P>)=>ReactNode;pending?:ReactNode;recovery?:ReactNode;close?:()=>void;closeLabel?:string;failed?:()=>void;retry?:()=>boolean}){
 const [Leaf,setLeaf]=useState(()=>lazy(p.load)),[attempt,setAttempt]=useState(0),[closed,setClosed]=useState(false),[active,setActive]=useState(p.scope.active);
 useEffect(()=>{const abort=()=>setActive(false);p.scope.signal.addEventListener('abort',abort,{once:true});if(!p.scope.active)abort();return()=>p.scope.signal.removeEventListener('abort',abort);},[p.scope]);
 const retry=()=>{if(!p.scope.active||p.retry?.()===false)return;setLeaf(()=>lazy(p.load));setAttempt(value=>value+1);setClosed(false);};
 if(!active||!p.scope.active)return null;
 if(closed)return <button type="button" className="btn" onClick={retry}>重新打开{p.label}</button>;
 const fallback=<><span role="alert">{p.label}加载失败，当前输入已保留。<button type="button" className="btn" onClick={retry}>重试{p.label}</button><button type="button" className="btn" onClick={()=>{if(!p.scope.active)return;if(p.close)p.close();else setClosed(true);}}>{p.closeLabel??'关闭'}</button></span>{p.recovery}</>;
 return <LeafErrorBoundary key={attempt} failed={()=>{if(p.scope.active)p.failed?.();}} fallback={fallback}><Suspense fallback={<>{p.pending??<span role="status">正在加载{p.label}…</span>}{p.close&&<button type="button" className="btn" onClick={()=>{if(p.scope.active)p.close?.();}}>{p.closeLabel??'关闭'}</button>}</>}>{p.children(Leaf)}</Suspense></LeafErrorBoundary>;
}
