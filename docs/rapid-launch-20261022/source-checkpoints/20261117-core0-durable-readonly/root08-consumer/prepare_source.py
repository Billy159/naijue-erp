"""Prepare only the eight reviewed SOURCE delta assets and fixed Root08 profile."""
from pathlib import Path
import hashlib,json,shutil
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
PARENT=ROOT/'outputs/D1/20261117-r3-root07-source-successor-01'
CURRENT=ROOT/'outputs/D1/20261117-r3-settlement24-current-wire-fix-source-01'
T45=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def save(path,value):path.write_text(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
def main():
 source=(CURRENT/'SOURCE-PINS.json').read_bytes();assert sha(source)=='76864577847c0ab030aaa78881bc24ffd5d5db288b2af1034eb5fc26f2061c3b'
 review=ROOT/'outputs/QB/20261117-r3-settlement24-current-wire-source-review-01/RESULT.json'
 assert sha(review.read_bytes())=='976ca7fd03741c81bab9d635c6577cbe5cc430b5e20ea9374621e8e530cb43bb'
 previous_raw=(PARENT/'source-rows.json').read_bytes();assert sha(previous_raw)=='74de5cbfd7315fbfa28be3f42087cb187709b16a0685dcca3a24ae1e66c3813e'
 rows_raw=(CURRENT/'source-rows.json').read_bytes();assert sha(rows_raw)=='3b8b77e94e5799ad399b97767d48e2b25f7f972b64d957e9666a89bf73d6f69e'
 old={r['path']:r for r in json.loads(previous_raw)};rows=json.loads(rows_raw);new={r['path']:r for r in rows}
 changed=[k for k in new if k in old and new[k]!=old[k]];added=[k for k in new if k not in old]
 assert len(old)==387 and len(new)==392 and len(changed)==3 and len(added)==5 and set(old)<=set(new)
 bundle=HERE/'bundle';bundle.mkdir(exist_ok=True)
 changes=[]
 for index,path in enumerate(changed+added):
  row=new[path];raw=(CURRENT/'operation'/path).read_bytes();assert len(raw)==row['bytes'] and sha(raw)==row['sha256']
  leaf=f'delta-{index:02}.asset';(bundle/leaf).write_bytes(raw)
  changes.append(dict(row,beforeSha256=old[path]['sha256']if path in old else None,payloadLeaf=leaf))
 (bundle/'source-rows.json').write_bytes(rows_raw)
 evidence={}
 for label,rel,pin in [
  ('parentWorker','ROOT07-MATERIALIZATION-SOURCE-01/bundle/materialize-batched-source.py','666adbbb3143aeccf88289cbd15277f806e2d9c5bc73ae3e9b2cbc34c7afb40a'),
  ('root07Marker','ROOT07-EXECUTION-PREPARATION-01/runtime/ACTUAL-ROOT07-MATERIALIZATION-ROOT.json','84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065'),
  ('closed39','NORMAL39-EXECUTION-PREPARATION-01/RESULT-NORMAL39-CLOSED-WRITER-FAILED.json','b8b2eb66f0d79d39a5a07aaa7afd56eb0d83d00efd465197e50e2a379a0be8f5'),
  ('writerFailed','NORMAL39-EXECUTION-PREPARATION-01/runtime/writer/READBACK-04.json','dbd5e1c4f8baa4d3489a9eda8fd7c29e5a834097aad6ba808e96aa07973e9aaa'),
  ('stop39','NORMAL39-EXECUTION-PREPARATION-01/runtime/stop/ACTUAL-STOP39-TERMINAL-RESULT.json','0fd93d487ab48b2ef141a194771a1c09a8bc100a7cd3f9c0a91d81949a83b2ac'),
  ('restore39','NORMAL39-EXECUTION-PREPARATION-01/runtime/restore/ACTUAL-RESTORE39-TERMINAL-RESULT.json','35faee2f3949882106463abb976d878859a49c1d0c0d7304dd7b20a1cd256d6c'),
 ]:
  path=T45/rel;assert sha(path.read_bytes())==pin;evidence[label]={'path':str(path),'sha256':pin}
 meta=json.loads((CURRENT/'DERIVED-METADATA.json').read_bytes())
 profile=dict(format='D1_ROOT08_EXACT_SOURCE_MATERIALIZATION_PROFILE_V1',requestKey='t45-r3-batched-root08-source-delta-20261117-01',
  outputDirectory='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root08-20261117-01',
  predecessorKey='t45-r3-batched-root07-source-delta-20261117-01',predecessorDirectory='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root07-20261117-01',
  predecessorMaterializationSha256=evidence['root07Marker']['sha256'],predecessorSourceRowsSha256=sha(previous_raw),
  predecessorSourceSetSha256='f9a7f170360185a2993b2e4e6d5fb3d1eb1767bcc325d71b72b2723c16faae7e',
  sourcePinsSha256=sha(source),sourceDecisionSha256='3b04898ea9050610f83295c51075c65dfeaf95c0566a1cd834b140df1085bef6',
  sourceReviewSha256=sha(review.read_bytes()),sourceRowsSha256=sha(rows_raw),sourceFiles=392,inheritedUnchangedFiles=384,
  sourceSetSha256=meta['sourceSetSha256'],catalogSourceSetSha256=meta['catalog']['sourceSetSha256'],catalogSpecSha256=meta['catalog']['catalogSpecSha256'],
  sourceModelSha256=meta['catalog']['modelSha256'],installedModelUnchangedByMaterialization=True,
  installerRunnerSha256='6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4',runnerDisposition='COPY_INHERITED_CODE_ONLY_NEVER_EXECUTE_OR_IMPORT',
  changes=changes,changedFiles=3,addedFiles=5,evidence=evidence,
  businessDurableState='UNKNOWN',workerNeverSubmitted=False,originalWriterStatus='FAILED',noSQLUpgrade=True,noImportReadyClaim=True,
  dataIdentity=[66304,13502421,61035,61035,448],minimumAvailableAfterBytes=28*1024**3,maximumOperationSeconds=300,
  rootRegistrationBasis=None,finiteAuthority=None,actualRoot08Marker=None,futureC=None,futureEpoch=None,clock=None)
 save(bundle/'source-profile.json',profile)
 print(json.dumps({'state':'ROOT08_LOCAL_PROFILE_PREPARED_NOT_EXECUTED','profileSha256':sha((bundle/'source-profile.json').read_bytes()),'deltaAssets':len(changes)}))
if __name__=='__main__':main()
