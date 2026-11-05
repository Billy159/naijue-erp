/** Offline data adapter for one captured V2 candidate. Fixed hashes select input
 * bytes, not a reviewed profile. No connection, SQL execution, security review,
 * install record or admission is provided, including by the private brand. */
import { constants } from 'node:fs';
import { open, readFile, realpath, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createFresh35EvidenceV2SourceBinding, validateFresh35EvidenceV2Candidate, FRESH35_EVIDENCE_V2_REQUIRED_FILES } from './fresh35-catalog-evidence-v2.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_V2_ANALYSIS_'+code);};
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const sourcePath='scripts/release/unified-install/fresh35-catalog-evidence-v2-adapter.mjs';
const loadedSourceSha256=hash(await readFile(new URL(import.meta.url)));
const analyses=new WeakMap();
// This selector is deliberately separate from the unchanged 177 capture pins.
const selector=Object.freeze({
 evidenceSha256Sums:'700f43affb2bdb035b4f50dab9613613db9498eec67bf2ab5d81e6f0f723d3e5',
 manifestSha256:'649c7b5b8ad5df48d77ace39745b20e4a16e2122326f7a6fea950850cc2a8b8d',
 sourceBindingSha256:'3cd0da8932bb59eb58e585e8f6aad9d894f334351b4ce97c8b370a36c48e0fb6',
 predecessorSourceSpecSha256:'88db01d978e0777d4f8a6fa4ca0d0918d80832cccf9300bb3ff5148b2990a86e',
 owner:'schema178v2_owner_20261105_r2',controller:'schema178v2_controller_20261105_r2',
});
const disabled=Object.freeze({reviewedEvidenceRegistered:false,independentSafetyReviewComplete:false,
 executionProvenanceAuthenticated:false,catalogMetadataComplete:false,engineDependenciesVerified:false,
 engineVerified:false,installationReady:false,targetAdmitted:false,hostWired:false,executionAuthorized:false});

/** Bounded reads on a regular descriptor. Empty sidecars are valid; the original
 * candidate validator independently requires nonempty core artifacts. */
