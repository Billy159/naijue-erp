from pathlib import Path
import ast,difflib,hashlib,json
HERE=Path(__file__).resolve().parent
BASE=HERE.parent/'NORMAL35-NATIVE-SPEC-SUCCESSOR-UNISSUED-01/catalog_update/bundle'
CONTRACT=json.loads((HERE/'evidence/D1-HOST-UPGRADE-CONTRACT.json').read_bytes())
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def main():
 text=(BASE/'batched161_command_update_host.py').read_text();old=text
 def edit(a,b):
  nonlocal text
  assert text.count(a)==1,(a,text.count(a));text=text.replace(a,b,1)
 for a,b in {
  "KEY='t45-r3-batched161-command-successor-20261116-01'":"KEY=None  # Actual successor unissued.",
  "JOB=BASE/'jobs'/KEY":"JOB=BASE/'jobs'/KEY if KEY is not None else None",
  "START='t45-first-r3-native-service-start-20261116-35'":"START=None\nSERVICE_PROOF=None\nAPPLY_KEY=None\nADMIN_CONFIG=None\nPOLICY=None\nINNER_LEAF=None\nROOT08_MARKER_SHA256=None",
  "ADMIN='erp35_admin_20261110_r3'":"ADMIN=None",
  "REVIEWED_INPUT_SHA256='849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7'":'REVIEWED_INPUT_SHA256='+repr(CONTRACT['reviewedInputSha256']),
  "OPERATOR='installed-real-operation-batched-root06-20261116-01'":"OPERATOR='installed-real-operation-batched-root08-20261117-01'",
  "SOURCE_SET_SHA256='d20f9f89091f7a0c1006fdadf0c5fecc7711dc7398d8e2cf0471789c2f9ea898'":'SOURCE_SET_SHA256='+repr(CONTRACT['operatorSourceSetSha256']),
  "SOURCE_ROWS_SHA256='078f2c0019df117ae9a32e2276feebca9094ce6dc91e5eaede3f8d9201202fe9'":'SOURCE_ROWS_SHA256='+repr(CONTRACT['operatorRowsSha256']),
 }.items():edit(a,b)
 node=next(n for n in ast.parse(text).body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='PINS'for x in n.targets))
 pins={p.name:sha(p.read_bytes())for p in(HERE/'bundle').iterdir()if p.is_file()and p.name!='batched161_command_update_host.py'}
 edit(ast.get_source_segment(text,node),'PINS = '+repr(pins))
 constants='''
ROUTINE_PINS=ROUTINES_LITERAL
BEFORE_CATALOG={'sourceSetSha256':'cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c','catalogSpecSha256':'9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29','modelSha256':'626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811'}
HISTORICAL_INSTALL32_CATALOG={'sourceSetSha256':'b7aa9fa8766d53d06ab9bd335d047fe9830cc95e8df31333e942193221ba7269','catalogSpecSha256':'4be30c87bfea605a313e48a5a94e158f8cb7bb90d6d78aa00e4a0d28dfd14b26','modelSha256':'6e0a0e039eead7714d4e2ec6c995678860dee16d35e7282245bc5748eb565e85'}
AFTER_MODEL='ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'
SQL_SHA256='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184'
DIAGNOSTIC_KEY='t45-r3-core0-durable-readonly-20261117-02'
DIAGNOSTIC_READBACK_SHA256='b460ff5de8330945d9f65d17410f3b623808a4521c56815930a0364302ac13bf'
MAIN_DECISION_SHA256='b07d9ba7ea9320e387ec43a2d99cd93a30faf99bfa95bb60915d8d3d59071b78'

def runtime_bound():
    need(all(type(x)is str and x for x in (KEY,START,SERVICE_PROOF,ADMIN,APPLY_KEY,ADMIN_CONFIG,POLICY,INNER_LEAF,ROOT08_MARKER_SHA256)),
        'SETTLEMENT24_ACTUAL_RUNTIME_BINDINGS_UNISSUED')
    need(KEY not in ('t45-r3-batched161-command-successor-20261116-01','t45-r3-batched-real-execute-20261115-01',DIAGNOSTIC_KEY),
        'SETTLEMENT24_CONSUMED_KEY_REFUSED')
    need(re.fullmatch('[a-f0-9]{64}',ROOT08_MARKER_SHA256),'SETTLEMENT24_ACTUAL_ROOT08_REQUIRED')

'''.replace('ROUTINES_LITERAL',repr(CONTRACT['routinePins']))
 edit('\ndef scope():',constants+'\ndef scope():')
 for a,b in {
  "format='T45_R3_BATCHED161_COMMAND_SUCCESSOR_HOST_V1'":"format='T45_R3_SETTLEMENT24_THREE_ROUTINE_HOST_V1'",
  "decision='UPDATE_EXACT_DB05_SIX_ARG_COMMAND_ONLY'":"decision='UPDATE_EXACT_SETTLEMENT24_THREE_ROUTINES_ONLY'",
  'sourceSetSha256=SOURCE_SET_SHA256,sourceRowsSha256=SOURCE_ROWS_SHA256,':'sourceSetSha256=SOURCE_SET_SHA256,sourceRowsSha256=SOURCE_ROWS_SHA256,\n        diagnostic02ReadbackSha256=DIAGNOSTIC_READBACK_SHA256,MainRecoveryDecisionSha256=MAIN_DECISION_SHA256,',
  'def validate(a,at):\n    fixed=scope()':'def validate(a,at):\n    runtime_bound()\n    fixed=scope()',
  "d['format']=='FRESH35_BATCHED161_COMMAND_SUCCESSOR_PROGRAM_V1'":"d['format']=='FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1'",
  "and d['functionIdentity']=='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)'":"and d['functionIdentities']==[r['signature']for r in ROUTINE_PINS]\n        and d['routinePins']==ROUTINE_PINS and d['sqlSha256']==SQL_SHA256",
  "and d['installedBatchedCatalog']==a['batchedCatalog']\n        and d['predecessorBatchedCatalog']['modelSha256']==a['batchedCatalog']['modelSha256']\n        and d['batchedCatalog']['modelSha256']!=a['batchedCatalog']['modelSha256']":"and d['installedBatchedCatalog']==a['batchedCatalog']==BEFORE_CATALOG\n        and type(d['predecessorBatchedCatalog'])is dict\n        and set(d['predecessorBatchedCatalog'])=={'sourceSetSha256','catalogSpecSha256','modelSha256'}\n        and d['predecessorBatchedCatalog']['sourceSetSha256']=='6ef51045764dd091191f664ff14f48bf5c47b7e972dbf94f4fcf19b4e769ba82'\n        and d['predecessorBatchedCatalog']['modelSha256']==BEFORE_CATALOG['modelSha256']\n        and type(d['predecessorBatchedCatalog']['catalogSpecSha256'])is str\n        and re.fullmatch('[a-f0-9]{64}',d['predecessorBatchedCatalog']['catalogSpecSha256'])\n        and d['batchedCatalog']['modelSha256']==AFTER_MODEL",
  "and v['batchedCatalog']==a['batchedCatalog']":"and v['batchedCatalog']==HISTORICAL_INSTALL32_CATALOG",
  "    key='t45-r3-ordinary35-auth-apply-20261116-01'":"    key=APPLY_KEY",
  "p=HOST/'state/native-services/ordinary35-auth-20261116-01'/(ADMIN+'.json')":"p=Path(ADMIN_CONFIG)\n    need(p.is_relative_to(HOST/'state/native-services') and p.name==ADMIN+'.json','SETTLEMENT24_FIXED_ADMIN_CUSTODY_REQUIRED')",
  'def main():\n    need(':'def main():\n    runtime_bound()\n    need(',
  "policy=json.loads(read(BASE/'r3-05-write-continuity/direct35-batched-real.json'))":"policy=json.loads(read(Path(POLICY)))\n    need(Path(POLICY).parent==BASE/'r3-05-write-continuity','SETTLEMENT24_FIXED_POLICY_PARENT_REQUIRED')",
  'prior=installed(a)':"need(h.KEY==KEY and h.START==START and h.SERVICE_PROOF==SERVICE_PROOF,'SETTLEMENT24_EXACT_TRANSPORT_BINDINGS_REQUIRED')\n    prior=installed(a)\n    recovery_facts(a)",
  "apply_key='t45-r3-ordinary35-auth-apply-20261116-01'":"apply_key=APPLY_KEY",
  "m['state']=='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'":"m['state']=='SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED'\n        and sha(material)==ROOT08_MARKER_SHA256 and m['sourceFiles']==392\n        and m['SQLUpgradePerformed']is False and m['importReady']is False\n        and m['oldLineageProvesNewSQLInstalled']is False and m['sourceModelSha256']==AFTER_MODEL",
  "leaf=HOST/'state/native-services'/START/'authority-61035/fresh35-batched161-command-successor-v1.json'":"leaf=HOST/'state/native-services'/START/'authority-61035'/INNER_LEAF\n    need(Path(INNER_LEAF).name==INNER_LEAF,'SETTLEMENT24_FIXED_INNER_LEAF_REQUIRED')",
  "public['state']=='DB05_COMMAND_SUCCESSOR_APPLIED_AND_READ_BACK'":"public['state']=='SETTLEMENT24_THREE_ROUTINES_APPLIED_AND_READ_BACK'",
  "public.get('captureDirectoryLeaf')=='batched161-command-'+public['programSha256']":"public.get('captureDirectoryLeaf')=='settlement24-three-routine-'+public['programSha256']",
  "if os.path.isdir(JOB/'results'):":"if JOB is not None and os.path.isdir(JOB/'results'):",
 }.items():edit(a,b)
 start=text.index("    writer='t45-r3-batched-real-execute-20261115-01'\n");end=text.index('    free=os.statvfs(data)',start);text=text[:start]+text[end:]
 recovery=(HERE/'recovery_facts.fragment.py').read_text();edit('\ndef private_admin(h,a):',recovery+'\ndef private_admin(h,a):')
 ast.parse(text);(HERE/'bundle/batched161_command_update_host.py').write_text(text)
 (HERE/'HOST-MINIMUM-DELTA.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),text.splitlines(True),fromfile='accepted-catalog35-host.py',tofile='three-routine-host.UNBOUND.py')))
 print(json.dumps({'state':'HOST_THREE_ROUTINE_SOURCE_RUNTIME_UNISSUED','hostSha256':sha(text.encode())}))
if __name__=='__main__':main()
