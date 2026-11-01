/** Reuse M08's actual wire boundary, including original store catch paths.
 * Does not construct a pool, client, timer or engine on import. */
import {closedRead} from '../../opt00/pg-component/phase-a-after/read-gate.mjs';
import {need} from './fixture.mjs';
export function guardedLegacyPool({openCaptured,gate,budget,closeCaptured}){
 need(typeof openCaptured==='function'&&typeof closeCaptured==='function'&&typeof gate?.quarantined==='function'&&typeof gate?.quarantine==='function'&&typeof budget?.remaining==='function','EXPLICIT_CAPTURED_LIFECYCLE_AND_GLOBAL_GATE_REQUIRED');
 const pending=new Set(),acquiring=new Set(),active=new Set(),closures=[];let closed=false;
 const close=client=>{const p=Promise.resolve().then(()=>closeCaptured(client)).then(receipt=>{closures.push(receipt);return receipt;},error=>{closures.push({settled:false,confirmed:false,errorCode:'CLIENT_CLOSE_REJECTED'});throw error;});pending.add(p);void p.then(()=>pending.delete(p),()=>pending.delete(p));return p;};
 const idle=async()=>{await Promise.all([...pending]);need(closures.every(r=>r.settled===true&&r.confirmed===true),'ALL_CAPTURED_CLIENT_CLOSURES_MUST_CONFIRM');};
 return Object.freeze({async connect(){
  need(!closed&&!gate.quarantined(),'NO_ACQUIRE_AFTER_UNKNOWN_COMMIT');
  const attempt=(async()=>{await idle();need(!closed&&!gate.quarantined(),'NO_ACQUIRE_AFTER_UNKNOWN_COMMIT');budget.remaining();const client=await openCaptured();if(closed||gate.quarantined()){await close(client);throw Object.assign(new Error('LATE_LEASE_AFTER_QUARANTINE_CLOSED'),{code:'LATE_LEASE_AFTER_QUARANTINE_CLOSED'});}let released=false;
   const release=()=>{if(!released){released=true;active.delete(release);void close(client).catch(()=>{});}};active.add(release);
   return Object.freeze({query(sql,values=[]){need(!released&&!closed,'ORIGINAL_COMPONENT_LEASE_RELEASED');return closedRead({gate,client,budget,sql,values});},release});})();
  acquiring.add(attempt);try{return await attempt;}finally{acquiring.delete(attempt);}
 },async awaitIdle(){await idle();},async close(){closed=true;await Promise.allSettled([...acquiring]);for(const release of [...active])release();await idle();return Object.freeze([...closures]);},closures:()=>Object.freeze([...closures])});
}
