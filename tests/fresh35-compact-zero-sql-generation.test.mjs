import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {loadFresh35AdminProvisionCandidate} from '../scripts/release/unified-install/fresh35-admin-provision-candidate.mjs';
import {generateFresh35CompactZeroPatch,compileFresh35CompactZeroCandidate,loadFrozenFresh35CompactZeroCandidate as loadFresh35CompactZeroCandidate} from '../scripts/release/unified-install/fresh35-compact-zero-candidate.mjs';
const root=new URL('../',import.meta.url).pathname,hash=s=>createHash('sha256').update(s).digest('hex');
const patch=await readFile(new URL('../adapters/postgres/patches/0037_compact_zero_scope_successor.sql',import.meta.url),'utf8'),v1=await readFile(new URL('../adapters/postgres/patches/0027_explicit_zero_evidence_successor.sql',import.meta.url),'utf8'),parent=await loadFresh35AdminProvisionCandidate(root),routine=parent.changedBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')),generated=generateFresh35CompactZeroPatch(routine,v1);
test('the actual SQL37 bytes equal deterministic callback generation; regex literals never expand original suffixes',()=>{
 assert.ok(patch===generated.patchSql,'Actual SQL37 differs from deterministic generation');
 assert.equal(generated.spec.replacements[0].after.split('EXPLICIT_ZERO_DESCRIPTOR_INVALID').length-1,1);
 assert.equal(generated.spec.replacements[1].after.split('EXPLICIT_ZERO_EVIDENCE_INVALID').length-1,1);
 for(const r of generated.spec.replacements)assert.ok(r.after.includes("'^[a-f0-9]{64}$'")); // quote stays on this SQL line
});
test('V1 validation branches and their original limits remain byte-for-byte inside each V2 wrapper',()=>{
 for(const [i,r]of generated.spec.replacements.entries()){
  const marker=i===0?"   IF zero_descriptor->>'format_version'='EXPLICIT_ZERO_SCOPE_MERKLE_V2' THEN\n":"      IF zero_descriptor->>'format_version'='EXPLICIT_ZERO_SCOPE_MERKLE_V2' THEN\n";
  const branch=i===0?'   ELSE\n':'      ELSE\n',end=i===0?'   END IF;\n  END IF;':'      END IF;\n     END IF;';
  const start=r.after.indexOf(marker),middle=r.after.indexOf(branch,start);assert.ok(start>=0&&middle>start);
  assert.equal(r.after[middle+branch.length],String.fromCharCode(10));const unwrapped=r.after.slice(0,start)+r.after.slice(middle+branch.length+1),tail=unwrapped.lastIndexOf(end);assert.ok(tail>=0&&unwrapped.slice(tail+end.length).trim()==='');const restored=unwrapped.slice(0,tail)+(i===0?'  END IF;':'     END IF;')+unwrapped.slice(tail+end.length);assert.equal(restored,r.before);
 }
 assert.ok(generated.spec.replacements[0].after.includes('NOT BETWEEN 1 AND 250000'));assert.ok(generated.spec.replacements[1].after.includes("jsonb_array_length(zero_evidence->'merkle_proof')>18"));
});
test('a self-consistently rehashed replacement-string corruption is refused instead of being blessed by new pins',async()=>{
 const all=await loadFresh35CompactZeroCandidate(root),predecessors=all.manifest.successorRoutinePins.map(p=>p.signature===routine.signature?routine:{...p,body:''});
 const bad=structuredClone(generated.spec),anchor="   zero_descriptor:=payload->'explicit_zero_approval';";
 // Deliberately reproduce the generator fault: $ followed by quote expands
 // the old replacement suffix when the replacement is supplied as a string.
 bad.replacements[0].after=bad.replacements[0].before.replace(anchor,anchor+"\nSELECT '^[a-f0-9]{64}$';\n");
 let body=routine.body;for(const r of bad.replacements)body=body.replace(r.before,()=>r.after);bad.successor_sha256=hash(body);
 const parts=patch.split('$compact_zero_changes$'),corrupted=parts[0]+'$compact_zero_changes$'+JSON.stringify(bad)+'$compact_zero_changes$'+parts[2];
 assert.throws(()=>compileFresh35CompactZeroCandidate(predecessors,corrupted,v1),/EXACT_GENERATED_PATCH_REQUIRED/);
});
