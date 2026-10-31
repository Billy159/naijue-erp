/** Read-only cancellation. Never use for writes or an in-progress issuer check. */
export function awaitRead<T>(work:Promise<T>,signal:AbortSignal,cancelled:()=>Error,onAbort?:()=>void):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  let done=false;
  const abort=()=>{if(done)return;done=true;signal.removeEventListener('abort',abort);try{onAbort?.();}catch{/* Cleanup outcome is unknown: never retry or strand cancellation. */}reject(cancelled());};
  signal.addEventListener('abort',abort,{once:true});
  work.then(value=>{if(done)return;done=true;signal.removeEventListener('abort',abort);resolve(value);},error=>{if(done)return;done=true;signal.removeEventListener('abort',abort);reject(error);});
  if(signal.aborted)abort();
 });
}
export async function acquireReadClient<T extends {release(error?:Error|boolean):void}>(pool:{connect():Promise<T>},signal:AbortSignal,cancelled:()=>Error):Promise<T>{
 if(signal.aborted)throw cancelled();
 let abandoned=false, observed:T|undefined, released=false;const pending=pool.connect();
 const release=()=>{if(observed&&!released){released=true;try{observed.release(cancelled());}catch{/* A failed disposal must not create an unhandled late rejection. */}}};
 // connect may itself verify an issuer: do not interrupt/revoke that check.
 // Retain its bounded physical work and dispose the late lease after it settles.
 void pending.then(client=>{observed=client;if(abandoned)release();},()=>{});
 return awaitRead(pending,signal,cancelled,()=>{abandoned=true;release();});
}
