/** Replay only the accepted SKU decisions; reject changed historical identities. */
export function applyAcceptedSizeDecisions(matches, policy) {
 const decisions=new Map();
 for(const decision of policy.decisions){
  if(decisions.has(decision.sku))throw Error('DUPLICATE_ACCEPTED_SIZE_DECISION: '+decision.sku);
  decisions.set(decision.sku,decision);
 }
 const seen=new Set();
 const updated=matches.map(row=>{
  const decision=decisions.get(row.sku);if(!decision)return row;
  if(seen.has(row.sku))throw Error('DUPLICATE_ORIGINAL_SIZE_SKU: '+row.sku);
  seen.add(row.sku);
  for(const [field,value] of Object.entries(decision.source))if(row[field]!==value)throw Error('ACCEPTED_SIZE_SOURCE_CHANGED: '+row.sku+' '+field);
  return {...row,targetGroup:decision.targetGroup,targetSize:decision.target[3],target:[...decision.target],issue:null};
 });
 if(seen.size!==decisions.size)throw Error('ACCEPTED_SIZE_SKU_MISSING');
 return updated;
}
