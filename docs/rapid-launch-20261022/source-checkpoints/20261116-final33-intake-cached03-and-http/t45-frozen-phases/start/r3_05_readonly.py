"""Exact 05 input projection and read-only bind plan. No entrypoint."""
import hashlib
import os
from pathlib import Path, PurePosixPath
import stat

WORKER = 61035
SERVICE = 't45-first-r3-native-service-start-20261116-33'
STATE = Path('/var/lib/naijue-erp/fresh35-production')
AUTHORITY = Path('/etc/naijue-erp')
OPERATION = STATE/'installed-real-operation-51724553-20261114-01/operation'
DEPS = Path('/srv/naijue-erp/isolated-targets/r3-e894-linux-deps-check-20261110-01/payload/node_modules')
SOURCE = '63eb1d9bd4e62bfdba6a344b494351165e411096b5c95e365a5538395562f14e'
E537_SOURCE = 'e43584e931791601974440955dfe3464cd0f3d9220141acfe5a9172212841d15'
OPERATOR_MANIFEST = 'c4795906bdfab154e5cd66305a3e9ec698cd1a0b23e3a896258b396540a42184'
OPERATOR_HOST = '7c88c0fae43c544959b2834f81dfe32fec2b99fbedd9c1533494c68e109245ae'
OPERATOR_HOST_BYTES = 72238
HOST_LEAF = 'tools/unified-import/fresh35-host-session.mjs'
OPERATOR_FILES = {
    HOST_LEAF: ('operator-host.mjs', 72238, OPERATOR_HOST),
    'tools/unified-import/stream-program.mjs': ('operator-stream-program.mjs', 10302, 'fa0ca2e0e41fe83925155406959d683458671d647caf475ce6ebf0b9761c87f6'),
    'tools/unified-import/stream-import-cli.mjs': ('operator-stream-import-cli.mjs', 26499, '6836bb2aadbfcd81621e0a49143ff5a44b26c9a913c8b12b4925296037113e5e'),
}

ARCHIVE = '909963c477f3501cc58fac788a3baef5ee5bb27e41411360934ce121b2fc07be'
READY = '824e58bdc639c71b085c8d13d159c1f7207bbb935fe65f88903e98b6539bde06'
MANIFEST = 'd661fa09be2ded0a4a3f0a6b6cb1c371e48796a8eb2d0ff89186ac4d0535e27e'
DEPS_LOCK = '7e2bc5e96f2b95c7404479d2785372696323d8ec9b49ce6e642de2bedf120f7d'
DEPS_INPUT_LOCK = 'c0997c162a31b22a6e2c01c75fe777ff5a68c740994e6765eb3180b11c108048'
PROOF = 'fresh35-current-production-service-v2-service-33.json'
EXECUTION = 'fresh35-compact-zero-execution-v2.json'
PROVISION = 'fresh35-production-provision-v2.json'
DEPLOYMENT = 'fresh35-isolated-deployment-v1.json'
INSTALLATION = 'fresh35-combined-installation-v1.json'
ADMIN154 = 'fresh35-admin154-successor-v1.json'
SQL38 = 'fresh35-compact-zero-successor-v2.json'
LAUNCHERS = {
    'launch-fresh35-isolated-v1.py': 'a56afc4a5fcd965f00306d4493586b27d4465896d4973e8535fe151975504d75',
    'launch-fresh35-production-v2.py': 'b72a0e5aeeb156a27488e32dbd5275f70de76887679f80c5803e8d44b2a8ee59',
}
INSTALLER = 'scripts/release/unified-install/'
DEPLOY = Path('/opt/naijue-erp/fresh35-combined-v1')


