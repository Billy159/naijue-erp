"""Bind only T45 frozen consumer metadata; never alter or execute its consumers."""
from pathlib import Path
import ast,hashlib,json,runpy
HERE=Path(__file__).resolve().parent
OLD=HERE.with_name('20261117-r3-normal39-root-source-01')
sha=lambda raw:hashlib.sha256(raw).hexdigest()
def main():
 history=json.loads((HERE/'HISTORY-INPUTS.WIP.json').read_bytes());folder=Path(history['consumerDirectory'])
 interface=json.loads((folder/'INTERFACE.UNISSUED.json').read_bytes())
 order=['apply','start','upgrade','stop','restore'];assert interface['phaseOrder']==order
 fields={'jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField'}
 rules={p:{k:interface['jobs'][p][k]for k in fields}for p in order}
 assert all(type(r['bundlePins'])is dict and r['script']in r['bundlePins']for r in rules.values())
 # Static rows are only inputs at this point; do not call a scope or validator.
 for phase,rule in rules.items():
  for name,pin in rule['bundlePins'].items():assert sha((Path(interface['jobs'][phase]['sourceDirectory'])/name).read_bytes())==pin
 ready=folder/'SOURCE-PINS.json'
 if ready.exists():
  source_raw=ready.read_bytes();source=json.loads(source_raw)
  assert source['sourceOnly']is True
  history['consumerSourcePinsSha256']=sha(source_raw);history['consumerFrozenInterfaceSha256']=sha((folder/'INTERFACE.UNISSUED.json').read_bytes())
  history['state']='ACTUAL110_HISTORY_WITH_FROZEN_CONSUMER_BINDINGS'
 else:history['state']='ACTUAL110_HISTORY_WITH_UNFROZEN_CONSUMER_METADATA_NOT_FINAL'
 history['consumerInterfaceSha256']=sha((folder/'INTERFACE.UNISSUED.json').read_bytes())
 history['consumerRulesSha256']=sha((folder/'PHASES40.UNISSUED.json').read_bytes())
 history['phaseDirectories']={p:interface['jobs'][p]['sourceDirectory']for p in order}
 history['expectedRules']=rules
 (HERE/'HISTORY-INPUTS.json').write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n')
 old=(OLD/'r3_normal39_continuation.py').read_text();tree=ast.parse(old);cls=next(n for n in tree.body if isinstance(n,ast.ClassDef)and n.name=='Normal39Continuation')
 methods={n.name:n for n in cls.body if isinstance(n,ast.FunctionDef)}
 names=['historical_install','child_settled','current_service','frozen','submitted','successful','current_batch_settled_or_absent']
 lines=old.splitlines(True);helpers='\n'.join(''.join(lines[methods[name].lineno-1:methods[name].end_lineno])for name in names)
 # Keep the local canonical stopped-data check; inherited helper would shadow it.
 text=(HERE/'admission.template.py').read_text()
 text=text.replace('__HISTORY_LITERAL__',repr(history)).replace('__RULES_LITERAL__',repr(rules)).replace('__INHERITED_HELPERS__',helpers)
 (HERE/'r3_normal40_continuation.py').write_text(text)
 dispatcher=runpy.run_path(str(HERE/'patch_dispatcher.py'))['render']((HERE/'ACTUAL110-DISPATCHER.py').read_bytes(),sha(text.encode()),history['jobs'])
 (HERE/'admin_exec.NORMAL40-UNREGISTERED.py').write_bytes(dispatcher)
 print(json.dumps({'state':history['state'],'consumerSourcePin':history['consumerSourcePinsSha256'],'moduleSha256':sha(text.encode()),'oldHelperCount':len(names)}))
if __name__=='__main__':main()
