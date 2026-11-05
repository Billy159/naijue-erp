/** Offline fixed-cohort search_path hardening renderer. No SQL execution. */
import{readFile}from'node:fs/promises';import{resolve}from'node:path';import{createHash}from'node:crypto';import{loadFresh27Plan,describeFresh27Plan}from'./fresh27-plan.mjs';
/** Read only existing exact routine signatures; never silently skip a successor. */
export function readWholeSuccessorPins(sql,known){
 const matches=[...sql.matchAll(/CREATE OR REPLACE FUNCTION naijue_erp\.([a-z0-9_]+)\(([^)]*)\)\s+RETURNS[\s\S]*?AS\s*(\$[a-zA-Z0-9_]*\$)([\s\S]*?)\3;/g)];
 const declarations=sql.match(/CREATE OR REPLACE FUNCTION naijue_erp\./g)||[];
 if(!matches.length||matches.length!==declarations.length)throw Error('WHOLE_SUCCESSOR_ROUTINE_PARSE_REQUIRED');
 const normalize=signature=>signature.replaceAll('pg_catalog.','').replace(/\bboolean\b/g,'bool');
 const seen=new Set();
 return matches.map(([,name,args,_delimiter,body])=>{
  const prior=known.get(name),signature=`naijue_erp.${name}(${args.trim()?args.split(',').map(a=>a.trim().split(/\s+/).at(-1)).join(','):''})`;
  if(!prior||seen.has(name)||normalize(prior.signature)!==normalize(signature))throw Error('WHOLE_SUCCESSOR_SIGNATURE_DIFFERS');
  seen.add(name);return{name,signature:prior.signature,sha256:createHash('sha256').update(body).digest('hex')};
 });
}
export async function renderWholeSearchPathHardening(root){
 const p=describeFresh27Plan(await loadFresh27Plan({sourceRoot:root,profile:'FRESH27_SOURCE47_PLUS49_CODE_ONLY'}));const entries=new Map(p.routines.map(r=>[r.name,{signature:r.signature,sha256:r.body_sha256}]));
 for(const file of ['v2','guards_v2','intent_v2','source_commit_v2','zero_balance_v2','verify_v2']){const sql=await readFile(resolve(root,`adapters/postgres/patches/0027_standard_import_whole_package_${file}.sql`),'utf8');for(const m of sql.matchAll(/CREATE OR REPLACE FUNCTION naijue_erp\.([a-z0-9_]+)\((.*?)\) RETURNS[\s\S]*?AS\s*(\$[a-zA-Z0-9_]*\$)([\s\S]*?)\3;/g)){const[,name,args,_delimiter,body]=m;entries.set(name,{signature:`naijue_erp.${name}(${args.trim()?args.split(',').map(a=>a.trim().split(/\s+/).at(-1)).join(','):''})`,sha256:createHash('sha256').update(body).digest('hex')});}}
 for(const successor of ['0027_document_specification_barcodes_successor.sql','0027_product_nullable_scheme_successor.sql','0027_published_settlement_identity_successor.sql','0027_standard_known_balance_runtime_v2.sql','0027_whole_conversion_prefix_counts_v2.sql']){
  const sql=await readFile(resolve(root,'adapters/postgres/patches/'+successor),'utf8');
  for(const {name,signature,sha256} of readWholeSuccessorPins(sql,entries))entries.set(name,{signature,sha256});
 }
 if(entries.size!==176)throw Error('WHOLE_EXACT_176_ROUTINES_REQUIRED');const pins=[...entries.values()].sort((a,b)=>a.signature.localeCompare(b.signature));
 return `-- Fixed source-cohort path hardening, SOURCE ONLY / NOT ENGINE TESTED.
-- Install only in the reviewed exclusive installation window. No role/ACL changes.
BEGIN;SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $paths$ DECLARE pin jsonb;routine_row record;before_row jsonb;after_row jsonb;expected_config text[];
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>176 THEN RAISE EXCEPTION 'WHOLE_PATH_COHORT_DIFFERS'; END IF;
 FOR pin IN SELECT value FROM jsonb_array_elements($pins$${JSON.stringify(pins)}$pins$::jsonb) LOOP
  SELECT * INTO STRICT routine_row FROM pg_catalog.pg_proc WHERE oid=(pin->>'signature')::regprocedure;
  IF routine_row.proowner<>current_user::regrole::oid OR routine_row.proowner<>(SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp') OR encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex') IS DISTINCT FROM pin->>'sha256' OR NOT (CASE pin->>'signature' WHEN 'naijue_erp.valid_history_counts(pg_catalog.jsonb)' THEN routine_row.proconfig IS NULL WHEN 'naijue_erp.history_closure_count_map(pg_catalog.jsonb,pg_catalog.text[])' THEN routine_row.proconfig=ARRAY['search_path=pg_catalog'] ELSE (SELECT count(*) FROM unnest(routine_row.proconfig) c WHERE c LIKE 'search_path=%')=1 AND (routine_row.proconfig @> ARRAY['search_path=pg_catalog, naijue_erp'] OR routine_row.proconfig @> ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']) END) THEN RAISE EXCEPTION 'WHOLE_PATH_SOURCE_OR_METADATA_DIFFERS'; END IF;
 END LOOP;
 FOR pin IN SELECT value FROM jsonb_array_elements($pins$${JSON.stringify(pins)}$pins$::jsonb) LOOP
  SELECT to_jsonb(p) INTO STRICT before_row FROM pg_catalog.pg_proc p WHERE oid=(pin->>'signature')::regprocedure;
  expected_config:=CASE WHEN before_row->'proconfig'='null'::jsonb THEN ARRAY['search_path=pg_catalog'] ELSE ARRAY(SELECT CASE WHEN c='search_path=pg_catalog, naijue_erp' THEN 'search_path=pg_catalog, naijue_erp, pg_temp' ELSE c END FROM jsonb_array_elements_text(before_row->'proconfig') WITH ORDINALITY t(c,n) ORDER BY n) END;
  IF pin->>'signature' IN ('naijue_erp.valid_history_counts(pg_catalog.jsonb)','naijue_erp.history_closure_count_map(pg_catalog.jsonb,pg_catalog.text[])') THEN
   EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog',(pin->>'signature')::regprocedure);
  ELSE
   EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog, naijue_erp, pg_temp',(pin->>'signature')::regprocedure);
  END IF;
  SELECT to_jsonb(p) INTO STRICT after_row FROM pg_catalog.pg_proc p WHERE oid=(pin->>'signature')::regprocedure;
  IF after_row-'proconfig' IS DISTINCT FROM before_row-'proconfig' OR after_row->'proconfig' IS DISTINCT FROM to_jsonb(expected_config) THEN RAISE EXCEPTION 'WHOLE_PATH_UNEXPECTED_CHANGE'; END IF;
 END LOOP;
END $paths$;COMMIT;
`;
}
