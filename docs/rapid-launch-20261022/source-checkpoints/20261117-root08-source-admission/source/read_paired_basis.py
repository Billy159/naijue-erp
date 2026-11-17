"""Future original private root read after the diagnostic has actually cleaned up."""
from pathlib import Path
from datetime import datetime,timezone
import json,os,runpy
def main():
 assert os.getuid()==os.geteuid()==0
 api=runpy.run_path(str(Path(__file__).with_name('register_exact.py')),run_name='root08_paired_metadata_only')
 closure=api['quiet']();registry=api['basis']()
 cfg=json.loads(api['read'](api['P']/'grant.json')[0])
 stamp=datetime.now(timezone.utc).isoformat()
 return {'closure':dict(closure,checkedAtUTC=stamp),
  'registry':{'checkedAtUTC':stamp,'dispatcherSha256':api['OLD'],'oldIdentities':registry,
   'grantExpiresAtEpoch':cfg['expiresAtEpoch'],'PGConnections':0,'mutations':0,'registryOrJobSubmitted':False}}
if __name__=='__main__':print(json.dumps(main(),sort_keys=True))
