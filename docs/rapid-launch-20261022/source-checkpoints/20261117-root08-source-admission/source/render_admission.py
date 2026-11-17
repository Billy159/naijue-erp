"""Render only the reviewed fixed Root08 SOURCE module and unregistered root delta."""
from pathlib import Path
import hashlib,json,runpy
HERE=Path(__file__).resolve().parent
def main():
 static=json.loads((HERE/'STATIC-INPUTS.json').read_bytes());text=(HERE/'admission.template.py').read_text()
 for key,value in [('__BUNDLE_LITERAL__',static['bundle']),('__ALIASES_LITERAL__',static['aliases']),('__SCOPE_LITERAL__',static['sourceScope']),('__BASELINE_LITERAL__',static['baselineRootPins'])]:
  assert text.count(key)==1;text=text.replace(key,repr(value),1)
 raw=text.encode();(HERE/'r3_root08_source_admission.py').write_bytes(raw)
 patch=runpy.run_path(str(HERE/'patch_dispatcher.py'))
 (HERE/'admin_exec.ROOT08-UNREGISTERED.py').write_bytes(patch['render']((HERE/'ACTUAL109-DISPATCHER.py').read_bytes(),hashlib.sha256(raw).hexdigest()))
 print('Rendered exact actual109->110 Root08 SOURCE; no authority or execution.')
if __name__=='__main__':main()
