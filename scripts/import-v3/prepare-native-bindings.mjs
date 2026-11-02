/** Private, connection-free preparation. New UUIDs are allocated once and frozen;
 * this package is a review candidate, never its own authorization or old approval. */
import { randomUUID, createHash } from 'node:crypto';
import { lstat, mkdir, chmod, readFile, writeFile, statfs } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { preflightV2 } from '../import-v2/run.mjs';
import { parseV2Csv } from '../../packages/application/src/import-v2.ts';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { stableImportId, validateCutoffImportCommand, CUTOFF_IMPORT_CHUNK_LIMIT, COMPLETE_SCOPE_DECISION } from '../../packages/application/src/inventory-cutoff-import.ts';
import { nativeStockContributorsManifestHash, nativeStockEffectiveGroupsManifestHash, validateNativeStockConservationPlan,
 validateNativeImportAccountingCommand, NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION, NATIVE_IMPORT_STOCK_CONSERVATION_VERSION } from '../../packages/application/src/native-import-record-accounting.ts';
import { buildHistoryTypedClosureExpected26, captureHistoryTypedClosureStageInput, historyClosureProjectionRow26 } from '../../packages/application/src/history-typed-closure.ts';
import { HISTORY_CLOSURE_SOURCE_GROUPS } from '../import-v2/authorized-history-closure-reader.mjs';
import { historySettlementRequestHash as capture } from '../../packages/application/src/import-v3-history-settlement.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { NATIVE_PRODUCT_NULLABLE_POLICY, NATIVE_PRODUCT_REFERENCE_DECISION_VERSION } from '../../packages/application/src/native-product-import.ts';

export const NATIVE_BINDING_PACKAGE_VERSION = 'NATIVE_BINDING_REVIEW_CANDIDATE_V1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const must = (ok, code) => { if (!ok) throw Object.assign(Error(code), { code }); };
const identityKey = (entity, sourceKey) => JSON.stringify([entity, sourceKey]);
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
export function createNativeIdentityRegistry(allocate = randomUUID, maximum = 600000) {
  const entries = new Map(), ids = new Set();
  return {
    add(entity, sourceKey, normalizedFields) {
      must(typeof entity === 'string' && typeof sourceKey === 'string' && sourceKey.length > 0 && sourceKey.length <= 65536, 'NATIVE_BINDING_IDENTITY');
      const key = identityKey(entity, sourceKey); must(!entries.has(key) && entries.size < maximum, 'NATIVE_BINDING_DUPLICATE_OR_LIMIT');
      const nativeId = allocate(); must(uuid(nativeId) && nativeId !== sourceKey && !ids.has(nativeId), 'NATIVE_BINDING_NEW_UUID');
      const entry = { entity, sourceKey, nativeId, normalizedHash: requestHash(normalizedFields) }; entries.set(key, entry); ids.add(nativeId); return entry;
    },
    get(entity, sourceKey) { const e = entries.get(identityKey(entity, sourceKey)); must(e, 'NATIVE_BINDING_REFERENCE_MISSING'); return structuredClone(e); },
    has: (entity, sourceKey) => entries.has(identityKey(entity, sourceKey)),
    values: () => entries.values(), get size() { return entries.size; }
  };
}
/** Project the actual T+ warehouse cells through the previously approved
 * warehouse-to-hall decision. The result is a candidate, not a native ID. */
export async function projectTPlusWarehouseHall26({warehouseBytes, warehouseSha256, decisionBytes, decisionSha256, bridgeBytes, bridgeSha256, singleHallBytes, singleHallSha256, events}) {
  must(Buffer.isBuffer(warehouseBytes) && hash(warehouseBytes) === warehouseSha256 && Buffer.isBuffer(decisionBytes)
    && hash(decisionBytes) === decisionSha256 && Buffer.isBuffer(bridgeBytes) && hash(bridgeBytes) === bridgeSha256, 'TPLUS_WAREHOUSE26_SOURCE_PIN');
  const decision = JSON.parse(new TextDecoder('utf8', {fatal:true}).decode(decisionBytes));
  const bridge = JSON.parse(new TextDecoder('utf8', {fatal:true}).decode(bridgeBytes));
  const supplemental = singleHallBytes === undefined ? [] : (() => {
    must(Buffer.isBuffer(singleHallBytes) && hash(singleHallBytes) === singleHallSha256, 'TPLUS_WAREHOUSE26_SOURCE_PIN');
    const doc=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(singleHallBytes));
    const mappings=doc?.['本次创建厅及销货版型补充']?.creatorHall?.warehouseHallMappings;
    must(Array.isArray(mappings),'TPLUS_WAREHOUSE26_HALL');return mappings;
  })();
  must(decision.approval && Array.isArray(decision.warehouses) && Array.isArray(decision.halls) && Array.isArray(bridge.records), 'TPLUS_WAREHOUSE26_APPROVAL');
  const warehouses = new Map(), halls = new Map(), originals = new Map();
  for (const w of decision.warehouses) { must(typeof w.code === 'string' && !warehouses.has(w.code), 'TPLUS_WAREHOUSE26_DUPLICATE'); warehouses.set(w.code,w); }
  for (const h of decision.halls) { must(typeof h.code === 'string' && !halls.has(h.code), 'TPLUS_WAREHOUSE26_DUPLICATE'); halls.set(h.code,h); }
  for (const w of bridge.records) { must(typeof w.code === 'string' && !originals.has(w.code), 'TPLUS_WAREHOUSE26_DUPLICATE'); originals.set(w.code,w); }
  let eof = false, physical = 0, last = 0, header = false; const rows = [], seen = new Set();
  for await (const event of events) {
    must(!eof && event?.sheet === '仓库', 'TPLUS_WAREHOUSE26_STREAM');
    if (event.event === 'eof') { must(event.rows === physical, 'TPLUS_WAREHOUSE26_EOF'); eof = true; continue; }
    must(event.event === 'row' && Number.isSafeInteger(event.excelRow) && event.excelRow > last && event.cells, 'TPLUS_WAREHOUSE26_STREAM');
    last = event.excelRow; physical++;
    if (event.excelRow === 1) { must(event.cells[0]?.raw === '仓库编码' && event.cells[1]?.raw === '仓库名称' && event.cells[8]?.raw === '停用', 'TPLUS_WAREHOUSE26_HEADER'); header = true; continue; }
    const code = event.cells[0], name = event.cells[1], disabled = event.cells[8];
    must(code?.kind === 'text' && typeof code.raw === 'string' && code.raw && !seen.has(code.raw)
      && name?.kind === 'text' && typeof name.raw === 'string' && name.raw && ['text','number'].includes(disabled?.kind)
      && ['0','1'].includes(disabled.raw), 'TPLUS_WAREHOUSE26_CELL');
    const approved = warehouses.get(code.raw), original = originals.get(code.raw);
    must(approved && original && approved.mappingNeedsSeparateConfirmation === false && Array.isArray(approved.proposedHallCodes)
      && Array.isArray(original.hallCodes), 'TPLUS_WAREHOUSE26_HALL');
    let hallCode;
    if (approved.proposedHallCodes.length === 1 && original.hallCodes.length === 1) hallCode=approved.proposedHallCodes[0];
    else {
      const chosen=supplemental.filter(r=>r.warehouseSourceKey===original.targetId);
      must(chosen.length===1, 'TPLUS_WAREHOUSE26_HALL');
      const matched=[...halls.values()].filter(h=>h.name===chosen[0].hallName && approved.proposedHallCodes.includes(h.code));
      must(matched.length===1, 'TPLUS_WAREHOUSE26_HALL');hallCode=matched[0].code;
    }
    must(halls.has(hallCode) && original.hallCodes.includes(hallCode) && approved.proposedHallCodes.includes(hallCode), 'TPLUS_WAREHOUSE26_HALL');
    must(original.isNew === true ? original.targetId === null && original.historicalId === null : original.isNew === false && uuid(original.targetId) && original.targetId === original.historicalId, 'TPLUS_WAREHOUSE26_IDENTITY');
    seen.add(code.raw); rows.push({sourceCode:code.raw, name:name.raw, disabled:disabled.raw, excelRow:event.excelRow,
      approvedHallCode:hallCode, identityKind:original.isNew ? 'NEW' : 'EXISTING', originalWarehouseId:original.isNew ? null : original.targetId});
  }
  must(header && eof && rows.length === warehouses.size && rows.length === originals.size, 'TPLUS_WAREHOUSE26_COVERAGE');
  return rows;
}
/** Read the pinned workbook itself through the existing XLSX reader. */
export async function readTPlusWarehouseHall26({warehousePath, warehouseSha256, decisionPath, decisionSha256, bridgePath, bridgeSha256, singleHallPath, singleHallSha256}) {
  const refs=[[warehousePath,warehouseSha256],[decisionPath,decisionSha256],[bridgePath,bridgeSha256],[singleHallPath,singleHallSha256]];
  const [warehouseBytes,decisionBytes,bridgeBytes,singleHallBytes]=await Promise.all(refs.map(([p,h])=>readPinnedStaffFile(p,h)));
  const child=spawn('python3',[fileURLToPath(new URL('../import-preflight/read-xlsx.py',import.meta.url)),'--stream',warehousePath,'仓库','0,1,8'],{stdio:['ignore','pipe','ignore']});
  const done=new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',resolve);});let completed=false;
  async function* events(){for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity})) yield JSON.parse(line);}
  try {
    const rows=await projectTPlusWarehouseHall26({warehouseBytes,warehouseSha256,decisionBytes,decisionSha256,bridgeBytes,bridgeSha256,singleHallBytes,singleHallSha256,events:events()});
    completed=true;return rows;
  } finally {
    if(!completed) child.kill('SIGTERM');
    must(await done===0,'TPLUS_WAREHOUSE26_STREAM');
    await Promise.all(refs.map(([p,h])=>readPinnedStaffFile(p,h)));
  }
}
/** Hall source facts and user-approved default warehouse, with unknown customer
 * reference kept open. This does not treat historical departments as halls. */
