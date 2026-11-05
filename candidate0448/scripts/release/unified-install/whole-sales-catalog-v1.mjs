/** Sales successor: same full physical catalogue/ACL query and independent OS
 * record trust boundary. No capture, installation, publication or permission grant. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadWholeCatalogSpec,WHOLE_CATALOG_QUERY,verifyWholeCatalogPacket} from './whole-catalog-gate.mjs';
import {renderWholeExplicitZeroCandidate} from './whole-explicit-zero-integration-candidate.mjs';
import {loadWholeSalesRecordV1} from './whole-sales-record-v1.mjs';
import {HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256} from '../../../packages/application/src/unified-import-contract.ts';
const trace='naijue_erp.standard_zero_amount_archive_trace(uuid)';
export const WHOLE_SALES_CATALOG_QUERY=WHOLE_CATALOG_QUERY.replace('(SELECT count(*) FROM funcs)=177','(SELECT count(*) FROM funcs)=178').replace(' AND (SELECT count(*) FROM caps)=2', ` AND (SELECT count(*) FROM caps)=2
 AND (SELECT count(*) FROM funcs p WHERE p.oid IN('naijue_erp.validate_sales_settlement()'::pg_catalog.regprocedure,'naijue_erp.reject_immutable_change()'::pg_catalog.regprocedure)
 AND p.proowner=(SELECT nspowner FROM ns)
 AND EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner OR a.is_grantable OR a.privilege_type<>'EXECUTE'))=2
 AND EXISTS(SELECT 1 FROM funcs p WHERE p.oid='${trace}'::pg_catalog.regprocedure AND p.prosecdef AND p.provolatile='s' AND p.prokind='f' AND p.proretset AND p.prorettype='record'::pg_catalog.regtype AND p.proowner=(SELECT nspowner FROM ns) AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC']
 AND p.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql') AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof
 AND p.proargnames=ARRAY['sales','record_id','sales_id','sales_source_key','source_namespace','proof']
 AND p.proargmodes=ARRAY['i','t','t','t','t','t']::pg_catalog."char"[]
 AND p.proallargtypes=ARRAY['uuid'::pg_catalog.regtype::oid,'uuid'::pg_catalog.regtype::oid,'uuid'::pg_catalog.regtype::oid,'text'::pg_catalog.regtype::oid,'text'::pg_catalog.regtype::oid,'jsonb'::pg_catalog.regtype::oid]
 AND pg_catalog.has_function_privilege('erp_unified27_importer_2393dbc6db9581c2',p.oid,'EXECUTE')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee NOT IN(p.proowner,'erp_unified27_importer_2393dbc6db9581c2'::pg_catalog.regrole) OR a.is_grantable OR a.privilege_type<>'EXECUTE'))`);
const specs=new WeakSet(),verifiedInstances=new WeakMap(),hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code)};
export async function loadWholeSalesSpecV1(root){
 const predecessor=await loadWholeCatalogSpec(root),candidate=await renderWholeExplicitZeroCandidate(root);
 const reviewedAclSignatures=['naijue_erp.reject_immutable_change()','naijue_erp.validate_sales_settlement()'];
 const aclChanges=candidate.manifest.aclChanges;
 need(Array.isArray(aclChanges)&&aclChanges.length===2&&new Set(aclChanges.map(c=>c?.signature)).size===2&&aclChanges.every(c=>c&&Object.keys(c).sort().join(',')==='after,before,operation,signature'&&reviewedAclSignatures.includes(c.signature)&&c.before==='DEFAULT_PUBLIC_EXECUTE'&&c.after==='OWNER_ONLY_EXECUTE'&&c.operation==='REVOKE_PUBLIC_EXECUTE'),'WHOLE_SALES_ACL_DELTA_INVALID');
 const acl_changes=Object.freeze([...aclChanges].sort((a,b)=>a.signature<b.signature?-1:1).map(c=>Object.freeze({...c})));
 const changes=candidate.manifest.routineChanges;
 const expected=['naijue_erp.standard_whole_package_closed_v2(uuid)','naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)','naijue_erp.validate_sales_settlement()',trace];
 need(changes.length===expected.length&&new Set(changes.map(c=>c.signature)).size===expected.length&&changes.every(c=>expected.includes(c.signature)),'WHOLE_SALES_PIN_DELTA_INVALID');
 const existingPins=predecessor.pins.map(pin=>{const change=changes.find(c=>c.signature===pin.signature);if(!change)return pin;need(pin.sha256===change.before,'WHOLE_SALES_PREDECESSOR_PIN_DIFFERS');return Object.freeze({...pin,sha256:change.after})});
 const added=changes.filter(c=>c.before===null);need(added.length===1&&added[0].signature===trace&&!predecessor.pins.some(p=>p.signature===trace),'WHOLE_SALES_PIN_DELTA_INVALID');
 const pins=Object.freeze([...existingPins,Object.freeze({signature:trace,sha256:added[0].after,search_path:'search_path=pg_catalog, naijue_erp, pg_temp'})]);
 need(changes.every(change=>pins.some(p=>p.signature===change.signature&&p.sha256===change.after)),'WHOLE_SALES_PIN_DELTA_INVALID');
 const sources=new Map();
 const add=pin=>{const prior=sources.get(pin.path);need(!prior||prior.sha256===pin.sha256,'WHOLE_SALES_SOURCE_PATH_CONFLICT');sources.set(pin.path,Object.freeze({...pin}))};
 for(const pin of [...predecessor.installation_sources,...candidate.manifest.sourcePins])add(pin);
 for(const path of ['scripts/release/unified-install/install-whole-sales-record-v1.mjs','scripts/release/unified-install/launch-whole-sales-install-v1.py','scripts/release/unified-install/preload-whole-sales-install-v1.mjs','scripts/release/unified-install/whole-sales-module-boundary.mjs','scripts/release/unified-install/whole-sales-platform-layout.mjs','scripts/release/unified-install/whole-sales-trusted-path.mjs','scripts/release/unified-install/publish-installation-record.mjs','scripts/release/unified-install/trusted-install-path.mjs','scripts/release/unified-install/record-whole-installation.mjs','scripts/release/unified-install/whole-sales-integration-candidate.mjs','scripts/release/unified-install/whole-explicit-zero-integration-candidate.mjs','packages/application/src/unified-explicit-zero-approval.ts','tools/unified-import/stream-preflight.mjs','tools/unified-import/stream-relations.mjs','tools/unified-import/stream-baseline-requests.mjs','scripts/release/unified-install/whole-sales-catalog-v1.mjs','scripts/release/unified-install/whole-sales-record-v1.mjs','scripts/release/unified-install/whole-sales-admission-v1.mjs','tools/unified-import/whole-package-host.mjs','tools/unified-import/whole-sales-host.mjs','tools/unified-import/whole-host-session.mjs','tools/unified-import/stream-import-cli.mjs','tools/unified-import/explicit-zero-cli-input.mjs','tools/unified-import/stream-preflight-cli.mjs','tools/unified-import/execution-plan.ts','tools/unified-import/stream-plan.mjs','tools/unified-import/stream-binding.mjs','packages/application/src/unified-import-contract.ts','tools/unified-import/stream-program.mjs','tools/unified-import/whole-package-sql-kernel.ts','packages/application/src/unified-import-execution.ts','packages/application/src/unified-import-execution-v2.ts','packages/application/src/unified-import-whole-package-profile.ts'])add({path,sha256:hash(await readFile(resolve(root,path)))});
 const installation_sources=Object.freeze([...sources.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0));
 const binding={format:'WHOLE_SALES_SOURCE_SPEC_V1',pins,acl_changes,installation_sources,predecessor_source_spec_sha256:predecessor.source_spec_sha256,combined_sql_sha256:candidate.manifest.sqlSha256,source_profile_sha256:HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256};
 const spec=Object.freeze({...binding,source_spec_sha256:hash(JSON.stringify(binding)+'\n'+WHOLE_SALES_CATALOG_QUERY)});specs.add(spec);return spec;
}
export async function verifyWholeSalesInstalledV1(client,spec){
 need(specs.has(spec),'WHOLE_SALES_GENUINE_SOURCE_SPEC_REQUIRED');
 // No caller-supplied record accepted. A missing record fails before any query.
 const reviewed=await loadWholeSalesRecordV1(spec);
 const ack=(r,tag)=>{const d=r&&Object.getOwnPropertyDescriptor(r,'command');need(d&&Object.hasOwn(d,'value')&&d.value===tag,'WHOLE_SALES_CATALOG_ACK_INVALID')};
 ack(await client.query('SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp'),'SET');
 const result=await client.query(WHOLE_SALES_CATALOG_QUERY,[JSON.stringify(spec.pins)]);ack(result,'SELECT');
 need(result.rows?.length===1&&typeof result.rows[0].catalog_json==='string','WHOLE_SALES_CATALOG_PACKET_INVALID');
 verifyWholeCatalogPacket(result.rows[0].catalog_json,reviewed,spec.source_spec_sha256);
 const verified=Object.freeze({...reviewed,profile:'WHOLE178_SALES_V1_INSTALLED_INSTANCE_MATCH',source_profile_sha256:spec.source_profile_sha256});
 verifiedInstances.set(verified,client);return verified;
}

/** One-use handoff from the actual fixed-record verifier to its same-client host. */
export function consumeWholeSalesVerificationV1(verified,client){
 need(verified&&verifiedInstances.get(verified)===client,'WHOLE_SALES_VERIFIED_INSTANCE_REQUIRED');
 verifiedInstances.delete(verified);return verified;
}
