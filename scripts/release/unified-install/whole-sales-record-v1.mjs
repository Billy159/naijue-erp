/** Fixed OS-trusted sales successor record. Parsing caller JSON is not admission. */
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {assertTrustedSalesPath} from './whole-sales-trusted-path.mjs';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {validateInstallationRecord,validateInstallationFileMetadata} from './whole-installation-record.mjs';
const etc=process.platform==='darwin'?'/private/etc':'/etc';
export const WHOLE_SALES_RECORD_V1_PATH=etc+'/naijue-erp/whole-sales-installation-v1.json';
const need=ok=>{if(!ok)throw Error('WHOLE_SALES_INSTALLATION_RECORD_UNTRUSTED')};
export function validateWholeSalesRecordV1(value,spec){
 need(value&&Object.keys(value).sort().join(',')==='binding,combinedSqlSha256,format,installedAt,predecessorSourceSpecSha256,sourceProfileSha256');
 need(value.format==='WHOLE_SALES_INSTALLATION_RECORD_V1');
 for(const key of ['source_spec_sha256','predecessor_source_spec_sha256','combined_sql_sha256','source_profile_sha256'])need(typeof spec?.[key]==='string'&&/^[a-f0-9]{64}$/.test(spec[key]));
 need(value.predecessorSourceSpecSha256===spec.predecessor_source_spec_sha256&&value.combinedSqlSha256===spec.combined_sql_sha256&&value.sourceProfileSha256===spec.source_profile_sha256);
 return validateInstallationRecord({format:'WHOLE_INSTALLATION_RECORD_V1',installedAt:value.installedAt,binding:value.binding},spec.source_spec_sha256);
}
export async function loadWholeSalesRecordV1(spec){
 try{
 const uid=process.getuid?.();need(Number.isInteger(uid)&&uid!==0);
 for(const path of [etc,etc+'/naijue-erp']){const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o022)===0)}
 await assertTrustedSalesPath(WHOLE_SALES_RECORD_V1_PATH);
 const file=await open(WHOLE_SALES_RECORD_V1_PATH,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{validateInstallationFileMetadata(await file.stat(),uid);const bytes=await file.readFile();need(bytes.length<=65536);return validateWholeSalesRecordV1(parseStrictJson(bytes.toString('utf8')),spec)}finally{await file.close()}
 }catch{throw Error('WHOLE_SALES_INSTALLATION_RECORD_UNTRUSTED')}
}
