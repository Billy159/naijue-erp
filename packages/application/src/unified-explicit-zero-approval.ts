import {createHash} from 'node:crypto';
import {decodeJsonl,validateOffsetInstant,parseStrictJson,decodeUtf8,safePackagePath,validateQuantityString} from './unified-import-contract.ts';
import {DatabaseSync} from 'node:sqlite';
import {constants,openSync,closeSync,readSync,writeSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {tmpdir} from 'node:os';
/** Operator-pinned evidence is distinct from a package's self-asserted provenance. */
export interface ExplicitZeroEvidence {format_version:'EXPLICIT_ZERO_ABSENCE_V1'|'EXPLICIT_ZERO_ABSENCE_V2';inventory_file_sha256:string;cutoff_at:string;approval_sha256:string;approval_row:number;approval_line:string;merkle_proof:string[];}
interface Fact {format_version:'EXPLICIT_ZERO_APPROVAL_V1';source_namespace:string;inventory_file_sha256:string;cutoff_at:string;source_key:string;warehouse_id:string;sku_id:string;quantity:'0';decision:'CONFIRMED_ABSENT_IS_ZERO';}
export interface ExplicitZeroApproval {readonly sha256:string;readonly facts?:readonly Readonly<Fact>[];}
interface ScopePin {relative_path:string;sha256:string;row_count:number;records_sha256:string;}
interface ScopeSummary {
 format_version:'EXPLICIT_ZERO_SCOPE_APPROVAL_V2'|'INVENTORY_BASELINE_SCOPE_V1';source_namespace:string;batch_key:string;inventory_file_sha256:string;cutoff_at:string;decision_ref:string;
 input_manifest:{relative_path:string;sha256:string};identity_registry:{relative_path:string;sha256:string;row_count:number};
 warehouses:ScopePin;skus:ScopePin;explicit_values:ScopePin;unknown_mask:ScopePin;
 counts:{universe:number;explicit_confirmed:number;zero:number;unknown:number;explicit_unknown_overlap:number};
}
interface ScopeState {summary:ScopeSummary;db:DatabaseSync;dir:string;levels:{fd:number;width:number}[];descriptor:ScopeDescriptor|BaselineScopeDescriptor|null;closed:boolean;pair:ReturnType<DatabaseSync['prepare']>|undefined;masked:ReturnType<DatabaseSync['prepare']>;explicit:ReturnType<DatabaseSync['prepare']>;}
interface ScopeDescriptor {format_version:'EXPLICIT_ZERO_SCOPE_MERKLE_V2';sha256:string;inventory_file_sha256:string;cutoff_at:string;source_namespace:string;record_count:number;merkle_root_sha256:string;batch_key:string;input_manifest_sha256:string;registry_sha256:string;warehouses:{sha256:string;records_sha256:string;count:number};skus:{sha256:string;records_sha256:string;count:number};explicit_values:{sha256:string;records_sha256:string;count:number};unknown_mask:{sha256:string;records_sha256:string;count:number};universe_count:number;explicit_confirmed_count:number;explicit_unknown_overlap_count:number;}
interface BaselineScopeDescriptor {
 format_version:'INVENTORY_BASELINE_SCOPE_V1';sha256:string;source_namespace:string;inventory_file_sha256:string;cutoff_at:string;batch_key:string;input_manifest_sha256:string;registry_sha256:string;
 warehouses:{sha256:string;records_sha256:string;count:number};skus:{sha256:string;records_sha256:string;count:number};explicit_values:{sha256:string;records_sha256:string;count:number};
 universe_count:number;nonzero_count:number;warehouse_totals:{warehouse_id:string;explicit_count:number;nonzero_count:number;quantity:string}[];
}
/** This variant verifies W+S+explicit facts and emits no inferred stock rows. */
export function isInventoryBaselineScope(approval:ExplicitZeroApproval):boolean {return scopes.get(approval)?.summary.format_version==='INVENTORY_BASELINE_SCOPE_V1';}
export function hasInventoryApprovalDescriptor(approval:ExplicitZeroApproval):boolean {return isInventoryBaselineScope(approval)||explicitZeroApprovalCount(approval)>0;}
const scopes=new WeakMap<object,ScopeState>();
const trees=new WeakMap<object,{lines:string[];levels:Buffer[][]}>();
const leaf=(row:number,line:string)=>createHash('sha256').update('EXPLICIT_ZERO_LEAF_V1\n'+String(row)+'\n'+line).digest();
const node=(a:Buffer,b:Buffer)=>createHash('sha256').update('EXPLICIT_ZERO_NODE_V1\n'+a.toString('hex')+'\n'+b.toString('hex')).digest();
const wires=new WeakMap<object,{utf8:string;sha256:string}>();
const hash=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const text=(s:unknown)=>typeof s==='string'&&s.length>0&&s===s.trim()&&!/[\u0000-\u001f\u007f]/.test(s);
const closed=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
export function readExplicitZeroApproval(input:{bytes:Uint8Array;trustedSha256:string;sourceNamespace:string;inventoryFileSha256:string;cutoffAt:string}):ExplicitZeroApproval & {readonly facts:readonly Readonly<Fact>[]} {
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
export function explicitZeroApprovalWire(approval:ExplicitZeroApproval):{utf8:string;sha256:string}{const wire=wires.get(approval);if(!wire||scopes.get(approval)?.closed)throw Error('EXPLICIT_ZERO_APPROVAL_UNVERIFIED');return {...wire};}
export function explicitZeroApproved(approval:unknown,namespace:string,source:string,cutoff:string,row:any):boolean {
 if(!approval||typeof approval!=='object'||!wires.has(approval))return false;
 const a=approval as ExplicitZeroApproval,e=row?.explicit_zero_evidence;
 if(scopes.has(a))return scopeApproved(a,namespace,source,cutoff,row);
 if(!closed(e,['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof'])||e.format_version!=='EXPLICIT_ZERO_ABSENCE_V1'||e.inventory_file_sha256!==source||e.cutoff_at!==cutoff||e.approval_sha256!==a.sha256||!Number.isSafeInteger(e.approval_row)||e.approval_row<1)return false;
 const f=a.facts![e.approval_row-1];if(!f||e.approval_line!==membership(a,e.approval_row).approval_line||JSON.stringify(e.merkle_proof)!==JSON.stringify(membership(a,e.approval_row).merkle_proof))return false;return !!f&&f.source_namespace===namespace&&f.inventory_file_sha256===source&&f.cutoff_at===cutoff&&f.source_key===row.source_key&&f.warehouse_id===row.fields?.warehouse_id&&f.sku_id===row.fields?.sku_id&&row.fields?.quantity==='0'&&Array.isArray(row.source_refs)&&row.source_refs.length===1&&closed(row.source_refs[0],['file_sha256','sheet','row'])&&row.source_refs[0].file_sha256===a.sha256&&row.source_refs[0].sheet===null&&row.source_refs[0].row===e.approval_row;
}
/** Only enumerate approved, resolved, actually absent keys. Existing stock is never replaced. */
export function* iterateExplicitZeroRecords(approval:ExplicitZeroApproval,warehouseIds:ReadonlySet<string>,skuIds:ReadonlySet<string>,listedStockKeys:ReadonlySet<string>){
 explicitZeroApprovalWire(approval);
 for(let ordinal=1;ordinal<=explicitZeroApprovalCount(approval);ordinal++){const f=explicitZeroApprovalFact(approval,ordinal);if(!warehouseIds.has(f.warehouse_id)||!skuIds.has(f.sku_id))throw Error('EXPLICIT_ZERO_IDENTITY_UNKNOWN');if(listedStockKeys.has(JSON.stringify([f.warehouse_id,f.sku_id])))throw Error('EXPLICIT_ZERO_ALREADY_LISTED');const v2=scopes.has(approval);const record={source_key:f.source_key,fields:{warehouse_id:f.warehouse_id,sku_id:f.sku_id,quantity:'0'},source_refs:[{file_sha256:approval.sha256,sheet:null,row:v2?1:ordinal}],explicit_zero_evidence:{format_version:v2?'EXPLICIT_ZERO_ABSENCE_V2' as const:'EXPLICIT_ZERO_ABSENCE_V1' as const,inventory_file_sha256:f.inventory_file_sha256,cutoff_at:f.cutoff_at,approval_sha256:approval.sha256,approval_row:ordinal,...(v2?scopeMembership(approval,ordinal):membership(approval,ordinal))}};if(v2&&Buffer.byteLength(JSON.stringify(record))>4096)throw Error('EXPLICIT_ZERO_RECORD_SIZE');yield record;}
}
/** Bounded plan/INIT identity; the full approval set stays in independently controlled evidence. */
export function explicitZeroApprovalDescriptor(approval:ExplicitZeroApproval){explicitZeroApprovalWire(approval);const scope=scopes.get(approval);if(scope){if(!scope.descriptor)throw Error('EXPLICIT_ZERO_EMPTY_DESCRIPTOR');return structuredClone(scope.descriptor);}const f=approval.facts![0]!;return {format_version:'EXPLICIT_ZERO_APPROVAL_MERKLE_V1' as const,sha256:approval.sha256,inventory_file_sha256:f.inventory_file_sha256,cutoff_at:f.cutoff_at,source_namespace:f.source_namespace,record_count:approval.facts!.length,merkle_root_sha256:trees.get(approval)!.levels.at(-1)![0]!.toString('hex')};}

function membership(approval:ExplicitZeroApproval,row:number){const tree=trees.get(approval)!;let index=row-1;const siblings:string[]=[];for(const level of tree.levels.slice(0,-1)){siblings.push((level[index^1]??level[index])!.toString('hex'));index=Math.floor(index/2);}return {approval_line:tree.lines[row-1]!,merkle_proof:siblings};}

export function compileExplicitZeroRecords(approval:ExplicitZeroApproval,warehouseIds:ReadonlySet<string>,skuIds:ReadonlySet<string>,listedStockKeys:ReadonlySet<string>){return [...iterateExplicitZeroRecords(approval,warehouseIds,skuIds,listedStockKeys)];}

export function explicitZeroApprovalCount(approval:ExplicitZeroApproval):number {explicitZeroApprovalWire(approval);return isInventoryBaselineScope(approval)?0:scopes.get(approval)?.summary.counts.zero??approval.facts!.length;}
export function explicitZeroApprovalFact(approval:ExplicitZeroApproval,ordinal:number) {
 explicitZeroApprovalWire(approval);if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>explicitZeroApprovalCount(approval))throw Error('EXPLICIT_ZERO_ORDINAL');
 const s=scopes.get(approval);if(!s)return approval.facts![ordinal-1]!;
 const p=s.pair!.get(ordinal) as {warehouse_id:string;sku_id:string};
 return {format_version:'EXPLICIT_ZERO_SCOPE_FACT_V2',source_namespace:s.summary.source_namespace,batch_key:s.summary.batch_key,approval_sha256:approval.sha256,inventory_file_sha256:s.summary.inventory_file_sha256,cutoff_at:s.summary.cutoff_at,source_key:`zero:v2:${p.warehouse_id}:${p.sku_id}`,warehouse_id:p.warehouse_id,sku_id:p.sku_id,quantity:'0',decision:'CONFIRMED_ABSENT_IS_ZERO'};
}
const scopeLeaf=(ordinal:number,line:string)=>createHash('sha256').update(`EXPLICIT_ZERO_LEAF_V2\n${ordinal}\n${line}`).digest();
const scopeNode=(left:Buffer,right:Buffer)=>createHash('sha256').update(`EXPLICIT_ZERO_NODE_V2\n${left.toString('hex')}\n${right.toString('hex')}`).digest();
function readNode(fd:number,index:number){const b=Buffer.alloc(32);if(readSync(fd,b,0,32,index*32)!==32)throw Error('EXPLICIT_ZERO_NODE_READ');return b;}
function scopeMembership(approval:ExplicitZeroApproval,ordinal:number){const s=scopes.get(approval)!;if(s.closed)throw Error('EXPLICIT_ZERO_APPROVAL_UNVERIFIED');let index=ordinal-1;const proof:string[]=[];for(const level of s.levels.slice(0,-1)){proof.push(readNode(level.fd,(index^1)<level.width?index^1:index).toString('hex'));index=Math.floor(index/2);}return {approval_line:JSON.stringify(explicitZeroApprovalFact(approval,ordinal)),merkle_proof:proof};}
function scopeApproved(a:ExplicitZeroApproval,namespace:string,source:string,cutoff:string,row:any){
 const s=scopes.get(a)!,e=row?.explicit_zero_evidence;if(s.closed||isInventoryBaselineScope(a)||namespace!==s.summary.source_namespace||source!==s.summary.inventory_file_sha256||cutoff!==s.summary.cutoff_at)return false;
 if(!closed(e,['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof'])||e.format_version!=='EXPLICIT_ZERO_ABSENCE_V2'||e.inventory_file_sha256!==source||e.cutoff_at!==cutoff||e.approval_sha256!==a.sha256||!Number.isSafeInteger(e.approval_row)||e.approval_row<1||e.approval_row>s.summary.counts.zero)return false;
 const f=explicitZeroApprovalFact(a,e.approval_row),m=scopeMembership(a,e.approval_row);
 return e.approval_line===m.approval_line&&JSON.stringify(e.merkle_proof)===JSON.stringify(m.merkle_proof)&&f.source_key===row.source_key&&f.warehouse_id===row.fields?.warehouse_id&&f.sku_id===row.fields?.sku_id&&row.fields?.quantity==='0'&&Array.isArray(row.source_refs)&&row.source_refs.length===1&&closed(row.source_refs[0],['file_sha256','sheet','row'])&&row.source_refs[0].file_sha256===a.sha256&&row.source_refs[0].sheet===null&&row.source_refs[0].row===1;
}
/** Frees only this approval's private scratch store. Closed tokens cannot be replayed. */
export function closeExplicitZeroApproval(approval:ExplicitZeroApproval|undefined){if(!approval)return;const s=scopes.get(approval);if(!s||s.closed)return;s.closed=true;for(const level of s.levels)closeSync(level.fd);s.db.close();rmSync(s.dir,{recursive:true,force:true});wires.delete(approval);}

/** Opens each pinned file below the approval directory without following a symlink.
 * Exhaustion verifies raw bytes, LF framing and file identity before issuing a token. */
async function* scopeLines(root:string,pin:{relative_path:string;sha256:string;row_count?:number},max:number){
 if(!safePackagePath(pin.relative_path)||!hash(pin.sha256))throw Error('EXPLICIT_ZERO_SCOPE_PIN');let path=root;
 for(const part of pin.relative_path.split('/')){path=join(path,part);if((await lstat(path)).isSymbolicLink())throw Error('EXPLICIT_ZERO_SCOPE_SYMLINK');}
 if(!(await realpath(path)).startsWith(root+sep))throw Error('EXPLICIT_ZERO_SCOPE_PATH');
 const expected=await lstat(path),fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes=0,line=0,pending=Buffer.alloc(0);const digest=createHash('sha256');
 try{const before=await fd.stat();if(!before.isFile()||before.size>max||before.dev!==expected.dev||before.ino!==expected.ino)throw Error('EXPLICIT_ZERO_SCOPE_FILE');const b=Buffer.alloc(65536);
  for(;;){const {bytesRead}=await fd.read(b,0,b.length,null);if(!bytesRead)break;bytes+=bytesRead;if(bytes>max)throw Error('EXPLICIT_ZERO_SCOPE_FILE_SIZE');const chunk=b.subarray(0,bytesRead);digest.update(chunk);pending=Buffer.concat([pending,chunk]);let start=0,end;
   while((end=pending.indexOf(10,start))!==-1){const raw=pending.subarray(start,end);if(!raw.length||raw.length>1024*1024)throw Error('EXPLICIT_ZERO_SCOPE_LINE_SIZE');yield parseStrictJson(decodeUtf8(raw));line++;start=end+1;}
   pending=Buffer.from(pending.subarray(start));if(pending.length>1024*1024)throw Error('EXPLICIT_ZERO_SCOPE_LINE_SIZE');
  }
  const after=await fd.stat(),now=await lstat(path);if(pending.length||bytes!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||now.dev!==before.dev||now.ino!==before.ino||digest.digest('hex')!==pin.sha256||(pin.row_count!==undefined&&line!==pin.row_count))throw Error('EXPLICIT_ZERO_SCOPE_FILE_CHANGED');
 }finally{await fd.close();}
}
function scopePin(v:any):v is ScopePin{return closed(v,['relative_path','sha256','row_count','records_sha256'])&&safePackagePath(v.relative_path)&&hash(v.sha256)&&hash(v.records_sha256)&&Number.isSafeInteger(v.row_count)&&v.row_count>=0&&v.row_count<=5_000_000;}
function canonicalDigest(db:DatabaseSync,sql:string,project:(r:any)=>unknown){const digest=createHash('sha256');for(const r of db.prepare(sql).iterate())digest.update(JSON.stringify(project(r))+'\n');return digest.digest('hex');}
async function scopeJson(root:string,pin:{relative_path:string;sha256:string}){
 if(!safePackagePath(pin.relative_path)||!hash(pin.sha256))throw Error('EXPLICIT_ZERO_SCOPE_PIN');let path=root;for(const part of pin.relative_path.split('/')){path=join(path,part);if((await lstat(path)).isSymbolicLink())throw Error('EXPLICIT_ZERO_SCOPE_SYMLINK');}
 if(!(await realpath(path)).startsWith(root+sep))throw Error('EXPLICIT_ZERO_SCOPE_PATH');const expected=await lstat(path),fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await fd.stat();if(!before.isFile()||before.size>2*1024*1024||before.dev!==expected.dev||before.ino!==expected.ino)throw Error('EXPLICIT_ZERO_SCOPE_FILE');const bytes=Buffer.alloc(before.size+1);let n=0;while(n<bytes.length){const r=await fd.read(bytes,n,bytes.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}const after=await fd.stat(),now=await lstat(path);if(n!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||now.dev!==before.dev||now.ino!==before.ino||createHash('sha256').update(bytes.subarray(0,n)).digest('hex')!==pin.sha256)throw Error('EXPLICIT_ZERO_SCOPE_FILE_CHANGED');return parseStrictJson(decodeUtf8(bytes.subarray(0,n))) as any;}finally{await fd.close();}
}
/** Independent V2 file intake. No database connection or business approval is created. */
export async function readExplicitZeroScopeApproval(input:{bytes:Uint8Array;trustedSha256:string;directory:string;sourceNamespace:string;inventoryFileSha256:string;cutoffAt:string}):Promise<ExplicitZeroApproval>{
 const bytes=Buffer.from(input.bytes);if(bytes.length<1||bytes.length>65536||!hash(input.trustedSha256)||createHash('sha256').update(bytes).digest('hex')!==input.trustedSha256)throw Error('EXPLICIT_ZERO_SCOPE_APPROVAL_HASH');
 const utf8=decodeUtf8(bytes);if(!utf8.endsWith('\n')||utf8.slice(0,-1).includes('\n'))throw Error('EXPLICIT_ZERO_SCOPE_SUMMARY_LINE');const s=parseStrictJson(utf8.slice(0,-1)) as ScopeSummary;
 if(!closed(s,['format_version','source_namespace','batch_key','inventory_file_sha256','cutoff_at','decision_ref','input_manifest','identity_registry','warehouses','skus','explicit_values','unknown_mask','counts'])||!['EXPLICIT_ZERO_SCOPE_APPROVAL_V2','INVENTORY_BASELINE_SCOPE_V1'].includes(s.format_version)||s.source_namespace!==input.sourceNamespace||!text(s.source_namespace)||Buffer.byteLength(s.source_namespace)>256||s.inventory_file_sha256!==input.inventoryFileSha256||!hash(s.inventory_file_sha256)||s.inventory_file_sha256===input.trustedSha256||s.cutoff_at!==input.cutoffAt||!validateOffsetInstant(s.cutoff_at)||!text(s.batch_key)||Buffer.byteLength(s.batch_key)>128||!text(s.decision_ref)||Buffer.byteLength(s.decision_ref)>1024||!closed(s.input_manifest,['relative_path','sha256'])||!closed(s.identity_registry,['relative_path','sha256','row_count'])||!Number.isSafeInteger(s.identity_registry.row_count)||s.identity_registry.row_count<1||![s.warehouses,s.skus,s.explicit_values,s.unknown_mask].every(scopePin)||!s.warehouses.row_count||!s.skus.row_count||!closed(s.counts,['universe','explicit_confirmed','zero','unknown','explicit_unknown_overlap'])||!Object.values(s.counts).every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('EXPLICIT_ZERO_SCOPE_SUMMARY');
 if(s.counts.universe!==s.warehouses.row_count*s.skus.row_count||s.counts.universe>5_000_000)throw Error('EXPLICIT_ZERO_SCOPE_UNIVERSE_LIMIT');
 const baseline=s.format_version==='INVENTORY_BASELINE_SCOPE_V1';
 if(baseline&&(s.counts.unknown!==0||s.counts.explicit_unknown_overlap!==0))throw Error('INVENTORY_BASELINE_SCOPE_UNRESOLVED');
 const root=await realpath(input.directory),dir=mkdtempSync(join(tmpdir(),'explicit-zero-v2-'));let db:DatabaseSync|undefined;const levels:ScopeState['levels']=[];let approval:ExplicitZeroApproval|undefined;
 try{db=new DatabaseSync(join(dir,'scope.sqlite'));db.exec('PRAGMA page_size=4096; PRAGMA cache_size=-4096; PRAGMA temp_store=FILE; PRAGMA journal_mode=OFF; PRAGMA max_page_count=1000000; CREATE TABLE members(kind TEXT,id TEXT,PRIMARY KEY(kind,id)) WITHOUT ROWID; CREATE TABLE registry(kind TEXT,id TEXT,PRIMARY KEY(kind,id)) WITHOUT ROWID; CREATE TABLE explicit_values(warehouse_id TEXT,sku_id TEXT,quantity TEXT,PRIMARY KEY(warehouse_id,sku_id)) WITHOUT ROWID; CREATE TABLE mask(warehouse_id TEXT,sku_id TEXT,PRIMARY KEY(warehouse_id,sku_id)) WITHOUT ROWID; BEGIN');if(!baseline)db.exec('CREATE TABLE zero_pairs(ordinal INTEGER PRIMARY KEY,warehouse_id TEXT,sku_id TEXT)');
  // The original input manifest is one pinned summary, independent of this approval.
  const m=await scopeJson(root,s.input_manifest),samePin=(a:any,b:any,keys:string[])=>a&&keys.every(k=>a[k]===b[k]);
  const compact=m?.format_version==='EXPLICIT_ZERO_SCOPE_INPUT_V2',frozen=m?.format_version==='ZERO_SCOPE_INPUT_MANIFEST_V2';
  if(!(compact||frozen)||m.source_namespace!==s.source_namespace||(compact?m.batch_key:m.batch_label)!==s.batch_key||m.inventory_file_sha256!==s.inventory_file_sha256||m.cutoff_at!==s.cutoff_at||!samePin(compact?m.identity_registry:m.registry,s.identity_registry,['relative_path','sha256','row_count'])||['warehouses','skus','explicit_values','unknown_mask'].some(k=>!samePin(m[k],(s as any)[k],['relative_path','sha256','row_count','records_sha256'])))throw Error('EXPLICIT_ZERO_SCOPE_INPUT_MANIFEST');
  if(frozen&&(!m.counts||m.counts.pair_universe!==s.counts.universe||m.counts.confirmed_explicit_pairs!==s.counts.explicit_confirmed||m.counts.confirmed_absent_zero_pairs!==s.counts.zero||m.counts.unknown_mask_pairs!==s.counts.unknown||m.counts.explicit_inside_unknown!==s.counts.explicit_unknown_overlap))throw Error('EXPLICIT_ZERO_SCOPE_INPUT_COUNTS');
  const addMember=db.prepare('INSERT INTO members VALUES(?,?)');
  for(const [kind,pin]of [['WAREHOUSE',s.warehouses],['SKU',s.skus]] as const){let previous='';for await(const value of scopeLines(root,pin,64*1024*1024)){const r=value as any;if(!closed(r,['id'])||!uuid(r.id)||r.id<=previous)throw Error('EXPLICIT_ZERO_SCOPE_MEMBER');addMember.run(kind,r.id);previous=r.id;}if(canonicalDigest(db,`SELECT id FROM members WHERE kind='${kind}' ORDER BY id`,r=>({id:r.id}))!==pin.records_sha256)throw Error('EXPLICIT_ZERO_SCOPE_MEMBER_DIGEST');}
  const addRegistry=db.prepare(baseline?'INSERT OR IGNORE INTO registry VALUES(?,?)':'INSERT INTO registry VALUES(?,?)');for await(const value of scopeLines(root,s.identity_registry,baseline?512*1024*1024:64*1024*1024)){const r=value as any;if(!r||r.source_namespace!==s.source_namespace||!uuid(r.target_id)||!text(r.entity_type))throw Error('EXPLICIT_ZERO_SCOPE_REGISTRY');if(['WAREHOUSE','SKU'].includes(r.entity_type))addRegistry.run(r.entity_type,r.target_id);}
  if(db.prepare('SELECT 1 FROM (SELECT kind,id FROM members EXCEPT SELECT kind,id FROM registry) UNION ALL SELECT 1 FROM (SELECT kind,id FROM registry EXCEPT SELECT kind,id FROM members) LIMIT 1').get())throw Error('EXPLICIT_ZERO_SCOPE_REGISTRY_SET');
  const hasMember=db.prepare('SELECT 1 FROM members WHERE kind=? AND id=?');
  for(const [table,pin]of [['explicit_values',s.explicit_values],['mask',s.unknown_mask]] as const){const add=db.prepare(`INSERT INTO ${table} VALUES(${table==='mask'?'?,?':'?,?,?'})`);let previous='';for await(const value of scopeLines(root,pin,64*1024*1024)){const r=value as any;if(!closed(r,table==='mask'?['warehouse_id','sku_id']:['warehouse_id','sku_id','quantity'])||!uuid(r.warehouse_id)||!uuid(r.sku_id)||!hasMember.get('WAREHOUSE',r.warehouse_id)||!hasMember.get('SKU',r.sku_id)||(table==='explicit_values'&&!validateQuantityString(r.quantity)))throw Error('EXPLICIT_ZERO_SCOPE_EXCEPTION');const key=r.warehouse_id+':'+r.sku_id;if(key<=previous)throw Error('EXPLICIT_ZERO_SCOPE_EXCEPTION_ORDER');previous=key;if(table==='mask')add.run(r.warehouse_id,r.sku_id);else add.run(r.warehouse_id,r.sku_id,r.quantity);}
   if(canonicalDigest(db,`SELECT * FROM ${table} ORDER BY warehouse_id,sku_id`,r=>table==='mask'?{warehouse_id:r.warehouse_id,sku_id:r.sku_id}:{warehouse_id:r.warehouse_id,sku_id:r.sku_id,quantity:r.quantity})!==pin.records_sha256)throw Error('EXPLICIT_ZERO_SCOPE_EXCEPTION_DIGEST');
  }
  const overlap=(db.prepare('SELECT count(*) AS n FROM explicit_values JOIN mask USING(warehouse_id,sku_id)').get() as {n:number}).n;
  if(s.counts.unknown!==s.unknown_mask.row_count||s.counts.explicit_unknown_overlap!==overlap||s.counts.explicit_confirmed!==s.explicit_values.row_count-overlap||s.counts.zero!==s.counts.universe-s.explicit_values.row_count-s.unknown_mask.row_count+overlap||s.counts.universe!==s.counts.explicit_confirmed+s.counts.zero+s.counts.unknown)throw Error('EXPLICIT_ZERO_SCOPE_PARTITION');
  const state:ScopeState={summary:s,db,dir,levels,descriptor:null,closed:false,pair:baseline?undefined:db.prepare('SELECT warehouse_id,sku_id FROM zero_pairs WHERE ordinal=?'),masked:db.prepare('SELECT 1 FROM mask WHERE warehouse_id=? AND sku_id=?'),explicit:db.prepare('SELECT quantity FROM explicit_values WHERE warehouse_id=? AND sku_id=?')};approval=Object.freeze({sha256:input.trustedSha256});scopes.set(approval,state);wires.set(approval,{utf8,sha256:input.trustedSha256});
  if(baseline){
   const totals=new Map<string,{warehouse_id:string;explicit_count:number;nonzero_count:number;quantity:bigint}>();
   for(const r of db.prepare("SELECT id FROM members WHERE kind='WAREHOUSE' ORDER BY id").iterate())totals.set(r.id as string,{warehouse_id:r.id as string,explicit_count:0,nonzero_count:0,quantity:0n});
   let nonzero=0;
   for(const r of db.prepare('SELECT warehouse_id,quantity FROM explicit_values').iterate()){const t=totals.get(r.warehouse_id as string)!;t.explicit_count++;t.quantity+=BigInt(r.quantity as string);if(r.quantity!=='0'){t.nonzero_count++;nonzero++;}}
   const pin=(p:ScopePin)=>({sha256:p.sha256,records_sha256:p.records_sha256,count:p.row_count});
   state.descriptor={format_version:'INVENTORY_BASELINE_SCOPE_V1',sha256:approval.sha256,source_namespace:s.source_namespace,inventory_file_sha256:s.inventory_file_sha256,cutoff_at:s.cutoff_at,batch_key:s.batch_key,input_manifest_sha256:s.input_manifest.sha256,registry_sha256:s.identity_registry.sha256,warehouses:pin(s.warehouses),skus:pin(s.skus),explicit_values:pin(s.explicit_values),universe_count:s.counts.universe,nonzero_count:nonzero,warehouse_totals:[...totals.values()].map(t=>({...t,quantity:t.quantity.toString()}))};
   db.exec('COMMIT');return approval;
  }
  const tempBytes=()=>{let n=statSync(join(dir,'scope.sqlite')).size;for(let i=0;i<levels.length;i++)n+=statSync(join(dir,`level-${i}`)).size;if(n>4*1024**3)throw Error('EXPLICIT_ZERO_SCOPE_TEMP_LIMIT');return n;};
  const pairs=db.prepare("SELECT w.id AS warehouse_id,s.id AS sku_id FROM members w CROSS JOIN members s WHERE w.kind='WAREHOUSE' AND s.kind='SKU' AND NOT EXISTS(SELECT 1 FROM explicit_values e WHERE e.warehouse_id=w.id AND e.sku_id=s.id) AND NOT EXISTS(SELECT 1 FROM mask u WHERE u.warehouse_id=w.id AND u.sku_id=s.id) ORDER BY w.id,s.id");
  let ordinal=0;const put=db.prepare('INSERT INTO zero_pairs VALUES(?,?,?)');if(s.counts.zero){const fd=openSync(join(dir,'level-0'),'wx+',0o600);levels.push({fd,width:s.counts.zero});for(const p of pairs.iterate()){ordinal++;put.run(ordinal,p.warehouse_id!,p.sku_id!);const line=JSON.stringify(explicitZeroApprovalFact(approval,ordinal));if(Buffer.byteLength(line)>1024)throw Error('EXPLICIT_ZERO_SCOPE_FACT_SIZE');const h=scopeLeaf(ordinal,line);if(writeSync(fd,h)!==32)throw Error('EXPLICIT_ZERO_NODE_WRITE');if(ordinal%4096===0)tempBytes();}}
  if(ordinal!==s.counts.zero)throw Error('EXPLICIT_ZERO_SCOPE_GENERATION_COUNT');
  while(levels.at(-1)&&levels.at(-1)!.width>1){const previous=levels.at(-1)!,fd=openSync(join(dir,`level-${levels.length}`),'wx+',0o600),width=Math.ceil(previous.width/2);levels.push({fd,width});for(let i=0;i<previous.width;i+=2){const left=readNode(previous.fd,i),right=i+1<previous.width?readNode(previous.fd,i+1):left;if(writeSync(fd,scopeNode(left,right))!==32)throw Error('EXPLICIT_ZERO_NODE_WRITE');}tempBytes();}
  db.exec('COMMIT');tempBytes();if(ordinal){const pin=(p:ScopePin)=>({sha256:p.sha256,records_sha256:p.records_sha256,count:p.row_count});state.descriptor={format_version:'EXPLICIT_ZERO_SCOPE_MERKLE_V2',sha256:approval.sha256,source_namespace:s.source_namespace,inventory_file_sha256:s.inventory_file_sha256,cutoff_at:s.cutoff_at,record_count:ordinal,merkle_root_sha256:readNode(levels.at(-1)!.fd,0).toString('hex'),batch_key:s.batch_key,input_manifest_sha256:s.input_manifest.sha256,registry_sha256:s.identity_registry.sha256,warehouses:pin(s.warehouses),skus:pin(s.skus),explicit_values:pin(s.explicit_values),unknown_mask:pin(s.unknown_mask),universe_count:s.counts.universe,explicit_confirmed_count:s.counts.explicit_confirmed,explicit_unknown_overlap_count:overlap};if(Buffer.byteLength(JSON.stringify(state.descriptor))>4096)throw Error('EXPLICIT_ZERO_DESCRIPTOR_SIZE');}return approval;
 }catch(error){if(approval)closeExplicitZeroApproval(approval);else{for(const level of levels)closeSync(level.fd);db?.close();rmSync(dir,{recursive:true,force:true});}throw error;}
}

export function explicitZeroScopeCounts(approval:ExplicitZeroApproval){explicitZeroApprovalWire(approval);const s=scopes.get(approval);return s?{...s.summary.counts}:undefined;}
export function explicitZeroScopeRecordValid(approval:ExplicitZeroApproval,row:any):boolean {
 explicitZeroApprovalWire(approval);const s=scopes.get(approval);if(!s)return true;const f=row?.fields;if(!f||!uuid(f.warehouse_id)||!uuid(f.sku_id)||s.masked.get(f.warehouse_id,f.sku_id))return false;
 if(row.explicit_zero_evidence!==undefined)return scopeApproved(approval,s.summary.source_namespace,s.summary.inventory_file_sha256,s.summary.cutoff_at,row);
 const e=s.explicit.get(f.warehouse_id,f.sku_id);return !!e&&e.quantity===f.quantity&&Array.isArray(row.source_refs)&&row.source_refs.some((r:any)=>r.file_sha256===s.summary.inventory_file_sha256);
}

export function isExplicitZeroApprovalDescriptor(value:unknown,namespace:string,cutoff:string):boolean {
 const a=value as any;if(a?.format_version==='INVENTORY_BASELINE_SCOPE_V1')return isInventoryBaselineDescriptor(a,namespace,cutoff);if(!a||a.source_namespace!==namespace||a.cutoff_at!==cutoff||!hash(a.sha256)||!hash(a.inventory_file_sha256)||a.sha256===a.inventory_file_sha256||!hash(a.merkle_root_sha256)||!Number.isSafeInteger(a.record_count)||a.record_count<1)return false;
 if(a.format_version==='EXPLICIT_ZERO_APPROVAL_MERKLE_V1')return closed(a,['format_version','sha256','inventory_file_sha256','cutoff_at','source_namespace','record_count','merkle_root_sha256']);
 if(a.format_version!=='EXPLICIT_ZERO_SCOPE_MERKLE_V2'||!closed(a,['format_version','sha256','inventory_file_sha256','cutoff_at','source_namespace','record_count','merkle_root_sha256','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','unknown_mask','universe_count','explicit_confirmed_count','explicit_unknown_overlap_count'])||!text(a.batch_key)||Buffer.byteLength(a.batch_key)>128||!text(a.source_namespace)||Buffer.byteLength(a.source_namespace)>256||!hash(a.input_manifest_sha256)||!hash(a.registry_sha256)||Buffer.byteLength(JSON.stringify(a))>4096)return false;
 for(const p of [a.warehouses,a.skus,a.explicit_values,a.unknown_mask])if(!closed(p,['sha256','records_sha256','count'])||!hash(p.sha256)||!hash(p.records_sha256)||!Number.isSafeInteger(p.count)||p.count<0||p.count>5_000_000)return false;
 return a.warehouses.count>0&&a.skus.count>0&&a.universe_count===a.warehouses.count*a.skus.count&&a.universe_count<=5_000_000&&Number.isSafeInteger(a.explicit_unknown_overlap_count)&&a.explicit_unknown_overlap_count>=0&&a.explicit_unknown_overlap_count<=Math.min(a.explicit_values.count,a.unknown_mask.count)&&a.explicit_confirmed_count===a.explicit_values.count-a.explicit_unknown_overlap_count&&a.record_count===a.universe_count-a.explicit_values.count-a.unknown_mask.count+a.explicit_unknown_overlap_count&&a.unknown_mask.count===0;
}
export function explicitZeroScopeMembersMatch(approval:ExplicitZeroApproval,members:Iterable<{entity_type:string;target_id:string}>):boolean {
 explicitZeroApprovalWire(approval);const s=scopes.get(approval);if(!s)return true;s.db.exec('CREATE TEMP TABLE IF NOT EXISTS final_members(kind TEXT,id TEXT,PRIMARY KEY(kind,id)) WITHOUT ROWID; DELETE FROM final_members');const add=s.db.prepare('INSERT INTO final_members VALUES(?,?)');try{for(const r of members)if(['WAREHOUSE','SKU'].includes(r.entity_type))add.run(r.entity_type,r.target_id);}catch{return false;}return !s.db.prepare('SELECT 1 FROM (SELECT kind,id FROM members EXCEPT SELECT kind,id FROM final_members) UNION ALL SELECT 1 FROM (SELECT kind,id FROM final_members EXCEPT SELECT kind,id FROM members) LIMIT 1').get();
}

function isInventoryBaselineDescriptor(a:any,namespace:string,cutoff:string):boolean {
 if(!closed(a,['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals'])||a.source_namespace!==namespace||a.cutoff_at!==cutoff||!validateOffsetInstant(cutoff)||!text(a.batch_key)||![a.sha256,a.inventory_file_sha256,a.input_manifest_sha256,a.registry_sha256].every(hash)||a.sha256===a.inventory_file_sha256)return false;
 for(const p of [a.warehouses,a.skus,a.explicit_values])if(!closed(p,['sha256','records_sha256','count'])||!hash(p.sha256)||!hash(p.records_sha256)||!Number.isSafeInteger(p.count)||p.count<0)return false;
 if(a.warehouses.count<1||a.skus.count<1||a.universe_count!==a.warehouses.count*a.skus.count||!Number.isSafeInteger(a.universe_count)||!Number.isSafeInteger(a.nonzero_count)||a.nonzero_count<0||a.nonzero_count>a.explicit_values.count||a.explicit_values.count>a.universe_count||!Array.isArray(a.warehouse_totals)||a.warehouse_totals.length!==a.warehouses.count)return false;
 let previous='',count=0,nonzero=0;
 for(const t of a.warehouse_totals){if(!closed(t,['warehouse_id','explicit_count','nonzero_count','quantity'])||!uuid(t.warehouse_id)||t.warehouse_id<=previous||!validateQuantityString(t.quantity)||!Number.isSafeInteger(t.explicit_count)||!Number.isSafeInteger(t.nonzero_count)||t.explicit_count<0||t.explicit_count>a.skus.count||t.nonzero_count<0||t.nonzero_count>t.explicit_count)return false;previous=t.warehouse_id;count+=t.explicit_count;nonzero+=t.nonzero_count;}
 return count===a.explicit_values.count&&nonzero===a.nonzero_count;
}

/** Domain membership only. Account permissions are checked by the caller's existing authorization. */
export function inventoryBaselineScopeContains(approval:ExplicitZeroApproval|undefined,warehouseId:unknown,skuId:unknown):boolean {
 if(!approval||!isInventoryBaselineScope(approval)||!uuid(warehouseId)||!uuid(skuId))return false;
 explicitZeroApprovalWire(approval);const s=scopes.get(approval)!;
 return !!s.db.prepare("SELECT 1 FROM members w JOIN members k ON k.kind='SKU' AND k.id=? WHERE w.kind='WAREHOUSE' AND w.id=?").get(skuId as string,warehouseId as string);
}
