"""Read exact source identity facts and sanitized boot actions, without credentials."""
import datetime, hashlib, json, os, re, shlex, socket, subprocess
from pathlib import Path

J=Path(os.environ['ERP_SHARED_JOB_DIR']); P=json.loads((J/'bundle/PLAN.json').read_text()); O=J/'results'
V={'jobId':P['jobId'],'status':'STARTED','databaseWrites':False,'serviceChanges':False,'credentialsExported':False}
def require(v,c):
    if not v: raise ValueError(c)
def digest(b): return hashlib.sha256(b).hexdigest()
def file_projection(path):
    p=Path(path); require(p.is_file() and not p.is_symlink(),'REGULAR_UNIT_FILE')
    data=p.read_bytes(); require(len(data)<1024*1024,'BOUNDED_UNIT_FILE')
    facts={'path':str(p),'sha256':digest(data),'bytes':len(data),'directives':[],'executables':[]}
    allowed={'Description','After','Before','Requires','Wants','WantedBy','Type','Restart','RemainAfterExit','WorkingDirectory','OnBootSec','OnUnitActiveSec','OnCalendar','Unit'}
    argv_values={'docker','/usr/bin/docker','compose','up','down','start','stop','restart','-d','--no-deps','--force-recreate','--remove-orphans','--project-name','-p','-f','--file','--env-file','app','web','db','naijue-prod','naijue-t48-prod-runtime'}
    for line in data.decode().splitlines():
        if '=' not in line or line.lstrip().startswith('#'): continue
        key,value=line.split('=',1)
        if key in allowed: facts['directives'].append({'key':key,'value':value})
        elif key.startswith('Exec'):
            try: argv=shlex.split(value)
            except ValueError: argv=[]
            safe=[]
            for token in argv:
                safe_path=bool(re.fullmatch(r'/(?:usr/local/(?:sbin|bin)|srv/naijue-erp)/[A-Za-z0-9_./-]+',token))
                if token in argv_values or safe_path: safe.append(token)
                else: safe.append({'unexpandedTokenSha256':digest(token.encode())})
            if argv: facts['executables'].append(argv[0])
            facts['directives'].append({'key':key,'argvProjection':safe,'originalValueSha256':digest(value.encode())})
    return facts
try:
    require(os.geteuid()==0 and socket.gethostname()=='naijue-server' and J.name==P['jobId'],'EXACT_READ_SCOPE')
    source=Path('/srv/naijue-erp/rapid-launch-20261022/private/account-capture-20261022-11/old-accounts.json');raw=source.read_bytes();require(digest(raw)==P['captureSha256'],'EXACT_SOURCE_CAPTURE')
    rows=[]
    for row in json.loads(raw)['rows']:
        facts=row.get('sourceFacts'); require(isinstance(facts,dict),'SOURCE_FACTS_OBJECT')
        safe={key:facts.get(key) for key in ['originalEmployeeId','originalEmployeeCode','currentPersonKey','approvedPlanSha256']}
        require(all(v is None or isinstance(v,(str,int)) and len(str(v))<512 for v in safe.values()),'BOUNDED_ORIGINAL_ID_FACTS')
        rows.append({'sourceAccountId':row['sourceAccountId'],'oldEmployeeLinkFound':row.get('sourceEmployeeNativeId') is not None,'sourceFacts':safe})
    (O/'account-source-identity-facts.json').write_text(json.dumps({'format':'SAFE_ORIGINAL_ACCOUNT_IDENTITY_FACTS_V1','sourceCaptureSha256':digest(raw),'rows':rows},indent=2)+'\n')
    units=[]
    for name in ['naijue-prod.service','naijue-t48-prod-runtime.service','naijue-t48-entry-monitor.service','naijue-t48-entry-monitor.timer']:
        p=Path('/etc/systemd/system')/name
        if p.exists(): units.append(file_projection(p))
    helpers=[]
    for unit in units:
        for exe in unit['executables']:
            if exe.startswith('/usr/local/'):
                p=Path(exe)
                if p.is_file() and not p.is_symlink():
                    data=p.read_bytes();require(len(data)<1024*1024,'BOUNDED_HELPER'); text=data.decode()
                    # Control-flow and command presence only. No raw helper body.
                    helpers.append({'path':exe,'sha256':digest(data),'bytes':len(data),'mentionsDockerStart':bool(re.search(r'docker\s+start\b',text)),
                        'mentionsComposeUp':bool(re.search(r'compose[^\n]*\bup\b',text)), 'mentionsDockerStop':bool(re.search(r'docker\s+stop\b',text)),
                        'mentionsProdWeb':'naijue-prod-web-1' in text,'mentions18080':'18080' in text,
                        'actionLines': [{'line':i,'sha256':digest(line.encode()),'kind':'DOCKER_OR_SYSTEMCTL_ACTION'} for i,line in enumerate(text.splitlines(),1) if re.search(r'\b(docker|systemctl)\b',line)]})
    V.update(status='PASS_EXACT_FOLLOWUP_METADATA',accountFactsRows=len(rows),units=units,helpers=helpers,remaining='Helper control-flow semantics may require specific safe projection; no boot edits or native accounts written.')
except Exception as e: V.update(status='FAILED_READONLY_FOLLOWUP',failureCode=str(e) if isinstance(e,ValueError) else type(e).__name__)
finally:
    V['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(O/'boot-actions-metadata.json').write_text(json.dumps(V,indent=2)+'\n')
raise SystemExit(0 if V['status'].startswith('PASS') else 2)
