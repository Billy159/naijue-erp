import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {writeExplicitZeroStreamPackage} from './fixtures/unified-import/explicit-zero-stream-package.mjs';
const stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
async function cliWithTokenSpies(){
 const sourceUrl=pathToFileURL(resolve('tools/unified-import/stream-import-cli.mjs')),approval=pathToFileURL(resolve('packages/application/src/unified-explicit-zero-approval.ts')).href;
 let s=await readFile(sourceUrl,'utf8');s=s.replace("const root=fileURLToPath(new URL('../../',import.meta.url));",`const root=${JSON.stringify(process.cwd())};`);
 const host=stub(`import{explicitZeroApprovalDescriptor}from${JSON.stringify(approval)};export async function openReviewedWholeHost(c,r,t,work,options){const d=explicitZeroApprovalDescriptor(options?.explicitZeroApproval);if(d.record_count!==3)throw Error('TOKEN_NOT_FORWARDED');return{result:await work({token:options.explicitZeroApproval}),cleanup:'CLOSED'}};export const openReviewedWholeSalesHost=openReviewedWholeHost;`);
 const kernel=stub(`import{explicitZeroApprovalDescriptor}from${JSON.stringify(approval)};export function createWholePackageSqlKernel(encoded,options){explicitZeroApprovalDescriptor(options?.explicitZeroApproval);return{token:options.explicitZeroApproval}}`);
 const inspect=stub("export async function inspectWholePackage(client,identity,initialize,kernel){if(client.token!==kernel.token||initialize.payload.explicit_zero_approval?.record_count!==3)throw Error('TOKEN_NOT_SHARED');return{state:'ABSENT'}}");
 for(const [p,url] of [['./whole-package-host.mjs',host],['./whole-sales-host.mjs',host],['./whole-package-sql-kernel.ts',kernel],['./whole-package-inspect.ts',inspect]])s=s.replaceAll("'"+p+"'",JSON.stringify(url));
 s=s.replace(/(['"])(\.\.?\/[^'"\n]+)\1/g,(_,q,path)=>JSON.stringify(new URL(path,sourceUrl).href));
 return import(stub(s));
}
test('ordinary whole and streamed CLI forward the same verified approval to host and kernel; hash error stays public and safe',async()=>{
 const d=await mkdtemp(join(tmpdir(),'zero-cli-token-'));try{
  const p=await writeExplicitZeroStreamPackage(join(d,'input'),3),m=await cliWithTokenSpies();
  const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_profile',catalog_sha256:'a'.repeat(64)},admin={staff_id:'10000000-0000-0000-0000-000000000001',account_id:'20000000-0000-0000-0000-000000000001',login_name:'synthetic-admin',staff_name:'SYNTHETIC admin'};
  for(const [n,v] of [['target',JSON.stringify(target)],['admin',JSON.stringify(admin)],['connection',JSON.stringify({password:'synthetic-private'})],['scrypt','naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128)]])await writeFile(join(d,n),v,{mode:0o600});
  const args=report=>['--package',join(d,'input'),'--report',join(d,report),'--manifest-sha256',p.manifestSha256,'--target',join(d,'target'),'--admin',join(d,'admin'),'--connection',join(d,'connection'),'--scrypt-file',join(d,'scrypt'),'--explicit-zero-approval',p.approvalPath,'--explicit-zero-approval-sha256',p.approvalSha256,'--allow-synthetic','--inspect-only','--ack-exclusive-ddl-window'];
  for(const method of ['runWholeImport','runStreamImport']){const result=await m[method](args(method));assert.equal(result.state,'ABSENT',JSON.stringify(result));assert.equal(result.connection_cleanup,'CLOSED')}
  const bad=args('bad');bad[bad.indexOf(p.approvalSha256)]='f'.repeat(64);const result=await m.runStreamImport(bad);assert.equal(result.state,'NOT_STARTED');assert.equal(result.code,'EXPLICIT_ZERO_APPROVAL_HASH');
 }finally{await rm(d,{recursive:true,force:true})}
});
