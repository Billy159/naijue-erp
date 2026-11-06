#!/usr/bin/python3
"""Fixed machine-generated controller passfile -> existing CLI private JSON.
Inert on import. No SQL, account change, role extension, or secret output.
Execute only as a new original T45 controlled input-preparation job after review.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import time

PARENT_SHA='3f1dbe79c692a36ea7d509644a0bfe1e3e3c5cc1fd0905b385c612042f5650d7'
PROPOSAL={'database':'erp_native35_20261107_r1','admin':'erp35_admin_20261107_r1','owner':'erp35_owner_20261107_r1','controller':'erp35_controller_20261107_r1','runtime':'erp35_runtime_20261107_r1','host':'127.0.0.1','port':18651,'workspaceDirectory':'/var/lib/naijue-erp/fresh35-production/production-fresh35-20261107-r1'}

def need(value,code):
 if not value:raise ValueError(code)

def controller_config(authority,raw):
 # The pinned original creator writes exactly this format with token_hex(32).
 # We do not parse general user passfiles, wildcard hosts/roles, or DSNs.
 need(authority['proposal']==PROPOSAL,'CONTROLLER_EXACT_PROPOSAL_REQUIRED')
 need(type(raw) is bytes and raw.endswith(b'\n') and raw.count(b'\n')==1,'CONTROLLER_MACHINE_PASSFILE_REQUIRED')
 try:parts=raw[:-1].decode('ascii').split(':')
 except UnicodeError:raise ValueError('CONTROLLER_MACHINE_PASSFILE_REQUIRED') from None
 p=authority['proposal']
 need(len(parts)==5 and parts[:4]==[p['host'],str(p['port']),'*',p['controller']] and re.fullmatch('[a-f0-9]{64}',parts[4]),'CONTROLLER_MACHINE_PASSFILE_BINDING_DIFFERS')
 return {'host':p['host'],'port':p['port'],'database':p['database'],'user':p['controller'],'password':parts[4]}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--plan',required=True);parser.add_argument('--plan-sha256',required=True);parser.add_argument('--execute',action='store_true');args=parser.parse_args()
 need(args.execute and os.getuid()==0 and os.environ.get('ERP_SHARED_TASK_ID')=='T45','ORIGINAL_ROOT_T45_PREPARER_REQUIRED')
 job=Path(os.environ['ERP_SHARED_JOB_DIR']);need(job.parent==Path('/root/erp-release-20261006-01-worker/grant-5cc58239751e4e2a/jobs') and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,70}',job.name),'ORIGINAL_PRIVATE_JOB_REQUIRED')
 # Reuse already reviewed parent ownership/retention/physical-process checks.
 # This fixed companion is the ORIGINAL 3f1d parent, not a selectable module.
 parent=job/'bundle/fresh35-production-carrier.BUILD-BOUND.py';s=parent.lstat();need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and not s.st_mode&0o022,'CONTROLLER_REVIEWED_PARENT_REQUIRED')
 raw=parent.read_bytes();need(hashlib.sha256(raw).hexdigest()==PARENT_SHA,'CONTROLLER_REVIEWED_PARENT_DIFFERS')
 spec=importlib.util.spec_from_file_location('reviewed_production_parent',parent);module=importlib.util.module_from_spec(spec);exec(compile(raw,str(parent),'exec'),module.__dict__)
 module.trusted(job);module.trusted(parent);plan=module.load_production_plan(args.plan,args.plan_sha256)
 facts=module.production_facts(plan);need(facts['status']=='DURABLE_PRODUCTION_SHARED_NAMESPACE_FACTS_NOT_DEPLOYMENT_APPROVAL','CONTROLLER_EXACT_RETAINED_TARGET_REQUIRED')
 authority_raw=module.read_file(module.ROOT/'authority/fresh35-production-provision-v2.json',65536,True);authority,factory=module.production_authority(authority_raw)
 need(authority['proposal']==PROPOSAL and authority['startsAt']<=int(time.time()*1000)<authority['expiresAt'],'CONTROLLER_ORIGINAL_FIRST_WINDOW_REQUIRED')
 work=module.ROOT/'state'/Path(PROPOSAL['workspaceDirectory']).name
 actual=module.strict(module.read_file(work/'target-binding.json',1048576,True));created=facts['creationFacts']['target']
 need(actual==created and actual['proposal']==PROPOSAL and actual['physical']['serverVersionNum']=='170011','CONTROLLER_PHYSICAL_TARGET_DIFFERS')
 output=module.trusted(module.ROOT/'state/real-r3')/'controller-connection.json'
 need(not output.exists() and not output.is_symlink(),'CONTROLLER_REFERENCE_EXISTS_NO_REPLAY')
 secret=module.read_file(work/'credentials'/(PROPOSAL['controller']+'.pgpass'),1024,True);config=controller_config(authority,secret)
 # No passwords or connection strings in results/logging. An uncertain write
 # leaves its exact file for original-key recovery; it is never overwritten.
 need(int(time.time()*1000)<authority['expiresAt'],'CONTROLLER_ORIGINAL_FIRST_WINDOW_EXPIRED')
 module.new_json(output,config);del config,secret
 result={'status':'EXISTING_CONTROLLER_REFERENCE_PREPARED_ONLY','requestKey':job.name,'sourceSetSha256':module.SOURCE,'targetSha256':facts['sharedPostgresNamespace']['targetSha256'],'installationRecordSha256':facts['sharedPostgresNamespace']['installationRecordSha256'],'containerId':facts['cid'],'role':PROPOSAL['controller'],'database':PROPOSAL['database'],'expiresAt':authority['expiresAt'],'referencePath':'/var/lib/naijue-erp/fresh35-production/real-r3/controller-connection.json','mode':'0600','roleCreated':False,'roleExtended':False,'sqlExecuted':False,'businessDatabaseWrites':False,'automaticRetry':False}
 module.new_json(job/'results/controller-reference-result.json',result)

if __name__=='__main__':
 try:main()
 except Exception as error:
  print(json.dumps({'status':'STOP_OR_UNKNOWN_ORIGINAL_KEY_ONLY','errorCode':str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z0-9_]+',str(error)) else type(error).__name__,'automaticRetry':False}))
  raise SystemExit(2)
