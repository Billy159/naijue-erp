/** All inputs synthetic and local, no database host or real source. */
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {spawnSync} from 'node:child_process';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {sha256,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256} from '../packages/application/src/unified-import-contract.ts';
import {buildHistoricalSalesHallEvidence} from '../packages/application/src/historical-sales-hall-evidence.ts';
import {runStreamPrepare} from '../tools/unified-import/stream-prepare-cli.mjs';
import {runStreamImport} from '../tools/unified-import/stream-import-cli.mjs';
const invoke=args=>spawnSync(process.execPath,['tools/unified-import/cli.mjs',...args],{encoding:'utf8',timeout:20000});
async function fixture(work){const dir=await mkdtemp(join(tmpdir(),'hall-cli-'));try{
 const pkg=join(dir,'package'),p=createSyntheticPackage(),h=p.records.sales_header[0],w=p.records.warehouse[0];
 p.manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256;for(const s of p.records.staff)s.fields.departure_date=null;
 const evidence=buildHistoricalSalesHallEvidence({originalHallId:null,warehouseId:w.fields.id,warehouseHallId:w.fields.hall_id,warehouseVersion:w.fields.version,capturedAt:'2026-11-05T03:00:00Z'});h.fields.hall_id=evidence.selected_hall_id;h.historical_hall_evidence=evidence;repinSyntheticPackage(p);await mkdir(pkg);
 for(const [name,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(pkg,name)),{recursive:true});await writeFile(join(pkg,name),bytes);}
 const mb=Buffer.from(JSON.stringify(p.manifest));await writeFile(join(pkg,'manifest.json'),mb);
 const proof=Buffer.from(JSON.stringify({format_version:'HISTORICAL_SALES_HALL_APPROVAL_V1',source_namespace:p.manifest.source_namespace,evidence_sha256:p.manifest.source_files[1].sha256,records:[{source_key:h.source_key,target_id:h.fields.id,source_refs:h.source_refs,evidence}]})),approval=join(dir,'approved.json');await writeFile(approval,proof);
 const target=join(dir,'target.json'),admin=join(dir,'admin.json');await writeFile(target,JSON.stringify({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_hall',catalog_sha256:'a'.repeat(64)}));await writeFile(admin,JSON.stringify({staff_id:'00000000-0000-4000-8000-000000000001',account_id:'00000000-0000-4000-8000-000000000002',login_name:'synthetic',staff_name:'SYNTHETIC'}));
 await work({dir,pkg,target,admin,approval,proof,pin:sha256(proof),base:['--package',pkg,'--manifest-sha256',sha256(mb),'--allow-synthetic'],pair:['--historical-hall-approval',approval,'--historical-hall-approval-sha256',sha256(proof)]});
 }finally{await rm(dir,{recursive:true,force:true});}}
test('all public CLI help declares independently pinned historical hall approval',()=>{for(const command of ['stream-preflight','stream-prepare','stream-import']){const r=invoke([command,'--help']);assert.equal(r.status,0,r.stderr);assert.match(JSON.parse(r.stdout).usage,/--historical-hall-approval FILE --historical-hall-approval-sha256 SHA/);}});
test('public preflight consumes hall evidence; prepare/import remain offline before private host access',async()=>fixture(async f=>{
 const r=invoke(['stream-preflight',...f.base,'--report',join(f.dir,'good'),...f.pair]);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).checks_passed,true);assert.doesNotMatch(r.stdout,/warehouse_hall_id_at_capture|original_hall_id|sales:01/);
 const prep=await runStreamPrepare([...f.base,'--report',join(f.dir,'prepare'),'--target',f.target,'--admin',f.admin,...f.pair]);assert.equal(prep.state,'PREPARATION_FAILED');assert.equal(prep.code,'WHOLE_SALES_ADMISSION_REQUIRED');
 const imp=await runStreamImport([...f.base,'--report',join(f.dir,'import'),'--target',f.target,'--admin',f.admin,...f.pair,'--connection',join(f.dir,'DO_NOT_OPEN_PRIVATE.json'),'--scrypt-file',join(f.dir,'DO_NOT_OPEN_SECRET'),'--ack-exclusive-ddl-window']);assert.equal(imp.state,'NOT_STARTED');assert.equal(imp.code,'FRESH35_TARGET_PROFILE_REQUIRED');
}));
test('untrusted pin, package-contained approval and missing pair fail without host fallback',async()=>fixture(async f=>{
 for(const [name,pair] of [['pin',[...f.pair.slice(0,3),'f'.repeat(64)]],['missing',f.pair.slice(0,2)]]){const r=invoke(['stream-preflight',...f.base,'--report',join(f.dir,name),...pair]);assert.equal(r.status,1);}
 const inside=join(f.pkg,'untrusted.json');await writeFile(inside,f.proof);const r=invoke(['stream-preflight',...f.base,'--report',join(f.dir,'inside'),'--historical-hall-approval',inside,'--historical-hall-approval-sha256',f.pin]);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).code,'STREAM_PREFLIGHT_FAILED');
 const {readHistoricalHallCliApproval}=await import('../tools/unified-import/historical-hall-cli-input.mjs');
 await assert.rejects(readHistoricalHallCliApproval(f.pkg,JSON.parse(await readFile(join(f.pkg,'manifest.json'),'utf8')),inside,f.pin),/HISTORICAL_HALL_APPROVAL_OUTSIDE_PACKAGE_REQUIRED/);
}));
