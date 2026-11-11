import {closeExplicitZeroApproval} from '../../packages/application/src/unified-explicit-zero-approval.ts';
import {readHistoricalSettlementRetentionCliApproval} from './historical-settlement-retention-cli-input.mjs';
import {readHistoricalHallCliApproval} from './historical-hall-cli-input.mjs';
import {readCurrentEffectiveAlignmentCliEvidence} from './current-effective-alignment-cli-input.mjs';
import {readHistoricalLineAmountCliEvidence} from './historical-line-amount-cli-input.mjs';
import {readSourceOccurrenceCliEvidence} from './source-reconciliation-cli-input.mjs';
import {streamPreflight} from './stream-preflight.mjs';
import {readBoundedCliFile,readExplicitZeroCliApproval,readStaffHallCliApproval} from './explicit-zero-cli-input.mjs';
import {parseStrictJson,decodeUtf8,sha256} from '../../packages/application/src/unified-import-contract.ts';
import {join} from 'node:path';
export async function runStreamPreflight(args){
 if(args.length===1&&args[0]==='--help'){process.stdout.write(JSON.stringify({usage:'stream-preflight --package DIR --report NEW_DIR --manifest-sha256 SHA [--allow-synthetic] [--explicit-zero-approval FILE --explicit-zero-approval-sha256 SHA] [--staff-hall-approval FILE --staff-hall-approval-sha256 SHA] [--historical-hall-approval FILE --historical-hall-approval-sha256 SHA] [--current-effective-alignment FILE --current-effective-alignment-sha256 SHA] [--historical-settlement-retention-approval FILE --historical-settlement-retention-approval-sha256 SHA] [--historical-line-amount-evidence FILE --historical-line-amount-evidence-sha256 SHA] [--source-occurrence-evidence FILE --source-occurrence-evidence-sha256 SHA]',scope:'OFFLINE_PREFLIGHT_NO_DATABASE_NO_EXECUTION_ADMISSION'})+'\n');return}
 const options={};let allowSynthetic=false;
 for(let i=0;i<args.length;){const key=args[i++];if(key==='--allow-synthetic'){if(allowSynthetic)throw Error('INVALID_STREAM_ARGUMENTS');allowSynthetic=true;continue}if(!['--package','--report','--manifest-sha256','--explicit-zero-approval','--explicit-zero-approval-sha256','--staff-hall-approval','--staff-hall-approval-sha256','--historical-hall-approval','--historical-hall-approval-sha256','--current-effective-alignment','--current-effective-alignment-sha256','--historical-settlement-retention-approval','--historical-settlement-retention-approval-sha256','--historical-line-amount-evidence','--historical-line-amount-evidence-sha256','--source-occurrence-evidence','--source-occurrence-evidence-sha256'].includes(key)||Object.hasOwn(options,key)||!args[i])throw Error('INVALID_STREAM_ARGUMENTS');options[key]=args[i++]}
 for(const flag of ['historical-settlement-retention-approval','historical-line-amount-evidence','source-occurrence-evidence','historical-hall-approval'])if(Boolean(options['--'+flag])!==Boolean(options['--'+flag+'-sha256']))throw Error('INVALID_STREAM_ARGUMENTS');
 if(Boolean(options['--current-effective-alignment'])!==Boolean(options['--current-effective-alignment-sha256']))throw Error('INVALID_STREAM_ARGUMENTS');
 if(!['--package','--report','--manifest-sha256'].every(k=>options[k])||Boolean(options['--explicit-zero-approval'])!==Boolean(options['--explicit-zero-approval-sha256'])||Boolean(options['--staff-hall-approval'])!==Boolean(options['--staff-hall-approval-sha256']))throw Error('INVALID_STREAM_ARGUMENTS');
 let historicalSettlementRetentionApproval,explicitZeroApproval,historicalStaffHallApproval,historicalSalesHallApproval,currentEffectiveAlignmentEvidence,historicalLineAmountEvidence,sourceOccurrenceEvidence;
 try{
 if(options['--historical-settlement-retention-approval']||options['--historical-hall-approval']||options['--explicit-zero-approval']||options['--staff-hall-approval']||options['--current-effective-alignment']||options['--historical-line-amount-evidence']||options['--source-occurrence-evidence']){
  const bytes=await readBoundedCliFile(join(options['--package'],'manifest.json'),2*1024*1024);
  if(sha256(bytes)!==options['--manifest-sha256'])throw Error('MANIFEST_HASH_MISMATCH');
  const manifest=parseStrictJson(decodeUtf8(bytes));
  if(options['--historical-hall-approval'])historicalSalesHallApproval=await readHistoricalHallCliApproval(options['--package'],manifest,options['--historical-hall-approval'],options['--historical-hall-approval-sha256']);
  if(options['--historical-settlement-retention-approval'])historicalSettlementRetentionApproval=await readHistoricalSettlementRetentionCliApproval(options['--package'],manifest,options['--historical-settlement-retention-approval'],options['--historical-settlement-retention-approval-sha256']);
  if(options['--historical-line-amount-evidence'])historicalLineAmountEvidence=await readHistoricalLineAmountCliEvidence(options['--package'],manifest,options['--historical-line-amount-evidence'],options['--historical-line-amount-evidence-sha256']);
  if(options['--source-occurrence-evidence'])sourceOccurrenceEvidence=await readSourceOccurrenceCliEvidence(options['--package'],manifest,options['--source-occurrence-evidence'],options['--source-occurrence-evidence-sha256']);
  if(options['--explicit-zero-approval'])explicitZeroApproval=await readExplicitZeroCliApproval(options['--package'],manifest,options['--explicit-zero-approval'],options['--explicit-zero-approval-sha256']);
  if(options['--current-effective-alignment'])currentEffectiveAlignmentEvidence=await readCurrentEffectiveAlignmentCliEvidence(options['--package'],manifest,options['--current-effective-alignment'],options['--current-effective-alignment-sha256']);
  if(options['--staff-hall-approval'])historicalStaffHallApproval=await readStaffHallCliApproval(options['--package'],manifest,options['--staff-hall-approval'],options['--staff-hall-approval-sha256']);
 }
 const result=await streamPreflight(options['--package'],options['--report'],{expectedManifestSha256:options['--manifest-sha256'],allowSynthetic,...(historicalSettlementRetentionApproval?{historicalSettlementRetentionApproval}:{}),...(historicalLineAmountEvidence?{historicalLineAmountEvidence}:{}),...(sourceOccurrenceEvidence?{sourceOccurrenceEvidence}:{}),...(historicalSalesHallApproval?{historicalSalesHallApproval}:{}),...(currentEffectiveAlignmentEvidence?{currentEffectiveAlignmentEvidence}:{}),...(explicitZeroApproval?{explicitZeroApproval}:{}),...(historicalStaffHallApproval?{historicalStaffHallApproval}:{})});
 const publicResult={...result,...(historicalSettlementRetentionApproval?{historical_settlement_retention_approval:{sha256:options['--historical-settlement-retention-approval-sha256'],document_count:25,settlement_count:27}}:{}),...(historicalSalesHallApproval?{historical_hall_approval:{sha256:options['--historical-hall-approval-sha256'],record_count:historicalSalesHallApproval.records.length}}:{}),...(historicalStaffHallApproval?{historical_staff_hall_approval:{sha256:options['--staff-hall-approval-sha256'],record_count:historicalStaffHallApproval.staff.length}}:{})};
 process.stdout.write(JSON.stringify(publicResult)+'\n');process.exitCode=result.checks_passed?0:1;
 }finally{closeExplicitZeroApproval(explicitZeroApproval);}
}
