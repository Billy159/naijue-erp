import {readFile, lstat, open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {isAbsolute, join} from 'node:path';
import {parseLegacyJsonText} from './legacy-json.mjs';
import {productMembership, minimumPriceFromLegacyObjects} from './effective-source-rules.mjs';

const names = Object.freeze({products:'erp_prod_source.product', overlays:'erp_prod_runtime.product_overlay',
  profiles:'erp_prod_runtime.product_profile_overlay', batches:'erp_prod_source.tplus_import_run', sources:'erp_prod_source.tplus_product_source'});
const need = (yes,code) => {if (!yes) throw new Error(code);};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const id = value => typeof value === 'string' && value.length > 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function unique(rows,key) {
  need(Array.isArray(rows),'PRODUCT_CENSUS_ROWS_REQUIRED'); const map=new Map();
  for (const row of rows) {
    need(plain(row) && id(row[key]) && !map.has(row[key]),'PRODUCT_CENSUS_SOURCE_ID_REFUSED');
    map.set(row[key],row);
  }
  return map;
}

/** Facts only. Not a product importer, authority, identity allocator or price
 * correction. Arrays must be from the exact declared same-snapshot tables. */
export function inspectProductSourceRows({products,overlays,profiles,batches,sources}) {
  const base=unique(products,'id'), extra=unique(overlays,'id'), profile=unique(profiles,'product_id');
  unique(batches,'batch_id');
  need(Array.isArray(sources),'PRODUCT_CENSUS_ROWS_REQUIRED');
  const members=productMembership({sourceRows:products,overlayRows:overlays});
  const committed=batches.filter(row=>row.status==='COMMITTED');
  // Multiple committed batches need the exact source consumer ordering. Do not
  // pick a maximum JS Date (which would lose PostgreSQL microseconds).
  const sourceByProduct=new Map(), sourceKeys=new Set();
  for (const row of sources) {
    need(plain(row) && id(row.batch_id) && id(row.source_id) && id(row.product_id),'PRODUCT_CENSUS_SOURCE_ROW_REFUSED');
    const key=JSON.stringify([row.batch_id,row.source_id]);
    need(!sourceKeys.has(key),'PRODUCT_CENSUS_DUPLICATE_SOURCE_KEY');sourceKeys.add(key);
    if (committed.length===1 && row.batch_id===committed[0].batch_id) {
      const matches=sourceByProduct.get(row.product_id)??[];matches.push(row);sourceByProduct.set(row.product_id,matches);
    }
  }
  const result={status:'SCOPED_PRODUCT_SOURCE_CENSUS_NOT_CONVERSION',physical:{products:base.size,overlays:extra.size,profiles:profile.size,batches:batches.length,sources:sources.length},
    membership:{total:members.length,source:0,overlayOnly:0,deletedPhysicalOverlays:overlays.filter(row=>row.deleted).length},
    profiles:{unknownPhysicalProduct:0,notVisible:0},committedBatchCount:committed.length,
    selectedSource:{ambiguousProducts:0,unknownPhysicalProducts:0},
    minimumPrice:{null:0,exactTwoDecimalOrLess:0,nonzeroExtraPrecision:0,unsupportedDecimalText:0,invalidSelectedType:0,unresolvedBatch:0,ambiguousSource:0,negativeValues:0,targetPrecisionOverflow:0},
    rawSourceProductNullReferences:{category_id:0,fit_id:0,counterparty_id:0},
    targetWrites:0,identityAllocation:0,independentTargetReadbackVerified:false};
  const visible=new Set(members.map(row=>row.id));
  for (const key of profile.keys()) {
    if (!base.has(key)&&!extra.has(key)) result.profiles.unknownPhysicalProduct++;
    if (!visible.has(key)) result.profiles.notVisible++;
  }
  for (const [key,rows] of sourceByProduct) {
    if (rows.length>1) result.selectedSource.ambiguousProducts++;
    if (!base.has(key)&&!extra.has(key)) result.selectedSource.unknownPhysicalProducts++;
  }
  for (const row of products) for (const field of Object.keys(result.rawSourceProductNullReferences)) {
    need(Object.hasOwn(row,field),'PRODUCT_CENSUS_SOURCE_COLUMN_MISSING');
    if (row[field]===null) result.rawSourceProductNullReferences[field]++;
  }
  for (const member of members) {
    result.membership[member.branch==='SOURCE'?'source':'overlayOnly']++;
    const pp=profile.get(member.id)?.body??null, po=extra.get(member.id)?.body??null;
    if (pp!==null) need(plain(pp),'PRODUCT_CENSUS_PROFILE_BODY_REFUSED');
    if (po!==null) need(plain(po),'PRODUCT_CENSUS_OVERLAY_BODY_REFUSED');
    // Higher precedence explicit values do not need an unused lower source.
    const selectedAbove=[pp,po].some(body=>body!==null && Object.hasOwn(body,'minimumPrice'));
    const candidates=sourceByProduct.get(member.id)??[];
    if (!selectedAbove && committed.length>1) {result.minimumPrice.unresolvedBatch++;continue;}
    if (!selectedAbove && candidates.length>1) {result.minimumPrice.ambiguousSource++;continue;}
    let value;
    try { value=minimumPriceFromLegacyObjects({profile:pp,overlay:po,sourcePayload:candidates[0]?.source_payload??null}); }
    catch (error) {
      if (!['EXACT_LEGACY_DECIMAL_SOURCE_REQUIRED','UNSUPPORTED_PRICE_JSON_TYPE','PLAIN_JSON_OBJECT_REQUIRED'].includes(error.message)) throw error;
      result.minimumPrice.invalidSelectedType++;continue;
    }
    if (value===null) result.minimumPrice.null++;
    else if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) result.minimumPrice.unsupportedDecimalText++;
    else {
      const [integer,fraction='']=value.replace(/^-/,'').split('.');
      // Diagnostic subcounts, not a currency/unit/sign decision or correction.
      if (value.startsWith('-')&&/[1-9]/.test(integer+fraction)) result.minimumPrice.negativeValues++;
      if (integer.length>16) result.minimumPrice.targetPrecisionOverflow++;
      if (/[1-9]/.test(fraction.slice(2))) result.minimumPrice.nonzeroExtraPrecision++;
      else result.minimumPrice.exactTwoDecimalOrLess++;
    }
  }
  return result;
}

