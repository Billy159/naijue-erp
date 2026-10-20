import {formatScaled,parseScaled} from '../transactions/decimal.js';
import {HistoryError,historyDigest,historyKey,validateHistoryBoundary,type HistoryBoundary,type HistoryKey} from './history-plan.js';

export interface HistoryComparisonRow extends HistoryKey {readonly quantity:string|null;readonly sourceRowReferences:readonly unknown[]}
export interface HistoryComparisonInput {readonly cutoff:HistoryBoundary;readonly rows:readonly HistoryComparisonRow[];readonly complete:boolean}

/** Comparison only. This function has no database/session or import callback and cannot fill a balance. */
export function compareHistoryInventory(calculated:HistoryComparisonInput,report:HistoryComparisonInput,imported:HistoryComparisonInput):Record<string,unknown> {
  for(const input of [calculated,report,imported])validateHistoryBoundary(input.cutoff);
  if(historyDigest(calculated.cutoff)!==historyDigest(report.cutoff) || historyDigest(calculated.cutoff)!==historyDigest(imported.cutoff))throw new HistoryError('RECONCILIATION_CUTOFF_MISMATCH');
  const maps=[calculated,report,imported].map(input=>{
    const map=new Map<string,HistoryComparisonRow>();
    for(const row of input.rows){if(!row.measurementUnit || !row.originalSkuId || !row.warehouseId || map.has(historyKey(row)))throw new HistoryError('RECONCILIATION_IDENTITY_CONFLICT',row);map.set(historyKey(row),row);}
    return map;
  });
  const differences=[];
  for(const key of new Set(maps.flatMap(m=>[...m.keys()]))){
    const rows=maps.map(m=>m.get(key)), missing=rows.flatMap((r,i)=>r===undefined?[['CALCULATED','REPORT','IMPORTED'][i]]:[]);
    const blank=rows.flatMap((r,i)=>r?.quantity===null?[['CALCULATED','REPORT','IMPORTED'][i]]:[]);
    const numbers=rows.map(r=>r && r.quantity!==null ? parseScaled(r.quantity,4,false):null);
    if(missing.length || blank.length || numbers[0]!==numbers[1] || numbers[0]!==numbers[2])differences.push({
      key:rows.find(r=>r!==undefined),calculatedQuantity:rows[0]?.quantity??null,reportedQuantity:rows[1]?.quantity??null,importedQuantity:rows[2]?.quantity??null,
      reportDifference:numbers[0]!==null&&numbers[1]!==null?formatScaled(numbers[0]!-numbers[1]!,4):null,
      importDifference:numbers[0]!==null&&numbers[2]!==null?formatScaled(numbers[0]!-numbers[2]!,4):null,
      missing,blank,sourceRowReferences:rows.flatMap(r=>r?.sourceRowReferences??[]),
      suspectedCauses:['missing-document','duplicate-contribution','original-identity-mapping','state-version','cutoff','opening-period-or-gap'],resolution:'UNRESOLVED_NO_BACKFILL'});
  }
  return {matches:calculated.complete&&report.complete&&imported.complete&&differences.length===0,cutoff:calculated.cutoff,differences,
    coverageComplete:calculated.complete&&report.complete&&imported.complete,productionAcceptance:false};
}
