/** Bounded, in-flight-only sharing. No private response is cached across refreshes or identities. */
export function createReferenceQueue({read,scope,limit=4}){
 const pending=new Map(),queue=[];let active=0;
 const pump=()=>{while(active<limit&&queue.length){const run=queue.shift();active++;run().finally(()=>{active--;pump();});}};
 return {load(kind){
  const owner=scope(),key=JSON.stringify([owner,kind]);if(pending.has(key))return pending.get(key);
  const task=new Promise((resolve,reject)=>{queue.push(async()=>{
   try{if(owner!==scope())throw Object.assign(Error('登录身份已变化'),{code:'AUTH',stale:true});
    const value=await read(kind);if(owner!==scope())throw Object.assign(Error('登录身份已变化'),{code:'AUTH',stale:true});resolve(value);
   }catch(error){reject(error);}
  });});
  pending.set(key,task);task.then(()=>pending.delete(key),()=>pending.delete(key));pump();return task;
 }};
}