export async function projectTPlusHall26({hallBytes,hallSha256,decisionBytes,decisionSha256,events}) {
  must(Buffer.isBuffer(hallBytes)&&hash(hallBytes)===hallSha256&&Buffer.isBuffer(decisionBytes)&&hash(decisionBytes)===decisionSha256,'TPLUS_HALL26_SOURCE_PIN');
  const d=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(decisionBytes));
  must(d.approval&&Array.isArray(d.halls),'TPLUS_HALL26_APPROVAL');
  const approved=new Map();for(const h of d.halls){must(typeof h.code==='string'&&!approved.has(h.code),'TPLUS_HALL26_DUPLICATE');approved.set(h.code,h);}
  let eof=false,physical=0,last=0,header=false;const rows=[],seen=new Set();
  for await(const event of events){
    must(!eof&&event?.sheet==='营业厅','TPLUS_HALL26_STREAM');
    if(event.event==='eof'){must(event.rows===physical,'TPLUS_HALL26_EOF');eof=true;continue;}
    must(event.event==='row'&&Number.isSafeInteger(event.excelRow)&&event.excelRow>last&&event.cells,'TPLUS_HALL26_STREAM');last=event.excelRow;physical++;
    if(event.excelRow===1){must(event.cells[0]?.raw==='编码'&&event.cells[1]?.raw==='名称'&&event.cells[2]?.raw==='停用','TPLUS_HALL26_HEADER');header=true;continue;}
    const code=event.cells[0],name=event.cells[1],disabled=event.cells[2];
    must(code?.kind==='text'&&typeof code.raw==='string'&&code.raw&&!seen.has(code.raw)&&name?.kind==='text'&&typeof name.raw==='string'&&name.raw
      &&['text','number'].includes(disabled?.kind)&&['0','1'].includes(disabled.raw),'TPLUS_HALL26_CELL');
    const h=approved.get(code.raw);
    must(h&&h.source?.sha256===hallSha256&&h.source?.sheet==='营业厅'&&h.source?.row===event.excelRow&&h.name===name.raw
      &&typeof h.proposedEnabled==='boolean'&&h.defaultWarehouseRuleAuthorized===true&&h.defaultWarehouseAssignmentResolved===true
      &&typeof h.defaultWarehouseCode==='string'&&h.defaultWarehouseCode,'TPLUS_HALL26_APPROVAL');
    seen.add(code.raw);rows.push({sourceCode:code.raw,name:name.raw,sourceDisabled:disabled.raw,approvedEnabled:h.proposedEnabled,
      excelRow:event.excelRow,defaultWarehouseCode:h.defaultWarehouseCode,defaultCustomerSourceKey:null,defaultCustomerState:'UNKNOWN_NOT_INFERRED'});
  }
  must(header&&eof&&rows.length===approved.size,'TPLUS_HALL26_COVERAGE');return rows;
}
export async function readTPlusHall26({hallPath,hallSha256,decisionPath,decisionSha256}){
  const refs=[[hallPath,hallSha256],[decisionPath,decisionSha256]], [hallBytes,decisionBytes]=await Promise.all(refs.map(([p,h])=>readPinnedStaffFile(p,h)));
  const child=spawn('python3',[fileURLToPath(new URL('../import-preflight/read-xlsx.py',import.meta.url)),'--stream',hallPath,'营业厅','0,1,2'],{stdio:['ignore','pipe','ignore']});
  const done=new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',resolve);});let completed=false;
  async function* events(){for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity}))yield JSON.parse(line);}
  try{const rows=await projectTPlusHall26({hallBytes,hallSha256,decisionBytes,decisionSha256,events:events()});completed=true;return rows;}
  finally{if(!completed)child.kill('SIGTERM');must(await done===0,'TPLUS_HALL26_STREAM');await Promise.all(refs.map(([p,h])=>readPinnedStaffFile(p,h)));}
}
/** A single registry freezes separate hall and warehouse candidate IDs. */
export function prepareTPlusWarehouseHallCandidates26({halls,warehouses,registry=createNativeIdentityRegistry()}){
  must(Array.isArray(halls)&&Array.isArray(warehouses),'TPLUS_PARTY26_INPUT');
  const hallByCode=new Map(),warehouseByCode=new Map();
  for(const h of halls){must(typeof h.sourceCode==='string'&&!hallByCode.has(h.sourceCode),'TPLUS_PARTY26_DUPLICATE');hallByCode.set(h.sourceCode,h);}
  for(const w of warehouses){must(typeof w.sourceCode==='string'&&!warehouseByCode.has(w.sourceCode)&&hallByCode.has(w.approvedHallCode),'TPLUS_PARTY26_RELATION');warehouseByCode.set(w.sourceCode,w);}
  for(const h of halls)must(warehouseByCode.has(h.defaultWarehouseCode)&&warehouseByCode.get(h.defaultWarehouseCode).approvedHallCode===h.sourceCode,'TPLUS_PARTY26_DEFAULT_WAREHOUSE');
  for(const h of halls)registry.add('HALL',h.sourceCode,h);
  for(const w of warehouses)registry.add('WAREHOUSE',w.sourceCode,w);
  return {scope:'SOURCE_REFERENCE_CANDIDATES_ONLY',importAuthorized:false,
    halls:halls.map(h=>({...h,candidateNativeId:registry.get('HALL',h.sourceCode).nativeId,defaultWarehouseCandidateNativeId:registry.get('WAREHOUSE',h.defaultWarehouseCode).nativeId})),
    warehouses:warehouses.map(w=>({...w,candidateNativeId:registry.get('WAREHOUSE',w.sourceCode).nativeId,hallCandidateNativeId:registry.get('HALL',w.approvedHallCode).nativeId}))};
}
export async function writeTPlusWarehouseHallCandidates26({hallSource,warehouseSource,outputPath,binding}){
  must(typeof outputPath==='string'&&isAbsolute(outputPath)&&binding&&uuid(binding.batchId)&&typeof binding.fixedSourceNamespace==='string'
    &&typeof binding.cutoffAt==='string'&&binding.selectionSha256===null,'TPLUS_PARTY26_OUTPUT');
  const parent=dirname(resolve(outputPath)),repo=fileURLToPath(new URL('../../',import.meta.url)),parentStat=await lstat(parent);
  must(parentStat.isDirectory()&&!parentStat.isSymbolicLink()&&parent!==repo&&!parent.startsWith(repo+'/')&&!parent.split('/').includes('.git'),'TPLUS_PARTY26_OUTPUT');
  const halls=await readTPlusHall26(hallSource),warehouses=await readTPlusWarehouseHall26(warehouseSource);
  const candidate={version:'TPLUS_WAREHOUSE_HALL_CANDIDATES_V1',binding:structuredClone(binding),sources:{hall:structuredClone(hallSource),warehouse:structuredClone(warehouseSource)},
    ...prepareTPlusWarehouseHallCandidates26({halls,warehouses})};
  const bytes=Buffer.from(JSON.stringify(candidate)+'\n');await writeFile(outputPath,bytes,{flag:'wx',mode:0o600});
  return {path:outputPath,bytes:bytes.length,sha256:hash(bytes),halls:halls.length,warehouses:warehouses.length,importAuthorized:false};
}
/** Reconstruct default-customer references from pinned, previously approved
 * party inputs; the new customer source code is not a native customer ID. */
