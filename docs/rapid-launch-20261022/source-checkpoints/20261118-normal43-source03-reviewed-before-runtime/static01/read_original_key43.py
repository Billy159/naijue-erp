"""Use exact reviewed readers and original private transport only when authorized."""
from pathlib import Path
import hashlib,json,runpy,shlex
HERE=Path(__file__).resolve().parent
V=HERE.parent
SOURCE=V/'NORMAL43-FULL-DATA-CONTINUATION-SOURCE-01'
PREP=V/'NORMAL43-EXECUTION-PREPARATION-01'
EXECUTION=V/'NORMAL43-EXECUTION-CONSUMER-01'
PHASES=('apply','start','writer','stop','restore')
sha=lambda b:hashlib.sha256(b).hexdigest()
LOADER=V/'RUNTIME-WINDOW-SUCCESSOR-01/seven_phase_client600.py'
LOADER_SHA='42943d8124fa43c217ffa5b7e85d27684290d3938bb18212e1589253fc6886f8'
def program(phase):
 assert phase in PHASES
 manifest=json.loads((HERE/'SOURCE-PINS.json').read_bytes())
 leaf='read_'+phase+'43.remote.py';raw=(HERE/leaf).read_bytes()
 assert sha(raw)==manifest['files'][leaf]['sha256']
 return raw.decode()
def read_once(phase):
 # Separate concrete Main scope remains mandatory; no method is called by import.
 code=program(phase)
 assert sha(LOADER.read_bytes())==LOADER_SHA
 client=runpy.run_path(str(LOADER))['load_client']();cfg=client['state']()
 return client['remote'](cfg,shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',code]))
def phase_api():
 # Bind the exact SOURCE CLI; it validates original authority args before network.
 pins=json.loads((SOURCE/'SOURCE-PINS.json').read_bytes())
 raw=(EXECUTION/'phase_cli.py').read_bytes()
 assert sha(raw)==pins['files']['phase_cli.py']['sha256']
 return runpy.run_path(str(EXECUTION/'phase_cli.py'))['execute']
