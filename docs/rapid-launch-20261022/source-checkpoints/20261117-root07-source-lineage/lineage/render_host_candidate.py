"""Render only a representative host delta; never edit a T45-owned bundle."""
from pathlib import Path
import hashlib
import difflib
import ast

H = Path(__file__).resolve().parent
BASE = H.parents[1] / 'T45/revisions/20261116-r3-batched161-formal-run-package-local-01/PREPARE04-REFERENCEERROR-CONSUMER-WIP-01/prepare/bundle/final33_host.py'
raw = BASE.read_bytes()
sha = lambda b: hashlib.sha256(b).hexdigest()
assert sha(raw) == 'a33dccffa138233096e4ff420675562646fe1e330ca4ef8e13a00776ab1b217a'
a = raw.decode()
once = lambda text, old, new: text.replace(old, new) if text.count(old) == 1 else (_ for _ in ()).throw(AssertionError(old))
b = once(a, "OPERATOR='installed-real-operation-batched-root06-20261116-01'", "OPERATOR='installed-real-operation-batched-root07-20261117-01'")
b = once(b, "SOURCE_ROWS_SHA256='078f2c0019df117ae9a32e2276feebca9094ce6dc91e5eaede3f8d9201202fe9'", "SOURCE_ROWS_SHA256='74de5cbfd7315fbfa28be3f42087cb187709b16a0685dcca3a24ae1e66c3813e'")
b = once(b, "SOURCE_SET_SHA256='d20f9f89091f7a0c1006fdadf0c5fecc7711dc7398d8e2cf0471789c2f9ea898'", "SOURCE_SET_SHA256='f9a7f170360185a2993b2e4e6d5fb3d1eb1767bcc325d71b72b2723c16faae7e'")
b = once(b, "'inputMaterializationResultSha256'}", "'inputMaterializationResultSha256','sourceLineage'}")
b = once(b, "binding.get('batchedSourceSetSha256')=='cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c'", "binding.get('batchedSourceSetSha256')=='db127efd32e1953fa550e56bd715b6ea334cc9d7e141217c4da8151bcd8c7803'")
b = once(b, "binding.get('batchedCatalogSpecSha256')=='9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29'", "binding.get('batchedCatalogSpecSha256')=='344ccd895e1e65dedf0fdae5be71e291a6226ba5c21d9c0f4276b2be5490f362'")
b = once(b, 'def applied_catalog_successor(a):', 'def historical_applied_catalog_successor(a):')
old = " binding=a['expectedBinding']\n expected=dict(sourceSetSha256=binding['batchedSourceSetSha256'],catalogSpecSha256=binding['batchedCatalogSpecSha256'],\n  modelSha256=binding['batchedModelSha256'])"
new = " expected=dict(sourceSetSha256='cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c',\n  catalogSpecSha256='9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29',\n  modelSha256='626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811')"
b = once(b, old, new)
helper_pin = sha((H / 'source_lineage.py').read_bytes())
wrapper = "\n\ndef applied_catalog_successor(a):\n historical_applied_catalog_successor(a)\n helper=load('source_lineage.py'," + repr(helper_pin) + ")\n helper.validate(a,read,JOBS,CONTROL,HOST_STATE,JOB)\n"
b = once(b, '\ndef current(support,a,old,apply):', wrapper + '\ndef current(support,a,old,apply):')
ast.parse(b)
(H / 'final33_host.SOURCE-CANDIDATE.py').write_text(b)
(H / 'FINAL33-HOST-NOT-APPLIED.patch').write_text(''.join(difflib.unified_diff(a.splitlines(True), b.splitlines(True), fromfile=str(BASE), tofile='D1/final33_host.SOURCE-CANDIDATE.py')))
print('Rendered strict historical catalog35 + actual ROOT07 lineage candidate only; T45 bundles untouched')
