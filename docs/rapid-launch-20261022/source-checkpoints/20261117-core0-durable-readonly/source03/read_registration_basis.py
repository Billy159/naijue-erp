"""Original private root channel only, future metadata read; no registration."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,runpy
def main():
 assert os.getuid()==os.geteuid()==0
 entry=Path(__file__).with_name('register_exact.py')
 # Exact code/pin is part of the frozen SOURCE reviewed before staging.
 api=runpy.run_path(str(entry),run_name='readonly_registration_basis')
 api['quiet']()
 return {'checkedAtUTC':datetime.now(timezone.utc).isoformat(),'dispatcherSha256':api['OLD'],'oldIdentities':api['basis'](),'PGConnections':0,'mutations':0,'registryOrJobSubmitted':False}
if __name__=='__main__':print(json.dumps(main(),sort_keys=True))
