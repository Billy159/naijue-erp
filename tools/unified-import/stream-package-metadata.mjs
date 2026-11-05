import {STABLE_SOURCE_KEY_PREFIX,parseStableSourceKey,validateStableIdentityBinding} from '../../packages/application/src/unified-import-stable-identity.ts';
import {currentEffectiveAlignmentMatchesManifest} from '../../packages/application/src/unified-current-effective-alignment.ts';
import {TABLE_SCHEMAS,WORK_PACKAGES,SCHEMA_BASELINE_COMMIT,SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256,ENUM_MAPPING_VERSION,UNIFIED_PACKAGE_VERSION,safePackagePath,parseStrictJson,decodeUtf8,sha256,findCredentialPath,registryTargetId,validateInt32,validateOffsetInstant,validateSourceTimezone} from '../../packages/application/src/unified-import-contract.ts';

const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const nonempty=x=>typeof x==='string'&&x.isWellFormed()&&!x.includes('\0')&&x.trim().length>0;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
const REPORT_LIMIT=2*1024*1024;
const pinNumbers=p=>Number.isSafeInteger(p.bytes)&&p.bytes>=0&&hash(p.sha256)&&validateInt32(p.row_count)&&p.row_count>=0;

/** Bounded metadata checks for the offline stream preflight. Issue records contain coordinates,
 * never input values. Original source pins describe provenance and are not local input files. */
