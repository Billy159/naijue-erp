/** Synchronous boundary immediately before EACH captured real Client.query.
 * No await, retry, SQL, client construction or engine on import. */
import{captureData}from'../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';import{need}from'./fixture.mjs';
export function physicalClientFence(client,gate){
 need(client&&typeof client==='object'&&typeof gate?.quarantined==='function','CAPTURED_CLIENT_AND_GLOBAL_GATE_REQUIRED');let send;
 for(let p=client;p!==null;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,'query');if(d){need(Object.hasOwn(d,'value')&&typeof d.value==='function','QUERY_DATA_METHOD_REQUIRED');send=d.value;break;}}
 need(typeof send==='function','QUERY_DATA_METHOD_REQUIRED');const connection=Object.getOwnPropertyDescriptor(client,'connection');need(!connection||Object.hasOwn(connection,'value'),'CONNECTION_DATA_PROPERTY_REQUIRED');
 return Object.freeze({connection:connection?.value,query(...args){need(gate.quarantined()===false,'NO_PHYSICAL_SQL_AFTER_UNKNOWN_COMMIT');return Reflect.apply(send,client,args);}});
}
export function stoppedControlEvidence(input){
 const o=captureData(input,['stdout','code','timedOut','birthId','targetId']);need(typeof o.stdout==='string'&&Number.isInteger(o.code)&&typeof o.timedOut==='boolean'&&(o.birthId===null||typeof o.birthId==='string'&&/^[1-9][0-9]{8,24}$/.test(o.birthId))&&(o.targetId===null||typeof o.targetId==='string'&&/^[1-9][0-9]{8,24}$/.test(o.targetId)),'CLOSED_CONTROL_OBSERVATION_REQUIRED');
 const ids=[...o.stdout.matchAll(/^Database system identifier:\s+([0-9]+)$/gm)],states=[...o.stdout.matchAll(/^Database cluster state:\s+([^\r\n]+)$/gm)];const actualId=ids.length===1?ids[0][1]:null,shut=states.length===1&&states[0][1].trim()==='shut down';
 const same=typeof o.birthId==='string'&&actualId===o.birthId&&(o.targetId===null||o.targetId===o.birthId&&actualId===o.targetId);
 return Object.freeze({actualSystemIdentifier:actualId,birthSystemIdentifier:o.birthId,targetSystemIdentifier:o.targetId,sameCapturedSystemIdentifier:same,shutDownText:shut,controlShutDown:o.code===0&&!o.timedOut&&same&&shut});
}
