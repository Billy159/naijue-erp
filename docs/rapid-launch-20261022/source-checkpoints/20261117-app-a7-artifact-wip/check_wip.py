"""Narrow AST/metadata-only WIP checks. Never invokes adapter, issuer or patcher."""
from pathlib import Path
import ast, hashlib, json
HERE=Path(__file__).resolve().parent
OLD=HERE.with_name('20261117-r3-two-fixed-artifact-admission-source-02')
ROOT=HERE.parents[2]
checks={}
def need(ok,name):
    assert ok,name
    checks[name]=True
def load(path):return json.loads(path.read_bytes())
def sha(raw):return hashlib.sha256(raw).hexdigest()
def parse(path):return ast.parse(path.read_bytes())
def functions(t):return {n.name:n for n in ast.walk(t)if isinstance(n,ast.FunctionDef)}
def constants(t):
    out={}
    for n in t.body:
        if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
            try:out[n.targets[0].id]=ast.literal_eval(n.value)
            except (ValueError,TypeError):pass
    return out
def dump(n):return ast.dump(n,include_attributes=False)

old_manifest=(OLD/'SOURCE-PINS.json').read_bytes()
need(sha(old_manifest)=='846aa1c8626d3a47cea3426a566e5e560e40f9a4ebea5c40040e62ef7266a662','old846SourcePreserved')
for leaf,row in json.loads(old_manifest)['files'].items():need(sha((OLD/leaf).read_bytes())==row['sha256'],'oldFrozen-'+leaf)
previous=load(OLD/'FIXED-PROFILES.json');draft=load(HERE/'FIXED-PROFILES.WIP.json')
ref=load(HERE/'APP-CANDIDATE-REFERENCE.json');tuple_=ref['tuple'];app=draft['profiles']['app']
need(tuple_['sourceCommit']=='a7bab2eec252e63b2ede61d2392cbd1f1bbb9728'and ref['sourceTree']=='bba4ce31d4a4bc72b29ff170b8836f7d18d4a8f5'and ref['parent']=='d728f3749cc8cf504fec6c51720562c5774b72c0','actualAppCommitTreeParentMetadata')
need(app['fixedScope']['archiveSha256']==tuple_['archiveSha256']=='13b8de7b328e791782bf39a99bf071df01cc05e768ea763418b4a785b6b99cc1'and app['fixedScope']['archiveBytes']==tuple_['archiveBytes']==7690353,'actualAppArchiveMetadataOnly')
need(app['fixedScope']['sourceSetSha256']==tuple_['nativeSourceSetSha256']=='57a302e1c06f420fb281084133a71ad8de3473dc86c59148b7efdb7642103abf','actualAppNativeSourceMetadata')
need(tuple_['manifestSha256']=='b74bf6fe9b215638552702f5879679cc9779e8a816b696dceb8e8adf0810b7a6','actualReleaseManifestMetadata')
need(set(app['fixedScope'])==set(previous['profiles']['app']['fixedScope']),'existingAppScopeSchemaNoUnownedExtraFields')
selection=load(Path(draft['sourceSelection']['path']))
need(sha(Path(draft['sourceSelection']['path']).read_bytes())==draft['sourceSelection']['sha256']=='b749f98a5477cae8b693c9362b0f209adf62915c31340872a0491768c088de3d','actualMainB749SourceSelection')
need(all(app['fixedScope'][k]==selection['app'][k]for k in ('artifactKey','targetDirectory','archiveSha256','archiveBytes','sourceSetSha256'))and all(app[k]==selection['app'][k]for k in ('installKey','restoreKey')),'fourNamesFromMainSourceSelectionNotGuessedRuntime')
need(draft['profiles']['private']==previous['profiles']['private'],'privateProfileExactlyUnchanged')
need((HERE/'REUSED-ARTIFACT-EVIDENCE.previous02.json').read_bytes()==(OLD/'REUSED-ARTIFACT-EVIDENCE.json').read_bytes(),'previousPrivateEvidenceRetainedByteExact')
need(draft['futureActiveRootBaseline']is draft['postWriterEvidencePaths']is draft['postWriterPhaseKeys']is draft['writerStopRestoreEvidence']is draft['stoppedService']is draft['dynamicAuthorityPins']is None,'allFutureBindingsRemainNone')
need(draft['receiverPairSource']is draft['receiverPairSourcePinsSha256']is draft['receiverPairReview']is draft['receiverPairReviewSha256']is None,'noFakeFinalReceiverPair')
need(app['bundlePins']['FIXED-SCOPE.json']is app['bundlePins']['receiver_client.py']is app['bundlePins']['reception_scope.py']is app['bundlePins']['root_policy.py']is None,'unownedAppSourcePinsRemainNone')
need((app['timeoutSeconds'],app['maximumWindowMs'])==(35,1080000)and(draft['profiles']['private']['timeoutSeconds'],draft['profiles']['private']['maximumWindowMs'])==(35,600000),'originalTimeoutsAndWindows')
module=parse(HERE/'r3_two_fixed_artifact_admission.py');mc=constants(module)
need(mc['WIP_PENDING']is True and len(mc['KEYS'])==4 and mc['PROFILES']==draft['profiles'],'adapterExplicitWIPWithFourSelectedSourceKeys')
oldf=functions(parse(OLD/'r3_two_fixed_artifact_admission.py'));newf=functions(module)
need(all(dump(n)==dump(newf[name])for name,n in oldf.items()if name!='__init__'),'allRuntimeReceiptAndStoppedBasisGatesUnchanged')
need(isinstance(newf['__init__'].body[0],ast.If)and any(isinstance(n,ast.Raise)for n in ast.walk(newf['__init__'].body[0])),'constructorRefusesBeforeIO')
newf['__init__'].body.pop(0)
need(dump(newf['__init__'])==dump(oldf['__init__']),'constructorOnlyAddsWIPGate')
producer=parse(HERE/'issue_profile.py');pc=constants(producer)
need(pc['WIP_PENDING']is True and all(pc[k]is None for k in ('PAIR','PAIR_SHA','PAIR_REVIEW','PAIR_REVIEW_SHA')),'producerNoInventedPair')
pf=functions(producer);opf=functions(parse(OLD/'issue_profile.py'))
need(dump(pf['validate_closed_receipts'])==dump(opf['validate_closed_receipts']),'actualWriterVerifiedSameCStopExactRestoreRequirementsUnchanged')
need(isinstance(pf['issue'].body[0],ast.Assert)and isinstance(pf['existing_inputs'].body[0],ast.Assert),'producerRefusesBeforeAnyInputsOrIssuance')
need(len(pf['issue'].args.args)==len(opf['issue'].args.args)==18,'originalExplicitTime18ArgumentProducerAPI')
text=(HERE/'issue_profile.py').read_text()
need("constants['NORMAL39_POLICY_SHA256']==baseline['normalPolicySha256']"in text and "constants['NORMAL39_MODULE_SHA256']==baseline['normalHelperSha256']"in text,'futureActualBaselineBindsActiveNormal39Constants')
patch=parse(HERE/'patch_dispatcher.py');patchc=constants(patch);patchf=functions(patch)
need(patchc['WIP_PENDING']is True and len(patchc['KEYS'])==4 and set(patchc['KEYS'])==set(mc['KEYS'])and isinstance(patchf['render'].body[0],ast.Assert),'purePatcherRefusesUntilFinalReceiverPair')
need('prior=normal39_continuation(core,prior,cfg)'in patchc['ADAPTER'],'artifactWrapperUsesCurrent39Chain')
opatchf=functions(parse(OLD/'patch_dispatcher.py'));patchf['render'].body.pop(0)
need(dump(patchf['render'])==dump(opatchf['render']),'pureRenderOnlyAddsWIPGateRetainsPrefixGuardsASTChecks')
for leaf in ('issue_profile.py','patch_dispatcher.py'):
    need(not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr in ('time','time_ns','now','utcnow','connect','flock')for n in ast.walk(parse(HERE/leaf))),'noNewClockPGOrLock-'+leaf)
for file in HERE.glob('*.py'):ast.parse(file.read_bytes());need(file.stat().st_size<=131072,'syntaxCap-'+file.name)
need(not(HERE/'SOURCE-PINS.json').exists()and not list(HERE.glob('*UNREGISTERED.py')),'noFrozenSourceOrFutureDispatcherPreview')
report=dict(state='WIP_STATIC_DELTA_CHECKED_FINAL_RECEIVER_PAIR_REQUIRED',sourceOnly=True,checks=checks,checkCount=len(checks),serverActions=0,PGConnections=0,nativeCalls=0,clockCalls=0,issuerInvocations=0,receiverInvocations=0,patcherInvocations=0,archivePayloadReads=0,privatePayloadReads=0,archivesRehashedRebuiltOrExtracted=False,positiveFutureFixtures=0,finalReceiverPairValidated=False,executionReady=False)
(HERE/'WIP-CHECKS.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
print(json.dumps(dict(state=report['state'],checks=len(checks)),sort_keys=True))
