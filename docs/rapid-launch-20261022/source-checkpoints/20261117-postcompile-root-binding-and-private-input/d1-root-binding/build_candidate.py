"""Local source delta only; preserve T45's frozen entry and ROOT06/native files."""
from pathlib import Path
import hashlib,difflib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
BASE=ROOT/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL34-APPLY02-CLI-SUCCESSOR-UNISSUED-01/start/bundle/batched161-run.mjs'
raw=BASE.read_bytes();assert hashlib.sha256(raw).hexdigest()=='820ad6f54f8ac06bceff6a5fd4903d73fe6fed033ac286e4b2bf8d0d93ce1e66'
old=raw.decode()
before="""  const options=helper.finalHostOptions(s,c);
  finalPreparationBinding=await api.describeFresh35FinalPreparationBinding(OPERATOR,options.referenceDirectory,
   options.currentService,options.parentPins,options.successorSha256,inputBinding,
"""
after="""  await targets.assertFresh35Installed154UpgradeTargetCurrent(target);
  finalPreparationBinding=api.buildFinalR3PreparationBinding(publicTarget,inputBinding,s.proofSha256,s.postmasterStart,
   {transactionMode:'BATCHED_V1',batchedDbCandidatePinsSha256:'dc08f911c509fc376f8b7e92ac94af788f9b31fb8871ca9af39b21c966597ab9',
    batchedSourceSetSha256:batchedCatalog.sourceSetSha256,batchedCatalogSpecSha256:batchedCatalog.catalogSpecSha256,
    batchedModelSha256:batchedCatalog.modelSha256},
"""
assert old.count(before)==1
new=old.replace(before,after)
(HERE/'source').mkdir(exist_ok=True)
(HERE/'source/batched161-run.mjs').write_text(new)
(HERE/'ENTRY.patch').write_text(''.join(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='T45-final-start34/batched161-run.mjs',tofile='D1-postcompile-fix/batched161-run.mjs')))
print('source-only entry delta; no T45/native files modified')
