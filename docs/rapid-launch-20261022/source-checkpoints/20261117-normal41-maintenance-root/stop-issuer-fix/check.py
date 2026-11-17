from pathlib import Path
import ast,hashlib,json
D=Path(__file__).resolve().parent;R=D.parents[2];O=D.with_name('20261117-r3-ordinary41-root-source-01');V=R/'outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01'
sha=lambda b:hashlib.sha256(b).hexdigest()
c=json.loads((D/'CORRECTION.json').read_bytes());checks=[]
def check(x,n):assert x,n;checks.append(n)
s=(O/'SOURCE-PINS.json').read_bytes();check(sha(s)==c['originalRegisteredSourcePinsSha256'],'registered source aadc unchanged')
for n,row in json.loads(s)['files'].items():check(sha((O/n).read_bytes())==row['sha256'],'original frozen '+n)
b=(V/'NORMAL41-STOP-BASIS-01/ACTUAL-STOP41-BASIS.json').read_bytes();check(sha(b)=='4c0b5301d535cddf9464cebe7786dde1e27710a36b1067837c97c46f57cf0f3c','actual stop basis exact');basis=json.loads(b)
check(c['before'][:-1]==c['after'][:-1]and len(c['before'])==len(c['after'])==5 and len(set(c['before'])^set(c['after']))==2,'one ID only')
check(set(c['after'])==set(basis['currentBatchTerminals']),'corrected exact five actual basis')
check(set(c['before'])!=set(basis['currentBatchTerminals']),'old40 set still rejected')
host=(V/'NORMAL41-THREE-ROUTINE-MAINTENANCE-SOURCE-01/stop/bundle/normal05_preserve_stop.py').read_bytes();t=ast.parse(host)
keys=ast.literal_eval(next(n.value for n in t.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='CURRENT_BATCH_OPERATIONS'for x in n.targets)))
check(list(keys)==c['after'],'actual stop bundle exact same41 five')
check("set(a['currentBatchTerminals']) == set(CURRENT_BATCH_OPERATIONS)"in host.decode(),'native exact set guard retained')
text=(D/'issue_stop.py').read_text();t=ast.parse(text);f=next(n for n in t.body if isinstance(n,ast.FunctionDef)and n.name=='issue')
check(len(f.args.args)==8,'original eight parameters');check("assert phase=='stop'"in text,'STOP-only');check('g[\'preservation_authority\']=corrected'in text and 'finally:g[\'preservation_authority\']=preservation'in text,'one witness boundary corrected then restored')
check('return preservation(phase,corrected_witness,rule,start,evidence,roles,policy,now)'in text,'all finite evidence fields unchanged')
check("correctionSourcePinsSha256"in text and "originalRegisteredSourcePinsSha256"in text and "correctionReviewSha256"in text,'original and correction QA separately bound')
for p in D.glob('*.py'):compile(p.read_bytes(),str(p),'exec')
r=dict(state='SOURCE_ONLY_STOP41_ONE_ID_FIX_CHECKS_PASS',checks=len(checks),passed=checks,actualStopBasisSha256=sha(b),stopHostSha256=sha(host),issuerCalls=0,clockCalls=0,serverCalls=0,authoritiesIssued=False,positiveAuthorityFixtures=False)
(D/'CHECKS.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items()if k!='passed'}))
