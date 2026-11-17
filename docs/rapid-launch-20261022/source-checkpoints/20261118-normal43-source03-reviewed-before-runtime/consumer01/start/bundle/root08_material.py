"""Read only actual Root08 materialization; does not claim SQL was installed."""
from pathlib import Path
from types import ModuleType
import hashlib
HELPER='0fb01ca460ea35b48d2f28f303a91901af34083aee710bb61cc67d99e03a88da'
def validate(ops,control):
 job=Path(__file__).parent.parent;jobs=job.parent
 def read(path,maximum=65536,owner=0):
  assert path.lstat().st_uid==owner
  return ops.read_file(path,maximum,False,owner==0)
 raw=read(job/'bundle/source_lineage.py');assert hashlib.sha256(raw).hexdigest()==HELPER
 m=ModuleType('after42_source');exec(compile(raw,str(job/'bundle/source_lineage.py'),'exec'),m.__dict__)
 return m.validate_material(read,jobs,control,Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state'),job)
