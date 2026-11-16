"""Original private carrier/envelope transport, literal-bound to issued direct31."""
from pathlib import Path
from datetime import datetime,timezone
import base64,hashlib,json,os,re,runpy,shlex,subprocess,sys,time

H=Path(__file__).resolve().parent
REPO=H.parents[3]
MAIN=REPO/'outputs/主控/20261115-r3-direct-service24-issuer-local-01/SERVICE31-INSTALL-TRANSPORT-02'
SOURCE='6c9468dc661d64d629f71e2bf3a24e9b899a68f22beaa801705f10f33481f169'
TEMPLATE='52369590d7151082ff4108d5105198a91c770ade313441972ce892fa95c452be'
SUCCESS='EXACT_DIRECT31_START_DESCRIBE_REGISTERED_NO_NEW_PHASE_SUBMITTED'
RULES='5d0ab4760c08e3614b6b0914e69d09c8e53a37348d2aaa1a8cd31e92335bf2cf'
CLIENT=REPO.parent/'monitor/normal-admission-20261112-01/admin_client.py'
CLIENT_SHA='54019fb135469fb60b4720a21922bb2923ccf36c644d7734131124eeee2a88a6'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
unpack=lambda raw:base64.b64decode(raw,validate=True)

TRANSPORT_CLIENT=CLIENT.with_name('admin_client-t45-code-transport-v2.py')
TRANSPORT_CLIENT_SHA='846e3dd51c7607b01c7e73b36f73c6edec03d3be981b2f40bf2bed14db7d2e54'
PHASES=REPO/'outputs/T45/revisions/20261116-r3-normal31-source-local-01/CANDIDATE-01'
RUNNER_SHA='c7344ef8b901f6685b49509520fc5535118b053e6f6dcf55718f84db3d152ee4'
PRIVATE_SOURCE_SHA='725415efdb5f5ca4e591de08e44a1c2e19ee75e111d65c566b89d3d6dabbddf1'
def check_local_pair():
    assert sha(TRANSPORT_CLIENT.read_bytes())==TRANSPORT_CLIENT_SHA
    assert sha((PHASES/'run_frozen_phase31.py').read_bytes())==RUNNER_SHA
    assert sha((PHASES/'PHASES31.UNISSUED.json').read_bytes())==RULES
    raw=(PHASES/'install/bundle/private_transport.py').read_bytes()
    assert len(raw)==12283 and sha(raw)==PRIVATE_SOURCE_SHA
    assert sha((MAIN/'admin_exec.DIRECT31-UNREGISTERED.py').read_bytes())=='857e267421cd728f87544619842f2aa059e60dd1f3bbbc6346bb501b115087d2'

def main():
    check_local_pair()
    directory,issued_pin,destination=sys.argv[1:]
    directory=Path(directory).resolve(strict=True);destination=Path(destination)
    read=lambda name:(directory/name).read_bytes()
    issued=read('ISSUED.json');assert sha(issued)==issued_pin
    report=json.loads(issued)
    assert report['state']=='ISSUED_EXACT_COMPLETED_ROOT04_REUSE_REGISTRATION_NO_SERVER_ACTION'
    assert Path(report['directory'])==directory and report['rulesSha256']==RULES and report['phaseSubmitted'] is False
    authority=read('registration-authorization.json');a=json.loads(authority)
    carrier=read('original-cas-direct31-carrier.ISSUED.py')
    envelope=read('registration-envelope.json');e=json.loads(envelope)
    policy=read('direct31-batched-real.json')
    assert [sha(v) for v in (authority,carrier,policy)]==[report[k] for k in ('registrationSha256','carrierSha256','policySha256')]
    assert a['sourceSha256']==SOURCE and sha(unpack(e['source']))==SOURCE and unpack(e['packet']['authorization'])==authority
    assert {k:sha(unpack(v)) for k,v in e['packet']['files'].items()}==a['sourcePins']
    assert unpack(e['packet']['files']['policy'])==policy
    assert a['sourceRegistrationOnly'] is True and a['businessDatabaseWrites']==0 and a['jobKeys']==report['jobs']
    assert a['startsAt']==report['startsAt'] and a['expiresAt']==report['registrationExpiresAt']
    assert a['independentReviewSha256']==report['independentReviewSha256']
    template=(MAIN/'original-cas-direct31-carrier.UNISSUED.py').read_bytes()
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
    proof['exactDirect31RegistrationReplyConfirmed']=verified
    with (destination/'ROOT-ENTRY-RESULT.json').open('x') as out:json.dump(proof,out,indent=2);out.write('\n')
    print(json.dumps(proof))
    return 0 if verified else 2

if __name__=='__main__':raise SystemExit(main())
