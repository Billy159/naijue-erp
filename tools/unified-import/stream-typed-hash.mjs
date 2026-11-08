import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {requireDomain} from '../../packages/domain/src/errors.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
const arrayMap=Array.prototype.map,arraySpecies=Object.getOwnPropertyDescriptor(Array,Symbol.species)?.get;
/** Same typed encoding and errors as requestHash, without joining owned JSON
 * containers into a second full request string. Keep observable accessor,
 * proxy and custom-array behavior in the original encoder. */
export function requestHashIncremental(value){
 const pending=[value],checked=new Set();let owned=true;
 while(pending.length&&owned){
  const v=pending.pop();if(v===null||typeof v!=='object'||checked.has(v))continue;
  if(types.isProxy(v)){owned=false;break}checked.add(v);
  const array=Array.isArray(v),prototype=Object.getPrototypeOf(v);
  if(prototype!==(array?Array.prototype:Object.prototype)){owned=false;break}
  const descriptors=Object.getOwnPropertyDescriptors(v);
  if(array&&(Object.hasOwn(descriptors,'map')||Object.hasOwn(descriptors,'constructor')||Array.prototype.map!==arrayMap||Object.getOwnPropertyDescriptor(Array.prototype,'constructor')?.value!==Array||Object.getOwnPropertyDescriptor(Array,Symbol.species)?.get!==arraySpecies)){owned=false;break}
  for(const d of Object.values(descriptors)){if(!Object.hasOwn(d,'value')){owned=false;break}if(d.enumerable)pending.push(d.value)}
 }
 if(!owned)return requestHash(value);
 const h=createHash('sha256'),seen=new Set();
 function put(item){
  if(item===null){h.update('null;');return}
  if(typeof item==='string'){h.update('s');h.update(JSON.stringify(item));return}
  if(typeof item==='bigint'){h.update('i'+item.toString()+';');return}
  if(typeof item==='boolean'){h.update(item?'true;':'false;');return}
  if(typeof item==='number'){requireDomain(Number.isSafeInteger(item),'INVALID_REQUEST','Request numbers must be safe integers');h.update('n'+item.toString()+';');return}
  requireDomain(typeof item==='object'&&!seen.has(item),'INVALID_REQUEST','Unsupported or cyclic request value');seen.add(item);
  if(Array.isArray(item)){h.update('[');const length=item.length;for(let i=0;i<length;i++){if(i)h.update(',');if(i in item)put(item[i])}h.update(']')}
  else{requireDomain(Object.getPrototypeOf(item)===Object.prototype,'INVALID_REQUEST','Only plain request objects are supported');h.update('{');let first=true;for(const key of Object.keys(item).sort()){if(!first)h.update(',');first=false;h.update(JSON.stringify(key)+':');put(item[key])}h.update('}')}
  seen.delete(item);
 }
 put(value);return h.digest('hex');
}
/** Owned, finite async arrays only. Values must be freshly constructed plain data.
 * The producer retains responsibility for source pins and exhausting each cursor. */
const arrays=new WeakMap(),claimed=new WeakSet();
export function typedHashArray(iterator){if(!iterator||(typeof iterator!=='object'&&typeof iterator!=='function')||typeof iterator[Symbol.asyncIterator]!=='function')throw Error('STREAM_HASH_ITERATOR_REQUIRED');if(claimed.has(iterator))throw Error('STREAM_HASH_ITERATOR_CLAIMED');claimed.add(iterator);const token=Object.freeze({});arrays.set(token,{iterator,consumed:false});return token;}
export async function streamTypedHash(value){const h=createHash('sha256'),active=new Set();async function put(v,depth){if(depth>64)throw Error('STREAM_HASH_DEPTH');if(v===null){h.update('null;');return}if(typeof v==='string'){h.update('s'+JSON.stringify(v));return}if(typeof v==='boolean'){h.update(v?'true;':'false;');return}if(typeof v==='number'&&Number.isSafeInteger(v)){h.update('n'+v+';');return}if(typeof v==='bigint'){h.update('i'+v+';');return}if(typeof v!=='object'||active.has(v))throw Error('STREAM_HASH_VALUE');active.add(v);try{const entry=arrays.get(v);if(entry){if(entry.consumed)throw Error('STREAM_HASH_CURSOR_CONSUMED');entry.consumed=true;h.update('[');let first=true;for await(const x of entry.iterator){if(!first)h.update(',');first=false;await put(x,depth+1)}h.update(']');return}if(Array.isArray(v)){h.update('[');for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error('STREAM_HASH_VALUE');if(i)h.update(',');await put(d.value,depth+1)}h.update(']');return}if(Object.getPrototypeOf(v)!==Object.prototype)throw Error('STREAM_HASH_VALUE');h.update('{');let first=true;for(const k of Object.keys(v).sort()){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw Error('STREAM_HASH_VALUE');if(!first)h.update(',');first=false;h.update(JSON.stringify(k)+':');await put(d.value,depth+1)}h.update('}')}finally{active.delete(v)}}await put(value,0);return h.digest('hex');}
