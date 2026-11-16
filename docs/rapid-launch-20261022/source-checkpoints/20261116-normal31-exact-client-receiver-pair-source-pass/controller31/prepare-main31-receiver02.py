from pathlib import Path
import ast, hashlib, json, difflib

HERE=Path(__file__).resolve().parent
PARENT=HERE.parent/'SERVICE31-INSTALL-TRANSPORT-01'
OUT=HERE.parent/'SERVICE31-INSTALL-TRANSPORT-02'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
encode=lambda o:(json.dumps(o,sort_keys=True,indent=2)+'\n').encode()
pins=json.loads((PARENT/'PINS.json').read_bytes())
names=['r3_direct31_batched.py','admin_exec.DIRECT31-UNREGISTERED.py','register_cas.py',
       'original-cas-direct31-carrier.UNISSUED.py','issue_phase.py','issue_registration.py','issue_upgrade_authority.py']
sources={n:(PARENT/n).read_text() for n in names}
assert all(sha((PARENT/n).read_bytes())==pins[n] for n in names)

name='admin_exec.DIRECT31-UNREGISTERED.py'
s=sources[name].replace('shutil, signal, socket, subprocess','shutil, signal, socket, stat, subprocess')
helper='''def fixed_install_code_member(cfg,job,row):
    return (job.get('taskId'),job.get('jobId'),job.get('grantId'),cfg.get('grantId'),
            row.get('name'),row.get('bytes'),row.get('sha256')) == (
        'T45','t45-r3-batched-install-20261115-01','b16447fbc81f4d64','b16447fbc81f4d64',
        'private_transport.py',12283,'725415efdb5f5ca4e591de08e44a1c2e19ee75e111d65c566b89d3d6dabbddf1')

def read_fixed_install_code(path):
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb') as stream:
        meta=os.fstat(stream.fileno())
        check(stat.S_ISREG(meta.st_mode) and meta.st_nlink==1 and meta.st_size==12283,'FIXED_INSTALL_CODE_FILE_REFUSED')
        data=stream.read(12284)
        identity=lambda m:(m.st_dev,m.st_ino,m.st_uid,m.st_gid,m.st_mode,m.st_nlink,m.st_size,m.st_mtime_ns,m.st_ctime_ns)
        check(len(data)==12283 and identity(meta)==identity(os.fstat(stream.fileno()))==identity(path.lstat()),'FIXED_INSTALL_CODE_CHANGED')
    check(hashlib.sha256(data).hexdigest()=='725415efdb5f5ca4e591de08e44a1c2e19ee75e111d65c566b89d3d6dabbddf1','FIXED_INSTALL_CODE_SHA_REFUSED')
    return data

'''
assert s.count('def freeze(cfg,job_id):')==1
s=s.replace('def freeze(cfg,job_id):',helper+'def freeze(cfg,job_id):')
old="        name=row.get('name','');check(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,120}',name) and name not in buffers and Path(name).suffix in {'.py','.mjs','.js','.json','.sh','.sql','.yaml','.yml','.md'} and not re.search(r'(^|[_.-])(private|secret|credentials?|password|token|cookie)([_.-]|$)',name,re.I),'BUNDLE_MEMBER_REFUSED')"
new="        name=row.get('name','');fixed_code=fixed_install_code_member(cfg,job,row)\n        check(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,120}',name) and name not in buffers and Path(name).suffix in {'.py','.mjs','.js','.json','.sh','.sql','.yaml','.yml','.md'} and (not re.search(r'(^|[_.-])(private|secret|credentials?|password|token|cookie)([_.-]|$)',name,re.I) or fixed_code),'BUNDLE_MEMBER_REFUSED')"
assert s.count(old)==1;s=s.replace(old,new)
old="        data=f.read_bytes();total+=len(data);check(total<=32*1024*1024 and len(data)==row.get('bytes') and hashlib.sha256(data).hexdigest()==row.get('sha256'),'FILE_DIGEST_OR_TOTAL_SIZE_REFUSED');buffers[name]=data"
new="        data=read_fixed_install_code(f) if fixed_code else f.read_bytes();total+=len(data);check(total<=32*1024*1024 and len(data)==row.get('bytes') and hashlib.sha256(data).hexdigest()==row.get('sha256'),'FILE_DIGEST_OR_TOTAL_SIZE_REFUSED');buffers[name]=data"
assert s.count(old)==1;s=s.replace(old,new);sources[name]=s
template_sha=sha(s.encode())
name='register_cas.py';s=sources[name]
old="TEMPLATE = '"+pins['admin_exec.DIRECT31-UNREGISTERED.py']+"'"
assert s.count(old)==1;s=s.replace(old,"TEMPLATE = '"+template_sha+"'");sources[name]=s
name='original-cas-direct31-carrier.UNISSUED.py';s=sources[name]
assert s.count(pins['register_cas.py'])==1
sources[name]=s.replace(pins['register_cas.py'],sha(sources['register_cas.py'].encode()))

OUT.mkdir(mode=0o700)
for n,s in sources.items():
    compile(s,n,'exec');(OUT/n).write_text(s)
    diff=''.join(difflib.unified_diff((PARENT/n).read_text().splitlines(True),s.splitlines(True),fromfile=n,tofile=n))
    if diff:(OUT/(n+'.patch')).write_text(diff)
preparation=json.loads((PARENT/'PREPARATION.json').read_bytes())
preparation.update(state='LOCAL_MAIN31_RECEIVER_FIX_REVIEW_PENDING',parentPinsSha256=sha((PARENT/'PINS.json').read_bytes()),
    closedFinding='INSTALL31-RECEIVER-MEMBER-01',initial31Eligibility='INELIGIBLE_RECEIVER_WOULD_REJECT_REQUIRED_MEMBER',
    exception=dict(task='T45',jobId='t45-r3-batched-install-20261115-01',grant='b16447fbc81f4d64',
        member='private_transport.py',bytes=12283,sha256='725415efdb5f5ca4e591de08e44a1c2e19ee75e111d65c566b89d3d6dabbddf1'),
    noChangeToOtherSensitiveNameRefusals=True,verifiedBytesFrozenWithoutRewrite=True,
    pending=['QB receiver fix and full normal31 pair','final real RO and API dry run before finite clocks'])
(OUT/'PREPARATION.json').write_bytes(encode(preparation))
(OUT/'PINS.json').write_bytes(encode({p.name:sha(p.read_bytes()) for p in OUT.iterdir() if p.is_file()}))
print(json.dumps(dict(directory=str(OUT),pinsSha256=sha((OUT/'PINS.json').read_bytes()),
    templateSha256=template_sha,registrarSha256=sha(sources['register_cas.py'].encode()),
    moduleUnchanged=sha(sources['r3_direct31_batched.py'].encode())==pins['r3_direct31_batched.py'])))
