/** Public readiness is bounded work, not a cached proof of authority. A logical
 * timeout never frees the single physical-work slot before its cleanup settles. */
export function createReadinessProbe(work:(signal:AbortSignal)=>Promise<boolean>, closing:()=>boolean,
  options:{timeoutMs:number;maxWaiters:number}={timeoutMs:2000,maxWaiters:32}) {
 if(!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||!Number.isSafeInteger(options.maxWaiters)||options.maxWaiters<1)throw new TypeError('Bounded readiness budgets required');
 type Waiter={finish:(ready:boolean)=>void};
 type Flight={controller:AbortController;waiters:Set<Waiter>;timer:ReturnType<typeof setTimeout>|undefined};
 let pending:Flight|undefined;
 return (signal?:AbortSignal):Promise<boolean>=>{
  if(closing()||signal?.aborted)return Promise.resolve(false);
  if(pending?.controller.signal.aborted || pending && pending.waiters.size>=options.maxWaiters)return Promise.resolve(false);
  let start=false;
  if(!pending){pending={controller:new AbortController(),waiters:new Set(),timer:undefined};start=true;}
  const flight=pending;
  const result=new Promise<boolean>(resolve=>{
   const waiter:Waiter={finish:ready=>{flight.waiters.delete(waiter);signal?.removeEventListener('abort',abort);resolve(ready&&!closing()&&!signal?.aborted&&!flight.controller.signal.aborted);}};
   const abort=()=>{waiter.finish(false);if(flight.waiters.size===0)flight.controller.abort();};
   flight.waiters.add(waiter);signal?.addEventListener('abort',abort,{once:true});
  });
  if(start){
   flight.timer=setTimeout(()=>{flight.controller.abort();for(const waiter of [...flight.waiters])waiter.finish(false);},options.timeoutMs);
   void Promise.resolve().then(()=>work(flight.controller.signal)).catch(()=>false).then(ready=>{
    if(flight.timer)clearTimeout(flight.timer);if(pending===flight)pending=undefined;
    for(const waiter of [...flight.waiters])waiter.finish(ready);
   });
  }
  return result;
 };
}
