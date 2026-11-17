"""Narrow new-pair metadata and AST checks; actual39/profile-None pure preview only."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OLD=HERE.with_name('20261117-r3-two-fixed-artifact-admission-source-02')
checks={}
def need(ok,name):
    assert ok,name
    checks[name]=True
def sha(raw):return hashlib.sha256(raw).hexdigest()
def load(path):return json.loads(path.read_bytes())
def tree(path):return ast.parse(path.read_bytes())
def dump(n):return ast.dump(n,include_attributes=False)
def functions(t):return {n.name:n for n in ast.walk(t)if isinstance(n,ast.FunctionDef)}
def constants(t):
    out={}
    for n in t.body:
        if isinstance(n,ast.Assign)and len(n.targets)==1 and isinstance(n.targets[0],ast.Name):
            try:out[n.targets[0].id]=out[n.value.id]if isinstance(n.value,ast.Name)else ast.literal_eval(n.value)
            except (ValueError,TypeError):pass
    return out

cfg=load(HERE/'FIXED-PROFILES.json');profiles=cfg['profiles'];ref=load(HERE/'APP-CANDIDATE-REFERENCE.json')
selection_raw=Path(cfg['sourceSelection']['path']).read_bytes();selection=json.loads(selection_raw)
need(sha(selection_raw)==cfg['sourceSelection']['sha256']=='b749f98a5477cae8b693c9362b0f209adf62915c31340872a0491768c088de3d','actualMainB749')
pair=Path(cfg['receiverPairSource']).parent;peer_raw=(pair/'SOURCE-PINS.json').read_bytes();peer=json.loads(peer_raw)
need(sha(peer_raw)==cfg['receiverPairSourcePinsSha256']=='179d65977bd82c43f136ce4ff8323227a457f500fd750bbda700d56a6a43215f','actualPair179')
need(peer['mainSourceSelection']==cfg['sourceSelection'],'peerUsesSameMainSelection')
previous_pair=load(pair.with_name('ARTIFACT-ROOT-PAIRING-SOURCE-01')/'SOURCE-PINS.json')
changed={name for name,pin in peer['files'].items()if pin!=previous_pair['files'][name]}
need(changed=={'app/FIXED-SCOPE.json','app/reception_scope.py','app/APP-READY.LOCAL.json','app/APP-PACK-RECEIPT.json'},'onlyFourActualPeerLeavesChanged')
for leaf in sorted(changed):need(sha((pair/leaf).read_bytes())==peer['files'][leaf],'actualNewLeaf-'+leaf)
need(all(peer['files'][n]==pin for n,pin in previous_pair['files'].items()if n not in changed),'inheritedPeerPinsReusedNoFullRehash')
previous=load(OLD/'FIXED-PROFILES.json')
need(profiles['private']==previous['profiles']['private'],'privateScopeBundleKeysByteMetadataUnchanged')
need((HERE/'REUSED-ARTIFACT-EVIDENCE.previous02.json').read_bytes()==(OLD/'REUSED-ARTIFACT-EVIDENCE.json').read_bytes(),'privatePayloadEvidenceReusedNoPayloadIO')
for kind,row in profiles.items():
    need(set(row['fixedScope'])==set(previous['profiles'][kind]['fixedScope']),kind+'OriginalScopeSchema')
    need(all(row['bundlePins'][leaf]==peer['files'][kind+'/'+leaf]for leaf in row['bundlePins']),kind+'ExactFinalBundlePins')
    need(all(row[key]==selection[kind][key]for key in ('installKey','restoreKey')),kind+'ExactMainKeys')
need(profiles['app']['fixedScope']==load(pair/'app/FIXED-SCOPE.json'),'actualAppScopeMatchesRootProducer')
need(all(profiles['app']['fixedScope'][key]==selection['app'][key]for key in ('archiveSha256','archiveBytes','sourceSetSha256','artifactKey','targetDirectory')),'appTupleMainScopePairThreeWay')
need(ref['tuple']['sourceCommit']==selection['app']['commit']and ref['sourceTree']==selection['app']['tree']and ref['parent']==selection['app']['parent']and ref['tuple']['manifestSha256']==selection['app']['releaseManifestSha256'],'commitTreeManifestRemainMetadataOnly')
scope=tree(pair/'app/reception_scope.py');sc=constants(scope)
pins_return=next(n for n in ast.walk(functions(scope)['pins'])if isinstance(n,ast.Return)).value.elts[0]
metadata={n.arg:ast.literal_eval(n.value)for n in pins_return.keywords if n.arg!='archiveBytes'}
need(metadata['readyBytes']==1905 and metadata['readySha256']==profiles['app']['bundlePins']['APP-READY.LOCAL.json']and metadata['packReceiptBytes']==584 and metadata['packReceiptSha256']==profiles['app']['bundlePins']['APP-PACK-RECEIPT.json'],'scopePinsBindActualReadyAndPackMetadata')
need(sc['KEY']==profiles['app']['fixedScope']['artifactKey']and sc['INSTALL']==profiles['app']['installKey']and sc['RESTORE']==profiles['app']['restoreKey']and sc['FIELDS']==sc['PROFILE']==peer['files']['app/FIXED-SCOPE.json'],'scopeConstantsSameSelectedTuple')
for name in ('futureActiveRootBaseline','postWriterEvidencePaths','postWriterPhaseKeys','writerStopRestoreEvidence','stoppedService','dynamicAuthorityPins','fourKeysActualAbsence'):need(cfg[name]is None,'future-'+name)
need(cfg['receiverPairReview']is cfg['receiverPairReviewSha256']is None,'noInventedQAReportOrSHA')
mod=tree(HERE/'r3_two_fixed_artifact_admission.py');mc=constants(mod)
need(mc['WIP_PENDING']is False and mc['PROFILES']==profiles and len(mc['KEYS'])==4,'finalFourKeyRuntimeSourceOnly')
oldf=functions(tree(OLD/'r3_two_fixed_artifact_admission.py'));newf=functions(mod)
need(all(dump(n)==dump(newf[name])for name,n in oldf.items()if name!='__init__'),'priorRuntimeVerifiedWriterStopRestoreMethodsUnchanged')
newf['__init__'].body.pop(0)
need(dump(newf['__init__'])==dump(oldf['__init__']),'constructorOnlyAddsCompletionGate')
issuer=tree(HERE/'issue_profile.py');ic=constants(issuer);iff=functions(issuer)
need(ic['WIP_PENDING']is False and ic['PAIR_SHA']==cfg['receiverPairSourcePinsSha256'],'producerFinalPeerPin')
need(len(iff['issue'].args.args)==18 and len(iff['existing_inputs'].args.args)==1,'original18ArgumentProducerOnlyInternalJointReportParameter')
need(dump(iff['validate_closed_receipts'])==dump(functions(tree(OLD/'issue_profile.py'))['validate_closed_receipts']),'existingClosedReceiptValidatorReused')
itext=(HERE/'issue_profile.py').read_text()
need("review['pairSourcePinsSha256']==PAIR_SHA and review['pairedScopesReviewed']is True"in itext and "review['sourcePinsSha256']==sha((HERE/'SOURCE-PINS.json').read_bytes())"in itext,'oneActualJointReviewMustBindBothFrozenSources')
need('PAIR_REVIEW_SHA'not in itext and "source=existing_inputs(review)"in itext,'noPrewrittenFuturePairReview')
need("constants['NORMAL39_POLICY_SHA256']==baseline['normalPolicySha256']"in itext and "constants['NORMAL39_MODULE_SHA256']==baseline['normalHelperSha256']"in itext,'actualFutureBaselineUsesCurrent39NotHistorical38')
need(not any(isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr in ('time','time_ns','now','utcnow','connect','flock')for n in ast.walk(issuer)),'explicitTimeProducerNoClockPGOrLock')
patch=runpy.run_path(str(HERE/'patch_dispatcher.py'),run_name='pure_actual39_patch_source')
need(patch['WIP_PENDING']is False and set(patch['KEYS'])==set(mc['KEYS'])and len(patch['KEYS'])==4,'sameFourKeysInPatchAndRuntime')
need('prior=normal39_continuation(core,prior,cfg)'in patch['ADAPTER'],'artifactAdmissionWrapsCurrent39Factory')
actual_path=ROOT/'outputs/主控/20261117-r3-normal39-registration-window-01/admin_exec.ISSUED.py'
actual=actual_path.read_bytes();actual_pin='eabf10a911740fc864165ff9d5e66f0e654edc755b31299924755f91aa050206'
need(sha(actual)==actual_pin,'actualObservedRegistered39SourceOnly')
preview=patch['render'](actual,actual_pin,sha((HERE/'r3_two_fixed_artifact_admission.py').read_bytes()),None)
oldtree=ast.parse(actual);newtree=ast.parse(preview);oldc=constants(oldtree);newc=constants(newtree)
need(len(oldc['R3_ORIGINAL02_ABSENT_KEYS'])==107 and newc['R3_ORIGINAL02_ABSENT_KEYS']==oldc['R3_ORIGINAL02_ABSENT_KEYS']+list(patch['KEYS'])and len(newc['R3_ORIGINAL02_ABSENT_KEYS'])==111,'107PrefixAppendOnlyFourEquals111')
need(newc['FIXED_ARTIFACT_PROFILE_SHA256']is None,'previewHasNoFiniteProfile')
need(newc['NORMAL39_POLICY_SHA256']==oldc['NORMAL39_POLICY_SHA256']and newc['NORMAL39_MODULE_SHA256']==oldc['NORMAL39_MODULE_SHA256']and newc['R3_ORIGINAL02_ABSENT_POLICY_SHA256']==oldc['R3_ORIGINAL02_ABSENT_POLICY_SHA256'],'active39AndHistorical38DigestConstantsPreserved')
oldtop={n.name:n for n in oldtree.body if isinstance(n,ast.FunctionDef)};newtop={n.name:n for n in newtree.body if isinstance(n,ast.FunctionDef)}
need(all(dump(n)==dump(newtop[name])for name,n in oldtop.items()if name!='execute'),'allOldFunctionsIncludingBothNormalAndRoot07AdaptersExact')
execute=ast.get_source_segment(preview.decode(),newtop['execute'])
need(execute.index('in FIXED_ARTIFACT_KEYS')<execute.index('hold.admit(')and execute.count('hold.admit(')==1,'artifactFourKeysBeforeOnlyAdmission')
need(len(preview)<=131072,'previewWithinSourceCap')
(HERE/'KNOWN39-PATCH-PREVIEW.UNREGISTERED.py').write_bytes(preview)
for file in HERE.glob('*.py'):ast.parse(file.read_bytes());need(file.stat().st_size<=131072,'syntaxCap-'+file.name)
report=dict(state='LOCAL_NARROW_SOURCE_DELTA_CHECKED_NOT_ADMITTED_OR_ISSUED',sourceOnly=True,checks=checks,checkCount=len(checks),pairSourcePinsSha256=cfg['receiverPairSourcePinsSha256'],previewBaselineSha256=actual_pin,previewBaselineMeaning='Actual registered39 observed history, not future postwriter baseline',previewProfileSha256=None,futureActualPostWriterBaseline=None,actualFourKeyAbsence=None,serverActions=0,PGConnections=0,nativeCalls=0,clockCalls=0,issuerInvocations=0,receiverInvocations=0,archivesRehashedRebuiltOrExtracted=False,archivePayloadReads=0,privatePayloadReads=0,positiveFutureFixtures=0,reviewRequired=True,executionReady=False)
(HERE/'LOCAL-CHECKS.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
print(json.dumps(dict(state=report['state'],checks=len(checks)),sort_keys=True))