export async function createMetadataChecker({manifest:m,issue,readBounded,scanJsonl,scanBinary,counts,db,allowSynthetic=false,currentEffectiveAlignmentEvidence}) {
 const emit=async(code,field,file='manifest.json',row=null)=>issue(code,file,row,field);
 const sourceHashes=new Set(), paths=new Set(['manifest.json']), assetRefs=new Map(), reportRoles=new Set();
 const addPath=async(p,field)=>{if(!safePackagePath(p)){await emit('UNSAFE_PATH',field);return false;}if(paths.has(p))await emit('DUPLICATE_FILE_PATH',field);paths.add(p);return true;};
 if(!exact(m,['format_version','stage','package_kind','source_namespace','identity_registry','schema_contract','enum_mapping_version','decimal_scale','quantity_unit','snapshot_mode','files','reports','assets','source_files','work_packages','inventory_source','document_cutoff_alignment']))await emit('MANIFEST_KEYS','$');
 if(!exact(m.schema_contract,['commit','source_declarations_sha256','proposed_contract_version'])||m.schema_contract.commit!==SCHEMA_BASELINE_COMMIT||![SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256].includes(m.schema_contract.source_declarations_sha256)||m.schema_contract.proposed_contract_version!==UNIFIED_PACKAGE_VERSION)await emit('SCHEMA_CONTRACT_MISMATCH','schema_contract');
 if(m.enum_mapping_version!==ENUM_MAPPING_VERSION||m.decimal_scale!==2||m.quantity_unit!=='PIECE'||m.snapshot_mode!=='CURRENT_EFFECTIVE')await emit('VALUE_CONVENTION_MISMATCH','$');
 if(m.format_version!==UNIFIED_PACKAGE_VERSION)await emit('UNSUPPORTED_VERSION','format_version');
 if(!['READY','CLEANED'].includes(m.stage))await emit('INVALID_STAGE','stage');
 if(!['REAL','SYNTHETIC'].includes(m.package_kind))await emit('INVALID_PACKAGE_KIND','package_kind');
 if(m.package_kind==='SYNTHETIC'&&!allowSynthetic)await emit('SYNTHETIC_REQUIRES_OPT_IN','package_kind');
 if(!nonempty(m.source_namespace))await emit('SOURCE_NAMESPACE_REQUIRED','source_namespace');
 if(!Array.isArray(m.source_files)||!Array.isArray(m.files)||!Array.isArray(m.assets)||!Array.isArray(m.reports)||!Array.isArray(m.work_packages)||!obj(m.identity_registry)||!obj(m.inventory_source)||!obj(m.document_cutoff_alignment)) {await emit('INVALID_MANIFEST_FIELDS','$');throw Error('INVALID_MANIFEST');}
 for(const f of m.source_files){if(!exact(f,['relative_path','bytes','sha256'])||!safePackagePath(f.relative_path)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!hash(f.sha256))await emit('INVALID_SOURCE_FILE','source_files');else{if(sourceHashes.has(f.sha256))await emit('DUPLICATE_SOURCE_FILE','source_files');sourceHashes.add(f.sha256);}}
 if(!sourceHashes.size)await emit('SOURCE_FILES_REQUIRED','source_files');
 async function checkSourceRefs(refs,file,line){if(!Array.isArray(refs)||!refs.length){await issue('SOURCE_REFS_REQUIRED',file,line,'source_refs');return;}for(const r of refs)if(!exact(r,['file_sha256','sheet','row'])||!hash(r.file_sha256)||!sourceHashes.has(r.file_sha256)||!(r.sheet===null||nonempty(r.sheet))||!validateInt32(r.row)||r.row<1)await issue('INVALID_SOURCE_REF',file,line,'source_refs');}
 const ir=m.identity_registry;
 if(!exact(ir,['relative_path','bytes','sha256','row_count'])||!pinNumbers(ir))await emit('FILE_PIN_KEYS','identity_registry');
 await addPath(ir.relative_path,'identity_registry');
 for(const p of m.files){if(!exact(p,['relative_path','bytes','sha256','row_count','table','work_package'])||!pinNumbers(p))await emit('FILE_PIN_KEYS','files');if(obj(p))await addPath(p.relative_path,'files');if(!obj(p)||!WORK_PACKAGES.find(w=>w.number===p.work_package)?.tables.includes(p.table))await emit('WORK_PACKAGE_OWNERSHIP','files');}
 if(m.work_packages.length!==13||m.work_packages.some((p,i)=>!exact(p,['number','version'])||p.number!==i+1||!nonempty(p.version)))await emit('WORK_PACKAGE_CATALOG','work_packages');
 const inv=m.inventory_source,align=m.document_cutoff_alignment;
 if(!exact(inv,['kind','source_file_sha256','exported_at','source_timezone','cutoff_at','unit','coverage_mode','warehouse_registry_sha256','sku_registry_sha256'])||inv.kind!==(m.package_kind==='SYNTHETIC'?'SYNTHETIC_NEW_SNAPSHOT':'NEW_AFTERNOON_SNAPSHOT')||!hash(inv.source_file_sha256)||!sourceHashes.has(inv.source_file_sha256)||!validateOffsetInstant(inv.cutoff_at)||(inv.exported_at!==null&&!validateOffsetInstant(inv.exported_at))||!validateSourceTimezone(inv.source_timezone)||inv.unit!=='PIECE'||inv.coverage_mode!=='EXPLICIT_KEYS'||inv.warehouse_registry_sha256!==ir.sha256||inv.sku_registry_sha256!==ir.sha256)await emit('STOCK_SOURCE_NOT_VERIFIED','inventory_source');
 if(!exact(align,['scope','evidence_sha256'])||align.scope!=='CURRENT_EFFECTIVE'||!hash(align.evidence_sha256)||(!sourceHashes.has(align.evidence_sha256)&&!currentEffectiveAlignmentMatchesManifest(currentEffectiveAlignmentEvidence,m))||align.evidence_sha256===inv.source_file_sha256||((inv.exported_at===null||currentEffectiveAlignmentEvidence!==undefined)&&!currentEffectiveAlignmentMatchesManifest(currentEffectiveAlignmentEvidence,m)))await emit('BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN','document_cutoff_alignment');
 for(const p of m.assets){
  if(!exact(p,['relative_path','bytes','sha256','file_ref','mime'])||!safePackagePath(p.relative_path)||!nonempty(p.file_ref)||!['image/png','image/jpeg','image/webp'].includes(p.mime)||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>8388608||!hash(p.sha256)){await emit('INVALID_ASSET_PIN','assets');continue;}
  await addPath(p.relative_path,'assets');if(assetRefs.has(p.file_ref))await emit('DUPLICATE_ASSET_REF','assets');else assetRefs.set(p.file_ref,p);
  const data=await scanBinary(p);if(data.bytes!==p.bytes||data.sha256!==p.sha256)await emit('FILE_PIN_MISMATCH','$',p.relative_path);
  const b=data.head;const mime=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'image/webp':null;if(mime!==p.mime)await emit('IMAGE_ASSET_MISMATCH','$',p.relative_path);
 }
 let reconciliation,reconciliationPath;
 for(const p of m.reports){
  if(!exact(p,['relative_path','bytes','sha256','row_count','role','encoding'])||!['DECISIONS','EXCEPTIONS','RECONCILIATION','CUTOFF_ALIGNMENT'].includes(p.role)||!['JSON','JSONL'].includes(p.encoding)||!safePackagePath(p.relative_path)||!pinNumbers(p)){await emit('INVALID_REPORT_PIN','reports');continue;}
  if(reportRoles.has(p.role))await emit('DUPLICATE_REPORT_ROLE','reports');reportRoles.add(p.role);await addPath(p.relative_path,'reports');
  if(p.role==='EXCEPTIONS'){
   if(p.encoding!=='JSONL'){await emit('INVALID_EXCEPTIONS','reports');continue;}
   await scanJsonl(p,async(e,file,line)=>{if(!exact(e,['entity_type','source_key','field','code','observed_value','expected_rule','source_refs','severity','proposed_action'])||!nonempty(e.entity_type)||!nonempty(e.source_key)||!(e.field===null||nonempty(e.field))||!nonempty(e.code)||!nonempty(e.expected_rule)||!nonempty(e.proposed_action)||!['INFO_PRESERVED_UNKNOWN','BLOCK_REFERENCE','BLOCK_SCHEMA','BLOCK_POSTING','BLOCK_CUTOVER'].includes(e.severity)){await issue('INVALID_EXCEPTION',file,line,'$');return;}await checkSourceRefs(e.source_refs,file,line);if(e.severity!=='INFO_PRESERVED_UNKNOWN')await issue('UNRESOLVED_EXCEPTION',file,line,'severity');});continue;
  }
  if(p.encoding!=='JSON'){await emit('INVALID_REPORT','$',p.relative_path);continue;}
  const b=await readBounded(p.relative_path,REPORT_LIMIT);if(b.length!==p.bytes||sha256(b)!==p.sha256)await emit('FILE_PIN_MISMATCH','$',p.relative_path);
  let v;try{v=parseStrictJson(decodeUtf8(b));}catch{await emit('INVALID_REPORT','$',p.relative_path);continue;}
  if(findCredentialPath(v)){await emit('FORBIDDEN_CREDENTIAL','$',p.relative_path);continue;}
  if(p.row_count!==(Array.isArray(v)?v.length:1))await emit('FILE_ROW_COUNT_MISMATCH','$',p.relative_path);
  if(!obj(v)){await emit('INVALID_REPORT','$',p.relative_path);continue;}
  if(p.role==='DECISIONS'){
   if(!exact(v,['format_version','package_kind','source_namespace','rules'])||v.format_version!==UNIFIED_PACKAGE_VERSION||v.package_kind!==m.package_kind||v.source_namespace!==m.source_namespace||!Array.isArray(v.rules)||v.rules.length<3)await emit('INVALID_DECISIONS','$',p.relative_path);
   else {const codes=new Set();for(const r of v.rules){if(!exact(r,['code','scope','evidence_sha256'])||!nonempty(r.code)||!nonempty(r.scope)||!hash(r.evidence_sha256)||!sourceHashes.has(r.evidence_sha256)||codes.has(r.code))await emit('INVALID_DECISIONS','$',p.relative_path);else codes.add(r.code);}for(const c of ['NO_MAIN_UNIT','DEFAULT_FIT_A','PRESERVE_EXISTING_SIZE_MAPPING'])if(!codes.has(c))await emit('INVALID_DECISIONS','$',p.relative_path);}
  }else if(p.role==='RECONCILIATION'){reconciliation=v;reconciliationPath=p.relative_path;}
 }
 for(const role of ['DECISIONS','EXCEPTIONS','RECONCILIATION'])if(!reportRoles.has(role))await emit('REPORT_REQUIRED','reports');
 const allowedTypes=new Set([...Object.keys(TABLE_SCHEMAS).filter(t=>TABLE_SCHEMAS[t].id).map(t=>t.toUpperCase()),'USER_ACCOUNT']);
 async function checkRegistry(e,file,line){
  if(!exact(e,['entity_type','source_namespace','canonical_source_key','target_id','aliases','identity_basis','source_refs'])||!allowedTypes.has(e.entity_type)||e.source_namespace!==m.source_namespace||!nonempty(e.canonical_source_key)||!uuid(e.target_id)||!Array.isArray(e.aliases)||!e.aliases.every(nonempty)||!['EXISTING_VERIFIED','STABLE_IMPORT_ID_V1'].includes(e.identity_basis)){await issue('INVALID_REGISTRY_ENTRY',file,line,'$');return false;}
  try{const stable=parseStableSourceKey(e.canonical_source_key);if(stable&&stable.entity_type!==e.entity_type)await issue('STABLE_IDENTITY_ENTITY_MISMATCH',file,line,'canonical_source_key');}catch{await issue('STABLE_SOURCE_KEY_INVALID',file,line,'canonical_source_key');}
  await checkSourceRefs(e.source_refs,file,line);if(e.entity_type==='USER_ACCOUNT'&&e.identity_basis!=='EXISTING_VERIFIED')await issue('ACCOUNT_PROVISIONING_NOT_PACKAGE_INPUT',file,line,'identity_basis');if(e.identity_basis==='STABLE_IMPORT_ID_V1'&&e.target_id!==registryTargetId(e.source_namespace,e.entity_type,e.canonical_source_key))await issue('REGISTRY_ID_ALGORITHM_MISMATCH',file,line,'target_id');return true;
 }
 async function checkAssetRef(f,file,line){const p=assetRefs.get(f?.file_ref);if(!p||p.mime!==f.mime||typeof f.byte_size!=='string'||!/^\d+$/.test(f.byte_size)||f.byte_size.replace(/^0+(?=\d)/,'')!==String(p.bytes))await issue('IMAGE_ASSET_MISMATCH',file,line,'file_ref');}
 async function finish(){
  const lookupQuery=db.prepare('SELECT r.raw_json FROM identity_keys k JOIN identities i ON i.entity=k.entity AND i.id=k.id JOIN registry_rows r ON r.ordinal=i.line AND r.file=i.file WHERE k.entity=? AND k.key=?');
  const lookup=(entity,key)=>{const row=lookupQuery.get(entity.toLowerCase(),key);return row?JSON.parse(row.raw_json):undefined;};
  const stableRows=db.prepare(`SELECT f.fields,f.file,f.line,r.raw_json FROM facts f JOIN identity_keys k ON k.entity=f.entity AND k.key=f.source_key JOIN identities i ON i.entity=k.entity AND i.id=k.id JOIN registry_rows r ON r.ordinal=i.line AND r.file=i.file WHERE substr(json_extract(r.raw_json,'$.canonical_source_key'),1,?)=?`);
  for(const row of stableRows.iterate(STABLE_SOURCE_KEY_PREFIX.length,STABLE_SOURCE_KEY_PREFIX)){
   const entry=JSON.parse(row.raw_json);for(const code of validateStableIdentityBinding(entry,JSON.parse(row.fields),lookup))await issue(code,row.file,row.line,'source_key');
  }
  const v=reconciliation;if(v){if(!exact(v,['format_version','package_kind','source_namespace','tables'])||v.format_version!==UNIFIED_PACKAGE_VERSION||v.package_kind!==m.package_kind||v.source_namespace!==m.source_namespace||!exact(v.tables,Object.keys(TABLE_SCHEMAS)))await emit('INVALID_RECONCILIATION','tables',reconciliationPath);else for(const [table,c] of Object.entries(v.tables)){if(!exact(c,['source_rows','retained_rows','rejected_rows'])||![c.source_rows,c.retained_rows,c.rejected_rows].every(n=>validateInt32(n)&&n>=0)||c.source_rows!==c.retained_rows+c.rejected_rows)await emit('INVALID_RECONCILIATION','tables',reconciliationPath);else{if(c.retained_rows!==counts[table])await emit('RECONCILIATION_COUNT_MISMATCH','tables',reconciliationPath);if(c.rejected_rows!==0)await emit('RECONCILIATION_SOURCE_ROWS_UNPRESERVED','tables',reconciliationPath);}}}}
 return {checkRegistry,checkSourceRefs,checkAssetRef,finish};
}
