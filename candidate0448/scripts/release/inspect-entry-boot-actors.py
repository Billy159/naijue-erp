"""Read-only, bounded projection of known ERP boot actors; never export credentials."""
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import socket
import subprocess

J = Path(os.environ['ERP_SHARED_JOB_DIR'])
P = json.loads((J / 'bundle/PLAN.json').read_text())
O = J / 'results'

def require(ok, code):
    if not ok:
        raise ValueError(code)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def command(argv):
    process = subprocess.run(argv, capture_output=True, text=True, timeout=20, check=False)
    if process.returncode != 0:
        result.setdefault('commandFailures', []).append({'argv':argv, 'exitCode':process.returncode, 'stderrSha256':sha(process.stderr.encode())})
    return process.stdout

def safe_value(value):
    if not isinstance(value, str):
        return value
    if value in {'docker','compose','up','down','start','stop','restart','inspect','ps','logs','systemctl','show','is-active','is-enabled','active','inactive','enabled','disabled','healthy','unhealthy','running','exited','app','web','db','naijue-prod','naijue-prod-app-1','naijue-prod-web-1','naijue-prod-db-1','GET','HEAD','POST','http','https','127.0.0.1','localhost','utf-8','r','w','a'}:
        return value
    if re.fullmatch(r'/(?:usr/bin|usr/local/bin|usr/local/sbin|srv/naijue-erp|run|etc/systemd/system)/[A-Za-z0-9_./-]{1,240}', value):
        return value
    if value in ('--format', '--no-pager', '--no-legend', '--all', '--no-deps', '--env-file', '--project-name', '--force-recreate', '--remove-orphans', '-d', '-f', '-p'):
        return value
    return '<redacted-literal-sha256:' + sha(value.encode()) + '>'

class Redactor(ast.NodeTransformer):
    def visit_Constant(self, node):
        return ast.copy_location(ast.Constant(value=safe_value(node.value)), node)

def project_unit(path):
    p = Path(path)
    raw = p.read_bytes()
    require(len(raw) < 1024 * 1024, 'UNIT_SIZE_BOUND')
    rows = []
    structural = {'Description','After','Before','Requires','Wants','PartOf','BindsTo','WantedBy','Type','Restart','RemainAfterExit','WorkingDirectory','OnBootSec','OnUnitActiveSec','OnCalendar','Unit','ConditionPathExists'}
    for i, line in enumerate(raw.decode().splitlines(), 1):
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        key, value = line.split('=', 1)
        if key.startswith('Exec'):
            rows.append({'line':i, 'key':key, 'argv':[safe_value(v) for v in shlex.split(value)], 'originalSha256':sha(value.encode())})
        elif key in structural:
            rows.append({'line':i, 'key':key, 'value':value})
        elif key in {'Environment', 'EnvironmentFile'}:
            rows.append({'line':i, 'key':key, 'value':'REDACTED', 'originalSha256':sha(value.encode())})
    return {'path':str(p), 'sha256':sha(raw), 'bytes':len(raw), 'directives':rows}

result = {'jobId':P['jobId'], 'databaseWrites':False, 'serviceChanges':False, 'rawSourceExported':False, 'status':'STARTED'}
try:
    require(os.geteuid() == 0 and socket.gethostname() == 'naijue-server' and J.name == P['jobId'], 'EXACT_HOST_AND_JOB')
    monitor = Path('/srv/naijue-erp/t48/entry-monitor/monitor.py')
    require(monitor.is_file() and not monitor.is_symlink(), 'EXACT_REGULAR_MONITOR')
    raw = monitor.read_bytes()
    require(len(raw) < 1024 * 1024, 'MONITOR_SIZE_BOUND')
    tree = ast.parse(raw.decode())
    projection = ast.unparse(ast.fix_missing_locations(Redactor().visit(tree)))
    (O / 'monitor-control-projection.json').write_text(json.dumps({'sanitizedSource':projection,'originalSha256':sha(raw)},indent=2)+'\n')
    result['monitor'] = {'path':str(monitor), 'sha256':sha(raw), 'bytes':len(raw), 'projectionSha256':sha((projection+'\n').encode()), 'note':'Every non-allowlisted literal redacted; inspect control flow, do not infer from keyword absence alone.'}
    enabled = command(['systemctl','list-unit-files','--state=enabled','--no-pager','--no-legend']).splitlines()
    enabled_names = {line.split()[0] for line in enabled if line.split()}
    candidates = {name for name in enabled_names if re.search(r'naijue|erp|t48',name,re.I)}
    # Inspect local unit source for ERP entry references, including indirectly activated disabled units.
    for p in Path('/etc/systemd/system').glob('*'):
        if p.is_file() and p.suffix in {'.service','.timer','.socket','.path'}:
            raw_unit = p.read_bytes()
            require(len(raw_unit) < 1024 * 1024, 'LOCAL_UNIT_SIZE_BOUND')
            if any(token in raw_unit for token in [b'/srv/naijue-erp', b'naijue-prod', b'127.0.0.1:18080']):
                candidates.add(p.name)
    require(len(candidates) <= 80, 'ERP_UNIT_COUNT_BOUND')
    units = []
    for name in sorted(candidates):
        properties = command(['systemctl','show',name,'--property=FragmentPath,DropInPaths,LoadState,ActiveState,SubState,UnitFileState','--no-pager'])
        parsed = dict(line.split('=',1) for line in properties.splitlines() if '=' in line)
        paths = [parsed.get('FragmentPath',''), *shlex.split(parsed.get('DropInPaths',''))]
        units.append({'name':name, 'enabledListed':name in enabled_names, 'state':parsed, 'sources':[project_unit(path) for path in paths if path]})
    result.update(status='PARTIAL_READONLY_BOOT_ACTOR_PROJECTION' if result.get('commandFailures') else 'PASS_READONLY_BOOT_ACTOR_PROJECTION', units=units, coverage='Enabled ERP-named units and local system units referencing exact ERP path/container/entry; external unrelated schedulers not exhaustively audited.')
except Exception as exc:
    result.update(status='FAILED_READONLY_BOOT_ACTOR_PROJECTION', failureCode=str(exc) if isinstance(exc,ValueError) else type(exc).__name__)
finally:
    result['finishedAtUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (O / 'boot-actors.json').write_text(json.dumps(result,indent=2)+'\n')
raise SystemExit(0 if result['status'].startswith('PASS') else 2)
