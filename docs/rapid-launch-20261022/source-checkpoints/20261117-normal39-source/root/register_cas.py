"""Single SOURCE registration using the original shared lock/publish CAS protocol."""
from pathlib import Path
from types import ModuleType
import base64,fcntl,hashlib,json,os,re,socket,stat,subprocess,sys,time
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
P=Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
H=B/'r3-05-write-continuity'
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
LOCK_ID=[66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
ENTRY=B/'r3-normal39-registration-source-20261117-01/register_cas.py'
AUDIT=B/'r3-normal39-registration-cas-20261117-01'
NEW_MODULE=P/'r3_normal39_continuation.py'
NEW_POLICY=H/'direct39-batched-real.json'
PENDING=P/'.normal39-dispatcher.pending'
OLD_DISPATCHER='69d52a00145421a7e675685aa626a30cdb5ffe0e62fdcba7c8ba272f18c01262'
STATIC={'basis': {'/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-38/results/normal-service-result.json': '5faf78825a2589ea2b276d269646cf947a0f0b2695a76ff7917941c0333c4059', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root07-source-delta-20261117-01/results/batched-source-materialization.json': '549e0670727b55f057cc11706ae0886be8f9310e50e452988031c36673eb3469', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-04/results/final33-prepare-result.json': '111dd7b6c011ae7cd85326df4ce7efd986ec336a3062ff72e2cbd68fa0a38df6', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-apply-20261116-01/results/maintenance-auth-result.json': '12ecde16359fd2f2a5f893d5af3dd48f244baefdb41f6d7168f598a577c3fc63', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-restore-20261116-01/results/maintenance-auth-result.json': '28ea93fa6f66b93479fe7d0696a1d167dd6344bb18737e0cb6f1df83846069be', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': '25242a3faa21121b89378436a36e1a36105a313f65542b0c6b857eee6fb39d8d', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-first-r3-native-service-start-20261116-38.json': 'da9c547a4981c1edd31049ddb138073991a6a279562435fcd573d1fa57998aaf', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-batched-root07-source-delta-20261117-01.json': 'f1228d139a4588d52af17fc611fb0f10bd0a0960b1d74b8f229928a9906edb9d', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-final33-plan-prepare-20261116-04.json': '96901db99ba450caf5d1f21c0421a50866c9eaf47d7cbd4a38beb8ac8e5a518c', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary38-auth-apply-20261116-01.json': 'aab86daa8e0ad1247d73992b58966ce0160b504fb0fed50c19a21b61dafb361f', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary38-auth-restore-20261116-01.json': 'f6c2773391ac2aa1c3c76181905b310517d736d933bdf7c6b55678c132e60747', '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary38-preserve-stop-20261116-01.json': '2f87bec15310fd9b6d0f28a8084e54ee4b926681c7d2dee07e0473ab51411dec', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-38/r3-outer-terminal.json': 'da9c547a4981c1edd31049ddb138073991a6a279562435fcd573d1fa57998aaf', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-38/results/normal-service-result.json': 'a87fac20c34ff46336287e16d3e3dd808df0d67176467921b860e5b266bd6f2d', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root07-source-delta-20261117-01/r3-outer-terminal.json': 'f1228d139a4588d52af17fc611fb0f10bd0a0960b1d74b8f229928a9906edb9d', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root07-source-delta-20261117-01/results/batched-source-materialization.json': '84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-04/r3-outer-terminal.json': '96901db99ba450caf5d1f21c0421a50866c9eaf47d7cbd4a38beb8ac8e5a518c', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-04/results/final33-prepare-result.json': '81d92aadb2f8b298660924b11fddbf8b074609f36d70e767860ef967f5f93bfa', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-apply-20261116-01/r3-outer-terminal.json': 'aab86daa8e0ad1247d73992b58966ce0160b504fb0fed50c19a21b61dafb361f', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-apply-20261116-01/results/maintenance-auth-result.json': 'c6b9415364bd8658aa15d38015fb4200f606a074305a89b0239358eddbb45d80', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-restore-20261116-01/r3-outer-terminal.json': 'f6c2773391ac2aa1c3c76181905b310517d736d933bdf7c6b55678c132e60747', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-auth-restore-20261116-01/results/maintenance-auth-result.json': '83c86cc684d3fbe63c752b73bdfa42cc4046145f5ea754baa10561ca1fd2486f', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-preserve-stop-20261116-01/r3-outer-terminal.json': '2f87bec15310fd9b6d0f28a8084e54ee4b926681c7d2dee07e0473ab51411dec', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary38-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': '2815ba3c28d758f273cef7cff94bdcf1ff5bb4c95fa3bcf64f6f14c8493a6b55', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct38-batched-real.json': '51da8cb64ce60386c60340126f95bb85a99a01d0275845a048dc600e092d949e', '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/root07-source-only-20261117-01.json': 'b87fa978f93da13582569027b8453cd3aedaaf3bd700aa26fdb8a500f6050189', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-38.json': 'a9e740c7dff329838f8fd82572d90353378c6e8b3fb1a3c29ac1fdd2362837e3', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/source-materialization.json': '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root07-20261117-01/source-materialization.json': '84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-38/retained-ack.json': 'dfb22f8067931383447cacbc9a1f15987232853cbda869a24d41bc1ddf430721', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py': '69d52a00145421a7e675685aa626a30cdb5ffe0e62fdcba7c8ba272f18c01262', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct38_aux_prepare.py': '3b7ebfcb95df010fdbd585b5551851cba6cd65953e54352ab25ee01bb3ec368d', '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_root07_source_admission.py': '76f8913957c728b82dbbd9d5831cfd085a95436f283aa8be997e47802dae6080'}, 'privateCustodyStatOnly': {'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/applied.json': {'device': 66304, 'inode': 13666453, 'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 493}, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/finite-auth.json': {'device': 66304, 'inode': 13666450, 'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 2549}, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/original-auth.json': {'device': 66304, 'inode': 13666447, 'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 2533}, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/restore-attempt.json': {'device': 66304, 'inode': 13666510, 'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 114}, '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/restored.json': {'device': 66304, 'inode': 13666512, 'uid': 0, 'gid': 0, 'mode': 256, 'bytes': 466}}, 'actualRootPins': {'dispatcher': '69d52a00145421a7e675685aa626a30cdb5ffe0e62fdcba7c8ba272f18c01262', 'helper': '3b7ebfcb95df010fdbd585b5551851cba6cd65953e54352ab25ee01bb3ec368d', 'policy': '51da8cb64ce60386c60340126f95bb85a99a01d0275845a048dc600e092d949e', 'sourceModule': '76f8913957c728b82dbbd9d5831cfd085a95436f283aa8be997e47802dae6080', 'sourcePolicy': 'b87fa978f93da13582569027b8453cd3aedaaf3bd700aa26fdb8a500f6050189'}, 'jobs': {'apply': 't45-r3-ordinary39-auth-apply-20261116-01', 'prepare': 't45-r3-final33-plan-prepare-20261116-05', 'restore': 't45-r3-ordinary39-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-39', 'stop': 't45-r3-ordinary39-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01'}, 'expectedRules': {'apply': {'jobId': 't45-r3-ordinary39-auth-apply-20261116-01', 'script': 'ordinary05_roles_job.py', 'authorityLeaf': 'host-authorization.json', 'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5', 'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73', 'ordinary05_roles.py': '0f4229f47364141ba655d52da13aedfa71063ffe220b8691bfb0947787c9c629', 'ordinary05_roles_job.py': 'a77d060097c6fc3e646dd1c600b985f2778b3ffce40ce17ba1ecc3faf52ad201', 'prior_preserved38.py': '675de81485628850355a97ec2ae58997bb45e537e529b71899457b9a02075fde', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a'}, 'timeoutSeconds': 300, 'deadlineField': 'expiresAt'}, 'prepare': {'jobId': 't45-r3-final33-plan-prepare-20261116-05', 'script': 'final33_host.py', 'authorityLeaf': 'host-authorization.json', 'bundlePins': {'final33-run.mjs': '1be01cec400b242cbcf7ff45451e5e60f0bbc87a1d0ea3f7bb2e527d56ee8851', 'final33_host.py': '9de42adf7eed263f378e6be61ce21ef122250654ff1809e4d0ae9b55626dc5e8', 'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4', 'nonroot_input_access.py': '0dab63562102ded384773477bdcad0c01d3ff5d2aa076431bacf5bd973b43385', 'normal05_retained_stop.py': '484c1c15b0d5a51a45b5eeba83255f5f1c976bca3ec01a52af4b6f8f00815e1e', 'r3_05_cli.py': 'b5e48708ca9b910d0aa0f85c689540958534afb4ded346c4d598dca5d0aa6ad6', 'r3_05_runtime.py': 'a6bf0977ef187c4b950685c90feb5bd3ca708f0e9ff8fa6767de5311ba6cdb62', 'source-catalog-lineage.json': 'eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0', 'source_lineage.py': 'c3db9e977206bfb148d5a61e98f47d05f6367160bf6af9a03aa6e58815a8a736'}, 'timeoutSeconds': 780, 'deadlineField': 'expiresAt'}, 'restore': {'jobId': 't45-r3-ordinary39-auth-restore-20261116-01', 'script': 'ordinary05_roles_job.py', 'authorityLeaf': 'host-authorization.json', 'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5', 'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73', 'ordinary05_roles.py': '0f4229f47364141ba655d52da13aedfa71063ffe220b8691bfb0947787c9c629', 'ordinary05_roles_job.py': 'a77d060097c6fc3e646dd1c600b985f2778b3ffce40ce17ba1ecc3faf52ad201', 'prior_preserved38.py': '675de81485628850355a97ec2ae58997bb45e537e529b71899457b9a02075fde', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a'}, 'timeoutSeconds': 300, 'deadlineField': 'expiresAt'}, 'start': {'jobId': 't45-first-r3-native-service-start-20261116-39', 'script': 'normal_service05_after08.py', 'authorityLeaf': 'service-start-authorization.json', 'bundlePins': {'batched161-run.mjs': '0f45396df7aec8bac9651591c685b30f7d318066feffb0f7f4e98df592855af6', 'final33-run.mjs': '1be01cec400b242cbcf7ff45451e5e60f0bbc87a1d0ea3f7bb2e527d56ee8851', 'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360', 'normal_service05_after08.py': '8f87d994ce56007446dfa8b60c64ab28dc9d8bbb34a9c08db4f088a49f866eea', 'normal_service05_after08_proof.py': 'b5f8085ef7822e5957c879ccc9f2d5a730be0577617f4c93bf11a15e8f0aaeee', 'operator-host.mjs': '7c88c0fae43c544959b2834f81dfe32fec2b99fbedd9c1533494c68e109245ae', 'operator-manifest.json': 'c4795906bdfab154e5cd66305a3e9ec698cd1a0b23e3a896258b396540a42184', 'operator-stream-import-cli.mjs': '6836bb2aadbfcd81621e0a49143ff5a44b26c9a913c8b12b4925296037113e5e', 'operator-stream-program.mjs': 'fa0ca2e0e41fe83925155406959d683458671d647caf475ce6ebf0b9761c87f6', 'prior_preserved38.py': '675de81485628850355a97ec2ae58997bb45e537e529b71899457b9a02075fde', 'production-plan.json': '7a416900f8b3988dc51b118a928c277f252fad1f736928d72003b1f21e0ce17d', 'r3_05_cli.py': 'b3f963efd9e8b37b653bf9eeaf5e9bfdc71b689a0f45c100a1d95fb9348f05c0', 'r3_05_readonly.py': 'e99c9fc2db646cfc33e8b835f228f5b34c195a18b89923003c80c8f7943e8932', 'r3_05_runtime.py': 'a6bf0977ef187c4b950685c90feb5bd3ca708f0e9ff8fa6767de5311ba6cdb62', 'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a', 'root07_material.py': '55ac6600ac982367b9d99678193b3a80dfe8e05b76828022c0c1aeb24a8864e2', 'source-catalog-lineage.json': 'eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0', 'source_lineage.py': 'c3db9e977206bfb148d5a61e98f47d05f6367160bf6af9a03aa6e58815a8a736', 'start_owned_describe.py': 'cf552c086430357e90c996f6e9c76dd2d907d1cc06655d3177fbb9b37f055fe3'}, 'timeoutSeconds': 300, 'deadlineField': 'expiresAt'}, 'stop': {'jobId': 't45-r3-ordinary39-preserve-stop-20261116-01', 'script': 'normal05_preserve_stop.py', 'authorityLeaf': 'normal05-preserve-stop-input.json', 'bundlePins': {'normal05_preserve_stop.py': '342be8649e454011ce84dd05957206150705ee77bcb9b2757bc613278c9845d2', 'normal05_retained_stop.py': '484c1c15b0d5a51a45b5eeba83255f5f1c976bca3ec01a52af4b6f8f00815e1e'}, 'timeoutSeconds': 120, 'deadlineField': 'expiresAt'}, 'writer': {'jobId': 't45-r3-batched-real-execute-20261115-01', 'script': 'final33_host.py', 'authorityLeaf': 'host-authorization.json', 'bundlePins': {'final33-run.mjs': '1be01cec400b242cbcf7ff45451e5e60f0bbc87a1d0ea3f7bb2e527d56ee8851', 'final33_host.py': '9de42adf7eed263f378e6be61ce21ef122250654ff1809e4d0ae9b55626dc5e8', 'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4', 'nonroot_input_access.py': '0dab63562102ded384773477bdcad0c01d3ff5d2aa076431bacf5bd973b43385', 'normal05_retained_stop.py': '484c1c15b0d5a51a45b5eeba83255f5f1c976bca3ec01a52af4b6f8f00815e1e', 'r3_05_cli.py': 'b5e48708ca9b910d0aa0f85c689540958534afb4ded346c4d598dca5d0aa6ad6', 'r3_05_runtime.py': 'a6bf0977ef187c4b950685c90feb5bd3ca708f0e9ff8fa6767de5311ba6cdb62', 'source-catalog-lineage.json': 'eb69d614ca0d9e42bd87110724725122e585a4f8f4146ea6b14cfa32ae235ce0', 'source_lineage.py': 'c3db9e977206bfb148d5a61e98f47d05f6367160bf6af9a03aa6e58815a8a736'}, 'timeoutSeconds': 3000, 'deadlineField': 'expiresAt'}}}

def need(ok, code):
    if not ok:
        raise ValueError('NORMAL34_REGISTRATION_' + code)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def now():
    return time.time_ns() // 1000000

def pack(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()

def identity(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]

def read(path, owner=0):
    need(path.resolve() == path, 'CANONICAL_INPUT_REQUIRED')
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), 'rb') as f:
        s = os.fstat(f.fileno())
        need(stat.S_ISREG(s.st_mode) and s.st_uid == owner and (s.st_nlink == 1) and (not s.st_mode & 18) and (0 < s.st_size <= 4 * 1024 ** 2), 'PROTECTED_INPUT_REQUIRED')
        raw = f.read(4 * 1024 ** 2 + 1)
        need(len(raw) == s.st_size and identity(s) == identity(os.fstat(f.fileno())) == identity(path.lstat()), 'INPUT_CHANGED')
    return (raw, identity(s))

def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def put(path, raw, mode=384):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 384), 'wb') as stream:
        need(stream.write(raw) == len(raw), 'SHORT_WRITE')
        stream.flush()
        os.fchown(stream.fileno(), 0, 0)
        os.fchmod(stream.fileno(), mode)
        os.fsync(stream.fileno())
    sync(path.parent)

MODULE_SHA256 = 'b8ec4823753f791332631a1f907a79c4f9d752e2e74108d7b572510b7f610785'
TEMPLATE_SHA256 = 'd1e257e94a8ea4be12a23bac53360d268d195a25cac51c3432eee87720235def'

def scope():
 return dict(format='T45_NORMAL39_REGISTRATION_CAS_V1',grantId='b16447fbc81f4d64',oldRootPins=STATIC['actualRootPins'],newModuleSha256=MODULE_SHA256,dispatcherTemplateSha256=TEMPLATE_SHA256,newModulePath=str(NEW_MODULE),newPolicyPath=str(NEW_POLICY),jobs=STATIC['jobs'],publishOrder=['module','policy','dispatcher'],sourceRegistrationOnly=True,businessDatabaseWrites=0,completedSourceAndHistoryPreserved=True)

def validate_policy_delta(p,cfg):
 need(type(p)is dict and set(p)=={'format','grantId','startsAt','expiresAt','jobs'}and p['format']=='T45_R3_NORMAL39_BATCHED_REAL_V1'and p['grantId']==cfg['grantId']=='b16447fbc81f4d64'and set(p['jobs'])==set(STATIC['jobs']),'EXACT_NORMAL39_POLICY_REQUIRED')
 need(type(p['startsAt'])is type(p['expiresAt'])is int and p['expiresAt']==p['startsAt']+10800000,'EXACT_THREE_HOUR_POLICY_REQUIRED')
 role_pins=[]
 for phase,r in p['jobs'].items():
  rule=dict(r);pins=dict(rule['bundlePins'])
  if phase in ('apply','restore'):need('roles-authorization.json'in pins,'NEW_ROLE_PIN_REQUIRED');role_pins.append(pins.pop('roles-authorization.json'))
  rule['bundlePins']=pins;need(rule==STATIC['expectedRules'][phase],'EXACT_FROZEN_CONSUMER_RULE_REQUIRED')
 need(len(role_pins)==2 and role_pins[0]==role_pins[1]and re.fullmatch('[a-f0-9]{64}',role_pins[0])and role_pins[0]!='941991a7401ae24448f7f90e2e24973db701b1ef635bbeb64685abec4a9c949b','NEW39_SAME_ROLE_PIN_REQUIRED')

def render(files):
 need(set(files)=={'module','policy','dispatcherTemplate'}and sha(files['module'])==MODULE_SHA256 and sha(files['dispatcherTemplate'])==TEMPLATE_SHA256,'EXACT_NORMAL39_SOURCE_REQUIRED')
 validate_policy_delta(json.loads(files['policy']),{'grantId':'b16447fbc81f4d64'})
 needle=b'NORMAL39_POLICY_SHA256 = None';need(files['dispatcherTemplate'].count(needle)==1,'EXACT_NORMAL39_PLACEHOLDER_REQUIRED')
 result=files['dispatcherTemplate'].replace(needle,('NORMAL39_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
 need(len(result)<=131072 and len(files['module'])<=131072,'ORIGINAL_SOURCE_CAP_REQUIRED');compile(result,str(P/'admin_exec.py'),'exec');compile(files['module'],str(NEW_MODULE),'exec');return result

def snapshot(a,dispatcher=OLD_DISPATCHER):
    need(set(a['oldIdentities'])==set(STATIC['basis'])|set(STATIC['privateCustodyStatOnly'])|{'executionLock'},'EXACT_IDENTITY_SET_REQUIRED')
    for name in STATIC['privateCustodyStatOnly']:
        need(identity(Path(name).lstat())==a['oldIdentities'][name],'PRIVATE_CUSTODY_STAT_CHANGED')
    for name,pin in STATIC['basis'].items():
        raw,meta=read(Path(name),1000 if name.startswith(str(C)+'/')else 0)
        changed=name==str(P/'admin_exec.py')and dispatcher!=OLD_DISPATCHER
        need(sha(raw)==(dispatcher if name==str(P/'admin_exec.py')else pin)and(changed or meta==a['oldIdentities'][name]),'ORIGINAL_BASIS_CHANGED')

def consumer(dispatcher,cfg,module_raw,policy_raw):
 wrapper=ModuleType('normal39_dispatcher');wrapper.__file__=str(P/'admin_exec.py');exec(compile(dispatcher,wrapper.__file__,'exec'),wrapper.__dict__)
 core,prior=wrapper.r3_continuity(cfg);need(prior.policy_sha256==STATIC['actualRootPins']['policy'],'PRESERVED_NORMAL38_POLICY_REQUIRED')
 module=ModuleType('normal39_continuation');module.__file__=str(NEW_MODULE);exec(compile(module_raw,module.__file__,'exec'),module.__dict__)
 original=core.read;core.read=lambda path,**kw:policy_raw if path==NEW_POLICY else original(path,**kw)
 try:hold=module.Normal39Continuation(core,prior,cfg,sha(policy_raw));hold.original_basis();hold.historical_install()
 finally:core.read=original
 return core,hold

def quiet():
 need(not os.path.lexists(P/'artifact-staging-authorization.json'),'UNRELATED_STAGING_AUTHORITY_PRESENT')
 state=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3');data=state/'state/fresh35-first-production-20261110-r3/data';s=data.lstat()
 need(stat.S_ISDIR(s.st_mode)and(s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13502421,61035,61035,0o700)and not os.path.lexists(data/'postmaster.pid'),'ORIGINAL_CURRENT_DATA_STOPPED_REQUIRED')
 marker=state/'state/installed-real-operation-batched-root07-20261117-01/source-materialization.json';need(sha(read(marker)[0])=='84599588dcf7b720d41d04bbea4b5f52b58396b2e16b1262d0ec639bdcf49065','COMPLETED_ROOT07_CURRENT_MARKER_REQUIRED')
 for path in (state/'state/native-services/ordinary39-auth-20261116-01',state/'state/native-services'/STATIC['jobs']['start'],state/'authority/fresh35-current-production-service-v2-service-39.json',state/'state/fresh35-first-production-20261110-r3/ordinary39-auth-capture-20261116-01',state/'state/real-first-20261110-r3/reports'/STATIC['jobs']['prepare']):
  need(not os.path.lexists(path),'NEW39_STATE_PRESENT_NO_REPLAY')
 for grant in ('b16447fbc81f4d64','5cc58239751e4e2a'):
  worker=B.with_name('grant-'+grant);control=C.with_name('grant-'+grant)
  for key in STATIC['jobs'].values():need(not any(os.path.lexists(path)for path in (worker/'jobs'/key,control/'jobs'/key,control/'requests'/(key+'.json'),control/'requests'/(key+'.tmp'),control/'results'/(key+'.json'))),'NEW39_OR_WRITER_KEY_PRESENT_NO_REPLAY')
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5);need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'ACTIVE_OPERATION_OR_UNKNOWN')

def decode(packet,expected):
    need(set(packet)=={'authorization','files'},'EXACT_PACKET_REQUIRED')
    raw=base64.b64decode(packet['authorization'],validate=True);need(sha(raw)==expected,'EXACT_EXTERNAL_AUTHORITY_REQUIRED');a=json.loads(raw)
    fixed=scope();variables={'sourceSha256','sourcePins','oldIdentities','startsAt','expiresAt','authorizationReference','independentReviewSha256'}
    need(set(a)==set(fixed)|variables and all(a[k]==v for k,v in fixed.items())and a['sourceSha256']==sha(read(Path(__file__))[0]),'EXACT_SOURCE_REGISTRATION_AUTHORITY_REQUIRED')
    need(type(a['startsAt'])is type(a['expiresAt'])is int and a['startsAt']<=now()<now()+30000<a['expiresAt']<=a['startsAt']+900000,'FINITE_REGISTRATION_WINDOW_REQUIRED')
    need(type(a['independentReviewSha256'])is str and re.fullmatch('[a-f0-9]{64}',a['independentReviewSha256'])and type(a['authorizationReference'])is str and 0<len(a['authorizationReference'])<=512,'EXACT_REVIEW_REFERENCE_REQUIRED')
    files={k:base64.b64decode(v,validate=True)for k,v in packet['files'].items()}
    need(set(files)==set(a['sourcePins'])=={'module','policy','dispatcherTemplate'}and all(0<len(v)<=131072 and sha(v)==a['sourcePins'][k]for k,v in files.items()),'EXACT_SOURCE_PACKET_REQUIRED')
    render(files);return a,files,raw

def register(a,files,authority):
    need(os.geteuid()==0 and socket.gethostname()=='naijue-server'and Path(__file__)==ENTRY,'EXACT_ROOT_ENTRY_REQUIRED')
    need(not any(os.path.lexists(path)for path in (AUDIT,NEW_MODULE,NEW_POLICY,PENDING)),'ALREADY_PRESENT_OR_UNKNOWN_READ_ORIGINAL_ONLY')
    for folder in (B,P,H,LOCK.parent):
        for path in [*reversed(folder.parents),folder]:
            s=path.lstat();need(path.resolve()==path and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&18,'PROTECTED_DIRECTORY_REQUIRED')
    with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b')as lock:
        need(identity(os.fstat(lock.fileno()))==a['oldIdentities']['executionLock']==LOCK_ID,'ORIGINAL_LOCK_CHANGED')
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);snapshot(a);quiet()
        old=read(P/'admin_exec.py')[0];cfg=json.loads(read(P/'grant.json')[0]);new=render(files)
        need(json.loads(files['policy'])['startsAt']==a['startsAt']and now()+5100000<json.loads(files['policy'])['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'FULL_NORMAL39_WINDOW_REQUIRED')
        consumer(old,cfg,files['module'],files['policy'])
        AUDIT.mkdir(mode=0o700);sync(AUDIT.parent)
        put(AUDIT/'authorization.json',authority);put(AUDIT/'old-dispatcher.bin',old)
        put(AUDIT/'old-normal-policy.bin',read(H/'direct38-batched-real.json')[0]);put(AUDIT/'old-identities.json',pack(a['oldIdentities']))
        result=dict(status='REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY',published=[],automaticReplay=False,businessDatabaseWrites=0)
        try:
            put(NEW_MODULE,files['module'],0o644);result['published'].append('module');snapshot(a);quiet()
            put(NEW_POLICY,files['policy']);result['published'].append('policy');consumer(new,cfg,files['module'],files['policy'])
            put(PENDING,new,0o755);snapshot(a);quiet();need(now()+30000<a['expiresAt'],'REGISTRATION_EXPIRED_BEFORE_CAS')
            put(AUDIT/'publish-intent.json',pack(dict(oldDispatcherSha256=OLD_DISPATCHER,dispatcherSha256=sha(new),moduleSha256=MODULE_SHA256,policySha256=sha(files['policy']))))
            os.replace(PENDING,P/'admin_exec.py');sync(P);result['published'].append('dispatcher')
            snapshot(a,sha(new));quiet();consumer(read(P/'admin_exec.py')[0],cfg,files['module'],files['policy'])
            need(identity(os.fstat(lock.fileno()))==LOCK_ID,'ORIGINAL_LOCK_CHANGED_AFTER_CAS')
            result.update(status='EXACT_NORMAL39_REGISTERED_NO_PHASE_SUBMITTED',dispatcherSha256=sha(new),moduleSha256=MODULE_SHA256,policySha256=sha(files['policy']),oldNormal38PolicyUnchanged=True,completedRoot07AdapterAndPolicyPreserved=True,originalLockPreserved=True,phaseSubmitted=False)
        except BaseException as error:
            result['exceptionClass']=type(error).__name__
            try:result['observedDispatcherSha256']=sha(read(P/'admin_exec.py')[0])
            except Exception:result['observedDispatcherSha256']=None
        put(AUDIT/'result.json',pack(result));return result

if __name__=='__main__':
    need(len(sys.argv)==2 and Path(__file__)==ENTRY,'EXACT_ENTRY_REQUIRED')
    a,files,authority=decode(json.load(sys.stdin),sys.argv[1]);result=register(a,files,authority)
    print(json.dumps(result,sort_keys=True));raise SystemExit(0 if result['status']=='EXACT_NORMAL39_REGISTERED_NO_PHASE_SUBMITTED'else 2)
