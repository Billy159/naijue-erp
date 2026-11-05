import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReplicaSalesSession } from './sales-session.ts';
import { SaleDialog } from './native-dialog.tsx';
export function WriteRecovery(p:{session:ReplicaSalesSession;committed:()=>void}) {
 const editor=p.session.editor,state=useSyncExternalStore(editor.subscribe,editor.getSnapshot,editor.getSnapshot),write=state.command.write;
 const [closed,setClosed]=useState(false);
 useEffect(()=>{if(write.phase==='uncertain')setClosed(false);},[write.phase]);
 const finish=async(task:Promise<boolean>)=>{await task;if(editor.getSnapshot().command.write.phase==='committed')p.committed();};
 return <>{write.phase==='uncertain'&&closed&&<button className="btn" onClick={()=>setClosed(false)}>核实原操作</button>}{write.phase==='uncertain'&&!closed&&<SaleDialog title="核实原操作" close={()=>setClosed(true)} footer={<><button className="btn" onClick={()=>void finish(editor.commands.checkReceipt())}>查询原回执</button><button className="btn" onClick={()=>void finish(editor.commands.replayOriginal())}>按原请求重试</button></>}><p>{state.command.notice??'原操作结果尚未确认，输入与原请求已保留。'}</p></SaleDialog>}{['submitting','checking','replaying'].includes(write.phase)&&<div role="status">正在处理原操作… <button className="btn" onClick={()=>editor.commands.cancelWaiting()}>停止等待</button></div>}</>;
}