def need(ok, code):
    if not ok:
        raise ValueError('R3_05_'+code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(s):
    return (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def protected_file(ops, path, limit, *, mode=None, group=None):
    before = ops.trusted(path).lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
         and (mode is None or stat.S_IMODE(before.st_mode) == mode)
         and (group is None or before.st_gid == group), 'EXACT_PROJECTION_METADATA_DIFFERS')
    raw = ops.read_file(path, limit, mode == 0o400)
    need(identity(before) == identity(path.lstat()), 'EXACT_PROJECTION_IDENTITY_CHANGED')
    return raw


def copy_once(ops, path, raw, mode, group=0):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(raw)
            stream.flush()
        os.fchown(fd, 0, group)
        os.fchmod(fd, mode)
        os.fsync(fd)
    finally:
        os.close(fd)
    ops.syncdir(path.parent)
    need(protected_file(ops, path, max(1,len(raw)), mode=mode, group=group) == raw,
         'EXACT_PROJECTION_READBACK_DIFFERS')


def boot_host(root):
    return root/'state/native-services'/SERVICE


def operation_host(root):
    return root/'state'/OPERATION.parent.name/'operation'


def payload_members(ops, payload):
    raw = ops.read_file(payload/'release-manifest.json', 600000)
    need(sha(raw) == MANIFEST, 'EXACT_E537_MANIFEST_DIFFERS')
    m = ops.strict(raw)
    need(m['sourceCommit'] == 'e5376516c744c47d56f97e4a90d056c94251c786'
         and m['native35']['sourceSetSha256'] == E537_SOURCE, 'EXACT_E537_SOURCE_DIFFERS')
    rows = [row for row in m['members'] if row['role'] == 'native35']
    pins = {row['path']:row['sha256'] for row in m['native35']['pins']}
    need(len(rows) == len(pins) == 223
         and {row['sourcePath']:row['sha256'] for row in rows} == pins, 'EXACT_E537_PINS_DIFFERS')
    for row in rows:
        rel = PurePosixPath(row['sourcePath'])
        need(not rel.is_absolute() and '..' not in rel.parts and str(rel) == row['sourcePath']
             and row['path'] == 'backend/native35-source/'+str(rel), 'EXACT_E537_MEMBER_PATH_DIFFERS')
    return rows


def verify_locked_linux_dependencies(ops):
    # Only the original npm-ci payload below was produced by UID 1000.
    # The fixed ancestor and all other protected inputs keep normal root checks.
    ops.trusted(DEPS.parent.parent)
    directories = ((DEPS.parent, 13503728, 0o700), (DEPS, 13504771, 0o755))
    captured = []
    for path, inode, mode in directories:
        st = path.lstat()
        need(stat.S_ISDIR(st.st_mode) and (st.st_dev, st.st_ino, st.st_uid, st.st_gid,
             stat.S_IMODE(st.st_mode)) == (66304, inode, 1000, 1000, mode),
             'EXACT_LOCKED_LINUX_DEPENDENCY_DIRECTORY_DIFFERS')
        captured.append((path, identity(st)))

    def check_lock(path, pin, size, owner, mode, inode=None):
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as stream:
            first = os.fstat(stream.fileno())
            need(stat.S_ISREG(first.st_mode) and first.st_uid == owner and first.st_nlink == 1
                 and stat.S_IMODE(first.st_mode) == mode and first.st_size == size
                 and (inode is None or (first.st_dev, first.st_ino, first.st_gid) == (66304, inode, 1000)),
                 'EXACT_LOCKED_LINUX_DEPENDENCY_FILE_DIFFERS')
            raw = stream.read(size + 1)
            need(len(raw) == size and sha(raw) == pin
                 and identity(first) == identity(os.fstat(stream.fileno())) == identity(path.lstat()),
                 'EXACT_LOCKED_LINUX_DEPENDENCIES_DIFFERS')

    check_lock(DEPS.parent/'package-lock.json', DEPS_INPUT_LOCK, 105758, 0, 0o444)
    check_lock(DEPS/'.package-lock.json', DEPS_LOCK, 49967, 1000, 0o644, 13504782)
    need(all(identity(path.lstat()) == before for path, before in captured),
         'EXACT_LOCKED_LINUX_DEPENDENCY_DIRECTORY_CHANGED')


def operator_inputs(ops, supplied=None):
    names={'operator-manifest.json',*(row[0] for row in OPERATOR_FILES.values())}
    need(supplied is None or set(supplied)==names,'EXACT_SERVICE19_OVERLAY_INPUTS_REQUIRED')
    def take(name,size):
        return supplied[name] if supplied is not None else protected_file(ops,boot_host(ops.ROOT)/name,size,mode=0o400,group=0)
    raw=take('operator-manifest.json',48490)
    need(len(raw)==48490 and sha(raw)==OPERATOR_MANIFEST,'EXACT_SERVICE19_OPERATOR_MANIFEST_DIFFERS')
    m=ops.strict(raw)
    need(m['sourceCommit']=='517245532e3e2a5a3df8a2a4f7762e70a3fee6b2' and m['operationSourceRoot']==str(OPERATION)
         and m['runtime']['sourceSetSha256']==SOURCE and len(m['runtime']['members'])==223,'EXACT_SERVICE19_SOURCE_DIFFERS')
    rows={row['path']:row for row in m['runtime']['members']}
    need(len(rows)==223,'EXACT_SERVICE19_UNIQUE_MEMBERS_REQUIRED')
    leaves={}
    for path,(name,size,pin) in OPERATOR_FILES.items():
        body=take(name,size)
        need(len(body)==size and sha(body)==pin and rows[path]=={'path':path,'bytes':size,'sha256':pin},
             'EXACT_SERVICE19_OPERATOR_LEAF_DIFFERS')
        leaves[path]=body
    return rows,leaves


def materialize_operation(ops, baseline, operator_leaves=None):
    verify_locked_linux_dependencies(ops)
    receipt = baseline.reuse_payload(ops, 'SQL38', ARCHIVE, READY)
    payload = baseline.payload_path('SQL38', ARCHIVE, READY)
    rows = payload_members(ops, payload)
    current,leaves=operator_inputs(ops,operator_leaves)
    need(set(current)=={row['sourcePath'] for row in rows}
         and all(path in OPERATOR_FILES or current[path]['sha256']==row['sha256'] and current[path]['bytes']==row['bytes']
                 for row in rows for path in [row['sourcePath']]),'EXACT_SERVICE19_ONLY_THREE_DELTAS_REQUIRED')
    dest = operation_host(ops.ROOT)
    final_receipt = {'format':'T45_R3_05_SERVICE19_OPERATION_V1', 'archiveSha256':ARCHIVE, 'readySha256':READY,
                     'operatorManifestSha256':OPERATOR_MANIFEST, 'operatorHostSha256':OPERATOR_HOST,
                     'operatorLeafPins':{path:row[2] for path,row in OPERATOR_FILES.items()},
                     'sourceSetSha256':SOURCE, 'manifestSha256':MANIFEST, 'sourceFiles':223,
                     'payloadDevice':receipt['payloadDevice'], 'payloadInode':receipt['payloadInode'],
                     'operationSourceRoot':str(OPERATION), 'nodeModulesSource':str(DEPS)}
    if not os.path.lexists(dest.parent):
        dest.parent.mkdir(mode=0o755);dest.parent.chmod(0o755)
        dest.mkdir(mode=0o755);dest.chmod(0o755)
        for row in rows:
            path = dest/row['sourcePath']
            raw = protected_file(ops, payload/row['path'], row['bytes'])
            need(len(raw) == row['bytes'] and sha(raw) == row['sha256'], 'EXACT_E537_MEMBER_DIFFERS')
            body=leaves.get(row['sourcePath'],raw)
            expected=current[row['sourcePath']]
            need(len(body)==expected['bytes'] and sha(body)==expected['sha256'],'EXACT_SERVICE19_COMPOSED_MEMBER_DIFFERS')
            path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
            for parent in path.parents:
                if parent == dest:break
                parent.chmod(0o755)
            ops.new_file(path,body,0o444)
        (dest/'node_modules').mkdir(mode=0o755);(dest/'node_modules').chmod(0o755)
        for path,row in current.items():
            actual=protected_file(ops,dest/path,row['bytes'],mode=0o444,group=0)
            need(len(actual)==row['bytes'] and sha(actual)==row['sha256'],'EXACT_SERVICE19_INSTALLED_CLOSURE_DIFFERS')
        ops.syncdir(dest)
        ops.new_json(dest.parent/'operation-ready.json', final_receipt)
    validate_operation(ops, receipt=final_receipt)
    return final_receipt


def validate_operation(ops, *, receipt=None):
    verify_locked_linux_dependencies(ops)
    dest = operation_host(ops.ROOT)
    raw = protected_file(ops, dest.parent/'operation-ready.json', 65536, mode=0o600, group=0)
    need(sha(raw)=='d16944aa32c22cb00c2b040a14b8ff59b8497d0b181d582b1e4a451e09bf6bde','EXACT_RETAINED_SERVICE19_OPERATION_READY_DIFFERS')
    row = ops.strict(raw)
    fixed = {'format':'T45_R3_05_SERVICE19_OPERATION_V1', 'archiveSha256':ARCHIVE, 'readySha256':READY,
                     'operatorManifestSha256':OPERATOR_MANIFEST, 'operatorHostSha256':OPERATOR_HOST,
             'operatorLeafPins':{path:row[2] for path,row in OPERATOR_FILES.items()},
             'sourceSetSha256':SOURCE, 'manifestSha256':MANIFEST, 'sourceFiles':223,
             'operationSourceRoot':str(OPERATION), 'nodeModulesSource':str(DEPS)}
    need(set(row) == set(fixed)|{'payloadDevice','payloadInode'}
         and all(row[key] == value for key,value in fixed.items())
         and all(type(row[key]) is int and row[key] > 0 for key in ('payloadDevice','payloadInode'))
         and (receipt is None or row == receipt), 'EXACT_E537_OPERATION_RECEIPT_DIFFERS')
    payload = ops.ROOT.with_name('r3-maintenance-service12-e43584e9-payload-20261113-01')/'payload'
    payload_stat = ops.trusted(payload).lstat()
    need((payload_stat.st_dev,payload_stat.st_ino) == (row['payloadDevice'],row['payloadInode']),
         'EXACT_E537_PAYLOAD_IDENTITY_DIFFERS')
    for directory in (dest.parent,dest,dest/'node_modules'):
        st = ops.trusted(directory).lstat()
        need(stat.S_ISDIR(st.st_mode) and stat.S_IMODE(st.st_mode) == 0o755,
             'EXACT_E537_OPERATION_DIRECTORY_DIFFERS')
    for path,(name,size,pin) in OPERATOR_FILES.items():
        body=protected_file(ops,dest/path,size,mode=0o444,group=0)
        need(len(body)==size and sha(body)==pin,'EXACT_SERVICE19_OPERATOR_LEAF_DIFFERS')
    return row


def authority_inputs(ops, auth, include_proof=False):
    source = ops.ROOT/'authority'
    pins = {PROVISION:None,DEPLOYMENT:ops.MANIFEST_SHA,INSTALLATION:'4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e',
            ADMIN154:auth['admin154RecordSha256'],SQL38:auth['record38Sha256']}
    if include_proof:
        pins[PROOF] = None
    values = {}
    for name,pin in pins.items():
        raw = protected_file(ops, source/name, 2*1024*1024 if name == DEPLOYMENT else 65536)
        if name == PROVISION:
            need(source.joinpath(name).lstat().st_mode & 0o077 == 0, 'ORIGINAL_PROVISION_MUST_STAY_PRIVATE')
        need(pin is None or sha(raw) == pin, 'EXACT_ORIGINAL_AUTHORITY_BYTES_DIFFERS')
        values[name] = raw
    return values


def stage(ops, boot, auth):
    launchers = boot/'launchers-61035'
    launchers.mkdir(mode=0o700)
    authority = boot/'authority-61035'
    authority.mkdir(mode=0o700)
    for name,pin in LAUNCHERS.items():
        rel = INSTALLER+name
        source = ops.first_native_launcher(rel)
        need(source == ops.ROOT/'native-launchers'/name and ops.FIRST_NATIVE_DELTA[rel][1] == pin,
             'EXACT_ORIGINAL_LAUNCHER_SCOPE_DIFFERS')
        raw = protected_file(ops,source,262144,mode=0o400,group=0)
        need(sha(raw) == pin, 'EXACT_ORIGINAL_LAUNCHER_BYTES_DIFFERS')
        copy_once(ops, launchers/name, raw, 0o440, WORKER)
    for name,raw in authority_inputs(ops,auth).items():
        mode,group = (0o400,0) if name in (PROVISION,DEPLOYMENT) else (0o440,WORKER)
        copy_once(ops,authority/name,raw,mode,group)
    os.chown(authority,0,WORKER)
    authority.chmod(0o750)
    ops.syncdir(authority)
    ops.syncdir(boot)


def verify_projection(ops, auth, *, include_proof=False):
    boot = boot_host(ops.ROOT)
    folder = ops.trusted(boot/'authority-61035').lstat()
    need(stat.S_ISDIR(folder.st_mode) and folder.st_gid == WORKER and stat.S_IMODE(folder.st_mode) == 0o750,
         'EXACT_AUTHORITY_PROJECTION_DIRECTORY_DIFFERS')
    for name,pin in LAUNCHERS.items():
        raw = protected_file(ops,boot/'launchers-61035'/name,262144,mode=0o440,group=WORKER)
        need(sha(raw) == pin, 'EXACT_LAUNCHER_PROJECTION_BYTES_DIFFERS')
    for name,raw in authority_inputs(ops,auth,include_proof).items():
        mode,group = (0o400,0) if name in (PROVISION,DEPLOYMENT) else (0o440,WORKER)
        need(protected_file(ops,boot/'authority-61035'/name,2*1024*1024,mode=mode,group=group) == raw,
             'EXACT_AUTHORITY_PROJECTION_BYTES_DIFFERS')
    allowed = {PROVISION,DEPLOYMENT,INSTALLATION,ADMIN154,SQL38}
    if include_proof:
        allowed.add(PROOF)
    need({path.name for path in (boot/'authority-61035').iterdir()} <= allowed,
         'UNEXPECTED_AUTHORITY_PROJECTION_LEAF')
    validate_operation(ops)


def publish_proof(ops, raw):
    copy_once(ops,boot_host(ops.ROOT)/'authority-61035'/PROOF,raw,0o440,WORKER)


def publish_execution(ops, expected_sha):
    raw = protected_file(ops,ops.ROOT/'authority'/EXECUTION,65536)
    need(sha(raw) == expected_sha, 'EXACT_EXECUTION_AUTHORITY_BYTES_DIFFERS')
    target = boot_host(ops.ROOT)/'authority-61035'/EXECUTION
    if not os.path.lexists(target):
        copy_once(ops,target,raw,0o440,WORKER)
    need(protected_file(ops,target,65536,mode=0o440,group=WORKER) == raw,
         'EXACT_EXECUTION_PROJECTION_BYTES_DIFFERS')


def retire_execution(ops, expected_sha):
    target = boot_host(ops.ROOT)/'authority-61035'/EXECUTION
    if not os.path.lexists(target):
        return
    raw = protected_file(ops,target,65536,mode=0o440,group=WORKER)
    need(sha(raw) == expected_sha, 'EXACT_EXECUTION_PROJECTION_BYTES_DIFFERS')
    target.unlink()
    ops.syncdir(target.parent)


def bind_spec(root):
    boot = boot_host(root)
    launchers = {str(DEPLOY/INSTALLER/name):(boot/'launchers-61035'/name,False)
                 for name in LAUNCHERS}
    return {
        **launchers, str(AUTHORITY):(boot/'authority-61035',False),
        str(OPERATION):(operation_host(root),False), str(OPERATION/'node_modules'):(DEPS,False),
    }


def host_mount_evidence(ops, auth):
    verify_projection(ops,auth)
    return {'format':'T45_R3_05_READONLY_MOUNTS_V1',
            'operation':validate_operation(ops),
            'mounts':[{'source':str(source),'target':target,'readonly':not rw}
                      for target,(source,rw) in bind_spec(ops.ROOT).items()]}


def replace_args(ops, args):
    spec = bind_spec(ops.ROOT)
    originals = {str(DEPLOY/INSTALLER/name):(ops.first_native_launcher(INSTALLER+name),False) for name in LAUNCHERS}
    originals[str(AUTHORITY)] = (ops.ROOT/'authority',True)
    args = list(args)
    for target,(source,rw) in originals.items():
        old = ops.mount([],source,target,not rw)
        new_source,new_rw = spec[target]
        need(args.count(old[1]) == 1, 'EXACT_ORIGINAL_BIND_ARGUMENT_REQUIRED')
        index = args.index(old[1])
        need(args[index-1:index+1] == old, 'EXACT_ORIGINAL_BIND_ARGUMENT_REQUIRED')
        args[index] = ops.mount([],new_source,target,not new_rw)[1]
    extra = []
    for target in (str(OPERATION),str(OPERATION/'node_modules')):
        extra = ops.mount(extra,spec[target][0],target,True)
    index = args.index('--entrypoint')
    return args[:index]+extra+args[index:]


def check_binds(root, mounts):
    spec = bind_spec(root)
    seen = set()
    for row in mounts:
        target = row['Destination']
        if target not in spec:
            need(not any(target.startswith(parent+'/') for parent in
                         (str(DEPLOY),str(AUTHORITY),str(OPERATION))), 'UNEXPECTED_FIXED_BIND_DESCENDANT')
            continue
        source,rw = spec[target]
        need(target not in seen and row['Type'] == 'bind' and row['Source'] == str(source)
             and row['RW'] is rw, 'EXACT_READONLY_BIND_DIFFERS')
        seen.add(target)
    need(seen == set(spec), 'EXACT_READONLY_BIND_MISSING')


def originals_for_verifier(ops, mounts):
    check_binds(ops.ROOT, mounts)
    spec = bind_spec(ops.ROOT)
    old = {str(DEPLOY/INSTALLER/name):(ops.first_native_launcher(INSTALLER+name),False) for name in LAUNCHERS}
    old[str(AUTHORITY)] = (ops.ROOT/'authority',True)
    return [dict(row,Source=str(old[row['Destination']][0]),RW=old[row['Destination']][1])
            if row['Destination'] in old else row for row in mounts
            if row['Destination'] not in spec or row['Destination'] in old]


WORKER_PROBE = r"""
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {watch} from 'node:fs';
import {open,readFile,lstat,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [root,phase,sourceSha,launchersRaw] = process.argv.slice(1);
const authority='/etc/naijue-erp', deploy='/opt/naijue-erp/fresh35-combined-v1';
assert.equal(process.getuid(),61035);
assert.equal(process.getgid(),61035);
assert.ok(process.getgroups().every(group=>group===61035));
const observer=watch(authority,()=>{});
observer.close();
for(const [name,pin] of Object.entries(JSON.parse(launchersRaw))){
 const path=deploy+'/scripts/release/unified-install/'+name;
 assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),pin);
}
const records=['fresh35-combined-installation-v1.json','fresh35-admin154-successor-v1.json',
               'fresh35-compact-zero-successor-v2.json','fresh35-current-production-service-v2-service-33.json'];
if(phase==='EXECUTE')records.push('fresh35-compact-zero-execution-v2.json');
for(const path of [...records.map(name=>authority+'/'+name),'/run/naijue-rewrite/current-production-service.json']){
 const fd=await open(path,'r');
 try{assert.ok((await fd.stat()).isFile());}finally{await fd.close();}
}
for(const name of ['fresh35-production-provision-v2.json','fresh35-isolated-deployment-v1.json'])
 await assert.rejects(open(authority+'/'+name,'r'),{code:'EACCES'});
const source=await import(pathToFileURL(root+'/scripts/release/unified-install/fresh35-combined-source-v1.mjs'));
const refs=await source.resolveFresh35ReferenceInputPaths(deploy+'/reference-inputs');
const descriptor=source.describeFresh35CombinedSource(await source.loadFresh35CompactZeroSource(root,refs));
assert.equal(descriptor.sourceSetSha256,sourceSha);
assert.equal(descriptor.currentSourcePins.length,223);
const require=createRequire(root+'/package.json');
const pg=await realpath(require.resolve('pg/package.json'));
assert.equal(pg,root+'/node_modules/pg/package.json');
assert.ok((await lstat(pg)).isFile());
assert.equal(require('pg/package.json').version,'8.23.1');
assert.equal(typeof require('pg').Client,'function');
console.log(JSON.stringify({uid:61035,sourceSetSha256:sourceSha,sourcePins:223,authorityWatch:true,
 launcherFiles:2,recordFiles:records.length+1,pgVersion:'8.23.1',databaseConnections:0}));
"""
