"""Generate the exact approved-wire successor from immutable current161 source."""
from pathlib import Path
import hashlib,json,shutil
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
BASE=ROOT/'outputs/D1/20261117-r3-root07-source-successor-01'
OP=HERE/'operation'
REL='scripts/release/unified-install/batched-import-v1/'
SQL_PATH='adapters/postgres/patches/settlement24-current-wire-successor.sql'
STEM='SETTLEMENT24-CURRENT-WIRE'
DECISION=ROOT/'outputs/主控/20261117-r3-settlement24-current-wire-source-fix-decision-01/DECISION.json'
DECISION_SHA='3b04898ea9050610f83295c51075c65dfeaf95c0566a1cd834b140df1085bef6'
NEW='b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05'
OLD='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'
NS='naijue:tplus:20261102'
MANIFEST='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
SIGNATURES=[
 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)',
 'naijue_erp.assert_document_migration(uuid)',
 'naijue_erp.standard_whole_package_verify_v2(jsonb,text)',
]
BEFORE=[
 ('cc11ea590f93b579a0e1286a2c28bd2fc7a6b423a366bc35ef54406a4cc46fba','3bcc7f4bd796df962c6794e1fe2b63e1a92df269f78d431af7b0fefc7f3c97b6'),
 ('508188784710a0bebaa7cf2d32e188f20ab82918e67a34b681d7b9d44951f5f4','3b44e33fd7d32d1ba33b2b520a1c62ac93f04c55198475d404eb2cdadd3e31ce'),
 ('8e490d4abdfaa1e8faa4a3ee3a7fe43d87c73521b1836818ae126db83acbbab8','fcad22a97e86d0b4c0226dbd6014600a7fecd9fa4923785aaf2983ee89b53eca'),
]
def sha(v):return hashlib.sha256(v.encode()if isinstance(v,str)else v).hexdigest()
def save(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
def norm(s):return s.replace('pg_catalog.','').replace('integer','int4')
def approved_gate(raw,namespace,manifest):
 return ('('+raw+"='"+OLD+"' OR ("+raw+"='"+NEW+"' AND ("+namespace+
         ") IS NOT DISTINCT FROM '"+NS+"' AND ("+manifest+") IS NOT DISTINCT FROM '"+MANIFEST+"'))")
def main():
 assert sha(DECISION.read_bytes())==DECISION_SHA
 decision=json.loads(DECISION.read_bytes());assert decision['sourceOnly']is True
 rows_raw=(BASE/'source-rows.json').read_bytes();assert sha(rows_raw)=='74de5cbfd7315fbfa28be3f42087cb187709b16a0685dcca3a24ae1e66c3813e'
 rows=json.loads(rows_raw);assert len(rows)==387
 assert next(r for r in rows if r['path']=='tools/unified-import/fresh35-host-session.mjs')['sha256']=='36f5e49c10a4e7541ed6a77cc377030b7ff343b7bd462ab2001a41040488d368'
 if not OP.exists():
  for row in rows:
   destination=OP/row['path'];destination.parent.mkdir(parents=True,exist_ok=True)
   shutil.copyfile(BASE/'operation'/row['path'],destination)
 bodies=json.loads((BASE/'operation'/REL/'COMMAND-SUCCESSOR-161-BODIES.json').read_bytes())
 definitions=json.loads((BASE/'operation'/REL/'COMMAND-SUCCESSOR-161-DEFINITIONS.json').read_bytes())
 model=json.loads((BASE/'operation'/REL/'COMMAND-SUCCESSOR-161-MODEL.json').read_bytes())
 changes=[]
 for signature,(before_body,before_def)in zip(SIGNATURES,BEFORE):
  body=bodies[signature];definition=definitions[signature]
  assert sha(body)==before_body and sha(definition)==before_def and definition.count(body)==1
  replacements=[]
  request='request'if signature==SIGNATURES[0]else'sr_request'if signature==SIGNATURES[1]else'init_request'
  atom="sr_wire->>'sha256'='"+OLD+"'"
  assert body.count(atom)==1
  replacements.append(dict(before=atom,after=approved_gate("sr_wire->>'sha256'","sr_approval->>'source_namespace'",request+"->>'package_manifest_sha256'")))
  if signature==SIGNATURES[0]:
   atom="cfg->'historical_settlement_retention_approval'->>'sha256'='"+OLD+"'"
   assert body.count(atom)==2
   # Distinguish the two exact CASE anchors; never replace an arbitrary count.
   for count in (24,26):
    before='CASE WHEN '+atom+' THEN '+str(count)
    assert body.count(before)==1
    replacements.append(dict(before=before,after='CASE WHEN '+approved_gate("cfg->'historical_settlement_retention_approval'->>'sha256'","initial_request->>'namespace'","initial_request->>'package_manifest_sha256'")+' THEN '+str(count)))
  after=body
  for change in replacements:
   assert after.count(change['before'])==1
   after=after.replace(change['before'],change['after'],1)
  after_def=definition.replace(body,after,1)
  changes.append(dict(signature=signature,beforeBodySha256=before_body,beforeDefinitionSha256=before_def,afterBodySha256=sha(after),afterDefinitionSha256=sha(after_def),replacements=replacements))
  bodies[signature]=after;definitions[signature]=after_def
  item=next(r for r in model['routines']if norm(r['signature'])==signature)
  assert item['bodySha256']==before_body and item['definitionSha256']==before_def
  item.update(bodySha256=sha(after),definitionSha256=sha(after_def))
 for kind,value in [('BODIES',bodies),('DEFINITIONS',definitions),('MODEL',model)]:save(OP/REL/(STEM+'-161-'+kind+'.json'),value)
 payload=json.dumps(changes,ensure_ascii=False,separators=(',',':'))
 sql="""-- Exact current161 three-routine approved-wire successor. No business data DML.
-- Execution still requires the existing owner/current-target/finite admission.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
SET LOCAL quote_all_identifiers=off;
DO $settlement24_current_wire$
DECLARE changes jsonb:=$settlement24_specs$PAYLOAD$settlement24_specs$::jsonb;
 change jsonb; edit jsonb; routine_oid oid; observed_body text; observed_definition text;
 next_body text; next_definition text; metadata_before jsonb; metadata_after jsonb;
BEGIN
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  routine_oid:=to_regprocedure(change->>'signature');
  IF routine_oid IS NULL THEN RAISE EXCEPTION 'SETTLEMENT24_PREDECESSOR_MISSING' USING ERRCODE='55000'; END IF;
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-ARRAY['oid','prosrc']
   INTO STRICT observed_body,observed_definition,metadata_before FROM pg_proc p WHERE p.oid=routine_oid;
  IF current_user IS DISTINCT FROM pg_get_userbyid((metadata_before->>'proowner')::oid)
   OR encode(sha256(convert_to(observed_body,'UTF8')),'hex') IS DISTINCT FROM change->>'beforeBodySha256'
   OR encode(sha256(convert_to(observed_definition,'UTF8')),'hex') IS DISTINCT FROM change->>'beforeDefinitionSha256' THEN
   RAISE EXCEPTION 'SETTLEMENT24_EXACT_PREDECESSOR_REQUIRED' USING ERRCODE='55000'; END IF;
  next_body:=observed_body;
  FOR edit IN SELECT value FROM jsonb_array_elements(change->'replacements') LOOP
   IF length(edit->>'before')=0 OR (length(next_body)-length(replace(next_body,edit->>'before','')))/length(edit->>'before')<>1 THEN
    RAISE EXCEPTION 'SETTLEMENT24_EXACT_SOURCE_ANCHOR_REQUIRED' USING ERRCODE='55000'; END IF;
   next_body:=replace(next_body,edit->>'before',edit->>'after');
  END LOOP;
  IF encode(sha256(convert_to(next_body,'UTF8')),'hex') IS DISTINCT FROM change->>'afterBodySha256'
   OR (length(observed_definition)-length(replace(observed_definition,observed_body,'')))/length(observed_body)<>1 THEN
   RAISE EXCEPTION 'SETTLEMENT24_EXACT_SUCCESSOR_REQUIRED' USING ERRCODE='55000'; END IF;
  next_definition:=replace(observed_definition,observed_body,next_body);
  IF encode(sha256(convert_to(next_definition,'UTF8')),'hex') IS DISTINCT FROM change->>'afterDefinitionSha256' THEN
   RAISE EXCEPTION 'SETTLEMENT24_EXACT_DEFINITION_REQUIRED' USING ERRCODE='55000'; END IF;
  EXECUTE next_definition;
  SELECT p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-ARRAY['oid','prosrc']
   INTO STRICT observed_body,observed_definition,metadata_after FROM pg_proc p WHERE p.oid=routine_oid;
  IF metadata_after IS DISTINCT FROM metadata_before
   OR encode(sha256(convert_to(observed_body,'UTF8')),'hex') IS DISTINCT FROM change->>'afterBodySha256'
   OR encode(sha256(convert_to(observed_definition,'UTF8')),'hex') IS DISTINCT FROM change->>'afterDefinitionSha256' THEN
   RAISE EXCEPTION 'SETTLEMENT24_EXACT_READBACK_REQUIRED' USING ERRCODE='55000'; END IF;
 END LOOP;
END $settlement24_current_wire$;
COMMIT;
""".replace('PAYLOAD',payload)
 (OP/SQL_PATH).write_text(sql)
 pins={kind:{'path':REL+STEM+'-161-'+kind+'.json','sha256':sha((OP/REL/(STEM+'-161-'+kind+'.json')).read_bytes())}for kind in ('MODEL','BODIES','DEFINITIONS')}
 descriptor=dict(format='FRESH35_SETTLEMENT24_CURRENT_WIRE_SUCCESSOR_PINS_V1',decisionSha256=DECISION_SHA,predecessorCommandReviewSha256='849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7',approved=dict(rawSha256=NEW,namespace=NS,manifestSha256=MANIFEST,documents=24,settlements=26,semanticFactsSha256=decision['approvedBatch']['semanticFactsSha256']),changes=changes,catalogInputs=pins,sqlPath=SQL_PATH,sqlSha256=sha(sql),routineCount=161,changedRoutines=3,otherRoutinesUnchanged=158,tables=35,columns=351,indexes=114,ownerSecuritySearchPathAndACLUnchanged=True,PGExecuted=False)
 save(OP/REL/(STEM+'-PINS.json'),descriptor)
 save(HERE/'ROUTINE-CHANGES.json',changes)
 print(json.dumps({'state':'GENERATED_SOURCE_ONLY_NOT_INSTALLED','changes':[{k:v for k,v in r.items()if k!='replacements'}for r in changes],'pinsSha256':sha((OP/REL/(STEM+'-PINS.json')).read_bytes())}))
if __name__=='__main__':main()
