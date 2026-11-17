"""Render the fixed mapped-file access probe; never run it locally or remotely."""
from pathlib import Path,PurePosixPath
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2];V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 rows_raw=(V/'ROOT08-EXECUTION-PREPARATION-01/job-bundle/source-rows.json').read_bytes()
 assert sha(rows_raw)=='3b8b77e94e5799ad399b97767d48e2b25f7f972b64d957e9666a89bf73d6f69e'
 source=json.loads(rows_raw);exclude='runtime/baseline-scope-input-pins.json'
 assert len(source)==392 and sum(x['path']==exclude for x in source)==1
 host='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3'
 state='/var/lib/naijue-erp/fresh35-production';op='installed-real-operation-batched-root08-20261117-01/operation'
 # STATE is the real outer bind. Do not skip its root08 directory ancestors.
 maps=[dict(name='state',hostRoot=host+'/state',targetRoot=state,basis='EXISTING_STATE_BIND'),
       dict(name='deploy',hostRoot='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261109-r1/deploy',targetRoot='/opt/naijue-erp/fresh35-combined-v1',basis='EXISTING_DEPLOY_BIND'),
       dict(name='deps',hostRoot='/srv/naijue-erp/isolated-targets/r3-e894-linux-deps-check-20261110-01/payload/node_modules',targetRoot=state+'/installed-real-operation-51724553-20261114-01/operation/node_modules',basis='EXISTING_517_OPERATION_NESTED_DEPENDENCY_BIND_NOT_ROOT08_ALIAS'),
       dict(name='record43',hostRoot=host+'/state/native-services/t45-first-r3-native-service-start-20261118-44/authority-61035',targetRoot='/etc/naijue-erp',basis='HISTORICAL44_IDENTICAL_INSTALLATION_RECORD_PROJECTION_NOT_FUTURE45'),
       dict(name='proof43',hostRoot=host+'/authority/r3-service-44-worker-proof',targetRoot='/run/naijue-rewrite',basis='HISTORICAL44_PROOF_PROJECTION_NOT_LIVE45')]
 needed={}
 def add(mapping,relative,kind='file',execute=False,list_directory=False):
  p=PurePosixPath(relative);assert not p.is_absolute()and'..'not in p.parts
  for parent in reversed(p.parents):
   name=str(parent);needed.setdefault((mapping,name),dict(map=mapping,relative=name,kind='directory',execute=True,listDirectory=False))
  needed[(mapping,str(p))]=dict(map=mapping,relative=str(p),kind=kind,execute=execute,listDirectory=list_directory)
 for row in source:
  if row['path']!=exclude:add(0,op+'/'+row['path'])
 refs=['INDEX.json',*[f'fresh35-install-review-plan-20261105-r2/{n}'for n in('00-BLOCKED-entry.sql','01-schema-REVIEW-ONLY.sql','02-lineage-REVIEW-ONLY.sql','candidate-source-pins.json','expected-core-metadata.json','expected-declared-metadata.json','migration-lineage.json')],
       'fresh35-v2-guard-schema-review-20261105-r2/expected-catalog-model.json','cloud-pg-schema178v2-20261105-r2/evidence/functions.json']
 for name in refs:add(1,'reference-inputs/'+name)
 for key,row in needed.items():
  if row['map']==1 and row['kind']=='directory'and(row['relative']=='reference-inputs'or row['relative'].startswith('reference-inputs/')):row['listDirectory']=True
 add(1,'runtime/node/bin/node',execute=True)
 add(3,'fresh35-combined-installation-v1.json');add(4,'current-production-service.json')
 add(2,'.',kind='directory')
 # Describe imports no third-party module. Limit the requested dependency
 # metadata to the existing fixed Linux-driver binding, not its writer graph.
 dependency_files=['.package-lock.json','pg/package.json','pg/esm/index.mjs']
 for name in dependency_files:add(2,name)
 value=dict(state='SOURCE_ONLY_FIXED_ORDINARY_DESCRIBE_ACCESS_PATHS',maps=maps,rows=list(needed.values()),dependencyFiles=dependency_files,sourceRowsSha256=sha(rows_raw),sourceFilesChecked=391,excludedPrivateSourceLeaf=exclude,referenceFiles=refs,actor=dict(uid=61035,gid=61035,groups=[]),newProjection45CheckedStaticallyOnly=True,liveNamespaceProven=False,dependencyImportResolutionVerified=False,bodyReads=False)
 (D/'DESCRIBE-ACCESS-PATHS.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
 print('Rendered fixed mapped access path set only; no access probe executed.')
if __name__=='__main__':main()