/** Read only these five small reference files, after main-control adoption of the
 * full file verification. Rehash each consumed file; never query DB, mutate the
 * snapshot, return source IDs/values, or manufacture BASE_V2 CSV provenance. */
export async function readProductSourceCensus({directory,expectedManifestSha256,expectedUid,signal}) {
  need(typeof directory==='string' && isAbsolute(directory) && /^[a-f0-9]{64}$/.test(expectedManifestSha256)
    && Number.isSafeInteger(expectedUid) && expectedUid>=0,'PRODUCT_CENSUS_EXACT_INPUT_REQUIRED');
  signal?.throwIfAborted();
  const root=await lstat(directory);
  need(root.isDirectory()&&!root.isSymbolicLink()&&root.uid===expectedUid&&(root.mode&0o777)===0o700,'PRODUCT_CENSUS_PRIVATE_DIRECTORY_REFUSED');
  const manifestBytes=await readFile(join(directory,'SNAPSHOT.json'));
  need(manifestBytes.length<=262144 && hash(manifestBytes)===expectedManifestSha256,'PRODUCT_CENSUS_MANIFEST_PIN_REFUSED');
  let manifest;try {manifest=JSON.parse(manifestBytes.toString('utf8'));}catch {throw new Error('PRODUCT_CENSUS_MANIFEST_REFUSED');}
  need(manifest.status==='COMPLETE_SCOPED_PRIVATE_SNAPSHOT'&&manifest.files?.length===93,'PRODUCT_CENSUS_COMPLETE_SOURCE_REQUIRED');
  const input={};let consumedBytes=0;
  for (const [kind,table] of Object.entries(names)) {
    signal?.throwIfAborted();
    const entries=manifest.files.filter(row=>row.table===table);need(entries.length===1,'PRODUCT_CENSUS_TABLE_REQUIRED');
    const file=entries[0];need(file.filename===`${table}.ndjson`&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=134217728,'PRODUCT_CENSUS_REFERENCE_BYTE_LIMIT');
    consumedBytes+=file.bytes;need(consumedBytes<=134217728,'PRODUCT_CENSUS_REFERENCE_BYTE_LIMIT');
    const path=join(directory,file.filename),before=await lstat(path);
    need(before.isFile()&&!before.isSymbolicLink()&&before.uid===expectedUid&&(before.mode&0o777)===0o600&&before.size===file.bytes,'PRODUCT_CENSUS_PRIVATE_FILE_REFUSED');
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
    try {bytes=await handle.readFile();const after=await handle.stat();need(['ino','dev','size','mtimeMs','ctimeMs'].every(k=>before[k]===after[k]),'PRODUCT_CENSUS_FILE_CHANGED');}
    finally {await handle.close();}
    need(hash(bytes)===file.sha256,'PRODUCT_CENSUS_FILE_DIGEST_REFUSED');
    let text;try {text=new TextDecoder('utf8',{fatal:true}).decode(bytes);}catch {throw new Error('PRODUCT_CENSUS_UTF8_REFUSED');}
    need(text===''||text.endsWith('\n'),'PRODUCT_CENSUS_EOF_REFUSED');
    const lines=text===''?[]:text.slice(0,-1).split('\n');need(String(lines.length)===file.rows,'PRODUCT_CENSUS_ROW_COUNT_REFUSED');
    input[kind]=lines.map(line=>{
      need(Buffer.byteLength(line)<=1048576,'PRODUCT_CENSUS_REFERENCE_ROW_LIMIT');
      let row;try {row=JSON.parse(line);}catch {throw new Error('PRODUCT_CENSUS_ENVELOPE_REFUSED');}
      need(plain(row)&&typeof row.raw_json==='string'&&typeof row.source_key_json==='string','PRODUCT_CENSUS_ENVELOPE_REFUSED');
      return parseLegacyJsonText(row.raw_json);
    });
  }
  signal?.throwIfAborted();
  return {...inspectProductSourceRows(input),sourceManifestSha256:expectedManifestSha256,referenceFilesConsumed:5,referenceFileBytes:consumedBytes,databaseConnections:0};
}
