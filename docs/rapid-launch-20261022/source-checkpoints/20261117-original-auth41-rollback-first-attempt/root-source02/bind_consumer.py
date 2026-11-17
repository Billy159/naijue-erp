"""Only read exact frozen consumer metadata; no consumer API invocation."""
from pathlib import Path
import hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2]
V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/ORIGINAL-AUTH41-ROLLBACK-SOURCE-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 s=(V/'SOURCE-PINS.json').read_bytes();i_raw=(V/'INTERFACE.UNISSUED.json').read_bytes()
 assert sha(s)=='02fd0d579d45fae57329511ae1cc43e39c1ed2e1419caca215e005292a2c2287'and sha(i_raw)=='53d15b19fa7291f1e9cfde54725abb34abeb2830870985051f269aa90342539c'
 i=json.loads(i_raw);b=json.loads((D/'CONSUMER-BINDING.json').read_bytes())
 assert b['history']['innerScopeFixed']==i['rolesScopeFixed']and b['history']['outerScopeFixed']==i['hostScopeFixed']
 for name,pin in b['rule']['bundlePins'].items():assert sha((V/'bundle'/name).read_bytes())==pin
 return dict(consumerSourcePinsSha256=sha(s),consumerInterfaceSha256=sha(i_raw),APICalls=0)
if __name__=='__main__':print(json.dumps(main()))
