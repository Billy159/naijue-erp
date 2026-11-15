"""Original private carrier/envelope transport, literal-bound to issued direct29."""
from pathlib import Path
from datetime import datetime,timezone
import base64,hashlib,json,os,re,runpy,shlex,subprocess,sys,time

H=Path(__file__).resolve().parent
REPO=H.parents[3]
MAIN=REPO/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE29-COMPILE-CLASSIFICATION-02'
SOURCE='75df85f9bb7da65da15f8b8d02b2c2089ed774429c924a8f26e963be851619ab'
TEMPLATE='d01e241010281f70c13ec137ebce9ea7fde78671e0e55dd87db700346c9b915f'
SUCCESS='EXACT_DIRECT29_START_DESCRIBE_REGISTERED_NO_NEW_PHASE_SUBMITTED'
RULES='c0d6763389998c439b4ee1e611f131ce3709a519d13ee5f6dd897591216411e6'
CLIENT=REPO.parent/'monitor/normal-admission-20261112-01/admin_client.py'
CLIENT_SHA='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
unpack=lambda raw:base64.b64decode(raw,validate=True)

def main():
    directory,issued_pin,destination=sys.argv[1:]
    directory=Path(directory).resolve(strict=True);destination=Path(destination)
    read=lambda name:(directory/name).read_bytes()
    issued=read('ISSUED.json');assert sha(issued)==issued_pin
    report=json.loads(issued)
    assert report['state']=='ISSUED_EXACT_ROOT03_SUCCESSOR_REGISTRATION_NO_SERVER_ACTION'
    assert Path(report['directory'])==directory and report['rulesSha256']==RULES and report['phaseSubmitted'] is False
    authority=read('registration-authorization.json');a=json.loads(authority)
    carrier=read('original-cas-direct29-carrier.ISSUED.py')
    envelope=read('registration-envelope.json');e=json.loads(envelope)
    policy=read('direct29-batched-real.json')
    assert [sha(v) for v in (authority,carrier,policy)]==[report[k] for k in ('registrationSha256','carrierSha256','policySha256')]
    assert a['sourceSha256']==SOURCE and sha(unpack(e['source']))==SOURCE and unpack(e['packet']['authorization'])==authority
    assert {k:sha(unpack(v)) for k,v in e['packet']['files'].items()}==a['sourcePins']
    assert unpack(e['packet']['files']['policy'])==policy
    assert a['sourceRegistrationOnly'] is True and a['businessDatabaseWrites']==0 and a['jobKeys']==report['jobs']
    assert a['startsAt']==report['startsAt'] and a['expiresAt']==report['registrationExpiresAt']
    assert a['independentReviewSha256']==report['independentReviewSha256']
    template=(MAIN/'original-cas-direct29-carrier.UNISSUED.py').read_bytes()
    assert sha(template)==TEMPLATE and sha((MAIN/'register_cas.py').read_bytes())==SOURCE
    for name,value in (('AUTH_SHA_LITERAL',repr(sha(authority))),('AUTH_START_LITERAL',str(a['startsAt'])),('AUTH_EXPIRES_LITERAL',str(a['expiresAt']))):
        assert template.count(name.encode())==1;template=template.replace(name.encode(),value.encode())
    assert template==carrier
    n=time.time_ns()//1000000
    assert a['startsAt']<=n and n+30000<a['expiresAt'] and n+900000<json.loads(policy)['expiresAt']
    assert sha(CLIENT.read_bytes())==CLIENT_SHA
    cfg=runpy.run_path(str(CLIENT))['state']();assert cfg['grantId']=='b16447fbc81f4d64'
    os.umask(0o077);destination.mkdir(mode=0o700)
    with (destination/'EXECUTION-ATTEMPT.json').open('x') as out:
        json.dump(dict(utc=datetime.now(timezone.utc).isoformat(),issuedSha256=issued_pin,
            authoritySha256=sha(authority),carrierSha256=sha(carrier),policySha256=sha(policy),sourceSha256=SOURCE,once=True),out)
        out.write('\n');out.flush();os.fsync(out.fileno())
    args=['/usr/bin/ssh','-i',cfg['keyFile'],'-o','IdentitiesOnly=yes','-o','IdentityAgent=none',
        '-o','BatchMode=yes','-o','PasswordAuthentication=no','-o','KbdInteractiveAuthentication=no',
        '-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',cfg['host']]
    command=shlex.join(['sudo','-n','/usr/bin/python3','-I','-S','-c',carrier.decode()])
    try:
        reply=subprocess.run(args+[command],input=envelope,capture_output=True,timeout=50)
        result=json.loads(reply.stdout) if reply.stdout.strip() else {}
        proof=dict(returncode=reply.returncode,result=result,stderrBytes=len(reply.stderr),automaticReplay=False)
        if reply.returncode:
            lines=reply.stderr.decode(errors='replace').splitlines()
            proof['safeError']=next((line for line in reversed(lines) if re.fullmatch(r'(?:AssertionError|ValueError)(?:: [A-Z0-9_]+)?',line)),None)
    except (ValueError,subprocess.TimeoutExpired) as error:
        proof=dict(status='CAS_RESPONSE_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY',exceptionClass=type(error).__name__,automaticReplay=False)
    value=proof.get('result',{})
    verified=proof.get('returncode')==0 and value.get('status')==SUCCESS \
        and all(value.get(k) is False for k in ('phaseSubmitted','rolesExecuted','postgresStarted')) \
        and value.get('policySha256')==report['policySha256'] and value.get('dispatcherSha256')==report['dispatcherSha256'] \
        and value.get('moduleSha256')==a['newModuleSha256']
    proof['exactDirect29RegistrationReplyConfirmed']=verified
    with (destination/'ROOT-ENTRY-RESULT.json').open('x') as out:json.dump(proof,out,indent=2);out.write('\n')
    print(json.dumps(proof))
    return 0 if verified else 2

if __name__=='__main__':raise SystemExit(main())
