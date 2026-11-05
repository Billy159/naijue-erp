/** Four source-pinned successor renderings for NEW EMPTY isolated installations.
 * Not a connector, approval, full catalogue admission or schema bootstrap.
 * Original SQL/body/lineage/count checks remain; physical pre-existing OIDs are
 * replaced by explicit metadata checks and same-transaction nonbody equality. */
import {createHash} from 'node:crypto';
export const PORTABLE_SUCCESSORS=Object.freeze({
'adapters/postgres/patches/0027_standard_import_category_alias_successor.sql':'886e63d9d7c308f1704c60cdd103e1b607180a6e02eb61cd65add7bb1d509bd5',
'adapters/postgres/patches/0027_standard_import_settlement_identity_successor.sql':'f360d17b11cdd42b54f55bc9de91426728e5870a6668ba82785c1061bf844190',
'adapters/postgres/patches/0027_standard_import_publish_verify_disambiguation_successor.sql':'df3d3698830dfe38baca73bf3cf71c756357d55b1f473d799cb4252ec51cb9f5',
'adapters/postgres/patches/0027_unified_live_history_dispatch_successor.sql':'15b400196725446d04757e431f27d815ed586a08b8c95ab73438ea1f1ead726f'});
const signatures={
assert_standard_import_operation:['uuid','void',true,false],validate_baseline_source_commit:['','trigger',false,true],assert_document_conversion_batch:['naijue_erp.import_batch,jsonb,text,boolean','void',false,false],guard_retained_settlement_identity:['','trigger',false,true],standard_import_command:['jsonb,text,text','jsonb',true,false],standard_import_verify:['jsonb,text','jsonb',true,false],history_numeric_ledger_set_guard:['','trigger',false,true]};
const literal=s=>"'"+s.replaceAll("'","''")+"'";
export function renderPortableFresh27Successor(path,source){
 if(typeof source!=='string'||createHash('sha256').update(source).digest('hex')!==PORTABLE_SUCCESSORS[path])throw Error('FRESH27_SUCCESSOR_SOURCE_DIFFERS');
 const names=[...source.matchAll(/CREATE OR REPLACE FUNCTION naijue_erp\.([a-z_]+)\(/g)].map(x=>x[1]);if(!names.length||new Set(names).size!==names.length||names.some(x=>!signatures[x]))throw Error('FRESH27_SUCCESSOR_FUNCTIONS_DIFFER');
 const specs=names.map(name=>{const[args,result,definer,publicExecute]=signatures[name];return{signature:`naijue_erp.${name}(${args})`,result,definer,publicExecute,importerExecute:name==='standard_import_verify',config:definer?['search_path=pg_catalog, naijue_erp','TimeZone=UTC']:['search_path=pg_catalog, naijue_erp']};});
 const gate=`
CREATE TEMP TABLE fresh27_before_metadata ON COMMIT DROP AS SELECT p.oid,(to_jsonb(p)-'prosrc') AS metadata FROM pg_catalog.pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace;
DO $portable$ DECLARE spec jsonb;p record;acl record; BEGIN
 FOR spec IN SELECT value FROM jsonb_array_elements(${literal(JSON.stringify(specs))}::jsonb) LOOP
  SELECT * INTO STRICT p FROM pg_proc WHERE oid=(spec->>'signature')::regprocedure;
  IF p.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR p.prokind<>'f' OR p.provolatile<>'v' OR p.proparallel<>'u' OR p.proisstrict OR p.proleakproof OR p.proretset OR p.prosecdef IS DISTINCT FROM (spec->>'definer')::boolean OR p.prorettype<>(spec->>'result')::regtype OR to_jsonb(p.proconfig) IS DISTINCT FROM spec->'config' OR p.procost<>100 OR p.prorows<>0 OR p.prosupport<>0 OR p.provariadic<>0 OR p.pronargdefaults<>0 OR p.proargdefaults IS NOT NULL OR p.proallargtypes IS NOT NULL OR p.proargmodes IS NOT NULL OR p.probin IS NOT NULL OR p.prosqlbody IS NOT NULL OR p.protrftypes IS NOT NULL THEN RAISE EXCEPTION 'FRESH27_ROUTINE_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
  FOR acl IN SELECT * FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) LOOP
   IF acl.privilege_type<>'EXECUTE' OR acl.grantor<>p.proowner OR (acl.grantee<>p.proowner AND (acl.is_grantable OR NOT((acl.grantee=0 AND (spec->>'publicExecute')::boolean) OR (acl.grantee='erp_unified27_importer_2393dbc6db9581c2'::regrole::oid AND (spec->>'importerExecute')::boolean)))) THEN RAISE EXCEPTION 'FRESH27_ROUTINE_ACL_UNSAFE' USING ERRCODE='42501'; END IF;
  END LOOP;
 END LOOP;
END $portable$;
`;
 const pattern=/encode\(sha256\(convert_to\(\(to_jsonb\(routine_row\)-'prosrc'\)::text,'UTF8'\)\),'hex'\)<>(?:pin->>'invariant_sha256'|'[a-f0-9]{64}')/g;
 const hits=[...source.matchAll(pattern)].length;if(hits!==(path.includes('publish_verify')?4:2))throw Error('FRESH27_REPLACEMENT_COUNT_DIFFERS');
 let sql=source.replace(pattern,"(to_jsonb(routine_row)-'prosrc') IS DISTINCT FROM (SELECT metadata FROM pg_temp.fresh27_before_metadata WHERE oid=routine_row.oid)");
 sql=sql.replace("SET LOCAL TimeZone='UTC';","SET LOCAL TimeZone='UTC';"+gate);
 if(!sql.includes(gate))throw Error('FRESH27_INSERTION_DIFFERS');
 const final=`DO $unchanged$ BEGIN IF EXISTS(SELECT 1 FROM pg_temp.fresh27_before_metadata b FULL JOIN (SELECT oid,to_jsonb(p)-'prosrc' AS metadata FROM pg_proc p WHERE pronamespace='naijue_erp'::regnamespace) a USING(oid) WHERE a.metadata IS DISTINCT FROM b.metadata) THEN RAISE EXCEPTION 'FRESH27_NONBODY_CATALOG_CHANGED' USING ERRCODE='55000'; END IF; END $unchanged$;\n`;
 return sql.replace(/COMMIT;\s*$/,final+'COMMIT;\n');
}
