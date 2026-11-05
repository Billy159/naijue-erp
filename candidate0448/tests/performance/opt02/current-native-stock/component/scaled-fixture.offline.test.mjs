/** Scripted protocol ONLY; no PostgreSQL or genuine native CREATE. */
import test from 'node:test';import assert from 'node:assert/strict';
import {buildScaledReferenceFixture,assertScaledFixture,scaledReferenceCommands,seedScaledReferenceFixture,scaledReferenceInsertPlan,SCALED_SETUP_TABLE_ORDER} from './scaled-fixture.mjs';
import {buildReferenceFixture,assertFixture,additionalReferenceCommands} from './fixture.mjs';
import {SETUP_COLUMNS,FORBIDDEN_ROWS} from '../../../opt00/pg-component/contract.mjs';
import {seedCommands} from '../../../opt00/pg-component/seed.mjs';
import {NODE_SCRYPT_DUMMY_HASH as passwordHash} from '../../../../../packages/authentication/src/passwords.ts';
const f=buildScaledReferenceFixture(),commands=scaledReferenceCommands(f,passwordHash);
test('private new303 brand refuses old/clone/proxy/inherited and input-configured factories',()=>{
 assert.equal(assertScaledFixture(f),f);assert.throws(()=>assertFixture(f));
 for(const x of [buildReferenceFixture(),null,{},structuredClone(f),Object.create(f),new Proxy(f,{})])assert.throws(()=>assertScaledFixture(x));
 assert.throws(()=>buildScaledReferenceFixture({}));assert.equal(f.referenceRows,303);assert.equal(f.skus.length,100);assert.equal(f.native,f.sourcePlan.native);assert.equal(f.checkpoints[3].cursor,107);
});
test('complete303 preserve original99 plus204 pre-cutoff rows only; no native planned IDs or receipt writes',()=>{
 assert.deepEqual(commands.slice(0,99),seedCommands(f.reference,passwordHash));assert.equal(commands.length,303);
 for(const [table,n] of Object.entries(f.referenceCounts))assert.equal(commands.filter(x=>x.table===table).length,n);
 const ids=new Set([...Object.values(f.native.ids),...f.native.allocations.flatMap(x=>[x.skuId,x.barcodeId])]);
 for(const x of commands){assert.ok(!FORBIDDEN_ROWS.includes(x.table));assert.ok(x.values.every(v=>!ids.has(v)));assert.ok(Object.isFrozen(x.values));assert.ok(!x.text.includes(passwordHash));assert.equal((x.text.match(/\$\d+/g)||[]).length,x.values.length);}
 assert.equal(commands.find(x=>x.table==='user_account').values[SETUP_COLUMNS.user_account.indexOf('password_hash')],passwordHash);
});
test('scripted owner seed checks business absence, constraints and every exact table count; no password result',async()=>{
 const calls=[];const query=async(text,values)=>{calls.push({text,values});if(text.startsWith('SELECT count(*)::text AS n'))return{rows:[{n:'0'}]};if(text.startsWith('SELECT count(*)::text n'))return{rows:[{n:String(f.referenceCounts[text.match(/"([a-z_]+)"$/)[1]])}]};if(text.startsWith('INSERT ')){const table=text.match(/naijue_erp\.\"([a-z_]+)\"/)[1],n=f.referenceCounts[table];return{rowCount:n,rows:Array.from({length:n},()=>({inserted:1}))};}return{rows:[]};};
 const result=await seedScaledReferenceFixture(query,f,passwordHash);assert.equal(result.referenceRows,303);assert.equal(result.serviceProduced,false);assert.ok(!JSON.stringify(result).includes(passwordHash));assert.equal(calls.filter(x=>x.text.startsWith('INSERT ')).length,14);assert.equal(calls.filter(x=>x.text==='SET CONSTRAINTS ALL IMMEDIATE').length,1);
 let sent=0;const never=async()=>{sent++;throw Error('no send')};await assert.rejects(seedScaledReferenceFixture(never,{...f},passwordHash));await assert.rejects(seedScaledReferenceFixture(never,f,'bad'));assert.equal(sent,0);
});
test('seed refuses existing business or count drift; original error retained and no transaction ownership invented',async()=>{
 let sent=0;await assert.rejects(seedScaledReferenceFixture(async()=>{sent++;return{rows:[{n:'1'}]}},f,passwordHash));assert.equal(sent,1);
 const original=Error('original owner failure');await assert.rejects(seedScaledReferenceFixture(async()=>{throw original},f,passwordHash),e=>e===original);
 const calls=[];await assert.rejects(seedScaledReferenceFixture(async text=>{calls.push(text);return{rows:text.startsWith('SELECT count(*)::text AS n')?[{n:'0'}]:[]}},f,passwordHash));assert.ok(!calls.includes('COMMIT'));assert.ok(!calls.includes('ROLLBACK'));
});

test('fixed14 batched inserts preserve every one of303 rows/columns/within-table order and dependencies',()=>{
 const batches=scaledReferenceInsertPlan(f,passwordHash);assert.deepEqual(batches.map(x=>x.table),SCALED_SETUP_TABLE_ORDER);assert.equal(batches.reduce((n,x)=>n+x.rowCount,0),303);
 for(const batch of batches){const original=commands.filter(x=>x.table===batch.table);assert.deepEqual(batch.values,original.flatMap(x=>x.values));assert.equal(batch.rowCount,original.length);assert.ok(batch.text.endsWith('RETURNING 1 AS inserted'));assert.ok(!batch.text.includes(passwordHash));
  assert.deepEqual([...batch.text.matchAll(/\$(\d+)/g)].map(x=>Number(x[1])),Array.from({length:batch.values.length},(_,i)=>i+1));
 }
 const at=table=>SCALED_SETUP_TABLE_ORDER.indexOf(table);for(const [parent,child] of [['hall','warehouse'],['staff','user_account'],['size','size_group_member'],['size_group','size_group_member'],['size_group_member','product'],['product_category','product'],['product','sku'],['color','sku'],['fit','sku']])assert.ok(at(parent)<at(child));
});
test('every batch requires exact real returned rowCount and303 individual ack rows; no next send after mismatch',async()=>{
 const batches=scaledReferenceInsertPlan(f,passwordHash);
 for(let target=0;target<batches.length;target++)for(const bad of ['count','missing','duplicate','wrong']){let inserts=0;
  await assert.rejects(seedScaledReferenceFixture(async text=>{if(text.startsWith('SELECT count(*)::text AS n'))return{rows:[{n:'0'}]};const batch=batches[inserts++];assert.equal(text,batch.text);const result={rowCount:batch.rowCount,rows:Array.from({length:batch.rowCount},()=>({inserted:1}))};
   if(inserts-1===target){if(bad==='count')result.rowCount--;if(bad==='missing')result.rows.pop();if(bad==='duplicate')result.rows.push({inserted:1});if(bad==='wrong')result.rows[0].inserted='1';}return result;
  },f,passwordHash),{code:'EXACT_SCALED_INSERT_ACK_REQUIRED:'+batches[target].table});assert.equal(inserts,target+1);
 }
});
test('post-batch closure independently rejects each actual table drift after all14 inserts and immediate constraints',async()=>{
 for(const target of Object.keys(f.referenceCounts)){let inserts=0,immediate=false;const closed=[];
  await assert.rejects(seedScaledReferenceFixture(async text=>{
   if(text.startsWith('SELECT count(*)::text AS n'))return{rows:[{n:'0'}]};
   if(text.startsWith('INSERT ')){inserts++;const table=text.match(/naijue_erp\."([a-z_]+)"/)[1],n=f.referenceCounts[table];return{rowCount:n,rows:Array.from({length:n},()=>({inserted:1}))};}
   if(text==='SET CONSTRAINTS ALL IMMEDIATE'){immediate=true;return{rows:[]};}
   const table=text.match(/"([a-z_]+)"$/)[1];closed.push(table);return{rows:[{n:String(f.referenceCounts[table]+(table===target?1:0))}]};
  },f,passwordHash),{code:'EXACT_SCALED_REFERENCE_COUNT_REQUIRED:'+target});assert.equal(inserts,14);assert.equal(immediate,true);assert.equal(closed.at(-1),target);
 }
});

test('all original105 reference row values remain exact inside scaled303, including alternate product/sku and scheme',()=>{
 const old=buildReferenceFixture(),oldRows=[...seedCommands(old.reference,passwordHash),...additionalReferenceCommands(old,passwordHash)];
 assert.equal(oldRows.length,105);for(const row of oldRows){const matches=commands.filter(x=>x.table===row.table&&JSON.stringify(x.values)===JSON.stringify(row.values));assert.equal(matches.length,1,row.table);}
});
