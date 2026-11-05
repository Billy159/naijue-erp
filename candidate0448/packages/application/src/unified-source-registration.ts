import {sha256,parseStrictJson,decodeUtf8,validateOffsetInstant,safePackagePath,findCredentialPath} from './unified-import-contract.ts';
import type {SourceFilePin} from './unified-import-contract.ts';
import {requestHash} from './request-hash.ts';
import {stableImportId} from './inventory-cutoff-import.ts';

export interface StandardSourceDeclarationRegistration {batch_id:string;source_namespace:string;source_metadata_sha256:string;cutoff_at:string;}
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object';
function cutoffMicros(value:unknown):string {
 if(typeof value!=='string'||!validateOffsetInstant(value))throw Error('REGISTRATION_SOURCE_INVALID');
 const m=/^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)!,ms=Date.parse(m[1]!+m[3]!);
 if(!Number.isSafeInteger(ms))throw Error('REGISTRATION_SOURCE_INVALID');
 return (BigInt(ms)*1000n+BigInt((m[2]??'').padEnd(6,'0'))).toString();
}
/** Pure source identity declaration, never source truth or execution authority.
 * Shared by offline stream preparation and the explicitly selected whole compiler. */
export function deriveStandardSourceRegistration(declaration:unknown):Readonly<StandardSourceDeclarationRegistration> {
 if(!object(declaration)||Object.keys(declaration).sort().join(',')!=='cutoff_at,source_files,source_namespace'||typeof declaration.source_namespace!=='string'||declaration.source_namespace.length>2*1024*1024||!declaration.source_namespace.trim()||!(declaration.source_namespace as string & {isWellFormed():boolean}).isWellFormed()||declaration.source_namespace.includes('\0')||typeof declaration.cutoff_at!=='string'||!validateOffsetInstant(declaration.cutoff_at)||!Array.isArray(declaration.source_files)||!declaration.source_files.length||declaration.source_files.length>20000)throw Error('REGISTRATION_SOURCE_INVALID');
 let budget=Buffer.byteLength(declaration.source_namespace)+Buffer.byteLength(declaration.cutoff_at);if(budget>2*1024*1024)throw Error('REGISTRATION_SOURCE_INVALID');
 const seen=new Set<string>();for(const f of declaration.source_files){if(!object(f)||Object.keys(f).sort().join(',')!=='bytes,relative_path,sha256'||typeof f.relative_path!=='string'||!safePackagePath(f.relative_path)||typeof f.bytes!=='number'||!Number.isSafeInteger(f.bytes)||f.bytes<0||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256)||seen.has(f.sha256))throw Error('REGISTRATION_SOURCE_INVALID');const pathBytes=Buffer.byteLength(f.relative_path);if(pathBytes>2*1024*1024)throw Error('REGISTRATION_SOURCE_INVALID');budget+=pathBytes+64;if(budget>2*1024*1024)throw Error('REGISTRATION_SOURCE_INVALID');seen.add(f.sha256);}
 if(findCredentialPath(declaration)||Buffer.byteLength(JSON.stringify(declaration))>2*1024*1024)throw Error('REGISTRATION_SOURCE_INVALID');
 const source_files=(declaration.source_files as SourceFilePin[]).map(f=>({...f})).sort((a,b)=>a.relative_path<b.relative_path?-1:a.relative_path>b.relative_path?1:a.sha256<b.sha256?-1:a.sha256>b.sha256?1:a.bytes-b.bytes);
 const source_metadata_sha256=requestHash({format_version:'STANDARD_SOURCE_DECLARATION_V3',source_namespace:declaration.source_namespace,source_files,cutoff_utc_microseconds:cutoffMicros(declaration.cutoff_at)});
 return Object.freeze({batch_id:stableImportId('native-import-batch',declaration.source_namespace,source_metadata_sha256),source_namespace:declaration.source_namespace,source_metadata_sha256,cutoff_at:declaration.cutoff_at});
}
/** Exact READY REAL manifest pin; full package and target admission are separate. */
export function createStandardSourceRegistration(manifestBytes:Uint8Array,expectedManifestSha256:string):Readonly<StandardSourceDeclarationRegistration> {
 if(!(manifestBytes instanceof Uint8Array)||manifestBytes.byteLength>2*1024*1024||typeof expectedManifestSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedManifestSha256)||sha256(manifestBytes)!==expectedManifestSha256)throw Error('REGISTRATION_MANIFEST_HASH_MISMATCH');
 const m:unknown=parseStrictJson(decodeUtf8(manifestBytes));if(!object(m)||m.format_version!=='UNIFIED_STANDARD_PACKAGE_V1'||m.stage!=='READY'||m.package_kind!=='REAL'||!object(m.inventory_source))throw Error('REGISTRATION_MANIFEST_INVALID');
 return deriveStandardSourceRegistration({source_namespace:m.source_namespace,source_files:m.source_files,cutoff_at:m.inventory_source.cutoff_at});
}
export function assertStandardSourceRegistration(registration:unknown,manifestBytes:Uint8Array,expectedManifestSha256:string):Readonly<StandardSourceDeclarationRegistration> {
 const expected=createStandardSourceRegistration(manifestBytes,expectedManifestSha256);
 if(!object(registration)||Object.keys(registration).sort().join(',')!=='batch_id,cutoff_at,source_metadata_sha256,source_namespace'||registration.batch_id!==expected.batch_id||registration.source_namespace!==expected.source_namespace||registration.source_metadata_sha256!==expected.source_metadata_sha256||cutoffMicros(registration.cutoff_at)!==cutoffMicros(expected.cutoff_at))throw Error('REGISTRATION_DECLARATION_MISMATCH');
 return expected;
}
