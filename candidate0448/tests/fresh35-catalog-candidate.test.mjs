import test from 'node:test';import assert from 'node:assert/strict';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{deriveFreshPublicationPins,loadFresh35CatalogCandidate,stripPinnedTransaction,renderFresh35AtomicCandidate}from'../scripts/release/unified-install/fresh35-catalog-candidate.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const c=await loadFresh35CatalogCandidate(root);
const changed=c.predecessorRoutinePins.map((p,i)=>({p,next:c.successorRoutinePins[i]})).filter(({p,next})=>p.sha256!==next.sha256);
const replacements=changed.map(({p,next})=>({signature:p.signature,before_sha256:p.sha256,after_sha256:next.sha256}));
test('exact nine successor hashes, unchanged other 168 and all nonhash pin metadata',()=>{
 assert.equal(changed.length,9);assert.equal(c.successorRoutinePins.length,177);
 for(let i=0;i<177;i++){const {sha256:a,...p}=c.predecessorRoutinePins[i],{sha256:b,...n}=c.successorRoutinePins[i];assert.deepEqual(n,p);}
 assert.equal(c.foreignKeyDelta.length,7);assert.equal(c.preserved.tableCount,56);assert.equal(c.installationReady,false);assert.equal(c.reviewedCatalog,false);
});
test('source-derived pin replacements cannot accept wrong predecessor or unknown routine',()=>{
 const wrong=replacements.map((p,i)=>i? p:{...p,before_sha256:'0'.repeat(64)});assert.throws(()=>deriveFreshPublicationPins(c.predecessorRoutinePins,wrong),/PREDECESSOR_BODY/);
 assert.throws(()=>deriveFreshPublicationPins(c.predecessorRoutinePins,[...replacements.slice(1),{...replacements[0],signature:'naijue_erp.missing()'}]),/MISSING/);
 assert.throws(()=>deriveFreshPublicationPins(c.predecessorRoutinePins,replacements.slice(1)),/EXACT_REPLACEMENT/);
});
test('one outer transaction, refusal before either mutation, original checks preserved',async()=>{
 const {sql}=await renderFresh35AtomicCandidate(root);
 assert.equal((sql.match(/^BEGIN ISOLATION LEVEL READ COMMITTED;$/gm)||[]).length,1);
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,0);assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.ok(sql.indexOf('FRESH35_REVIEWED_CATALOG_AND_RETIREMENT_CLOSURE_MISSING')<sql.indexOf('DO $specialize$'));
 for(const msg of ['PUBLICATION_ISOLATION_PREDECESSOR_DIFFERS','PUBLICATION_ISOLATION_UNEXPECTED_CHANGE','CORE_HISTORY_FK_NEW_EMPTY_TARGET_REQUIRED','CORE_HISTORY_FK_UNEXPECTED_REPLACEMENT_CHANGE'])assert.ok(sql.includes(msg));
 assert.ok(!/DROP TABLE/i.test(sql));
});
test('atomic rewriting refuses altered bytes and additional transaction boundaries',()=>{
 const s='BEGIN;\nSELECT 1;\nCOMMIT;\n',hash=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(stripPinnedTransaction(s,hash(s)),'\nSELECT 1;\n');assert.throws(()=>stripPinnedTransaction(s+' ',hash(s)),/PIN_DIFFERS/);
 const bad='BEGIN;\nBEGIN;\nCOMMIT;\n';assert.throws(()=>stripPinnedTransaction(bad,hash(bad)),/OUTER_TRANSACTION/);
});