export async function prepareTPlusHallCustomerCandidates26({hallCandidateBytes,priorHallBytes,priorCustomerBytes,currentCustomerBytes,decisionBytes,relationsBytes,priorCaptureBytes,pins}){
  const sources={hallCandidate:hallCandidateBytes,priorHalls:priorHallBytes,priorCustomers:priorCustomerBytes,currentCustomers:currentCustomerBytes,decision:decisionBytes,relations:relationsBytes,priorCapture:priorCaptureBytes};
  for(const [key,bytes]of Object.entries(sources))must(Buffer.isBuffer(bytes)&&hash(bytes)===pins?.[key],'TPLUS_HALL_CUSTOMER26_PIN');
  const decode=b=>new TextDecoder('utf8',{fatal:true}).decode(b), candidate=JSON.parse(decode(hallCandidateBytes)),decision=JSON.parse(decode(decisionBytes)),relations=JSON.parse(decode(relationsBytes)),capture=JSON.parse(decode(priorCaptureBytes));
  must(candidate.scope==='SOURCE_REFERENCE_CANDIDATES_ONLY'&&candidate.importAuthorized===false&&candidate.binding?.selectionSha256===null&&Array.isArray(candidate.halls)
    &&decision.approval&&Array.isArray(decision.halls)&&Array.isArray(relations.customers)&&Array.isArray(capture.rows),'TPLUS_HALL_CUSTOMER26_INPUT');
  const parse=async(bytes,header)=>{const rows=[];let n=0;for await(const cells of parseV2Csv((async function*(){yield decode(bytes).replace(/^\uFEFF/,'');})())){
    if(!n++){must(cells.length===header.length&&cells.every((v,i)=>v===header[i]),'TPLUS_HALL_CUSTOMER26_HEADER');continue;}
    must(cells.length===header.length,'TPLUS_HALL_CUSTOMER26_ROW');rows.push(Object.fromEntries(header.map((k,i)=>[k,cells[i]])));}must(n>0,'TPLUS_HALL_CUSTOMER26_HEADER');return rows;};
  const halls=await parse(priorHallBytes,['来源编号','厅名称','默认客户来源编号','默认销货仓来源编号','状态']);
  const customers=await parse(priorCustomerBytes,['来源编号','原编码','名称','状态']);
  const byName=new Map(),priorCustomers=new Map(),currentCustomers=new Map(),approved=new Map(),confirmed=new Map(),captured=new Map();
  for(const h of halls){const a=byName.get(h['厅名称'])??[];a.push(h);byName.set(h['厅名称'],a);}
  for(const c of customers){must(!priorCustomers.has(c['来源编号']),'TPLUS_HALL_CUSTOMER26_DUPLICATE');priorCustomers.set(c['来源编号'],c);}
  for(const line of decode(currentCustomerBytes).split('\n')){if(!line)continue;const c=JSON.parse(line);if(c.entity!=='CUSTOMER')continue;
    must(typeof c.sourceId==='string'&&c.sourceId&&c.data?.['来源编号']===c.sourceId&&c.data?.['原编码']===c.sourceId&&!currentCustomers.has(c.sourceId),'TPLUS_HALL_CUSTOMER26_CUSTOMER');currentCustomers.set(c.sourceId,c);}
  for(const h of decision.halls){must(typeof h.code==='string'&&!approved.has(h.code),'TPLUS_HALL_CUSTOMER26_DUPLICATE');approved.set(h.code,h);}
  for(const r of relations.customers){const a=confirmed.get(r.department)??[];a.push(r);confirmed.set(r.department,a);}
  for(const row of capture.rows){const x=row?.input;if(x?.source?.entityType!=='HALL')continue;must(!captured.has(x.source.sourceKey),'TPLUS_HALL_CUSTOMER26_DUPLICATE');captured.set(x.source.sourceKey,x);}
  const rows=[],seen=new Set();
  for(const h of candidate.halls){const a=approved.get(h.sourceCode);must(a&&a.name===h.name&&a.userConfirmedThisProposal===true&&!seen.has(h.sourceCode),'TPLUS_HALL_CUSTOMER26_HALL');seen.add(h.sourceCode);
    const matches=byName.get(h.name)??[],row={hallSourceCode:h.sourceCode,hallCandidateNativeId:h.candidateNativeId,defaultWarehouseSourceCode:h.defaultWarehouseCode,
      defaultWarehouseCandidateNativeId:h.defaultWarehouseCandidateNativeId,customerSourceCode:null,priorHallSourceId:null,priorCustomerSourceId:null,relationStatus:'UNRESOLVED'};
    if(matches.length===1){const old=matches[0];row.priorHallSourceId=old['来源编号'];const oldId=old['默认客户来源编号'],customer=priorCustomers.get(oldId),r=confirmed.get(h.sourceCode)??[],source=captured.get(old['来源编号']);
      if(oldId&&customer&&currentCustomers.has(customer['原编码'])&&r.length===1&&r[0].customer?.code===customer['原编码']
        &&source?.bindings?.['默认客户来源编号']?.sourceKey===oldId){row.customerSourceCode=customer['原编码'];row.priorCustomerSourceId=oldId;row.relationStatus='EXACT_REFERENCE_CANDIDATE';}}
    rows.push(row);
  }
  must(rows.length===halls.length&&rows.length===approved.size,'TPLUS_HALL_CUSTOMER26_COVERAGE');
  return {version:'TPLUS_HALL_DEFAULT_CUSTOMER_REFERENCE_CANDIDATES_V1',scope:'SOURCE_RELATION_CANDIDATES_ONLY',binding:structuredClone(candidate.binding),
    sourcePins:structuredClone(pins),rows,resolvedCount:rows.filter(x=>x.relationStatus==='EXACT_REFERENCE_CANDIDATE').length,
    unresolvedCount:rows.filter(x=>x.relationStatus==='UNRESOLVED').length,executionAuthorized:false,nativeCustomerIdsClaimed:false};
}
export async function writeTPlusHallCustomerCandidates26({files,pins,outputPath}){
  const keys=['hallCandidate','priorHalls','priorCustomers','currentCustomers','decision','relations','priorCapture'];
  must(typeof outputPath==='string'&&isAbsolute(outputPath)&&files&&pins&&keys.every(k=>typeof files[k]==='string'&&isAbsolute(files[k])),'TPLUS_HALL_CUSTOMER26_OUTPUT');
  const parent=dirname(resolve(outputPath)),repo=fileURLToPath(new URL('../../',import.meta.url)),s=await lstat(parent);
  must(s.isDirectory()&&!s.isSymbolicLink()&&parent!==repo&&!parent.startsWith(repo+'/')&&!parent.split('/').includes('.git'),'TPLUS_HALL_CUSTOMER26_OUTPUT');
  const b=Object.fromEntries(await Promise.all(keys.map(async k=>[k,await readPinnedStaffFile(files[k],pins[k])])));
  const candidate=await prepareTPlusHallCustomerCandidates26({hallCandidateBytes:b.hallCandidate,priorHallBytes:b.priorHalls,priorCustomerBytes:b.priorCustomers,
    currentCustomerBytes:b.currentCustomers,decisionBytes:b.decision,relationsBytes:b.relations,priorCaptureBytes:b.priorCapture,pins});
  await Promise.all(keys.map(k=>readPinnedStaffFile(files[k],pins[k])));
  const bytes=Buffer.from(JSON.stringify({...candidate,sourceReferences:structuredClone(files)})+'\n');await writeFile(outputPath,bytes,{flag:'wx',mode:0o600});
  return {path:outputPath,bytes:bytes.length,sha256:hash(bytes),resolved:candidate.resolvedCount,unresolved:candidate.unresolvedCount,executionAuthorized:false};
}
export function sourceEvidence(raw, line, normalizedFields, binding, mappingEvidence) {
  must(raw?.data?.['来源编号'] === raw.sourceId && uuid(binding.batchId) && typeof raw.file === 'string' && typeof raw.sheet === 'string'
    && Number.isSafeInteger(raw.row) && raw.row > 0 && /^[a-f0-9]{64}$/.test(raw.sourceSha256), 'NATIVE_BINDING_SOURCE');
  const rowSha256 = hash(Buffer.from(line)), fields = {};
  if (mappingEvidence === undefined) {
    for (const [name, value] of Object.entries(raw.data)) fields[name] = { origin: 'ORIGINAL', reason: 'EXACT_ORIGINAL_SNAPSHOT_CELL', raw: value };
  } else {
    const proof = mappingEvidence?.proof, pin = mappingEvidence?.sha256;
    must(proof && proof.version === 'TPLUS_FIELD_MAPPING_EVIDENCE_V1' && proof.fields &&
      /^[a-f0-9]{64}$/.test(pin ?? '') && requestHash(proof) === pin &&
      Object.keys(proof.fields).length === Object.keys(raw.data).length &&
      Object.keys(raw.data).every(name => Object.hasOwn(proof.fields, name)), 'NATIVE_BINDING_MAPPING_EVIDENCE');
    let parsed; try { parsed = JSON.parse(line); } catch { must(false, 'NATIVE_BINDING_MAPPING_LINE'); }
    must(requestHash(parsed) === requestHash(raw), 'NATIVE_BINDING_MAPPING_LINE');
    for (const [name, value] of Object.entries(raw.data)) {
      const field = proof.fields[name], source = field?.source;
      must(field && source && typeof source.file === 'string' && source.file && typeof source.sheet === 'string' && source.sheet &&
        Number.isSafeInteger(source.row) && source.row > 0 && Number.isSafeInteger(source.column) && source.column >= 0 && source.column < 256 &&
        typeof source.header === 'string' && source.header && /^[a-f0-9]{64}$/.test(source.sha256 ?? '') && typeof source.value === 'string' &&
        typeof value === 'string', 'NATIVE_BINDING_MAPPING_SOURCE');
      const mapped = field.rule === 'COPY' ? source.value : field.rule === 'DISABLED_0_1_TO_STATUS' && source.value === '0' ? '正常' :
        field.rule === 'DISABLED_0_1_TO_STATUS' && source.value === '1' ? '停用' : null;
      must(mapped !== null && mapped === value, 'NATIVE_BINDING_MAPPING_VALUE');
      fields[name] = { origin: 'MIGRATION_DERIVED', reason: 'EXPLICIT_TPLUS_FIELD_MAPPING', raw: value, evidence_ref: pin };
    }
    const identity = proof.fields['来源编号']?.source;
    must(identity?.file === raw.file && identity.sheet === raw.sheet && identity.row === raw.row && identity.sha256 === raw.sourceSha256 &&
      identity.value === raw.sourceId, 'NATIVE_BINDING_MAPPING_IDENTITY');
  }
  fields.__source_row_hash = { origin: 'ORIGINAL', reason: 'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1', raw: rowSha256 };
  return { id: stableImportId('source-row', binding.fixedSourceNamespace, raw.entity, raw.sourceId), batchId: binding.batchId,
    entityType: raw.entity, sourceKey: raw.sourceId, fileRef: raw.file, sheet: raw.sheet, rowNo: String(raw.row),
    sourceFileSha256: raw.sourceSha256, rowSha256, rawFields: raw.data, normalizedFields,
    fieldProvenance: { schema_version: 1, fields } };
}
async function* lines(chunks) {
  let pending = '', count = 0;
  for await (const chunk of chunks) { let start = 0; for (;;) {
    const end = chunk.indexOf('\n', start); pending += chunk.slice(start, end < 0 ? undefined : end);
    must(Buffer.byteLength(pending) <= 4 * 1024 * 1024, 'NATIVE_BINDING_LINE_LIMIT'); if (end < 0) break;
    must(pending.length > 0 && ++count <= 1000000, 'NATIVE_BINDING_LINE_COUNT'); yield pending; pending = ''; start = end + 1;
  }}
  if (pending) { must(++count <= 1000000, 'NATIVE_BINDING_LINE_COUNT'); yield pending; }
}
/** Only candidate evidence in an already manifest-pinned stream. This binds every
 * mapping locator to an input hash; an independent reviewer still proves cells. */
export async function readTPlusFieldMappings26(chunks, inputHashes) {
  must(inputHashes && typeof inputHashes === 'object', 'NATIVE_BINDING_MAPPING_INPUT_HASHES');
  const mapped = new Map(), partyMappings = new Map();
  for await (const line of lines(chunks)) {
    let item; try { item=JSON.parse(line); } catch { must(false, 'NATIVE_BINDING_MAPPING_JSON'); }
    const partyKey=identityKey(item?.entity,item?.sourceId), isProduct=item?.entity==='PRODUCT';
    must(item && Object.keys(item).sort().join(',') === 'entity,proof,sha256,sourceId' && ['PRODUCT','CUSTOMER','SUPPLIER','STAFF'].includes(item.entity) &&
      typeof item.sourceId === 'string' && item.sourceId && !(isProduct?mapped.has(item.sourceId):partyMappings.has(partyKey)) &&
      /^[a-f0-9]{64}$/.test(item.sha256 ?? '') && item.proof?.version === 'TPLUS_FIELD_MAPPING_EVIDENCE_V1' &&
      item.proof.fields && requestHash(item.proof) === item.sha256, 'NATIVE_BINDING_MAPPING_ROW');
    for (const field of Object.values(item.proof.fields)) {
      const source=field?.source;
      must(source && typeof source.file === 'string' && inputHashes[source.file] === source.sha256 &&
        /^[a-f0-9]{64}$/.test(source.sha256 ?? ''), 'NATIVE_BINDING_MAPPING_INPUT_HASH');
    }
    if(item.entity==='STAFF'){
      const e=item.proof.identityEvidence,c=e?.currentSource,p=item.proof.currentContactSource,fields=item.proof.fields,prior=fields['来源编号']?.source,name=fields['姓名']?.source,contact=fields['联系方式']?.source;
      if(e?.kind==='APPROVED_PLAN_NO_PRIOR_HISTORY'){
        const cols=['来源编号','姓名','角色','所属厅来源编号','联系方式','任职状态'];
        must(Object.keys(e).sort().join(',')==='approvedSourceId,currentSourceBinding,decisionFile,decisionSha256,kind'&&e.approvedSourceId===item.sourceId&&e.currentSourceBinding==='NOT_ESTABLISHED'&&e.decisionSha256==='a6aab187d4f531715c60bcf32f114d48dcb7cf736576ac5df43463fa43599f2e'&&inputHashes[e.decisionFile]===e.decisionSha256&&
         prior?.value===item.sourceId&&prior.sheet==='08员工'&&prior.sha256==='ed4aad36329381d07f6dfc5c2e317fb20405ce880b7e07066febee344d97b4f9'&&Number.isSafeInteger(prior.row)&&prior.row>=2&&Object.keys(fields).length===cols.length&&
         cols.every((k,col)=>fields[k]?.rule==='COPY'&&fields[k]?.source?.file===prior.file&&fields[k]?.source?.sheet===prior.sheet&&fields[k]?.source?.row===prior.row&&fields[k]?.source?.sha256===prior.sha256&&fields[k]?.source?.column===col&&fields[k]?.source?.header===k)&&!Object.hasOwn(item.proof,'currentContactSource')&&!Object.hasOwn(item.proof,'contactSelection'),'NATIVE_BINDING_STAFF_PRIOR_ONLY');
      }else{
      const sameCurrent=x=>x&&x.file===c?.file&&x.sheet===c?.sheet&&x.row===c?.row&&x.sha256===c?.sha256;
      must(e&&typeof e.decisionFile==='string'&&e.decisionSha256==='a6aab187d4f531715c60bcf32f114d48dcb7cf736576ac5df43463fa43599f2e'&&inputHashes[e.decisionFile]===e.decisionSha256&&Number.isSafeInteger(e.decisionIndex)&&e.decisionIndex>=0&&e.approvedSourceId===item.sourceId&&typeof e.originalCode==='string'&&e.originalCode!==''&&
       c&&inputHashes[c.file]===c.sha256&&c.sheet==='员工'&&Number.isSafeInteger(c.row)&&c.row>2&&c.column===0&&c.header==='员工编码'&&c.value===e.originalCode&&
       prior?.value===item.sourceId&&prior.sheet==='08员工'&&prior.column===0&&prior.header==='来源编号'&&sameCurrent(name)&&name.column===1&&name.header==='员工名称'&&sameCurrent(p)&&p.column===23&&p.header==='手机'&&p.cell&&
       [['角色',2],['所属厅来源编号',3],['任职状态',5]].every(([k,col])=>fields[k]?.source?.file===prior.file&&fields[k]?.source?.sheet===prior.sheet&&fields[k]?.source?.row===prior.row&&fields[k]?.source?.sha256===prior.sha256&&fields[k]?.source?.column===col&&fields[k]?.source?.header===k), 'NATIVE_BINDING_STAFF_IDENTITY');
      if(Object.hasOwn(e,'historicalAliases')){
        const aliases=e.historicalAliases;must(Array.isArray(aliases)&&aliases.length>1&&e.originalEmployeeId===item.sourceId&&aliases.every(a=>a&&Object.keys(a).sort().join(',')==='currentRow,originalCode,originalEmployeeId'&&typeof a.originalCode==='string'&&a.originalCode!==''&&typeof a.originalEmployeeId==='string'&&a.originalEmployeeId!==''&&Number.isSafeInteger(a.currentRow)&&a.currentRow>2)&&new Set(aliases.map(a=>a.originalCode)).size===aliases.length&&new Set(aliases.map(a=>a.originalEmployeeId)).size===aliases.length&&aliases.filter(a=>a.originalEmployeeId===item.sourceId&&a.originalCode===e.originalCode&&a.currentRow===c.row).length===1,'NATIVE_BINDING_STAFF_ALIASES');
      }
      const blank=(p.cell.kind==='blank'&&p.cell.raw===null)||(p.cell.kind==='text'&&p.cell.raw==='');
      must(item.proof.contactSelection==='APPROVED_SUPPLEMENT_SOURCE_BLANK'?blank&&contact?.file===prior.file&&contact?.sheet===prior.sheet&&contact?.row===prior.row&&contact?.sha256===prior.sha256&&contact.column===4&&contact.header==='联系方式':
       item.proof.contactSelection==='CURRENT_SOURCE_EQUAL_APPROVED'&&!blank&&['text','number'].includes(p.cell.kind)&&sameCurrent(contact)&&contact.column===23&&contact.header==='手机'&&contact.value===p.cell.raw,'NATIVE_BINDING_STAFF_CONTACT');
      }
    }
    (isProduct?mapped:partyMappings).set(isProduct?item.sourceId:partyKey,{proof:item.proof,sha256:item.sha256});
    must(mapped.size+partyMappings.size <= 600000, 'NATIVE_BINDING_MAPPING_LIMIT');
  }
  Object.defineProperty(mapped,'partyMappings',{value:partyMappings});
  return mapped;
}
/** Verify candidate staff mapping against pinned file bytes and the actual
 * selected workbook stream. This prepares evidence; it is not an approval. */