async function readBounded(directory,name,limit=32*1024*1024){
 let handle;try{handle=await open(resolve(directory,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
 catch{throw Error('FRESH35_V2_ANALYSIS_EVIDENCE_FILE_UNAVAILABLE:'+name);}
 try{
  const before=await handle.stat({bigint:true});need(before.isFile(),'EVIDENCE_FILE_NOT_REGULAR:'+name);need(before.size<=BigInt(limit),'EVIDENCE_FILE_TOO_LARGE:'+name);
  const chunks=[];let total=0;for(;;){const chunk=Buffer.allocUnsafe(Math.min(65536,limit-total+1));const {bytesRead}=await handle.read(chunk,0,chunk.length,null);if(!bytesRead)break;total+=bytesRead;need(total<=limit,'EVIDENCE_FILE_TOO_LARGE:'+name);chunks.push(chunk.subarray(0,bytesRead));}
  const after=await handle.stat({bigint:true});need(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k])&&BigInt(total)===after.size,'EVIDENCE_FILE_CHANGED:'+name);
  return Buffer.concat(chunks,total);
 }finally{await handle.close();}
}
async function currentSource(root){
 need(hash(await readFile(resolve(root,sourcePath)))===loadedSourceSha256,'RUNNING_ADAPTER_SOURCE_DIFFERS');
 const binding=await createFresh35EvidenceV2SourceBinding(root);
 need(binding.sha256===selector.sourceBindingSha256&&binding.predecessorSourceSpecSha256===selector.predecessorSourceSpecSha256,'SOURCE_BINDING_DIFFERS');
 return binding;
}
export function requireFresh35EvidenceV2Analysis(value){need(analyses.has(value),'GENUINE_ANALYSIS_REQUIRED');return value;}
/** Consumers check before and after source projection. Brand alone does not
 * establish current local sources, target state, approval or execution. */
export async function assertFresh35EvidenceV2AnalysisCurrent(value){requireFresh35EvidenceV2Analysis(value);await currentSource(analyses.get(value));}

export async function loadFresh35EvidenceV2Analysis(root,directory){
 need(arguments.length===2&&typeof root==='string'&&typeof directory==='string','ROOT_AND_DIRECTORY_REQUIRED');
 root=resolve(root);directory=resolve(directory);need(await realpath(directory)===directory,'EVIDENCE_DIRECTORY_SYMLINK');
 const binding=await currentSource(root);
 const sumBytes=await readBounded(directory,'SHA256SUMS',64*1024);need(hash(sumBytes)===selector.evidenceSha256Sums,'EVIDENCE_SELECTOR_DIFFERS');
 const lines=sumBytes.toString('utf8').split('\n');need(lines.pop()===''&&lines.length===87,'EVIDENCE_CHECKSUM_LIST_INVALID');
 const pins=lines.map(line=>{const match=/^([0-9a-f]{64})  ([a-zA-Z0-9][a-zA-Z0-9.-]*)$/.exec(line);need(match,'EVIDENCE_CHECKSUM_LIST_INVALID');return {path:match[2],sha256:match[1]};});
 need(new Set(pins.map(p=>p.path)).size===pins.length,'EVIDENCE_CHECKSUM_LIST_INVALID');
 const names=[...pins.map(p=>p.path),'SHA256SUMS'].sort();need(JSON.stringify((await readdir(directory)).sort())===JSON.stringify(names),'EVIDENCE_DIRECTORY_COHORT_DIFFERS');
 const files={};let manifest;let total=0;const evidencePins=[];
 for(const pin of pins){const bytes=await readBounded(directory,pin.path);total+=bytes.length;need(total<=96*1024*1024,'EVIDENCE_TOTAL_TOO_LARGE');need(hash(bytes)===pin.sha256,'EVIDENCE_BYTES_DIFFER:'+pin.path);evidencePins.push({...pin,bytes:bytes.length});if(FRESH35_EVIDENCE_V2_REQUIRED_FILES.includes(pin.path))files[pin.path]=bytes;if(pin.path==='candidate-manifest.json')manifest=bytes;}
 need(manifest&&hash(manifest)===selector.manifestSha256,'MANIFEST_SELECTOR_DIFFERS');
 const consistency=await validateFresh35EvidenceV2Candidate(binding,{manifest,files});
 const parsed=name=>JSON.parse(files[name].toString('utf8'));
 const inventory=parsed('inventory.json'),functions=parsed('functions.json'),sourceTarget=parsed('source-target.json'),captureContext=parsed('capture-context.json');
 // The V2 target intentionally has no controller field. Resolve this capture's
 // separately selected role from its actual role rows, without assessing ACLs.
 need(sourceTarget.target.owner===selector.owner&&[selector.owner,selector.controller].every(name=>inventory.roles.filter(row=>row.rolname===name).length===1),'SOURCE_ROLE_SELECTOR_DIFFERS');
 need(functions.length===178&&inventory.relations.filter(row=>row.relkind==='r').length===56,'PREDECESSOR_COHORT_DIFFERS');
 const dump=files['schema178-naijue-erp.sql'].toString('utf8'),objects=parsed('objects.json'),acl=parsed('acl-and-roles.json');
 const artifactPins=consistency.artifactPins;
 const modelEvidence=freeze({format:'FRESH35_V2_LEGACY_SHAPED_ANALYSIS_ONLY',pins:Object.fromEntries(artifactPins.map(p=>[p.path,p.sha256])),dump,inventory,functions,objects,acl,
  sourceTarget:{source_spec_sha256:sourceTarget.predecessorSourceSpecSha256,target:{...sourceTarget.target,controller:selector.controller}},
  bridgeProvenance:{sourceSpecField:'source-target.json.predecessorSourceSpecSha256',ownerField:'source-target.json.target.owner',controllerSource:'Fixed capture role selector, matched exactly once in inventory.json roles; not an ACL or safety approval'},...disabled});
 await currentSource(root);need(await realpath(directory)===directory,'EVIDENCE_DIRECTORY_CHANGED');
 need(hash(await readBounded(directory,'SHA256SUMS',64*1024))===selector.evidenceSha256Sums,'EVIDENCE_SELECTOR_DIFFERS');
 const result=freeze({format:'FRESH35_PREDECESSOR_ANALYSIS_V2',state:'UNREVIEWED_PREDECESSOR_ANALYSIS',sourceBinding:binding,
  adapterSourcePin:{path:sourcePath,sha256:loadedSourceSha256},selector,artifactPins,evidencePins,consistency,
  dump,sourceTarget,captureContext,inventory,functions,objects,acl,dependencies:parsed('dependencies.json'),sharedDependencies:parsed('shared-dependencies.json'),modelEvidence,
  evidenceBytesMatchSelector:true,analysisOnly:true,...disabled});
 analyses.set(result,root);return result;
}
