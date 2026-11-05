import {createHash} from 'node:crypto';
import {decodeJsonl,validateOffsetInstant} from './unified-import-contract.ts';
/** Operator-pinned evidence is distinct from a package's self-asserted provenance. */
export interface ExplicitZeroEvidence {format_version:'EXPLICIT_ZERO_ABSENCE_V1';inventory_file_sha256:string;cutoff_at:string;approval_sha256:string;approval_row:number;approval_line:string;merkle_proof:string[];}
interface Fact {format_version:'EXPLICIT_ZERO_APPROVAL_V1';source_namespace:string;inventory_file_sha256:string;cutoff_at:string;source_key:string;warehouse_id:string;sku_id:string;quantity:'0';decision:'CONFIRMED_ABSENT_IS_ZERO';}
export interface ExplicitZeroApproval {readonly sha256:string;readonly facts:readonly Readonly<Fact>[];}
const trees=new WeakMap<object,{lines:string[];levels:Buffer[][]}>();
const leaf=(row:number,line:string)=>createHash('sha256').update('EXPLICIT_ZERO_LEAF_V1\n'+String(row)+'\n'+line).digest();
const node=(a:Buffer,b:Buffer)=>createHash('sha256').update('EXPLICIT_ZERO_NODE_V1\n'+a.toString('hex')+'\n'+b.toString('hex')).digest();
const wires=new WeakMap<object,{utf8:string;sha256:string}>();
const hash=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const text=(s:unknown)=>typeof s==='string'&&s.length>0&&s===s.trim()&&!/[\u0000-\u001f\u007f]/.test(s);
const closed=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
export function readExplicitZeroApproval(input:{bytes:Uint8Array;trustedSha256:string;sourceNamespace:string;inventoryFileSha256:string;cutoffAt:string}):ExplicitZeroApproval {
 const supplied=input.bytes;if(!(supplied instanceof Uint8Array)||supplied.byteLength<1||supplied.byteLength>64*1024*1024)throw Error('EXPLICIT_ZERO_APPROVAL_SIZE');
 const bytes=Buffer.from(supplied); // Own one snapshot before hashing; later caller mutation cannot rebind evidence.
 if(!hash(input.trustedSha256)||createHash('sha256').update(bytes).digest('hex')!==input.trustedSha256)throw Error('EXPLICIT_ZERO_APPROVAL_HASH');
 if(!text(input.sourceNamespace)||!hash(input.inventoryFileSha256)||input.trustedSha256===input.inventoryFileSha256||!validateOffsetInstant(input.cutoffAt))throw Error('EXPLICIT_ZERO_APPROVAL_BINDING');
 const facts=decodeJsonl(bytes) as Fact[],keys=new Set<string>(),pairs=new Set<string>();
 if(!facts.length||facts.length>250000)throw Error('EXPLICIT_ZERO_APPROVAL_COUNT');
 for(const f of facts){if(!closed(f,['format_version','source_namespace','inventory_file_sha256','cutoff_at','source_key','warehouse_id','sku_id','quantity','decision'])||f.format_version!=='EXPLICIT_ZERO_APPROVAL_V1'||f.source_namespace!==input.sourceNamespace||f.inventory_file_sha256!==input.inventoryFileSha256||f.cutoff_at!==input.cutoffAt||!text(f.source_key)||!uuid(f.warehouse_id)||!uuid(f.sku_id)||f.quantity!=='0'||f.decision!=='CONFIRMED_ABSENT_IS_ZERO')throw Error('EXPLICIT_ZERO_APPROVAL_FACT');
 const pair=JSON.stringify([f.warehouse_id,f.sku_id]);if(keys.has(f.source_key)||pairs.has(pair))throw Error('EXPLICIT_ZERO_APPROVAL_DUPLICATE');keys.add(f.source_key);pairs.add(pair);Object.freeze(f);}
 const lines=bytes.toString('utf8').slice(0,-1).split('\n');if(lines.some(line=>Buffer.byteLength(line)>65536))throw Error('EXPLICIT_ZERO_APPROVAL_LINE_SIZE');const levels=[lines.map((line,i)=>leaf(i+1,line))];
 while(levels.at(-1)!.length>1){const previous=levels.at(-1)!,next:Buffer[]=[];for(let i=0;i<previous.length;i+=2)next.push(node(previous[i]!,previous[i+1]??previous[i]!));levels.push(next);}
 const approval=Object.freeze({sha256:input.trustedSha256,facts:Object.freeze(facts)});trees.set(approval,{lines,levels});wires.set(approval,{utf8:bytes.toString('utf8'),sha256:input.trustedSha256});return approval;
}
export function explicitZeroApprovalWire(approval:ExplicitZeroApproval):{utf8:string;sha256:string}{const wire=wires.get(approval);if(!wire)throw Error('EXPLICIT_ZERO_APPROVAL_UNVERIFIED');return {...wire};}
export function explicitZeroApproved(approval:unknown,namespace:string,source:string,cutoff:string,row:any):boolean {
 if(!approval||typeof approval!=='object'||!wires.has(approval))return false;
 const a=approval as ExplicitZeroApproval,e=row?.explicit_zero_evidence;
 if(!closed(e,['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof'])||e.format_version!=='EXPLICIT_ZERO_ABSENCE_V1'||e.inventory_file_sha256!==source||e.cutoff_at!==cutoff||e.approval_sha256!==a.sha256||!Number.isSafeInteger(e.approval_row)||e.approval_row<1)return false;
 const f=a.facts[e.approval_row-1];if(!f||e.approval_line!==membership(a,e.approval_row).approval_line||JSON.stringify(e.merkle_proof)!==JSON.stringify(membership(a,e.approval_row).merkle_proof))return false;return !!f&&f.source_namespace===namespace&&f.inventory_file_sha256===source&&f.cutoff_at===cutoff&&f.source_key===row.source_key&&f.warehouse_id===row.fields?.warehouse_id&&f.sku_id===row.fields?.sku_id&&row.fields?.quantity==='0'&&Array.isArray(row.source_refs)&&row.source_refs.length===1&&closed(row.source_refs[0],['file_sha256','sheet','row'])&&row.source_refs[0].file_sha256===a.sha256&&row.source_refs[0].sheet===null&&row.source_refs[0].row===e.approval_row;
}
/** Only enumerate approved, resolved, actually absent keys. Existing stock is never replaced. */
export function* iterateExplicitZeroRecords(approval:ExplicitZeroApproval,warehouseIds:ReadonlySet<string>,skuIds:ReadonlySet<string>,listedStockKeys:ReadonlySet<string>){
 explicitZeroApprovalWire(approval);
 for(const [index,f] of approval.facts.entries()){if(!warehouseIds.has(f.warehouse_id)||!skuIds.has(f.sku_id))throw Error('EXPLICIT_ZERO_IDENTITY_UNKNOWN');if(listedStockKeys.has(JSON.stringify([f.warehouse_id,f.sku_id])))throw Error('EXPLICIT_ZERO_ALREADY_LISTED');yield {source_key:f.source_key,fields:{warehouse_id:f.warehouse_id,sku_id:f.sku_id,quantity:'0'},source_refs:[{file_sha256:approval.sha256,sheet:null,row:index+1}],explicit_zero_evidence:{format_version:'EXPLICIT_ZERO_ABSENCE_V1' as const,inventory_file_sha256:f.inventory_file_sha256,cutoff_at:f.cutoff_at,approval_sha256:approval.sha256,approval_row:index+1,...membership(approval,index+1)}};}
}
/** Bounded plan/INIT identity; the full approval set stays in independently controlled evidence. */
export function explicitZeroApprovalDescriptor(approval:ExplicitZeroApproval){explicitZeroApprovalWire(approval);const f=approval.facts[0]!;return {format_version:'EXPLICIT_ZERO_APPROVAL_MERKLE_V1' as const,sha256:approval.sha256,inventory_file_sha256:f.inventory_file_sha256,cutoff_at:f.cutoff_at,source_namespace:f.source_namespace,record_count:approval.facts.length,merkle_root_sha256:trees.get(approval)!.levels.at(-1)![0]!.toString('hex')};}

function membership(approval:ExplicitZeroApproval,row:number){const tree=trees.get(approval)!;let index=row-1;const siblings:string[]=[];for(const level of tree.levels.slice(0,-1)){siblings.push((level[index^1]??level[index])!.toString('hex'));index=Math.floor(index/2);}return {approval_line:tree.lines[row-1]!,merkle_proof:siblings};}

export function compileExplicitZeroRecords(approval:ExplicitZeroApproval,warehouseIds:ReadonlySet<string>,skuIds:ReadonlySet<string>,listedStockKeys:ReadonlySet<string>){return [...iterateExplicitZeroRecords(approval,warehouseIds,skuIds,listedStockKeys)];}