export async function verifyTPlusStaffActualCells26(mappings,{approvedPlanBytes,identityDecisionBytes,inputHashes,files,events}){
  must(mappings instanceof Map&&mappings.partyMappings instanceof Map&&Buffer.isBuffer(approvedPlanBytes)&&Buffer.isBuffer(identityDecisionBytes)&&inputHashes?.[files?.approvedPlanPath]===hash(approvedPlanBytes)&&inputHashes?.[files?.identityDecisionPath]===hash(identityDecisionBytes),'NATIVE_BINDING_STAFF_SOURCE_PIN');
  const links=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(identityDecisionBytes)).links;must(Array.isArray(links),'NATIVE_BINDING_STAFF_SOURCE_IDENTITY');
  const headers=['来源编号','姓名','角色','所属厅来源编号','联系方式','任职状态'],plan=new Map();let header,row=0;
  for await(const cells of parseV2Csv((async function*(){yield new TextDecoder('utf-8',{fatal:true}).decode(approvedPlanBytes).replace(/^\uFEFF/,'');})())){row++;if(!header){must(cells.length===headers.length&&cells.every((v,i)=>v===headers[i]),'NATIVE_BINDING_STAFF_SOURCE_HEADER');header=cells;continue;}must(cells.length===headers.length,'NATIVE_BINDING_STAFF_SOURCE_ROW');plan.set(row,Object.fromEntries(headers.map((k,i)=>[k,cells[i]])));}
  must(header,'NATIVE_BINDING_STAFF_SOURCE_HEADER');const observed=new Map();let eof=false,physical=0,last=0,headerSeen=false;
  for await(const event of events){must(event?.sheet==='员工'&&!eof,'NATIVE_BINDING_STAFF_SOURCE_STREAM');if(event.event==='eof'){must(event.rows===physical,'NATIVE_BINDING_STAFF_SOURCE_EOF');eof=true;continue;}must(event.event==='row'&&Number.isSafeInteger(event.excelRow)&&event.excelRow>last&&event.cells,'NATIVE_BINDING_STAFF_SOURCE_ROW');last=event.excelRow;physical++;if(event.excelRow===2){must(event.cells?.[0]?.raw==='员工编码'&&event.cells?.[1]?.raw==='员工名称'&&event.cells?.[23]?.raw==='手机','NATIVE_BINDING_STAFF_SOURCE_HEADER');headerSeen=true;}if(event.excelRow>2)observed.set(event.excelRow,event.cells);}
  must(eof&&headerSeen,'NATIVE_BINDING_STAFF_SOURCE_EOF');let checked=0;
  for(const [key,mapping]of mappings.partyMappings){const [entity,sourceId]=JSON.parse(key);if(entity!=='STAFF')continue;const proof=mapping.proof,e=proof.identityEvidence,fields=proof.fields,loc=fields['来源编号'].source,actual=plan.get(loc.row);
    must(loc.file===files.approvedPlanPath&&e.decisionFile===files.identityDecisionPath&&actual&&actual['来源编号']===sourceId,'NATIVE_BINDING_STAFF_SOURCE_PLAN');
    for(const [name,field]of Object.entries(fields)){const s=field.source;if(s.file===files.approvedPlanPath)must(s.row===loc.row&&actual[name]===s.value,'NATIVE_BINDING_STAFF_SOURCE_PLAN');}
    if(e.kind==='APPROVED_PLAN_NO_PRIOR_HISTORY'){must(!links.some(x=>x.plannedCurrentEmployeeId===sourceId),'NATIVE_BINDING_STAFF_SOURCE_PRIOR_LINK');checked++;continue;}
    const link=links[e.decisionIndex],c=e.currentSource,cells=observed.get(c.row),phone=cells?.[23]??{kind:'blank',raw:null},declared=proof.currentContactSource.cell;
    must(c.file===files.currentEmployeeXlsxPath&&link&&link.originalCode===e.originalCode&&link.originalEmployeeId===sourceId&&link.plannedCurrentEmployeeId===sourceId&&cells?.[0]?.kind==='text'&&cells[0].raw===e.originalCode&&cells?.[1]?.kind==='text'&&cells[1].raw===fields['姓名'].source.value&&phone.kind===declared.kind&&phone.raw===declared.raw,'NATIVE_BINDING_STAFF_SOURCE_IDENTITY');
    if(proof.contactSelection==='CURRENT_SOURCE_EQUAL_APPROVED')must(String(phone.raw)===actual['联系方式'],'NATIVE_BINDING_STAFF_SOURCE_CONTACT');
    if(e.historicalAliases){const expected=links.filter(x=>x.plannedCurrentEmployeeId===sourceId);must(expected.length===e.historicalAliases.length&&e.historicalAliases.every(a=>expected.some(x=>x.originalCode===a.originalCode&&x.originalEmployeeId===a.originalEmployeeId)&&observed.get(a.currentRow)?.[0]?.raw===a.originalCode),'NATIVE_BINDING_STAFF_SOURCE_ALIASES');}
    checked++;
  }
  must(checked>0,'NATIVE_BINDING_STAFF_SOURCE_COVERAGE');return {checked};
}
async function* actualStaffWorkbookEvents(path){
  const child=spawn('python3',[fileURLToPath(new URL('../import-preflight/read-xlsx.py',import.meta.url)),'--stream',path,'员工','0,1,23'],{stdio:['ignore','pipe','ignore']});
  const done=new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',resolve);});let completed=false;
  try{for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity})){let event;try{event=JSON.parse(line);}catch{throw Error('NATIVE_BINDING_STAFF_SOURCE_STREAM');}yield event;}completed=true;}
  finally{if(!completed)child.kill('SIGTERM');const code=await done;must(code===0,'NATIVE_BINDING_STAFF_SOURCE_STREAM');}
}
async function readPinnedStaffFile(path,pin){
  must(typeof path==='string'&&isAbsolute(path)&&/^[a-f0-9]{64}$/.test(pin??''),'NATIVE_BINDING_STAFF_SOURCE_PIN');const before=await lstat(path);must(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=16777216,'NATIVE_BINDING_STAFF_SOURCE_FILE');const bytes=await readFile(path),after=await lstat(path);must(hash(bytes)===pin&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs,'NATIVE_BINDING_STAFF_SOURCE_PIN');return bytes;
}
async function* csv(strings, path) {
  let header; for await (const cells of parseV2Csv(strings(path))) {
    if (!header) { header = cells; must(new Set(header).size === header.length, 'NATIVE_BINDING_CSV_HEADER'); continue; }
    must(cells.length === header.length, 'NATIVE_BINDING_CSV_WIDTH'); yield Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  } must(header, 'NATIVE_BINDING_CSV_EMPTY');
}
export function reviewedPartyBinding(entity, row, registry, evidenceRef, reviewedAt, recordId = randomUUID) {
  const base = { id: registry.get(entity, row['来源编号']).nativeId, name: row[entity === 'HALL' ? '厅名称' : entity === 'WAREHOUSE' ? '仓库名称' : entity === 'STAFF' ? '姓名' : '名称'], version: 1 };
  const bindings = {}, enumMappings = {};
  const relation = (field, target) => row[field] === '' ? null : (bindings[field] = { sourceKey: row[field], nativeId: registry.get(target, row[field]).nativeId }).nativeId;
  const enabled = () => { must(['正常', '停用'].includes(row['状态']), 'NATIVE_BINDING_STATUS'); const native = row['状态'] === '正常'; enumMappings['状态'] = { raw: row['状态'], native, evidenceRef }; return native; };
  let nativeSnapshot, warehouseRecord;
  if (entity === 'HALL') nativeSnapshot = { ...base, default_customer_id: relation('默认客户来源编号', 'CUSTOMER'), default_sales_warehouse_id: relation('默认销货仓来源编号', 'WAREHOUSE'), enabled: enabled() };
  else if (entity === 'WAREHOUSE') { nativeSnapshot = { ...base, hall_id: relation('所属厅来源编号', 'HALL'), enabled: enabled() }; warehouseRecord = { id: recordId(), reviewedAt, decisionReason: 'REVIEW_CANDIDATE_EXACT_APPROVED_COMPLETE_WAREHOUSE_SCOPE' }; }
  else if (entity === 'STAFF') {
    const roles = { '管理员': 'ADMIN', '仓库': 'WAREHOUSE', '营业员': 'SALESPERSON' }, employment = { '在职': '在职', '离职': '离职' };
    must(Object.hasOwn(roles, row['角色']) && Object.hasOwn(employment, row['任职状态']), 'NATIVE_BINDING_STAFF_ENUM');
    enumMappings['角色'] = { raw: row['角色'], native: roles[row['角色']], evidenceRef }; enumMappings['任职状态'] = { raw: row['任职状态'], native: employment[row['任职状态']], evidenceRef };
    nativeSnapshot = { ...base, hall_id: relation('所属厅来源编号', 'HALL'), role: roles[row['角色']], contact: row['联系方式'] === '' ? null : row['联系方式'], employment_status: employment[row['任职状态']] };
  } else { must(['CUSTOMER', 'SUPPLIER'].includes(entity), 'NATIVE_BINDING_PARTY_KIND'); nativeSnapshot = { ...base, code: row['原编码'], enabled: enabled(), created_at: null, updated_at: null }; }
  return { nativeSnapshot, bindings, enumMappings, ...(warehouseRecord ? { warehouseRecord } : {}) };
}

