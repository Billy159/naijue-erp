/** Pure SQL draft generation from T45's immediately-before-window effective privilege observation. */
export const schemeColumns=Object.freeze(['id','name','barcode_type','rule_description','code_length','rule_version','status']);
const role='"erp_rewrite_runtime_20261022"',table='naijue_erp.barcode_scheme',helper='naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid)';
export function compileMinimumAclDelta(baseline){
 const bad=()=>{throw Error('SIX_SCHEME_FRESH_ACL_BASELINE_REQUIRED');};
 if(baseline?.database!=='erp_rewrite_20261022_r1'||baseline.databaseOid!=='1027659'||baseline.role!=='erp_rewrite_runtime_20261022'
  ||typeof baseline.observedAtUtc!=='string'||!Number.isFinite(Date.parse(baseline.observedAtUtc))
  ||schemeColumns.some(c=>typeof baseline.columnInsert?.[c]!=='boolean')||typeof baseline.idUpdate!=='boolean'||typeof baseline.helperExecute!=='boolean'
  ||baseline.tableMaintain!==false||baseline.tableUpdate!==false||baseline.tableDelete!==false||baseline.tableTruncate!==false)bad();
 const missing=schemeColumns.filter(c=>!baseline.columnInsert[c]),grant=[],revoke=[];
 if(missing.length){const list=missing.join(',');grant.push(`GRANT INSERT (${list}) ON ${table} TO ${role};`);revoke.unshift(`REVOKE INSERT (${list}) ON ${table} FROM ${role};`);}
 if(!baseline.idUpdate){grant.push(`GRANT UPDATE (id) ON ${table} TO ${role};`);revoke.unshift(`REVOKE UPDATE (id) ON ${table} FROM ${role};`);}
 if(!baseline.helperExecute){grant.push(`GRANT EXECUTE ON FUNCTION ${helper} TO ${role};`);revoke.unshift(`REVOKE EXECUTE ON FUNCTION ${helper} FROM ${role};`);}
 return {grantSql:grant.join('\n'),rollbackSql:revoke.join('\n'),addedInsertColumns:missing,addedIdUpdate:!baseline.idUpdate,addedHelperExecute:!baseline.helperExecute,
  scope:'New explicit privileges only; no preexisting SELECT/column grants/other principals removed. T45 original owner serial window only.'};
}
