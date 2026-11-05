/** Every reader wire query, including original catch/ROLLBACK paths, uses this gate. */
import {budgetedQuery,need} from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import {unknownCommit} from '../component.mjs';
export async function closedRead({gate,client,budget,sql,values=[]}){need(!gate.quarantined(),'NO_READER_SQL_AFTER_UNKNOWN_COMMIT');try{return await budgetedQuery(client,sql,values,budget);}catch(original){if(sql==='COMMIT'){const error=unknownCommit('COMPONENT',original);gate.quarantine(error);throw error;}throw original;}}

/** Small diagnostic chain only: no SQL values/detail/password catalog inspection. */
export function errorReceipt(error,depth=0,seen=new Set()){if(depth>5)return{truncated:true};if(error===null||typeof error!=='object')return{thrownType:typeof error};if(seen.has(error))return{cycle:true};seen.add(error);const out={};for(const key of['name','code','message','stack']){const value=error[key];if(typeof value==='string')out[key]=value;}if(Object.hasOwn(error,'cause'))out.cause=errorReceipt(error.cause,depth+1,seen);if(Array.isArray(error.errors))out.errors=error.errors.slice(0,8).map(e=>errorReceipt(e,depth+1,seen));return out;}