/** One explicit source preparation invocation. complete preflight validates current bytes;
 * files are private new artifacts and require QB review plus C's OUTSIDE pin. */
export async function prepareNativeBindings(options) {
  const { base, v3Amendment, v3Approval, trustedApprovalSha256, approvedMoneyOverlaySha256, binding, outputParent, registrationId, tplusFieldMappingPath, staffSourceFiles } = options;
  must(tplusFieldMappingPath === undefined || tplusFieldMappingPath === 'evidence/tplus-field-mapping.jsonl', 'NATIVE_BINDING_MAPPING_PATH');
  must(binding?.version === 'C_NATIVE_IMPORT_PREPARATION_BINDING_V1' && uuid(binding.batchId) && typeof binding.fixedSourceNamespace === 'string'
    && (binding.cutoffAt === '2026-10-04T12:00:00+08:00' || (tplusFieldMappingPath !== undefined && ['2026-11-02T12:00:00+08:00','2026-11-02T04:00:00Z'].includes(binding.cutoffAt))) && /^[a-f0-9]{64}$/.test(binding.selectionSha256), 'NATIVE_BINDING_CONTROLLER_BINDING');
  const newTPlusBatch=binding.cutoffAt==='2026-11-02T12:00:00+08:00'||binding.cutoffAt==='2026-11-02T04:00:00Z';
  must(typeof registrationId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(registrationId) && isAbsolute(outputParent), 'NATIVE_BINDING_OUTPUT');
  const parent = resolve(outputParent), roots = [base, v3Amendment, fileURLToPath(new URL('../../', import.meta.url))].map(p => resolve(p));
  must(!roots.some(p => parent === p || parent.startsWith(p + '/')) && !parent.split('/').includes('.git'), 'NATIVE_BINDING_PRIVATE_OUTPUT');
  must((await lstat(parent)).isDirectory() && !(await lstat(parent)).isSymbolicLink(), 'NATIVE_BINDING_OUTPUT');
  const free = await statfs(parent); must(BigInt(free.bavail) * BigInt(free.bsize) >= 536870912n, 'NATIVE_BINDING_FREE_SPACE');
  const directory = join(parent, registrationId); await mkdir(directory, { mode: 0o700 }); await chmod(directory, 0o700);
  const files = [], registry = createNativeIdentityRegistry(), retained = new Map(), partySources = new Map(), productSources = new Map();
  const report = { version: NATIVE_BINDING_PACKAGE_VERSION, registrationId, status: 'PREPARING', reviewRequired: true, sql: false,
    batchId: binding.batchId, fixedSourceNamespace: binding.fixedSourceNamespace, cutoffAt: binding.cutoffAt, selectionSha256: binding.selectionSha256,
    preparedAtUtc: new Date().toISOString(), reviewStatus: 'PENDING_QB_AND_C_EXTERNAL_PIN',
    identityAllocation: 'New randomUUID once, frozen in registry. No old native identity claim or deterministic source-key UUID.', limits: { heapMiB: 1024, registryBytes: 134217728, originalLineBytes: 4194304, identityRows: 600000, productDecisionBytes: 4194304, otherFileBytes: 134217728 } };
  async function save(name, value, maximum = 134217728) { const bytes = Buffer.from(JSON.stringify(value) + '\n'); must(bytes.length <= maximum
    && files.reduce((n, f) => n + f.bytes, 0) + bytes.length <= 268435456, 'NATIVE_BINDING_FILE_LIMIT');
    await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 }); const d = { name, bytes: bytes.length, sha256: hash(bytes) }; files.push(d); return d; }
  try {
    let selection, baseManifestSha256, inputHashes, dictionaryInputs;
    const preflight = await preflightV2(base, { v3Amendment, v3Approval, approvedMoneyOverlaySha256, verifyCreatorHall: true,
      onVerifiedV3: async ({ strings, manifest, verified, report: checked }) => {
        must(verified.approvalSha256 === trustedApprovalSha256 && verified.selectionSha256 === binding.selectionSha256
          && checked.referenceTargetsValid && checked.wireRequiredFieldsValid, 'NATIVE_BINDING_SOURCE_PREFLIGHT');
        selection = verified.selection; baseManifestSha256 = selection.baseManifestSha256; inputHashes = manifest.sourceInputSha256;
        for (const table of IMPORT_V2_TABLES.filter(t => t.entity !== 'ISSUE')) {
          // BARCODE is replaced by v3, not appended. This initial registry excludes it
          // until its exact replacement file producer is attached (reported below).
          if (table.entity === 'BARCODE') continue;
          for await (const row of csv(strings, table.file)) {
            const key = table.entity === 'PAYMENT_ACCOUNT_HALL' ? JSON.stringify([row['账户来源编号'], row['厅来源编号']]) : row['来源编号'];
            registry.add(table.entity, key, row);
            if (['PRODUCT', 'HALL', 'WAREHOUSE', 'STAFF', 'CUSTOMER', 'SUPPLIER'].includes(table.entity)) retained.set(identityKey(table.entity, key), row);
          }
        }
        dictionaryInputs = {};
        for (const path of ['dictionaries/source-color-identities.json', 'dictionaries/source-fit-code-identities.json', 'dictionaries/current-size-groups.json']) {
          let s = ''; for await (const part of strings(path)) { s += part; must(Buffer.byteLength(s) <= 16777216, 'NATIVE_BINDING_METADATA_LIMIT'); }
          dictionaryInputs[path] = JSON.parse(s);
        }
        const tplusMappings = tplusFieldMappingPath === undefined ? null : await readTPlusFieldMappings26(strings(tplusFieldMappingPath), inputHashes);
        if(tplusMappings&&[...tplusMappings.partyMappings.keys()].some(key=>JSON.parse(key)[0]==='STAFF')){
          must(staffSourceFiles&&Object.keys(staffSourceFiles).sort().join(',')==='approvedPlanPath,currentEmployeeXlsxPath,identityDecisionPath'&&inputHashes[staffSourceFiles.approvedPlanPath]==='ed4aad36329381d07f6dfc5c2e317fb20405ce880b7e07066febee344d97b4f9'&&inputHashes[staffSourceFiles.identityDecisionPath]==='a6aab187d4f531715c60bcf32f114d48dcb7cf736576ac5df43463fa43599f2e'&&inputHashes[staffSourceFiles.currentEmployeeXlsxPath]==='879dc354156b28a8ffee808790936c04920d4be4bd41c8f599487d8b1ba8dafd','NATIVE_BINDING_STAFF_SOURCE_PIN');
          const [approvedPlanBytes,identityDecisionBytes]=await Promise.all([readPinnedStaffFile(staffSourceFiles.approvedPlanPath,inputHashes[staffSourceFiles.approvedPlanPath]),readPinnedStaffFile(staffSourceFiles.identityDecisionPath,inputHashes[staffSourceFiles.identityDecisionPath]),readPinnedStaffFile(staffSourceFiles.currentEmployeeXlsxPath,inputHashes[staffSourceFiles.currentEmployeeXlsxPath])]);
          await verifyTPlusStaffActualCells26(tplusMappings,{approvedPlanBytes,identityDecisionBytes,inputHashes,files:staffSourceFiles,events:actualStaffWorkbookEvents(staffSourceFiles.currentEmployeeXlsxPath)});
          await Promise.all([staffSourceFiles.approvedPlanPath,staffSourceFiles.identityDecisionPath,staffSourceFiles.currentEmployeeXlsxPath].map(p=>readPinnedStaffFile(p,inputHashes[p])));
        }
        const partyTypes=tplusMappings?new Set([...tplusMappings.partyMappings.keys()].map(key=>JSON.parse(key)[0])):new Set();
        let originalRows = 0, mappedProducts = 0, mappedParties = 0;
        for await (const line of lines(strings('snapshots/all-business-source-rows.jsonl'))) {
          const raw = JSON.parse(line); originalRows++; if (!['PRODUCT', 'HALL', 'WAREHOUSE', 'STAFF', 'CUSTOMER', 'SUPPLIER'].includes(raw.entity)) continue;
          must(inputHashes[raw.file] === raw.sourceSha256, 'NATIVE_BINDING_ORIGINAL_FILE_PIN');
          const key = identityKey(raw.entity, raw.sourceId), normalized = retained.get(key); must(normalized, 'NATIVE_BINDING_MISSING_ORIGINAL');
          const target = raw.entity === 'PRODUCT' ? productSources : partySources; must(!target.has(key), 'NATIVE_BINDING_DUPLICATE_ORIGINAL');
          const mapping = raw.entity === 'PRODUCT' && tplusMappings ? tplusMappings.get(raw.sourceId) : tplusMappings?.partyMappings.get(key);
          if (raw.entity === 'PRODUCT' && tplusMappings) { must(mapping, 'NATIVE_BINDING_MAPPING_MISSING'); mappedProducts++; }
          if (partyTypes.has(raw.entity) || (newTPlusBatch && ['CUSTOMER','SUPPLIER','STAFF'].includes(raw.entity))) { must(mapping, 'NATIVE_BINDING_MAPPING_MISSING'); mappedParties++; }
          target.set(key, sourceEvidence(raw, line, normalized, binding, mapping));
        }
        if (tplusMappings) must(mappedProducts === tplusMappings.size && mappedParties === tplusMappings.partyMappings.size, 'NATIVE_BINDING_MAPPING_COVERAGE');
        report.originalRowsScanned = originalRows;
        must(productSources.size + partySources.size === retained.size, 'NATIVE_BINDING_SOURCE_COVERAGE');
      }
    });
    const registryFile = await save('native-identity-registry.json', [...registry.values()]);
    const partyRows = [];
    for (const [key, source] of partySources) {
      const entity = source.entityType, selected = selection.importFiles.find(f => f.entity === entity);
      const selectedScope = { baseManifestSha256, selectionSha256: binding.selectionSha256, approvalSha256: trustedApprovalSha256, entity, source: 'BASE_V2', path: selected.path, csvSha256: selected.sha256 };
      partyRows.push({ batchId: binding.batchId, fixedSourceNamespace: binding.fixedSourceNamespace, selection: selectedScope, source,
        ...reviewedPartyBinding(entity, retained.get(key), registry, 'NATIVE_BINDING_REVIEW_CANDIDATE_V1:party-enum-contract', report.preparedAtUtc) });
    }
    await save('party-reference-candidates.json', partyRows);
    // Freeze reference dictionary inputs verbatim and explicit paths. Category hierarchy and
    // source-name ambiguities are not parsed into guessed records in this preparatory slice.
    const referenceInputs = { version: 'NATIVE_REFERENCE_INPUTS_REVIEW_V1', baseManifestSha256, selectionSha256: binding.selectionSha256,
      dictionaries: dictionaryInputs, products: [...productSources.values()].map(s => ({ sourceRowId: s.id, sourceKey: s.sourceKey,
        sourceEvidenceHash: requestHash(s), categoryPath: s.normalizedFields['分类路径'], sizeGroupName: s.normalizedFields['尺码组'],
        season: s.normalizedFields['季节'], supplierSourceKey: s.normalizedFields['供应商来源编号'] })) };
    const references = await save('reference-inputs-for-review.json', referenceInputs);
    await save('product-source-candidates.json', [...productSources.values()]);
    report.status = 'REVIEW_CANDIDATE_IDENTITIES_AND_PARTIES_PREPARED'; report.identities = registry.size; report.products = productSources.size; report.parties = partySources.size;
    report.files = files; report.preflight = { referenceTargetsValid: preflight.referenceTargetsValid, wireRequiredFieldsValid: preflight.wireRequiredFieldsValid };
    report.existingPricePolicy = 'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET'; report.existingNullablePolicy = NATIVE_PRODUCT_NULLABLE_POLICY;
    report.referenceDecisionVersion = NATIVE_PRODUCT_REFERENCE_DECISION_VERSION;
    report.remaining = ['Product category root-to-leaf, dictionary enablement/code/order and complete catalogue decisions require reviewed exact occurrences, not PRODUCT aggregation.',
      'v3 replacement barcode producer and immutable exact aliases/stock contributor producers.', 'QB independently checks actual source bytes and mapping rules; C freezes outside pins before any authorization.'];
    report.registryFile = registryFile.name; report.referenceInputs = references.name;
    await save('review-candidate-manifest.json', report, 4194304);
    return { directory, status: report.status, identities: registry.size, products: productSources.size, parties: partySources.size, manifestSha256: files.at(-1).sha256, sql: false, reviewRequired: true };
  } catch (error) {
    await writeFile(join(directory, 'FAILURE.json'), JSON.stringify({ version: NATIVE_BINDING_PACKAGE_VERSION, status: 'FAIL_PREPARATION', code: /^[A-Z0-9_]+$/.test(error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'NATIVE_BINDING_FAILED', sql: false, files }) + '\n', { flag: 'wx', mode: 0o600 });
    throw error;
  }
}
// Full preparation consumes already independently adopted DATA and original canonical
// reader results. It does not authenticate those inputs or call the old raw preflight.
const fullExact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join() === [...keys].sort().join();
const fullCount=v=>Number.isSafeInteger(v)&&v>=0&&v<2147483646;
const fullHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fullTargets=['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'];
const fullInteger=v=>typeof v==='string'&&/^(?:0|-?[1-9][0-9]{0,127})$/.test(v);
function noCredentials(value){
 if(!value||typeof value!=='object')return;
 for(const [key,item]of Object.entries(value)){must(!/password|credential|salt|token|login_name/i.test(key),'FULL_PAYLOAD_CREDENTIAL_FORBIDDEN');noCredentials(item);}
}
export function prepareFullPayloadData26(original){
 capture(original);const o=structuredClone(original);
 must(fullExact(o,['binding','core','groups','expectedCounts','expectedSourceEntityCounts','inventoryExpectedCounts','stock']),'FULL_PAYLOAD_DATA_SHAPE');
 const b=o.binding,c=o.core;
 must(fullExact(b,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&uuid(b.batchId)&&typeof b.fixedSourceNamespace==='string'
  &&/^[a-z][a-z0-9_.:-]*$/.test(b.fixedSourceNamespace)&&typeof b.cutoffAt==='string'&&Number.isFinite(Date.parse(b.cutoffAt))&&fullHash(b.selectionSha256),'FULL_PAYLOAD_DATA_BINDING');
 must(fullExact(c,['coreReceiptId','coreSourceDigest','coreMembers','staffProofs','coreMaintenanceBinding'])&&uuid(c.coreReceiptId)&&fullHash(c.coreSourceDigest)
  &&Array.isArray(c.coreMembers)&&c.coreMembers.length===115&&Array.isArray(c.staffProofs)&&c.staffProofs.length===49,'FULL_PAYLOAD_CORE_DATA');
 noCredentials(c);
 const members=new Map();
 for(const m of c.coreMembers){must(fullExact(m,['sourceRowId','entity','sourceKey','nativeId'])&&uuid(m.sourceRowId)&&uuid(m.nativeId)&&typeof m.sourceKey==='string'
  &&['HALL','WAREHOUSE','STAFF','CUSTOMER'].includes(m.entity)&&!members.has(m.sourceRowId),'FULL_PAYLOAD_CORE_MEMBER');members.set(m.sourceRowId,m);}
 for(const [kind,n]of [['HALL',22],['WAREHOUSE',22],['STAFF',49],['CUSTOMER',22]])must([...members.values()].filter(m=>m.entity===kind).length===n,'FULL_PAYLOAD_CORE_MEMBER');
 const proofs=new Set();for(const p of c.staffProofs){must(fullExact(p,['sourceRowId','bootstrapAccounts'])&&members.get(p.sourceRowId)?.entity==='STAFF'&&!proofs.has(p.sourceRowId)
  &&p.bootstrapAccounts!==null&&typeof p.bootstrapAccounts==='object','FULL_PAYLOAD_ORIGINAL_PROOF_REQUIRED');proofs.add(p.sourceRowId);}
 must(fullExact(c.coreMaintenanceBinding,['version','members'])&&c.coreMaintenanceBinding.version==='CORE_MAINTENANCE_BINDING_V1'
  &&Array.isArray(c.coreMaintenanceBinding.members)&&c.coreMaintenanceBinding.members.length===115,'FULL_PAYLOAD_MAINTENANCE');
 const maintained=new Set();for(const m of c.coreMaintenanceBinding.members){
  must(members.has(m.sourceRowId)&&!maintained.has(m.sourceRowId)&&requestHash(members.get(m.sourceRowId))===requestHash(Object.fromEntries(['sourceRowId','entity','sourceKey','nativeId'].map(k=>[k,m[k]]))),'FULL_PAYLOAD_MAINTENANCE');
  historyClosureProjectionRow26(m.entity.toLowerCase(),m.nativeSnapshot);maintained.add(m.sourceRowId);
 }
 const bySource=(a,b)=>a.sourceRowId<b.sourceRowId?-1:a.sourceRowId>b.sourceRowId?1:0;
 c.coreMembers.sort(bySource);c.staffProofs.sort(bySource);c.coreMaintenanceBinding.members.sort(bySource);
 must(Array.isArray(o.groups)&&o.groups.length===HISTORY_CLOSURE_SOURCE_GROUPS.length,'FULL_PAYLOAD_ALL11_REQUIRED');
 const groups=[],seen=new Set();
 for(const group of o.groups){
  must(fullExact(group,['group','artifacts'])&&HISTORY_CLOSURE_SOURCE_GROUPS.includes(group.group)&&!seen.has(group.group)
   &&Array.isArray(group.artifacts)&&group.artifacts.length>0,'FULL_PAYLOAD_ALL11_REQUIRED');seen.add(group.group);const roles=new Set();
  const artifacts=group.artifacts.map(ref=>{
   must(fullExact(ref,['logicalRole','bytes','sha256','rows','memberCoverage',...(Object.hasOwn(ref,'path')?['path']:[])])
    &&typeof ref.logicalRole==='string'&&ref.logicalRole.trim().length>0&&!roles.has(ref.logicalRole)&&fullCount(ref.bytes)&&fullHash(ref.sha256)&&fullCount(ref.rows)
    &&fullExact(ref.memberCoverage,['rows','sha256'])&&ref.memberCoverage.rows===ref.rows&&fullHash(ref.memberCoverage.sha256),'FULL_PAYLOAD_CONTENT_REF_REQUIRED');roles.add(ref.logicalRole);
   // A physical locator is transport only. All semantic roles and content/coverage pins remain.
   return {logicalRole:ref.logicalRole,bytes:ref.bytes,sha256:ref.sha256,rows:ref.rows,memberCoverage:ref.memberCoverage};
  }).sort((a,b)=>a.logicalRole<b.logicalRole?-1:a.logicalRole>b.logicalRole?1:0);
  groups.push({group:group.group,artifacts});
 }
 groups.sort((a,b)=>HISTORY_CLOSURE_SOURCE_GROUPS.indexOf(a.group)-HISTORY_CLOSURE_SOURCE_GROUPS.indexOf(b.group));
 const s=o.stock;
 must(fullExact(s,['effectiveStockCsvSha256','contributorLineageCsvSha256','contributors','effectiveGroups','warehouses','warehouseUnits'])
  &&Array.isArray(s.contributors)&&Array.isArray(s.effectiveGroups)&&s.effectiveGroups.length>0&&Array.isArray(s.warehouses)&&s.warehouses.length===53&&Array.isArray(s.warehouseUnits),'FULL_PAYLOAD_STOCK_REQUIRED');
 const byGroup=new Map(),ids=new Set(),nativeGroups=new Set(),warehouseTotals=new Map(),unitTotals=new Map();
 for(const g of s.effectiveGroups){
  must(fullExact(g,['canonicalStockSourceKey','warehouseSourceKey','canonicalSkuSourceKey','warehouseId','skuId','signedQuantity','sourceUnit','contributorCount','effectiveRowHash'])
   &&typeof g.canonicalStockSourceKey==='string'&&!byGroup.has(g.canonicalStockSourceKey)&&fullInteger(g.signedQuantity)&&BigInt(g.signedQuantity)!==0n
   &&uuid(g.warehouseId)&&uuid(g.skuId)&&typeof g.sourceUnit==='string'&&g.sourceUnit.length>0&&fullCount(g.contributorCount)&&g.contributorCount>0&&fullHash(g.effectiveRowHash)
   &&!nativeGroups.has(JSON.stringify([g.warehouseId,g.skuId])),'FULL_PAYLOAD_EFFECTIVE_GROUP');
  byGroup.set(g.canonicalStockSourceKey,{row:g,count:0,sum:0n});nativeGroups.add(JSON.stringify([g.warehouseId,g.skuId]));
  warehouseTotals.set(g.warehouseSourceKey,(warehouseTotals.get(g.warehouseSourceKey)??0n)+BigInt(g.signedQuantity));
 }
 for(const r of s.contributors){
  must(fullExact(r,['sourceRowId','sourceKey','sourceFileSha256','rowSha256','fileRef','sheet','rowNo','warehouseSourceKey','canonicalSkuSourceKey','oldSkuSourceId','canonicalStockSourceKey','warehouseId','skuId','signedQuantity','sourceUnit'])
   &&uuid(r.sourceRowId)&&!ids.has(r.sourceRowId)&&fullHash(r.sourceFileSha256)&&fullHash(r.rowSha256)&&fullInteger(r.signedQuantity),'FULL_PAYLOAD_CONTRIBUTOR');ids.add(r.sourceRowId);
  const g=byGroup.get(r.canonicalStockSourceKey);
  must(g&&['warehouseSourceKey','canonicalSkuSourceKey','warehouseId','skuId','sourceUnit'].every(k=>r[k]===g.row[k]),'FULL_PAYLOAD_CONTRIBUTOR_GROUP');g.count++;g.sum+=BigInt(r.signedQuantity);
  const key=JSON.stringify([r.warehouseSourceKey,r.sourceUnit]);unitTotals.set(key,(unitTotals.get(key)??0n)+BigInt(r.signedQuantity));
 }
 for(const {row,count,sum}of byGroup.values())must(count===row.contributorCount&&sum===BigInt(row.signedQuantity),'FULL_PAYLOAD_GROUP_CONSERVATION');
 const stockConservation={version:NATIVE_IMPORT_STOCK_CONSERVATION_VERSION,selectionSha256:b.selectionSha256,effectiveStockCsvSha256:s.effectiveStockCsvSha256,
  contributorLineageCsvSha256:s.contributorLineageCsvSha256,contributorCount:s.contributors.length,effectiveGroupCount:s.effectiveGroups.length,
  contributorsManifestHash:nativeStockContributorsManifestHash(s.contributors),effectiveGroupsManifestHash:nativeStockEffectiveGroupsManifestHash(s.effectiveGroups),
  warehouses:[...s.warehouses].sort((a,b)=>a.sourceKey<b.sourceKey?-1:a.sourceKey>b.sourceKey?1:0),warehouseUnits:[...s.warehouseUnits].sort((a,b)=>{const x=JSON.stringify([a.warehouseSourceKey,a.sourceUnit]),y=JSON.stringify([b.warehouseSourceKey,b.sourceUnit]);return x<y?-1:x>y?1:0;})};
 validateNativeStockConservationPlan(stockConservation);
 const warehouseKeys=new Set(stockConservation.warehouses.map(w=>w.sourceKey));
 must([...byGroup.values()].every(({row})=>stockConservation.warehouses.some(w=>w.sourceKey===row.warehouseSourceKey&&w.nativeId===row.warehouseId)),'FULL_PAYLOAD_WAREHOUSE_IDENTITY');
 for(const w of stockConservation.warehouses)must(BigInt(w.signedQuantity)===(warehouseTotals.get(w.sourceKey)??0n),'FULL_PAYLOAD_WAREHOUSE_CONSERVATION');
 must([...warehouseTotals.keys()].every(k=>warehouseKeys.has(k))&&stockConservation.warehouseUnits.length===unitTotals.size
  &&stockConservation.warehouseUnits.every(r=>unitTotals.has(JSON.stringify([r.warehouseSourceKey,r.sourceUnit]))&&BigInt(r.signedQuantity)===unitTotals.get(JSON.stringify([r.warehouseSourceKey,r.sourceUnit]))),'FULL_PAYLOAD_UNIT_CONSERVATION');
 must(fullExact(o.inventoryExpectedCounts,fullTargets)&&Object.values(o.inventoryExpectedCounts).every(fullCount)&&o.inventoryExpectedCounts.WAREHOUSE===53
  &&o.inventoryExpectedCounts.INVENTORY_LEDGER===s.effectiveGroups.length&&o.inventoryExpectedCounts.IMPORT_BATCH===1,'FULL_PAYLOAD_INVENTORY_COUNTS');
 const dataManifest={...b,core:c,groups,expectedCounts:o.expectedCounts,expectedSourceEntityCounts:o.expectedSourceEntityCounts,inventoryExpectedCounts:o.inventoryExpectedCounts,stock:stockConservation};
 const authorizedPayloadHash=requestHash(dataManifest);
 must(authorizedPayloadHash!==b.selectionSha256&&authorizedPayloadHash!==c.coreSourceDigest,'FULL_PAYLOAD_DISTINCT_SCOPE');
 return {dataManifest,authorizedPayloadHash,sourceClosurePins:groups.map(g=>({group:g.group,sha256:requestHash(g)})),stockConservation};
}

/** No pool/gate/authority/retry. Streams are the caller's actual original reader results;
 * verifiedCurrent is D1's locked continuation readback, not a passed/count flag. */
export async function prepareFullSourceBindings26({data,sourceRows,typedRows,documents,warehouses,skuMemberships,baselineItems,
 verifiedCurrent,actorAccountId,sourceManifestRef,requestKeys,chunkRows=CUTOFF_IMPORT_CHUNK_LIMIT,originalCommands,originalExpected}){
 const prepared=prepareFullPayloadData26(data),m=prepared.dataManifest,b={batchId:m.batchId,fixedSourceNamespace:m.fixedSourceNamespace,selectionSha256:m.selectionSha256};
 const current=verifiedCurrent;capture(current);
 must(current&&current.actorAccountId===actorAccountId&&uuid(actorAccountId)&&current.fixedSourceNamespace===b.fixedSourceNamespace&&current.selectionSha256===b.selectionSha256
  &&Array.isArray(current.coreClaims)&&current.coreClaims.length===22&&Array.isArray(current.claims)&&Array.isArray(current.committedOperations)
  &&Array.isArray(current.coreWarehouses)&&current.coreWarehouses.length===22
  &&current.coreClaims.every(c=>c.batchId===b.batchId&&c.operationId===m.core.coreReceiptId&&c.checkpointSequence===1&&c.targetType==='WAREHOUSE'),'FULL_PREP_VERIFIED_CURRENT_REQUIRED');
 must(current.checkpoint&&fullCount(current.checkpoint.sequence)&&fullCount(current.checkpoint.cursor)&&current.claims.length===current.checkpoint.cursor
  &&fullTargets.every(t=>current.claims.filter(c=>c.targetType===t).length===current.checkpoint.counts[t])
  &&new Set(current.claims.map(c=>c.importRecordId)).size===current.claims.length
  &&current.coreClaims.every(c=>current.claims.some(r=>requestHash(r)===requestHash(c))),'FULL_PREP_VERIFIED_CURRENT_REQUIRED');
 must(Array.isArray(warehouses)&&warehouses.length===53&&Array.isArray(skuMemberships)&&skuMemberships.length===m.inventoryExpectedCounts.SKU
  &&Array.isArray(baselineItems)&&baselineItems.length===m.inventoryExpectedCounts.INVENTORY_LEDGER,'FULL_PREP_ALL_MAIN_ITEMS_REQUIRED');
 const allItems=[...warehouses,...skuMemberships,...baselineItems],itemKeys=new Set(),recordIds=new Set();
 const effectiveGroupsByKey=new Map(data.stock.effectiveGroups.map(group=>[group.canonicalStockSourceKey,group]));
 for(const item of allItems){
  const c={action:'IMPORT_CHUNK',actorAccountId,batchId:b.batchId,requestKey:'preparation-item-validation',expectedSequence:0,expectedCursor:0,accountingVersion:NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,items:[item]};
  validateNativeImportAccountingCommand(c);
  const key=JSON.stringify([item.sourceEntityType,item.sourceKey]);must(!itemKeys.has(key),'FULL_PREP_DUPLICATE_ITEM');itemKeys.add(key);
  if(item.targetType!=='INVENTORY_LEDGER'){must(!recordIds.has(item.nativeRecord.id),'FULL_PREP_DUPLICATE_ITEM');recordIds.add(item.nativeRecord.id);}
  else {const group=effectiveGroupsByKey.get(item.sourceKey);must(group&&group.warehouseId===item.warehouseId&&group.skuId===item.skuId&&BigInt(group.signedQuantity)===item.quantity,'FULL_PREP_BASELINE_CHANGED');}
 }
 must(warehouses.every(w=>w.targetType==='WAREHOUSE')&&skuMemberships.every(w=>w.targetType==='SKU')&&baselineItems.every(w=>w.targetType==='INVENTORY_LEDGER')
  &&new Set(warehouses.map(w=>w.targetId)).size===53&&new Set(skuMemberships.map(w=>w.targetId)).size===skuMemberships.length
  &&warehouses.every(w=>m.stock.warehouses.some(r=>r.nativeId===w.targetId&&r.sourceKey===w.sourceKey)),'FULL_PREP_MAIN_IDENTITY');
 must(current.coreWarehouses.every(w=>warehouses.some(item=>requestHash(item)===requestHash(w))),'FULL_PREP_CORE_WAREHOUSES_CHANGED');
 const expectedScope={...b,authorizedPayloadHash:prepared.authorizedPayloadHash,expectedCounts:m.expectedCounts,expectedSourceEntityCounts:m.expectedSourceEntityCounts};
 let expected;
 if(originalCommands){expected=captureHistoryTypedClosureStageInput(originalExpected);must(expected.batchId===b.batchId&&expected.fixedSourceNamespace===b.fixedSourceNamespace
  &&expected.plan.authorizedPayloadHash===prepared.authorizedPayloadHash&&requestHash(expected.plan.expectedCounts)===requestHash(m.expectedCounts)
  &&requestHash(expected.plan.sourceEntityCounts)===requestHash(m.expectedSourceEntityCounts),'FULL_PREP_ORIGINAL_EXPECTED_CHANGED');}
 else{
  const sourceMembers=new Map(m.core.coreMembers.map(r=>[r.sourceRowId,r])),proofs=new Map(m.core.staffProofs.map(r=>[r.sourceRowId,r.bootstrapAccounts]));
  const nativeMembers=new Map(m.core.coreMaintenanceBinding.members.map(r=>[JSON.stringify([r.entity.toLowerCase(),r.nativeId]),r.nativeSnapshot]));
  const seenSource=new Set(),seenNative=new Set();
  async function* originalSources(){for await(const row of sourceRows){const p=row.projection,member=sourceMembers.get(p?.id);
    if(member){must(row.relation==='import_source_row'&&p.batch_id===b.batchId&&p.entity_type===member.entity&&p.source_key===member.sourceKey&&!seenSource.has(p.id),'FULL_PREP_CORE_SOURCE_CHANGED');seenSource.add(p.id);
      if(proofs.has(p.id))must(requestHash(p.field_provenance?.fields?.bootstrap_accounts)===requestHash(proofs.get(p.id)),'FULL_PREP_ORIGINAL_PROOF_CHANGED');}
    yield row;
   }must(seenSource.size===115,'FULL_PREP_CORE_SOURCE_MISSING');}
  async function* currentNatives(){for await(const row of typedRows){const key=JSON.stringify([row.relation,row.projection?.id]),native=nativeMembers.get(key);
    if(native){must(!seenNative.has(key)&&requestHash(native)===requestHash(row.projection),'FULL_PREP_CORE_NATIVE_CHANGED');seenNative.add(key);}yield row;
   }must(seenNative.size===115,'FULL_PREP_CORE_NATIVE_MISSING');}
  expected=await buildHistoryTypedClosureExpected26({...expectedScope,documents,sourceRows:originalSources(),typedRows:currentNatives()});
 }
 let commands;
 if(originalCommands){capture(originalCommands);commands=structuredClone(originalCommands);must(fullExact(commands,['BIND','ACCOUNT','PUBLISH'])&&Array.isArray(commands.ACCOUNT),'FULL_PREP_ORIGINAL_COMMANDS_REQUIRED');}
 else{
  const cp=current.checkpoint;must(current.fullBinding===null&&current.status==='STAGED'&&cp.cursor===22&&current.claims.length===22
   &&requestHash(cp.counts)===requestHash({WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0})&&Object.keys(cp.expected).length===0
   &&fullCount(cp.sequence)&&cp.sequence>=1,'FULL_PREP_ORIGINAL_COMMANDS_REQUIRED');
  must(fullCount(chunkRows)&&chunkRows>0&&chunkRows<=CUTOFF_IMPORT_CHUNK_LIMIT,'FULL_PREP_CHUNK_BOUND');
  const coreRecords=new Set(current.coreClaims.map(c=>c.importRecordId));
  must(warehouses.filter(w=>coreRecords.has(w.nativeRecord.id)&&current.coreClaims.some(c=>c.targetId===w.targetId&&c.importRecordId===w.nativeRecord.id)).length===22,'FULL_PREP_CORE_WAREHOUSES_CHANGED');
  const remaining=[...warehouses.filter(w=>!coreRecords.has(w.nativeRecord.id)),...skuMemberships,...baselineItems];
  must(requestKeys&&typeof requestKeys.bind==='string'&&typeof requestKeys.publish==='string'&&Array.isArray(requestKeys.account)
   &&requestKeys.account.length===Math.ceil(remaining.length/chunkRows),'FULL_PREP_FROZEN_KEYS_REQUIRED');
  let sequence=cp.sequence,cursor=cp.cursor;
  const BIND={action:'IMPORT_BIND_FULL_SOURCE',actorAccountId,batchId:b.batchId,requestKey:requestKeys.bind,expectedSequence:sequence,expectedCursor:cursor,
   fullBinding:{authorizedPayloadHash:prepared.authorizedPayloadHash,historyExpectedCounts:m.expectedCounts,inventoryExpectedCounts:m.inventoryExpectedCounts,sourceClosurePins:prepared.sourceClosurePins,
    coreReceiptId:m.core.coreReceiptId,coreSourceDigest:m.core.coreSourceDigest,coreMaintenanceBinding:m.core.coreMaintenanceBinding}};sequence++;
  const ACCOUNT=[];for(let i=0;i<remaining.length;i+=chunkRows){const items=remaining.slice(i,i+chunkRows);ACCOUNT.push({action:'IMPORT_CHUNK',actorAccountId,batchId:b.batchId,requestKey:requestKeys.account[ACCOUNT.length],expectedSequence:sequence,expectedCursor:cursor,accountingVersion:NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,items});sequence++;cursor+=items.length;}
  const PUBLISH={action:'IMPORT_PUBLISH',actorAccountId,batchId:b.batchId,requestKey:requestKeys.publish,expectedSequence:sequence,expectedCursor:cursor,accountingVersion:NATIVE_IMPORT_RECORD_ACCOUNTING_VERSION,
   approval:{completeScope:true,absentMeansZero:true,allFilesVerified:true,finalDeltaVerified:true,noUnresolvedExceptions:true,sourceHash:b.selectionSha256,sourceManifestRef},stockConservation:prepared.stockConservation,historyClosure:expected.plan};
  commands={BIND,ACCOUNT,PUBLISH};
 }
 const itemDigests=new Map(allItems.map(item=>[JSON.stringify([item.sourceEntityType,item.sourceKey]),requestHash(item)]));
 const ordered=[commands.BIND,...commands.ACCOUNT,commands.PUBLISH],keys=new Set(),represented=new Set(),coreRecords=new Set(current.coreClaims.map(c=>c.importRecordId));
 let seq=commands.BIND.expectedSequence,cursor=22;
 for(const command of ordered){
  validateCutoffImportCommand(command);if(command.action!=='IMPORT_BIND_FULL_SOURCE')validateNativeImportAccountingCommand(command);
  must(command.actorAccountId===actorAccountId&&command.batchId===b.batchId&&typeof command.requestKey==='string'&&command.requestKey.length>0&&!keys.has(command.requestKey)
   &&command.expectedSequence===seq&&command.expectedCursor===cursor,'FULL_PREP_COMMAND_CHAIN');keys.add(command.requestKey);seq++;
  if(command.action==='IMPORT_CHUNK')for(const item of command.items){const key=JSON.stringify([item.sourceEntityType,item.sourceKey]);must(!represented.has(key)&&itemDigests.get(key)===requestHash(item)
    &&(item.targetType==='INVENTORY_LEDGER'||!coreRecords.has(item.nativeRecord.id)),'FULL_PREP_COMMAND_ITEM_CHANGED');represented.add(key);cursor++;}
 }
 must(commands.BIND.action==='IMPORT_BIND_FULL_SOURCE'&&commands.ACCOUNT.every(c=>c.action==='IMPORT_CHUNK')&&commands.PUBLISH.action==='IMPORT_PUBLISH'
  &&requestHash(commands.BIND.fullBinding)===requestHash({authorizedPayloadHash:prepared.authorizedPayloadHash,historyExpectedCounts:m.expectedCounts,inventoryExpectedCounts:m.inventoryExpectedCounts,sourceClosurePins:prepared.sourceClosurePins,coreReceiptId:m.core.coreReceiptId,coreSourceDigest:m.core.coreSourceDigest,coreMaintenanceBinding:m.core.coreMaintenanceBinding})
  &&represented.size===allItems.length-22&&cursor===Object.values(m.inventoryExpectedCounts).reduce((a,n)=>a+n,0)-1
  &&requestHash(commands.PUBLISH.historyClosure)===requestHash(expected.plan)&&requestHash(commands.PUBLISH.stockConservation)===requestHash(prepared.stockConservation)
  &&commands.PUBLISH.approval.sourceManifestRef===sourceManifestRef,'FULL_PREP_COMPLETE_COMMAND_SCOPE');
 const prefix=current.committedOperations.filter(r=>['IMPORT_BIND_FULL_SOURCE','IMPORT_CHUNK','IMPORT_PUBLISH'].includes(r.action));
 must(prefix.length<=ordered.length,'FULL_PREP_COMMITTED_PREFIX_CONFLICT');
 for(let i=0;i<prefix.length;i++){const r=prefix[i],c=ordered[i];must(r.requestKey===c.requestKey&&r.requestHash===requestHash(c)&&r.action===c.action
  &&r.operationId===stableImportId('operation',actorAccountId,c.requestKey)&&r.beforeCheckpoint.sequence===c.expectedSequence&&r.beforeCheckpoint.cursor===c.expectedCursor,'FULL_PREP_COMMITTED_PREFIX_CONFLICT');}
 if(prefix.length)must(requestHash(prefix.at(-1).checkpoint)===requestHash(current.checkpoint)&&current.fullBinding?.authorizedPayloadHash===prepared.authorizedPayloadHash,'FULL_PREP_COMMITTED_PREFIX_CONFLICT');
 else must(current.checkpoint.sequence===commands.BIND.expectedSequence&&current.checkpoint.cursor===commands.BIND.expectedCursor&&current.fullBinding===null,'FULL_PREP_COMMITTED_PREFIX_CONFLICT');
 must((current.status==='IMPORTED')===(prefix.length===ordered.length),'FULL_PREP_PUBLICATION_OUTCOME_CONFLICT');
 return {...prepared,expected,commands,remainingCommands:ordered.slice(prefix.length),reusedOriginalCommands:!!originalCommands,
  executionAuthorizationIssued:false,executionReady:false};
}

/** First preparation only. Resumes reuse the original command files byte-for-byte. */
export async function writeFullSourceBindings26({outputParent,registrationId,prepared}){
 must(isAbsolute(outputParent)&&typeof registrationId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(registrationId)&&prepared.executionAuthorizationIssued===false
  &&prepared.executionReady===false&&!prepared.reusedOriginalCommands,'FULL_PREP_PRIVATE_OUTPUT');
 const parent=resolve(outputParent),root=fileURLToPath(new URL('../../',import.meta.url));
 must(parent!==resolve(root)&&!parent.startsWith(resolve(root)+'/')&&(await lstat(parent)).isDirectory(),'FULL_PREP_PRIVATE_OUTPUT');
 const directory=join(parent,registrationId);await mkdir(directory,{mode:0o700});const files=[];
 const save=async(logicalRole,name,value)=>{const bytes=Buffer.from(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?{__bigint:v.toString()}:v,2)+'\n');
  if(['BIND','ACCOUNT','PUBLISH'].includes(logicalRole))must(bytes.length<=4194304,'FULL_PREP_ORIGINAL_COMMAND_FILE_LIMIT');
  await writeFile(join(directory,name),bytes,{flag:'wx',mode:0o600});files.push({logicalRole,path:join(directory,name),bytes:bytes.length,sha256:hash(bytes)});};
 await save('FULL_DATA','DATA.json',prepared.dataManifest);await save('EXPECTED','EXPECTED.json',prepared.expected);
 await save('BIND','BIND.json',prepared.commands.BIND);
 for(let i=0;i<prepared.commands.ACCOUNT.length;i++)await save('ACCOUNT',`ACCOUNT-${String(i+1).padStart(6,'0')}.json`,prepared.commands.ACCOUNT[i]);
 await save('PUBLISH','PUBLISH.json',prepared.commands.PUBLISH);
 const manifest={authorizedPayloadHash:prepared.authorizedPayloadHash,executionAuthorizationIssued:false,executionReady:false,files};
 await writeFile(join(directory,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});return {directory,...manifest};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  must(process.argv.length === 3 && isAbsolute(process.argv[2]), 'NATIVE_BINDING_USAGE');
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  prepareNativeBindings(config).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(JSON.stringify({ status: 'FAIL_PREPARATION', code: error.code ?? 'NATIVE_BINDING_FAILED' }) + '\n'); process.exitCode = 1; });
}
