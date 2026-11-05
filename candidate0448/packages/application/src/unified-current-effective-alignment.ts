import {createHash} from 'node:crypto';
import {decodeUtf8,parseStrictJson,safePackagePath,validateOffsetInstant,findCredentialPath} from './unified-import-contract.ts';

const documents=['sales_header','sales_line','sales_settlement','transfer_header','transfer_line'] as const;
interface DocumentPin {readonly table:string;readonly relative_path:string;readonly bytes:number;readonly sha256:string;readonly row_count:number;}
/** An independently reviewed assertion, not an invented export timestamp.
 * The caller obtains trustedSha256 from the authorized reviewer outside the package.
 * Hash verification binds that review to these bytes; it cannot establish source truth. */
export interface CurrentEffectiveAlignmentEvidence {
 readonly format_version:'CURRENT_EFFECTIVE_ALIGNMENT_V1';
 readonly scope:'CURRENT_EFFECTIVE';
 readonly source_namespace:string;
 readonly inventory_file_sha256:string;
 readonly inventory_exported_at:null;
 readonly cutoff_at:string;
 readonly registry_sha256:string;
 readonly document_files:readonly DocumentPin[];
 readonly reviewed_by:string;
 readonly review_reference:string;
 readonly alignment_basis:string;
 readonly decision:'CURRENT_EFFECTIVE_DOCUMENTS_MATCH_INVENTORY_CUTOFF';
}
const verified=new WeakMap<object,{sha256:string;bytes:number}>();
const hash=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const text=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=4096&&x===x.trim()&&!/[\uD800-\uDFFF]/u.test(x)&&!/[\u0000-\u001f\u007f]/.test(x);
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const closed=(x:unknown,keys:string[]):x is Record<string,unknown>=>object(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const count=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<=2147483647;
function pins(value:unknown):value is readonly DocumentPin[] {
 if(!Array.isArray(value)||value.length!==documents.length)return false;
 const paths=new Set<string>();
 return value.every((p,i)=>{if(!closed(p,['table','relative_path','bytes','sha256','row_count'])||p.table!==documents[i]||!safePackagePath(p.relative_path)||!Number.isSafeInteger(p.bytes)||Number(p.bytes)<0||!hash(p.sha256)||!count(p.row_count)||paths.has(p.relative_path))return false;paths.add(p.relative_path);return true;});
}
export function readCurrentEffectiveAlignmentEvidence(input:{bytes:Uint8Array;trustedSha256:string}):CurrentEffectiveAlignmentEvidence {
 if(!(input.bytes instanceof Uint8Array)||input.bytes.byteLength<1||input.bytes.byteLength>65536)throw Error('CURRENT_EFFECTIVE_ALIGNMENT_SIZE');
 const bytes=Buffer.from(input.bytes);
 if(!hash(input.trustedSha256)||createHash('sha256').update(bytes).digest('hex')!==input.trustedSha256)throw Error('CURRENT_EFFECTIVE_ALIGNMENT_HASH');
 const value=parseStrictJson(decodeUtf8(bytes));
 if(!closed(value,['format_version','scope','source_namespace','inventory_file_sha256','inventory_exported_at','cutoff_at','registry_sha256','document_files','reviewed_by','review_reference','alignment_basis','decision'])||value.format_version!=='CURRENT_EFFECTIVE_ALIGNMENT_V1'||value.scope!=='CURRENT_EFFECTIVE'||!text(value.source_namespace)||!hash(value.inventory_file_sha256)||value.inventory_file_sha256===input.trustedSha256||value.inventory_exported_at!==null||!validateOffsetInstant(value.cutoff_at)||!hash(value.registry_sha256)||!pins(value.document_files)||!text(value.reviewed_by)||!text(value.review_reference)||!text(value.alignment_basis)||value.decision!=='CURRENT_EFFECTIVE_DOCUMENTS_MATCH_INVENTORY_CUTOFF'||findCredentialPath(value))throw Error('CURRENT_EFFECTIVE_ALIGNMENT_FACT');
 for(const pin of value.document_files)Object.freeze(pin);Object.freeze(value.document_files);Object.freeze(value);
 verified.set(value,{sha256:input.trustedSha256,bytes:bytes.byteLength});return value as unknown as CurrentEffectiveAlignmentEvidence;
}
/** Exact package binding supplements all ordinary file, relation and approval checks.
 * A cloned object or a different self-declared source hash is not a review capability. */
export function currentEffectiveAlignmentMatchesManifest(evidence:unknown,manifest:unknown):boolean {
 if(!object(evidence)||!verified.has(evidence)||!object(manifest))return false;
 const proof=verified.get(evidence)!,e=evidence as unknown as CurrentEffectiveAlignmentEvidence;
 const inv=manifest.inventory_source,alignment=manifest.document_cutoff_alignment,registry=manifest.identity_registry;
 if(!object(inv)||!object(alignment)||!object(registry)||!Array.isArray(manifest.source_files)||!Array.isArray(manifest.files)||manifest.snapshot_mode!=='CURRENT_EFFECTIVE'||manifest.source_namespace!==e.source_namespace||inv.source_file_sha256!==e.inventory_file_sha256||inv.exported_at!==e.inventory_exported_at||inv.cutoff_at!==e.cutoff_at||registry.sha256!==e.registry_sha256||alignment.scope!==e.scope||alignment.evidence_sha256!==proof.sha256)return false;
 const source=manifest.source_files.filter(p=>object(p)&&p.sha256===proof.sha256);
 if(source.length!==1||!object(source[0])||source[0].bytes!==proof.bytes||!safePackagePath(source[0].relative_path))return false;
 const selected=manifest.files.filter(p=>object(p)&&documents.includes(p.table as typeof documents[number]));
 return selected.length===documents.length&&e.document_files.every(pin=>selected.filter(p=>object(p)&&p.table===pin.table&&p.relative_path===pin.relative_path&&p.bytes===pin.bytes&&p.sha256===pin.sha256&&p.row_count===pin.row_count).length===1);
}
export function currentEffectiveAlignmentDescriptor(evidence:CurrentEffectiveAlignmentEvidence) {
 const proof=verified.get(evidence);if(!proof)throw Error('CURRENT_EFFECTIVE_ALIGNMENT_UNVERIFIED');
 return {format_version:'CURRENT_EFFECTIVE_ALIGNMENT_BINDING_V1' as const,evidence_sha256:proof.sha256,bytes:proof.bytes,scope:evidence.scope,source_namespace:evidence.source_namespace,inventory_file_sha256:evidence.inventory_file_sha256,cutoff_at:evidence.cutoff_at,registry_sha256:evidence.registry_sha256,reviewed_by:evidence.reviewed_by,review_reference:evidence.review_reference};
}
