import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createOccurrenceStorage} from '../tools/unified-import/source-occurrence-storage.mjs';

function storage(make=createOccurrenceStorage){
 const root=mkdtempSync(join(tmpdir(),'occurrence-storage-test-'));
 const previous=process.env.TMPDIR;
 let store;
 try{process.env.TMPDIR=root;store=make();}
 finally{if(previous===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=previous;}
 const path=join(root,readdirSync(root)[0],'ledger.sqlite');
 return{store,path,close(){try{store.close();}finally{rmSync(root,{recursive:true,force:true});}}};
}
test('maps and sets preserve serialized key identity, overwrite, isolation and missing values',()=>{
 const s=storage();
 try{
  const a=s.store.map(),b=s.store.map(),set=s.store.set();
  const keys=[null,'null',0,'0',false,'false',['a',null],{a:1,b:2},{b:2,a:1}];
  for(const [i,k] of keys.entries()){a.set(k,{i,unknown:null,raw:'001.00'});set.add(k);set.add(k);}
  assert.equal(a.size,keys.length);assert.equal(set.size,keys.length);assert.equal(b.size,0);
  for(const [i,k] of keys.entries()){assert.deepEqual(a.get(k),{i,unknown:null,raw:'001.00'});assert.equal(set.has(k),true);assert.equal(b.has(k),false);}
  assert.equal(a.get('missing'),undefined);assert.equal(a.has('missing'),false);assert.equal(set.has('missing'),false);
  a.set(null,null);assert.equal(a.get(null),null);assert.equal(a.has(null),true);assert.equal(a.size,keys.length);
  a.set('null','');assert.equal(a.get('null'),'');
  const value={nested:{raw:'-0.00'}};a.set('copy',value);value.nested.raw='changed';
  const copy=a.get('copy');assert.deepEqual(copy,{nested:{raw:'-0.00'}});copy.nested.raw='another';assert.deepEqual(a.get('copy'),{nested:{raw:'-0.00'}});
  b.set(null,'independent');assert.equal(a.get(null),null);assert.equal(b.get(null),'independent');
 }finally{s.close();}
});
test('lists retain repeated complete rows, unknowns, exact text and independent nested iterators',()=>{
 const s=storage();
 try{
  const list=s.store.list(),other=s.store.list();
  const rows=[null,'',false,0,{unknown:null,raw:'001.00',quantity:'-0.00',missing:undefined},'é','e\u0301','\u0000\ud800','same-prefix:'.repeat(1000)+'A','same-prefix:'.repeat(1000)+'B'];
  const expected=rows.map(x=>JSON.parse(JSON.stringify(x)));
  for(const row of rows){list.push(row);other.push(row);}
  list.push(rows[4]);expected.push(expected[4]);
  assert.equal(list.length,expected.length);assert.deepEqual([...list],expected);assert.deepEqual([...list],expected);
  assert.equal(list.filter(x=>x===null||x?.unknown===null).length,3);
  const pairs=[];for(const a of list)for(const b of other)pairs.push([a,b]);
  assert.equal(pairs.length,expected.length*rows.length);assert.deepEqual(pairs.at(-1),[expected.at(-1),expected.at(-2)]);
  const copy=[...list];copy[4].raw='mutated';assert.deepEqual([...list],expected);
 }finally{s.close();}
});
test('groups preserve every repeated member, ordering, key identity and nested multi-group iteration',()=>{
 const s=storage();
 try{
  const groups=s.store.groups(),other=s.store.groups();
  groups.add('a',{raw:'1.00',unknown:null});groups.add('b',{raw:'2.00'});groups.add('a',{raw:'1.00',unknown:null});
  groups.add(null,{raw:'0'});groups.add('null',{raw:''});groups.add(['a'],{raw:'array'});
  other.add('a',{raw:'independent'});
  assert.equal(groups.size,5);assert.equal(groups.get('a').length,2);
  assert.deepEqual([...groups.get('a')],[{raw:'1.00',unknown:null},{raw:'1.00',unknown:null}]);
  assert.equal(groups.get('absent'),undefined);assert.equal(groups.has('absent'),false);assert.equal(groups.has(null),true);
  assert.deepEqual([...groups.get(null)],[{raw:'0'}]);assert.deepEqual([...groups.get('null')],[{raw:''}]);
  assert.deepEqual([...groups.get(['a'])],[{raw:'array'}]);assert.deepEqual([...other.get('a')],[{raw:'independent'}]);
  let n=0;for(const a of groups.get('a'))for(const b of groups.get('b')){assert.equal(a.raw,'1.00');assert.equal(b.raw,'2.00');n++;}assert.equal(n,2);
  const iterator=groups.get('a')[Symbol.iterator]();assert.deepEqual(iterator.next().value,{raw:'1.00',unknown:null});
  assert.deepEqual([...groups.get('b')],[{raw:'2.00'}]);assert.deepEqual(iterator.next().value,{raw:'1.00',unknown:null});assert.equal(iterator.next().done,true);
 }finally{s.close();}
});

function representative(make,count){
 const s=storage(make),store=s.store,phases=[];
 const key=i=>'naijue:source-identity:v1:'+JSON.stringify(['TRANSFER_LINE','naijue:source-identity:v1:'+JSON.stringify(['TRANSFER_HEADER','PERSISTED_LEDGER_ID',String(Math.floor(i/6)).padStart(36,'0')]),'PERSISTED_LEDGER_ID',String(i).padStart(36,'0')]);
 const source=i=>({entity_type:'TRANSFER_LINE',source_key:key(i),source_parent_key:null,source_refs:[{file_sha256:'a'.repeat(64),sheet:'调拨单',row:i+1},{file_sha256:'b'.repeat(64),sheet:'调拨单',row:i+2}],original_values:{quantity:i%13===0?null:'001.0000',source_amount:'-0.00',source_note:'原始文本:é/e\u0301/\u0000/'+String(i),unmapped:null}});
 const target=i=>({table:'transfer_line',source_key:key(i),archive_source_key:null});
 const mapping=i=>({entity_type:'TRANSFER_LINE',source_key:key(i),source_parent_key:null,target_record_sha256:String(i).padStart(64,'0'),target:target(i)});
 const sourceKey=r=>JSON.stringify([r.entity_type,r.source_key,r.source_parent_key]);
 const targetKey=r=>JSON.stringify([r.table,r.source_key,r.archive_source_key]);
 function sample(phase){const st=statSync(s.path);phases.push({phase,bytes:st.size,allocated_bytes:st.blocks*512});}
 try{
  const sources=store.list(),mappings=store.list(),declared=store.set(),mapped=store.set();
  for(let i=0;i<count;i++){const r=source(i);sources.push(r);mappings.push(mapping(i));declared.add(sourceKey(r));mapped.add(sourceKey(r));}
  sample('reader_and_registration');
  const originals=store.map(),groups=store.groups(),needed=store.set(),aliases=store.map();
  for(const r of sources){originals.set(sourceKey(r),r);needed.add(JSON.stringify([r.entity_type,r.source_key]));}
  for(const r of mappings){groups.add(targetKey(r.target),r);needed.add(JSON.stringify([r.entity_type,r.target.source_key]));}
  for(let i=0;i<count;i++)aliases.set(JSON.stringify(['TRANSFER_LINE',key(i)]),'id:'+i);
  sample('originals_groups_identities');
  const output=store.list(),seen=store.set(),used=store.set();
  for(let i=0;i<count;i++){
   const r=source(i),k=sourceKey(r),t=target(i),g=targetKey(t);
   assert.equal(declared.has(k),true);assert.equal(mapped.has(k),true);assert.deepEqual(originals.get(k),r);
   assert.equal(seen.has(r.source_key),false);seen.add(r.source_key);used.add(g);
   assert.deepEqual([...groups.get(g)],[mapping(i)]);assert.equal(aliases.get(JSON.stringify([r.entity_type,r.source_key])),'id:'+i);
   output.push({source:r,target:t,target_id:'id:'+i,target_record_sha256:mapping(i).target_record_sha256});
  }
  let i=0;for(const r of output){assert.deepEqual(r,{source:source(i),target:target(i),target_id:'id:'+i,target_record_sha256:mapping(i).target_record_sha256});i++;}
  assert.equal(i,count);assert.equal(sources.length,count);assert.equal(mappings.length,count);assert.equal(originals.size,count);assert.equal(groups.size,count);assert.equal(needed.size,count);assert.equal(used.size,count);assert.equal(seen.size,count);
  sample('complete_output_eof');
  return{rows:i,phases,peak_bytes:Math.max(...phases.map(p=>p.bytes)),peak_allocated_bytes:Math.max(...phases.map(p=>p.allocated_bytes))};
 }finally{s.close();}
}
test('representative source/mapping fan-out retains complete rows while reducing scratch bytes',{skip:!process.env.SOURCE_OCCURRENCE_STORAGE_BASELINE},async()=>{
 const {createOccurrenceStorage:before}=await import(pathToFileURL(process.env.SOURCE_OCCURRENCE_STORAGE_BASELINE).href);
 const old=representative(before,30000),current=representative(createOccurrenceStorage,30000);
 assert.equal(current.rows,old.rows);assert.ok(current.peak_bytes<old.peak_bytes);
 console.log(JSON.stringify({scope:'SYNTHETIC_STORAGE_ONLY_NOT_FULL_REAL_SOURCE_RECONCILIATION',before:old,after:current,reduction_fraction:1-current.peak_bytes/old.peak_bytes}));
});
