/** Exact SOURCE-byte and complete-command comparison; not a metadata/runtime issuer. */
import {buildLegacyCutoffFixture,need,SHA} from './fixture.mjs';
import {requestHash} from '../../../../packages/application/src/request-hash.ts';
import {validateCutoffImportCommand} from '../../../../packages/application/src/inventory-cutoff-import.ts';
/** Capture own enumerable data before hashing. Never call a getter/toString/iterator. */
export function snapshot(value,seen=new Set()){
 if(value===null||['string','boolean','bigint'].includes(typeof value))return value;
 if(typeof value==='number'){need(Number.isSafeInteger(value),'FINITE_TYPED_NUMBER_REQUIRED');return value;}
 need(value&&typeof value==='object'&&!seen.has(value),'FINITE_PLAIN_SOURCE_DATA_REQUIRED');seen.add(value);
 const array=Array.isArray(value);need(Object.getPrototypeOf(value)===(array?Array.prototype:Object.prototype),'PLAIN_OWN_DATA_REQUIRED');
 const keys=Reflect.ownKeys(value);need(keys.every(k=>typeof k==='string'),'NO_SYMBOL_SOURCE_KEYS');let out;
 if(array){const n=Object.getOwnPropertyDescriptor(value,'length').value;need(keys.length===n+1&&keys.every(k=>k==='length'||/^(0|[1-9]\d*)$/.test(k)&&Number(k)<n),'DENSE_SOURCE_ARRAY_REQUIRED');out=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));need(d&&d.enumerable&&Object.hasOwn(d,'value'),'OWN_DATA_SOURCE_REQUIRED');out.push(snapshot(d.value,seen));}}
 else{out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);need(d&&d.enumerable&&Object.hasOwn(d,'value'),'OWN_DATA_SOURCE_REQUIRED');Object.defineProperty(out,k,{value:snapshot(d.value,seen),enumerable:true,writable:false,configurable:false});}}
 seen.delete(value);return Object.freeze(out);
}
export function createExactLegacySourceAuthorizer(readArtifact){
 need(typeof readArtifact==='function','EXPLICIT_FIXED_ARTIFACT_READER_REQUIRED');const f=buildLegacyCutoffFixture();
 async function verify(){for(const expected of f.artifacts){const bytes=await readArtifact(expected.path);need(Buffer.isBuffer(bytes)&&Object.getPrototypeOf(bytes)===Buffer.prototype,'EXACT_ARTIFACT_BUFFER_REQUIRED');const copy=Buffer.from(bytes);need(copy.length===expected.bytes&&SHA(copy)===expected.sha256&&copy.equals(Buffer.from(expected.utf8)),'FROZEN_SYNTHETIC_ARTIFACT_MISMATCH:'+expected.path);}return{artifacts:f.artifacts.length,manifestSha256:f.commands[0].sourceHash,syntheticOnly:true};}
 return Object.freeze({verify,async assertAllowed(actor,command){need(typeof actor==='string'&&actor===f.reference.actor.accountId,'EXACT_SOURCE_ACTOR_REQUIRED');const copy=snapshot(command);validateCutoffImportCommand(copy);const i=f.commands.findIndex(c=>c.requestKey===copy.requestKey);need(i>=0&&requestHash(copy)===f.commandHashes[i],'EXACT_COMPLETE_SOURCE_COMMAND_REQUIRED');await verify();return Object.freeze({caseId:f.caseId,commandIndex:i,commandSha256:f.commandHashes[i]});}});
}
