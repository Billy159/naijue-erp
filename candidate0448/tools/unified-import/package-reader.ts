import { constants } from "node:fs";
import { open, realpath, lstat, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { decodeJsonl, decodeUtf8, findCredentialPath, parseStrictJson, safePackagePath, sha256, UNIFIED_PACKAGE_VERSION, validateUnifiedPackage } from "../../packages/application/src/unified-import-contract.ts";
import type { PackageValidation, ValidationOptions, PackageManifest, UnifiedPackage, StandardRecord, IdentityEntry } from "../../packages/application/src/unified-import-contract.ts";

export interface DirectoryValidationOptions extends ValidationOptions { expectedManifestSha256?:string; }
const MAX_MANIFEST_BYTES=2*1024*1024,MAX_PACKAGE_FILE_BYTES=64*1024*1024,MAX_TOTAL_BYTES=256*1024*1024;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
/** Read-only bounded local-directory intake. No ZIP extraction, network, env/DB access or SQL. */
export async function inspectPackageDirectory(directory:string,options:DirectoryValidationOptions={}):Promise<PackageValidation & {manifest_sha256?:string}> {
  const base:PackageValidation={format_version:UNIFIED_PACKAGE_VERSION,valid:false,import_eligible:false,database_import_implemented:false,package_kind:null,stage:null,counts:{},issues:[]};
  const problem=(code:string,path:string,message:string)=>{base.issues.push({code,path:findCredentialPath(path)?"$":path,message,severity:"BLOCK_SCHEMA"});};
  let root:string;try{root=await realpath(resolve(directory));if(!(await lstat(root)).isDirectory())throw new Error();}catch{problem("PACKAGE_DIRECTORY_UNREADABLE","$","Standard-package directory is not readable");return base;}
  let total=0;
  const read=async(path:string,limit:number):Promise<Uint8Array>=>{
    if(!safePackagePath(path)){problem("UNSAFE_PATH",path,"Package path must be a safe relative path");throw new Error();}
    const absolute=join(root,path);let current=root;
    for(const component of path.split("/")){current=join(current,component);const s=await lstat(current);if(s.isSymbolicLink()){problem("UNSAFE_PATH",path,"Symlinks are forbidden in package paths");throw new Error();}}
    const actual=await realpath(absolute);if(!actual.startsWith(root+sep)){problem("UNSAFE_PATH",path,"Package path escaped root");throw new Error();}
    const handle=await open(actual,constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=await handle.stat();if(!stat.isFile()||stat.size>limit||total+stat.size>MAX_TOTAL_BYTES){problem("PACKAGE_SIZE_LIMIT",path,"File/total package bound exceeded or not a regular file");throw new Error();}const bytes=Buffer.alloc(stat.size);let offset=0;while(offset<bytes.length){const chunk=await handle.read(bytes,offset,bytes.length-offset,offset);if(chunk.bytesRead===0)break;offset+=chunk.bytesRead;}const extra=await handle.read(Buffer.alloc(1),0,1,stat.size),after=await handle.stat();if(offset!==stat.size||extra.bytesRead!==0||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||bytes.length>limit){problem("FILE_CHANGED_DURING_READ",path,"Package bytes changed while reading");throw new Error();}total+=bytes.length;return bytes;}finally{await handle.close();}
  };
  let manifestBytes:Uint8Array,raw:unknown;
  try{manifestBytes=await read("manifest.json",MAX_MANIFEST_BYTES);raw=parseStrictJson(decodeUtf8(manifestBytes));}catch{if(!base.issues.length)problem("INVALID_MANIFEST","manifest.json","Manifest requires strict UTF8 LF JSON with unique keys");return base;}
  try{if(findCredentialPath(raw)){problem("FORBIDDEN_CREDENTIAL","$","Credential-bearing manifest values/paths are prohibited and never echoed");return base;}}catch{problem("INVALID_MANIFEST","manifest.json","Manifest JSON structure exceeds permitted bounds");return base;}
  const manifestHash=sha256(manifestBytes);
  if(options.expectedManifestSha256!==undefined&&(!/^[a-f0-9]{64}$/.test(options.expectedManifestSha256)||options.expectedManifestSha256!==manifestHash))problem("MANIFEST_HASH_MISMATCH","manifest.json","Manifest SHA256 differs from externally frozen package pin");
  if(!object(raw)||!object(raw.identity_registry)||!Array.isArray(raw.files)||!Array.isArray(raw.reports)||!Array.isArray(raw.assets)){problem("INVALID_MANIFEST","manifest.json","Missing closed registry/files declaration");return{...base,manifest_sha256:manifestHash};}
  if(raw.package_kind==="REAL"&&raw.stage==="READY"&&!options.expectedManifestSha256)problem("MANIFEST_HASH_REQUIRED","manifest.json","REAL READY validation requires externally frozen --manifest-sha256");
  const artifacts:Record<string,Uint8Array>={},records:Record<string,StandardRecord[]>={};let registry:IdentityEntry[]=[];const reports:Record<string,unknown>={};
  const declared=new Set(["manifest.json"]);
  for(const pin of [raw.identity_registry,...raw.files,...raw.reports,...raw.assets]) {
    if(!object(pin)||typeof pin.relative_path!=="string"){problem("INVALID_FILE_PIN","manifest.files","Invalid file pin");continue;}
    declared.add(pin.relative_path);
    let bytes:Uint8Array;try{bytes=await read(pin.relative_path,MAX_PACKAGE_FILE_BYTES);}catch{if(!base.issues.some(i=>i.path===pin.relative_path))problem("FILE_UNREADABLE",pin.relative_path,"Pinned standard file is unreadable");continue;}
    artifacts[pin.relative_path]=bytes;
    if(typeof pin.mime==="string")continue;
    let data:unknown[];try{decodeUtf8(bytes);}catch{problem("INVALID_ENCODING",pin.relative_path,"UTF8 without BOM and LF-only encoding is required");continue;}
    try{if(pin.encoding==="JSON"){reports[pin.relative_path]=parseStrictJson(decodeUtf8(bytes));continue;}data=decodeJsonl(bytes);}catch{problem("INVALID_JSONL",pin.relative_path,"Expected one JSON object per LF-terminated line with unique keys");continue;}
    if(pin===raw.identity_registry)registry=data as IdentityEntry[];else if(typeof pin.role==="string")reports[pin.relative_path]=data;else if(typeof pin.table==="string")records[pin.table]=data as StandardRecord[];
  }
  // Undeclared contents are never interpreted (especially raw files or credentials).
  let scanned=0;
  const scan=async(path:string,depth=0):Promise<void>=>{if(depth>16)throw new Error("Depth limit");for(const entry of await readdir(join(root,path),{withFileTypes:true})){if(++scanned>4096)throw new Error("Entry limit");const relative=path?`${path}/${entry.name}`:entry.name;if(entry.isDirectory())await scan(relative,depth+1);else if(!declared.has(relative))problem("UNDECLARED_PACKAGE_FILE",relative,"Only manifest, registry and declared standard files are accepted");}};
  try{await scan("");}catch{problem("PACKAGE_DIRECTORY_UNREADABLE","$","Cannot enumerate standard package");}
  const parsed:UnifiedPackage={manifest:raw as unknown as PackageManifest,registry,records,artifacts,reports};
  const validation=validateUnifiedPackage(parsed,options);
  return{...validation,valid:base.issues.length===0&&validation.valid,issues:[...base.issues,...validation.issues],manifest_sha256:manifestHash};
}
