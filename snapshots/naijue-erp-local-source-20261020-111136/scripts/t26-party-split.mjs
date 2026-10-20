import {createHash} from 'node:crypto';

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const refuse = (reason, differences = []) => {
  const error = new Error(reason);
  error.code = 'PARTY_SOURCE_CHANGED';
  error.differences = differences;
  throw error;
};

/** Prepare ordinary reference imports from an approved, archive-bound package and current API snapshot.
 * Never allocates IDs or writes source tables, balances, historical documents or exclusions.
 */
export function buildPartySplitBatches(input, snapshot) {
  if (input?.version !== 'T26-PARTY-SPLIT-v1' || !input.binding?.sourceBatch ||
      !/^[a-f0-9]{64}$/.test(input.binding.decisionSha256 ?? '') || !Array.isArray(input.parties)) refuse('缺少已确认来源批次');
  const approved = input.parties;
  const counts = {supplier:0, customer:0, excluded:0}, codes = new Set(), ids = new Set();
  for (const item of approved) {
    if (!item.code || !item.id || codes.has(item.code) || ids.has(item.id) || !['supplier','customer',null].includes(item.role)) refuse('分类输入重复或身份不明确', [{code:item.code,id:item.id}]);
    codes.add(item.code); ids.add(item.id); counts[item.role ?? 'excluded']++;
  }
  if (counts.supplier !== 222 || counts.customer !== 261 || counts.excluded !== 2) refuse('分类输入数量与本批裁决不一致', [counts]);
  const records = snapshot?.records?.filter(row => row.kind === 'parties');
  if (!Array.isArray(records)) refuse('须先回读本环境往来资料');
  const current = new Map(), sourceMap = new Map(), differences = [];
  for (const row of records) {
    const code = row.body?.code;
    if (code && current.has(code)) differences.push({code,reason:'DUPLICATE_CURRENT_CODE',ids:[current.get(code).id,row.id]});
    current.set(code,row);
    // Canonical API source facts survive runtime edits; local creates have no source records.
    if (Array.isArray(row.sourceFacts?.records) && row.sourceFacts.records.length) {
      sourceMap.set(code,row);
      if (!codes.has(code)) differences.push({code,id:row.id,reason:'ADDED_SOURCE_IDENTITY'});
    }
  }
  for (const item of approved) {
    const row = sourceMap.get(item.code);
    if (!row) differences.push({code:item.code,id:item.id,reason:'MISSING_CURRENT_IDENTITY'});
    else if (row.id !== item.id) differences.push({code:item.code,expectedId:item.id,actualId:row.id,reason:'IDENTITY_REBOUND'});
  }
  if (differences.length) refuse('本环境来源身份与已确认批次不一致，请先核对逐码差异', differences);
  const rows = approved.filter(item => item.role !== null).sort((a,b)=>a.code.localeCompare(b.code)).map(item => {
    const row = current.get(item.code);
    return {rowKey:'party:'+item.code,kind:'parties',payload:{id:row.id,expectedVersion:row.version,
      body:{...structuredClone(row.body),usage:[item.role],tags:[item.role]}}};
  });
  const bindingHash = fingerprint(input), batches = [];
  for (let offset=0; offset<rows.length; offset+=100) batches.push({
    batchId:'party-split-'+bindingHash.slice(0,32)+'-'+String(batches.length+1),
    source:{name:'PARTY-SPLIT-20261003-'+input.binding.sourceBatch.slice(0,16)+'.json',sha256:bindingHash},
    rows:rows.slice(offset,offset+100),
  });
  return {binding:input.binding,bindingHash,batches,excluded:approved.filter(item=>item.role===null).map(({id,code})=>({id,code})),
    nameExceptions:input.nameExceptions,counts};
}
