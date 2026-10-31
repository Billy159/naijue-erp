"""Offline candidate: read metadata JSON, emit differences only. Never connects to a DB.
Input envelope: {sourceCommit, sourceSha256, observation:{manifest, identity,
migration_versions,catalog_sha256,source_routines_match,complete_write_xmin_acl_match,...}}
Expected envelope additionally: independentReview:{decision:'REVIEWED_EXPECTED_METADATA',reviewId:...}
Output is NOT an admission review, even when exact. No function source or credentials emitted.
"""
import sys,json,hashlib,re
from pathlib import Path

def need(v,c):
    if not v: raise ValueError(c)
def read(p):
    with Path(p).open('rb') as f: b=f.read(32*1024*1024+1)
    need(len(b)<=32*1024*1024,'INPUT_TOO_LARGE'); return json.loads(b),hashlib.sha256(b).hexdigest()
def digest(x): return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def index(rows,keys):
    need(isinstance(rows,list),'METADATA_ARRAY_REQUIRED'); out={}
    for r in rows:
        need(isinstance(r,dict) and all(k in r for k in keys),'METADATA_KEY_REQUIRED')
        key=tuple(str(r[k]) for k in keys); need(key not in out,'DUPLICATE_METADATA_KEY');out[key]=r
    return out

def compare(actual,expected):
    for x in [actual,expected]:
        need(re.fullmatch('[a-f0-9]{40}',x.get('sourceCommit','')) and re.fullmatch('[a-f0-9]{64}',x.get('sourceSha256','')),'SOURCE_BINDING_REQUIRED')
        need(isinstance(x.get('observation'),dict),'OBSERVATION_REQUIRED')
    review=expected.get('independentReview',{})
    need(review.get('decision')=='REVIEWED_EXPECTED_METADATA' and isinstance(review.get('reviewId'),str) and review['reviewId'].strip(),'INDEPENDENT_EXPECTED_REQUIRED')
    need((actual['sourceCommit'],actual['sourceSha256'])==(expected['sourceCommit'],expected['sourceSha256']),'SOURCE_BINDING_MISMATCH')
    a,e=actual['observation'],expected['observation'];am,em=a.get('manifest'),e.get('manifest')
    need(isinstance(am,dict) and isinstance(em,dict),'FULL_MANIFEST_REQUIRED')
    identity_keys={'database','database_oid','database_owner','current_user','session_user','server_version_num','server_addr','server_port','postmaster_start','replication_role'}
    for x,m in [(a,am),(e,em)]:
        ident=x.get('identity')
        need(isinstance(ident,dict) and set(ident)==identity_keys,'COMPLETE_IDENTITY_REQUIRED')
        need(all(isinstance(ident[k],str) and ident[k] for k in identity_keys-{'server_addr','server_port'}),'NONEMPTY_IDENTITY_REQUIRED')
        need(ident['current_user']==ident['session_user'] and ident['replication_role']=='origin','DIRECT_RUNTIME_ORIGIN_REQUIRED')
        need(re.fullmatch('[1-9][0-9]*',ident['database_oid']) and re.fullmatch('[1-9][0-9]*',ident['server_version_num']),'OID_VERSION_REQUIRED')
        need((ident['server_addr'] is None and ident['server_port'] is None) or (isinstance(ident['server_addr'],str) and ident['server_addr'] and type(ident['server_port']) is int and 0<ident['server_port']<65536),'TRANSPORT_REQUIRED')
        need(x.get('migration_versions')==m.get('migration_versions')==list(range(1,27)),'MIGRATION_1_26_REQUIRED')
        schema=m.get('schema')
        need(isinstance(schema,dict) and set(schema)=={'name','owner','acl'} and schema['name']=='naijue_erp' and all(isinstance(schema[k],str) and schema[k] for k in ['owner','acl']),'SCHEMA_REQUIRED')
    need(a['identity']==e['identity']==am.get('identity')==em.get('identity'),'EXACT_SAME_TARGET_ROLE_REQUIRED')
    need(em.get('format') in ['EXACT26_RUNTIME_CATALOG_EXPORT_V6','EXACT26_RUNTIME_CATALOG_EXPORT_V7','EXACT26_RUNTIME_CATALOG_EXPORT_V8','EXACT26_RUNTIME_CATALOG_EXPORT_PREPARATION13_V1'],'EXPECTED_V6_V7_V8_OR_PREPARATION13_REQUIRED')
    prep13=em['format']=='EXACT26_RUNTIME_CATALOG_EXPORT_PREPARATION13_V1'
    if prep13:
        for x in [a,e]:need(set(x)=={'manifest','identity','migration_versions','catalog_sha256','source_routines_match','preparation13_xmin_acl_match'},'EXACT_PREPARATION13_OBSERVATION_REQUIRED')
        need(a['identity']['database']=='demo_8877_v7_r1_rehearsal_20261031_01' and a['identity']['current_user']=='v7_r1_prepare_20261031_01','EXACT_PREPARATION13_TARGET_REQUIRED')
        tables=sorted(['audit_change','history_revision','import_batch','import_history_closure_manifest','import_source_row','inventory_ledger','operation_receipt','payment_account','payment_account_hall','payment_method','product','staff','user_account'])
        for m in [am,em]:
            cells=m.get('system_column_acls')
            need(isinstance(cells,list) and len(cells)==13 and sorted(c.get('table','') for c in cells)==tables and all(c.get('number')==-2 and c.get('name')=='xmin' for c in cells),'EXACT_PREPARATION13_CELLS_REQUIRED')
    for x in [a,e]:need(re.fullmatch('[a-f0-9]{64}',x.get('catalog_sha256','')),'REAL_CATALOG_HASH_REQUIRED')
    need(len(em.get('routines',[]))==(135 if prep13 or em['format'].endswith('_V6') else 137),'EXPECTED_ROUTINE_CLOSURE_REQUIRED')
    for m in [am,em]:
        need(isinstance(m.get('routines'),list),'ROUTINES_REQUIRED')
        for r in m['routines']:
            need(isinstance(r,dict) and all(re.fullmatch('[a-f0-9]{64}',r.get(k,'')) for k in ['body_sha256','definition_sha256']),'ROUTINE_HASH_REQUIRED')
    diffs=[]
    def add(section,key,field,av,ev):
        # Values are safe metadata hashes/booleans only. Never print arbitrary source or ACL text.
        diffs.append({'section':section,'key':list(key),'field':field,'actualValueSha256':None if av is None else digest(av),'expectedValueSha256':None if ev is None else digest(ev),'state':'missing' if av is None else 'unexpected' if ev is None else 'mismatch'})
        if field in {'body_sha256','definition_sha256','acl','privileges','owner','runtime_select','table_select','security_definer','login','superuser','inherit','create_role','create_db','replication','bypass_rls','admin','set','catalog_sha256'}:
            diffs[-1].update(actual=av,expected=ev)
    fields={'routines':['signature'],'relations':['name'],'columns':['table','number','name'],'system_column_acls':['table','number','name'],'triggers':['table','name'],'constraints':['table','name'],'indexes':['table','name'],'policies':['table','name'],'roles':['name'],'memberships':['role','member','grantor']}
    for section,keys in fields.items():
        ai=index(am.get(section),keys);ei=index(em.get(section),keys)
        if section not in {'policies','memberships'}: need(bool(ai) and bool(ei),'NONEMPTY_CATALOG_SECTION_REQUIRED')
        for key in sorted(set(ai)|set(ei)):
            if key not in ai or key not in ei:add(section,key,'object',ai.get(key),ei.get(key));continue
            for field in sorted(set(ai[key])|set(ei[key])):
                if field=='source':continue
                av,ev=ai[key].get(field),ei[key].get(field)
                if av!=ev:add(section,key,field,av,ev)
    for field in ['format','migration_versions','schema']:
        if am.get(field)!=em.get(field):add('manifest',(),field,am.get(field),em.get(field))
    for field in (['source_routines_match','preparation13_xmin_acl_match'] if prep13 else ['source_routines_match','recorded_live_balance_contract_match','complete_write_system_acl_match_v8','normal_delete_acl_match_v8'] if em['format'].endswith('_V8') else ['source_routines_match','complete_write_xmin_acl_match']+(['recorded_live_balance_contract_match'] if em['format'].endswith('_V7') else [])):
        if a.get(field) is not True or e.get(field) is not True:add('proof',(),field,a.get(field),e.get(field))
    if a['catalog_sha256']!=e['catalog_sha256']:add('observation',(),'catalog_sha256',a['catalog_sha256'],e['catalog_sha256'])
    return {'format':'RUNTIME26_OFFLINE_DIFF_CANDIDATE_V1','decision':'REFUSE' if diffs else 'EXACT_METADATA_ONLY_NOT_UPGRADE_AUTHORIZATION','differenceCount':len(diffs),'differences':diffs,'actualCatalogSha256':a['catalog_sha256'],'expectedCatalogSha256':e['catalog_sha256'],'sourceCommit':actual['sourceCommit'],'sourceSha256':actual['sourceSha256'],'warning':'Expected review provenance must be independently verified; JSON labels are not signatures. No DB or business tests executed.'}
if __name__=='__main__':
    try:
        need(len(sys.argv)==3,'USAGE_ACTUAL_EXPECTED_JSON'); a,ah=read(sys.argv[1]);e,eh=read(sys.argv[2]);r=compare(a,e);r.update(actualFileSha256=ah,expectedFileSha256=eh);print(json.dumps(r,ensure_ascii=False,indent=2));sys.exit(2 if r['decision']=='REFUSE' else 0)
    except (ValueError,KeyError,TypeError,AttributeError,OSError):
        print(json.dumps({'decision':'REFUSE','reason':'Invalid, incomplete or unbound metadata/independent expected input; no DB connection attempted.'}));sys.exit(2)
