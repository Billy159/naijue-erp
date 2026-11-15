"""Existing three-file CAS registration for seven exact direct REAL phases."""
from pathlib import Path
from types import ModuleType,SimpleNamespace
import base64,fcntl,hashlib,json,os,re,stat,subprocess,sys,time
GRANT='b16447fbc81f4d64'
B=Path('/root/erp-release-20261006-01-worker/grant-'+GRANT)
P=Path('/usr/local/lib/naijue-erp-night/grant-'+GRANT)
C=Path('/home/naijue/erp-release-20261006-01-control/grant-'+GRANT)
H=B/'r3-05-write-continuity'
LOCK=B.with_name('grant-5cc58239751e4e2a')/'execution.lock'
ENTRY=B/'r3-direct30-start-describe-registration-source-20261116-01/register_cas.py'
AUDIT=B/'r3-direct30-start-describe-registration-cas-20261116-01'
OLD_DISPATCHER = 'e15c47bb947a402f87de40e9972161b577df78611dd7a8f87019ad2f48ea54ed'
CORE='1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d'
HELPER = '3c8835c7d0a151260a4c17f56f60253aeb1a52eddac5861001d26bf7820a9220'
TEMPLATE = 'c1477b97792894458af19dffffa23b4e1ba0d1e4e0d8451cdcc1b8991a49ec21'
JOBS = {'apply': 't45-r3-ordinary30-auth-apply-20261116-01', 'install': 't45-r3-batched-install-20261115-01', 'materialize': 't45-r3-batched-root04-source-delta-20261116-01', 'restore': 't45-r3-ordinary30-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-30', 'stop': 't45-r3-ordinary30-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01'}
BASIS={
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_absent22_continuation.py'):'16e54ec54cf945c086e547050fa7893e856b05e217f3b0b6feb650797e56e4fa',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original05-absent22-continuation.json'):'27c9b661d7ade353bb42be2b23f104879462749c117779d971d3c4d5b9cd6282',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_unknown22_inspect.py'):'32aecd9f5ee7079f243b78f89d5a58e051610e16e10490cb8a12538a74a9863f',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original05-unknown22-inspect.json'):'7fe44435553def39809cf8ad1a63532cd1aeb23f9bd8f1d45d13acef2d7c0e04',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original04_absent22_continuation.py'):'87c543d66e6a6d19f50d640cf8c1d483fb3e16a4eac4fcabcb6d1e1a2147a781',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original04-absent22-continuation.json'):'d2698af3e4d2acebf3198c93086af46cc9e20007b2ed4cac6839cc865730e913',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_inspect04.py'):'d39aac90e056fec55e23e1eea2086b62c52590edd61d7e438c55449a28401d95',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-inspect04.json'):'a3b5b3e3f0616c6f23007f3cf0a7ed34aead49b5cf2e486ded76c99e3961e99a',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_apply02.py'):'720e1c9344650f55351e8654b409d7a3b3c9e38e442be06911893907911c814d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-apply02.json'):'322a6ad5ab56f2ef268a9c93b5641d00c43b6076213652cd2289d411ae3e9a65',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_continuation.py'):'982e5b0178bd69a07d0d659d8793033a36093283c16632ea7811a9f53588dd1f',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-continuation.json'):'9f24ba07d7251e35c58d91e409377a46f62988a65845da92d6c1899ea097307b',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_continuation.py'):'162dfa8b90549da125465cde04d0936cf2d0592c6702a763e13fc47dca0d4c2e',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent21-continuation.json'):'a85a825c170cdb7adfc4394d1a843511d0563668be4992955809dfed10af21da',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_inspect03.py'):'fd84d560bc8903746fc31babfcab04e85f339ad1c2eff0bf31a5482a75d0591f',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent21-inspect03.json'):'cbed4bf8f7c5bdf28ff7187d7cdde45aff7fe049bb640631a2f42c9bfc39374e',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent_continuation.py'):'909abe203293f791cdaa909227a5a90e0ae16da2ab6fa45390d271f16f2ec19a',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent-continuation.json'):'74dea44d2b88283b1946aea35baee9c216dee6c2e2f1b19f440446e8390c377a',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_failed19_readonly.py'):'4c35abe0fc5ea65e6a3629bd6a690289d14586a790a1f2f2ce10cb3eb3cf808e',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/failed19-readonly-recovery.json'):'338d30dc3b3d39de130f0152899eeb92a1aa91c9c60d2073b06a2227bb4024cd',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py'):'e15c47bb947a402f87de40e9972161b577df78611dd7a8f87019ad2f48ea54ed',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_write_continuity.py'):'1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.before-r3-05-continuity.py'):'5bf72fc20dfa597c81a9eb5ae8956c497a980b1497e2cfbfe8d469932b27ad49',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/policy.json'):'25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/active.json'):'0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/bindings/writer.json'):'f6b60a9470edd408e2f2783e955669e9545b184c9e97a4f4fb4bf68cbea1ce01',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-20261110-r3-real-execute-20261114-02/r3-outer-terminal.json'):'ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/r3-outer-terminal.json'):'c4b2c12d626712ed4eb9409560539d2bed6ce42e77922990d7f033ce60aab24a',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/results/maintenance-auth-result.json'):'2dce7c2a3b0315c9291f7f8c9076879dcadb2d2427ef71c1883653cf254e994d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/results/maintenance-auth-cleanup.json'):'61b30a3bec3239c283faff791e876989e3bc4544e25f2611109cc24e603d1919',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched.py'):'d60c68633383f5da9e5054d518010bb6a4f34d3a068c51f87fa738d6f36a6cef',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct24-batched-real.json'):'cb384d2176e3a8c4a46fd3ffb1ce1e4b82b293f41c5647310c10f1b8e8a10898',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/r3-outer-terminal.json'):'6d2005bfd5cc61e34fa5e25eb0e5ef58b7addfa0490306ef634221c591e63461',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/results/maintenance-auth-result.json'):'77f6c66f5252fb5238e4f3cc1ed8dff030efd00413c09876d09d8fa63f217b21',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/bundle/ordinary05_roles_job.py'):'0d677daf02c1d567295efab3965dd8b90ce755188bb78b9b75cc8c56dea27451',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched_apply02.py'):'da4303f6597962842d0db5993396ca1012e2181ee2224ddec9f4bd01b1a69eef',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-preserve-stop-20261115-01/r3-outer-terminal.json'):'0a9ea80f2c52494c584e2dc7999766e725e604c9ec7d12c92af7424d1eb83a39',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-preserve-stop-20261115-01/results/normal05-preserve-stop-result.json'):'24c937badca67b63d07d13a7e976dc6433c0468dc7de50cf100f20a6e5f096a0',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/r3-outer-terminal.json'):'977a2d3ff1bb03e9bb8304a541dbc8b3e250df2c26aa0efe17b917c504947825',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/results/maintenance-auth-result.json'):'b275e1369531bb303ed0587a59a37af9215553afbedc782101ce2325ee8186ac',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/results/maintenance-auth-cleanup.json'):'fe681d7e4075572131519c74f64802dc964d859230255e02697cca25e474ea9b',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_batched.py'):'57d8ea9c363f4c4db743b99bfacafdafecdb644d8e65894a416ec2a418aa2810',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_restore_precontainer.py'):'ec89f4f472f559e621974b8f8187308b1de0d4049ddb568c9a1aa5cd545aadea',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct25-batched-real.json'):'8c6a2a9fa827da4fd8a81cdfce37c379d743886a02170724cc6ca221129a3afa',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-25/r3-outer-terminal.json'):'79c3657f7f0051c1646215ee7e5149ecfb6e6fa31606750167bc2e8f3b3f5738',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-25/results/normal-service-result.json'):'c2a5ee898726e66ebb53e309cb39d803069fa1336f19fd5c50b016187f5e90be',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/r3-outer-terminal.json'):'1b82a691e39b0a72495542757664773a9a204f84bc3331da243ab7f6fb2be238',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/results/maintenance-auth-result.json'):'ecf79874833ade08d7f63aceb1d6a80b587f1644ce727c22d9bc591cd54ea74d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/results/maintenance-auth-cleanup.json'):'281f7858e447a0665ad02444c43e2eb971651415c99a8e8307ad0db3c7664acd',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_batched.py'):'a4b5ef7bd42bad85089021095080785225c3efa7c6c7eef5b18029ada468e78d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct26-batched-real.json'):'ae952f261ad8b59fd5342c20acc69a5585b027997003cd684299b30aeebb3525',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root03-source-delta-20261116-01/r3-outer-terminal.json'):'db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root03-source-delta-20261116-01/results/batched-source-materialization.json'):'cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/r3-outer-terminal.json'):'c588bbc912a8b6bbe6c469abfd584c3b17b30ffe726bac331a5dfa3806587ba0',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/results/maintenance-auth-result.json'):'0545e87f04e9a6f66de318e911f527003d8902ac787d1844567e02c400a998af',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/results/maintenance-auth-cleanup.json'):'a657740b94edbad211e2e78fafad67fb25c513c255ec592472e6b2fbc60164c6',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-26/r3-outer-terminal.json'):'853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-26/results/normal-service-result.json'):'5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_restore_precontainer.py'):'165c5c4c2c1f6d3f6b6ba9f555aee42d112b6881740b61384aed45d7669ace0b',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/r3-outer-terminal.json'):'944dfa9b110fd836ee9e99a8944446111b1e68808d92280a5d220e91cd67fc63',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/results/maintenance-auth-result.json'):'d521106c1c1a5a20601f7ad125dd2c254ff1879a78d25c5a299c0464ed527bd8',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/results/maintenance-auth-cleanup.json'):'6bfcdbe6f9ef11e7816856e5e6672788461c75131f8a9f6a5c795aff65f34680',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct27_batched.py'):'45ee118981ebddd278240dc5bcd1ff0e05769092668e8021f8070c6ce0c04eba',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct27-batched-real.json'):'89f49225c19c1043e4a4a59c876876972b49abb9d5e0b29bcb699d5d069b2094',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/r3-outer-terminal.json'):'94933ecd1885265d8e84e1f7e3de72f0a73879f85ec490e5f3a0e0016761ad3e',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/results/maintenance-auth-result.json'):'396f58878c782fc2f598ea637469c2f499a1ee88f2a902561628e3e95b13ee5d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/results/maintenance-auth-cleanup.json'):'9a241d91ebc2e1a69a2c3a0f144e6dbda09019a619ec8b3632ba2787fe04db9c',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-27/r3-outer-terminal.json'):'ba1caa324ceba9a191479d45bd6e1b497e78b5adc7946d21589c296a2e300cd4',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-27/results/normal-service-result.json'):'808c633e8d7f11bac5e09efa21cbb3b40f39272a103b89af191624915b869609',
 Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-27.json'):'2640ef4df8bc3e2c64f31d327a41a1c4fddc9adf99584b68169ab854fe6c6dbb',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-preserve-stop-20261116-01/r3-outer-terminal.json'):'2dc418392380fe9313facee2b85cf06d79ad2b1e8fcac1faedd6c0263d1fd04f',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json'):'a5aa0eecb1cfa711b922a1cbbd227a25b7316c93bcfc83dc4ab4c60f5a56d24a',
 Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-27/cleanup.json'):'fda7c05908d7b94223901638b83a417d2d7f1c624d6d195abae6ede6fc0702e8',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/r3-outer-terminal.json'):'957f0f26d7ed9272ea675c855a7726e9627af7946774b9b8827fb720d47aafe0',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/results/maintenance-auth-result.json'):'90e8fc47b7df781cb325dc9e653510c2080da0e336748146e25d8751a4cc9fc7',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/results/maintenance-auth-cleanup.json'):'b8286a2e7449b7b9e165975fd5492fc6084eea1d1b9322e1b5f57e40c4c57339',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct27-fullchain-registration-cas-20261116-01/old-dispatcher.bin'):'4474fc511ed22a1e9c1a405ef81f35ddba2bdff2e0ba45c42e6ff18c0cf49cfb',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct28_batched.py'):'0fa08870dbf5fec3daf5a2c4d2300e3719666091252cff9ac12ec8fcfacc3261',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct28-batched-real.json'):'56bb27580cf88df1c61491366da765a501dd84f9dce70033bf1c2a601cb84858',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct28-start-describe-registration-cas-20261116-01/old-dispatcher.bin'):'f411beed0cd78307742f59aa6668a6e693ce8c6bae4b24e26182820a27869fec',
 Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-28.json'):'d57946c9ff13ee5715787ee1d1f0a13fe1ffd2a2898fa76ecc82545a5d3d18ae',
 Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-28/failed-start-cleanup.json'):'395dd08471c95dda1f56f4959ae315d135fbec582ff97f489167a6033cc840b8',
 Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-28/retained-ack.json'):'7296e03b9865a67718c0e938058dd7990000a72535e3b00a5a94e7b5be7b1b83',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/r3-outer-terminal.json'):'163a6252ea1ca699392c5955be78077e86e0a7d7ba75991044ada741bb1c409d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/results/maintenance-auth-result.json'):'7d2dff965ccae19fc835bb669a622b9555dfc5532f4426bab5c6443e05657abc',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/results/maintenance-auth-cleanup.json'):'c455111cf4de0d73782c9bf04c0dbc2aedd6df2a92c2a2d5914a736942cd6b87',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/r3-outer-terminal.json'):'89afe4cb6651db43fe530961e62040ded2ee8ed8ead9bb720ca079776ffe1408',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/normal-service-result.json'):'94cdae517c242cc904c7f68d1b43f31ce01aa87f7f0089fc1de93fb77c2cc29f',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/r3-outer-terminal.json'):'496966e4b649819a641dc72eab3a3a2ca65f3507f59f27d5d04144617d553db6',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/results/maintenance-auth-result.json'):'b8da5c9281edc26cc20c17702f0257fa1c95016a8744ae5a6eae7cf0c41ce5cc',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/results/maintenance-auth-cleanup.json'):'91477439a305528bf3a71041ab6db699cd8ae62869a3fd35c01c38249e648949',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/normal-service-incomplete.json'):'d3d32bee8c9792f5cfe8354e050cfec3a07977af7e3b324826b2d84b4330526d',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/genuine-describe-process.json'):'fe03bd630a02acfc63a14369f23bed5620f7f89cd0f9484c83a80c4828d72ae4',
 Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct29_batched.py'):'096f8ebca3ec5aee1f3091a18842e533e42932fb7b26d3da689e7a4d7a1de799',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct29-batched-real.json'):'faed7dec0ccd88d74745e47bbdca94bbb8a9095f550d8016945f38d76ead827e',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct29-start-describe-registration-cas-20261116-01/old-dispatcher.bin'):'6b6b0d0aee71e95e989431bb6df822ab77cfa925fdeab1a12077b4feb1205842',
 Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-29.json'):'e50a7112cb48fc987b220a514e62e2e370b08bc3322bfa0ed42babc50d379568',
 Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-29/failed-start-cleanup.json'):'4bc125537c15b9593e663b07fc95ea96f07e170e809c9b4a58d106bef8ae06cf',
 Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-29/retained-ack.json'):'ba6a0699b5b37a7b5e81bbd86ad5e8f9735e85f842da6449387c4ab91592a781',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/r3-outer-terminal.json'):'a30a2a024f2456e15254c3b8fef18d041b25b094d9835db694895ae5fe04a105',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/results/maintenance-auth-result.json'):'0a0c1142c8cb922397ee48da2868b1bf973950b9f8a89721e0914477905fe483',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/results/maintenance-auth-cleanup.json'):'04b8975792ea7a646af2c586d537cf09bd5d5a0412635f88aa3c7cb731756469',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/r3-outer-terminal.json'):'30e747021f4775edb001b3ce1d7463b813b3240b99819ac1cd5236e4c22c8990',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/normal-service-result.json'):'769ca923a3e9f15eb4a010d4e23a991ab06ce8bed759bd22f6d5580ae1a9c426',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/r3-outer-terminal.json'):'536e3726f2a4f0785e2ffc64fa8f89c82830652dd78ae29a773cf4c77a218004',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/results/maintenance-auth-result.json'):'f0cb72700e78fd5097911e0169054272c66b570fad2dcf0b2572cc2f66c34039',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/results/maintenance-auth-cleanup.json'):'1d50af6619b16eae16013ad0063b26cb5705eec58b49e156fffefd1ba3015b21',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/normal-service-incomplete.json'):'70c903267ecca60c8b0de9e9dfb6a044d3060516690d30f3997e4c89bcb153ab',
 Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/genuine-describe-process.json'):'719a1bcdeffacf67c8d2e24a37fa4226fa4925439bc16610934185a189d26935',
}
NEW_MODULE=P/'r3_direct30_batched.py';NEW_POLICY=H/'direct30-batched-real.json'
FILES={'module','policy','dispatcherTemplate'}
LOCK_ID=[66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
def need(v,c):
 if not v:raise ValueError('DIRECT30_START_DESCRIBE_REGISTRATION_'+c)
def sha(b):return hashlib.sha256(b).hexdigest()
def now():return time.time_ns()//1000000
def pack(v):return(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
def identity(s):return[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
def read(path,owner=0):
 need(path.resolve()==path,'CANONICAL_INPUT_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_uid==owner and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=4*1024**2,'PROTECTED_INPUT_REQUIRED')
  raw=f.read(4*1024**2+1);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'INPUT_CHANGED')
 return raw,identity(s)
def sync(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(fd)
 finally:os.close(fd)
def put(path,raw,mode=0o600):
 with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')as f:
  need(f.write(raw)==len(raw),'SHORT_WRITE');f.flush();os.fchown(f.fileno(),0,0);os.fchmod(f.fileno(),mode);os.fsync(f.fileno())
 sync(path.parent)
def scope():
 return dict(format='T45_DIRECT30_START_DESCRIBE_REGISTRATION_CAS_V1',grantId=GRANT,
  oldDispatcherSha256=OLD_DISPATCHER,originalCoreSha256=CORE,newModuleSha256=HELPER,dispatcherTemplateSha256=TEMPLATE,
  newModulePath=str(NEW_MODULE),newPolicyPath=str(NEW_POLICY),publishOrder=['module','policy','dispatcher'],
  jobKeys=JOBS,sourceRegistrationOnly=True,businessDatabaseWrites=0,oldHistoryChanged=False)
def decode(packet,expected):
 need(type(packet)is dict and set(packet)=={'authorization','files'},'EXACT_PACKET_REQUIRED')
 raw=base64.b64decode(packet['authorization'],validate=True);need(sha(raw)==expected,'EXTERNAL_AUTHORITY_BYTES_DIFFER');a=json.loads(raw);fixed=scope()
 need(set(a)==set(fixed)|{'sourceSha256','sourcePins','oldIdentities','startsAt','expiresAt','authorizationReference','independentReviewSha256'}
  and all(a[k]==v for k,v in fixed.items())and type(a['startsAt'])is type(a['expiresAt'])is int
  and a['startsAt']<=now()<now()+30000<a['expiresAt']<=a['startsAt']+900000,'EXACT_FINITE_AUTHORITY_REQUIRED')
 need(type(a['authorizationReference'])is str and 0<len(a['authorizationReference'])<=512
  and re.fullmatch('[a-f0-9]{64}',a['independentReviewSha256'])and a['sourceSha256']==sha(read(Path(__file__))[0]),'EXACT_REVIEWED_SOURCE_REQUIRED')
 need(set(packet['files'])==set(a['sourcePins'])==FILES and set(a['oldIdentities'])=={str(p)for p in BASIS}|{'executionLock'},'EXACT_INPUT_KEYS_REQUIRED')
 files={k:base64.b64decode(v,validate=True)for k,v in packet['files'].items()}
 need(all(0<len(raw)<=4*1024**2 and sha(raw)==a['sourcePins'][key]for key,raw in files.items())
  and sha(files['module'])==HELPER and sha(files['dispatcherTemplate'])==TEMPLATE,'EXACT_NEW_BYTES_REQUIRED')
 return a,files,raw

def snapshot(a,dispatcher=OLD_DISPATCHER,policy=None):
 result={}
 for path,pin in BASIS.items():
  raw,meta=read(path);expected=dispatcher if path==P/'admin_exec.py'else policy if path==NEW_POLICY and policy is not None else pin
  need(sha(raw)==expected and(path==P/'admin_exec.py'and dispatcher!=OLD_DISPATCHER or path==NEW_POLICY and policy is not None or meta==a['oldIdentities'][str(path)]),'ORIGINAL_BASIS_CHANGED')
  result[path]=(raw,meta)
 return result

def quiet_unused():
 host=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
 need(not os.path.lexists(host/'state/fresh35-first-production-20261110-r3/data/postmaster.pid'),'PG_PID_PRESENT')
 restore='t45-r3-ordinary26-auth-restore-20261116-01'
 raw=read(B/'jobs'/restore/'results/maintenance-auth-result.json')[0];public=read(C/'jobs'/restore/'results/maintenance-auth-result.json',1000)[0]
 need(sha(raw)=='d521106c1c1a5a20601f7ad125dd2c254ff1879a78d25c5a299c0464ed527bd8' and sha(public)=='57aff18487f294415830404abaf18f8a970b04b779d22e2d226018539c5879cb' and json.loads(raw)==json.loads(public),'EXACT_RESTORED26_RESULT_REQUIRED')
 q=subprocess.run(['/usr/bin/docker','ps','-aq','--filter','label=t45.operation=t45-first-r3-native-service-start-20261116-26'],capture_output=True,timeout=5);need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'FAILED26_CONTAINER_PRESENT_OR_UNKNOWN')
 q=subprocess.run(['/usr/bin/docker','inspect','--format','{"running":{{json .State.Running}},"pid":{{json .State.Pid}}}','698334aec0449e513c9e6d082e5d0e11e8f277bb12cd7b5baf0758c8c7011981'],capture_output=True,timeout=5);need(q.returncode==0 and not q.stderr and json.loads(q.stdout)=={'running':False,'pid':0},'RESTORE26_CONTAINER_ACTIVE_OR_UNKNOWN')
 restore27='t45-r3-ordinary27-auth-restore-20261116-01'
 raw27=read(B/'jobs'/restore27/'results/maintenance-auth-result.json')[0];public27=read(C/'jobs'/restore27/'results/maintenance-auth-result.json',1000)[0]
 need(sha(raw27)=='90e8fc47b7df781cb325dc9e653510c2080da0e336748146e25d8751a4cc9fc7' and sha(public27)=='9e2a41c47eeb23745dae3558266f3b01b9776594f95a766e8a4f742ee30a2be2' and json.loads(raw27)==json.loads(public27),'EXACT_RESTORED27_RESULT_REQUIRED')
 restored27=json.loads(raw27)['result'];need(restored27.get('exactOriginalVerifierAndExpiryVerifiedPrivately')is True and restored27.get('naturalExpiryCountedAsRestoration')is False,'ACTUAL_ORIGINAL_AUTH27_RESTORATION_REQUIRED')
 for cid27 in ('6c8f40034cd8f1940648d7bc9d9614fa660cfac1fa3844aae6847516902f8448','9337b8bfe7415343a5acd6b96ef619bcb02fcd2d6c1d019d5246c901d9f05310','9a5daf9489fbd15d9e341e5fe2f765eed880e08866ca267d29693d1b2ad90820'):
  q27=subprocess.run(['/usr/bin/docker','inspect','--format','{"running":{{json .State.Running}},"pid":{{json .State.Pid}}}',cid27],capture_output=True,timeout=5);need(q27.returncode==0 and not q27.stderr and json.loads(q27.stdout)=={'running':False,'pid':0},'PREVIOUS27_CONTAINER_ACTIVE_OR_UNKNOWN')
 restore28='t45-r3-ordinary28-auth-restore-20261116-01'
 raw28=read(B/'jobs'/restore28/'results/maintenance-auth-result.json')[0];public28=read(C/'jobs'/restore28/'results/maintenance-auth-result.json',1000)[0]
 need(sha(raw28)=='b8da5c9281edc26cc20c17702f0257fa1c95016a8744ae5a6eae7cf0c41ce5cc' and sha(public28)=='00813a0504f7fffe54e2614554e4a3489a2bcd5a9f3c69921717e781a7a1e98e' and json.loads(raw28)==json.loads(public28),'EXACT_RESTORED28_RESULT_REQUIRED')
 restored28=json.loads(raw28)['result'];need(restored28.get('exactOriginalVerifierAndExpiryVerifiedPrivately')is True and restored28.get('naturalExpiryCountedAsRestoration')is False,'ACTUAL_ORIGINAL_AUTH28_RESTORATION_REQUIRED')
 for cid28 in ('0fe68379c491aa5d7cdbdf83eed54d7bb0eae8d3f714d72d5a3ffe1d8efcdcb9','b9020f198b8dafed8c79b6fdffb33766d5912abad40ae45b24b1cb8f5fd28b50','0cbf0e2fa1350650a13dcd1e150359a774fcc566637943ee250936e3aa57ca89'):
  q28=subprocess.run(['/usr/bin/docker','inspect','--format','{"running":{{json .State.Running}},"pid":{{json .State.Pid}}}',cid28],capture_output=True,timeout=5);need(q28.returncode==0 and not q28.stderr and json.loads(q28.stdout)=={'running':False,'pid':0},'PREVIOUS28_CONTAINER_ACTIVE_OR_UNKNOWN')
 prior_material='t45-r3-batched-root03-source-delta-20261116-01'
 oldmat=read(B/'jobs'/prior_material/'r3-outer-terminal.json')[0];oldmatpub=read(C/'results'/(prior_material+'.json'),1000)[0];m=json.loads(oldmat)
 need(sha(oldmat)=='db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8' and oldmat==oldmatpub and m.get('jobId')==prior_material and m.get('status')=='COMPLETED' and m.get('exitCode')==0,'ACCEPTED_OLD03_MATERIALIZATION_TERMINAL_REQUIRED')
 priorproof=read(host/'state/installed-real-operation-batched-root03-20261116-01/source-materialization.json')[0];m=json.loads(priorproof)
 need(sha(priorproof)=='cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec' and m.get('sourceSetSha256')=='70339b80d4c2261094c5d794530406d3fc58ef78af3a90953d07502d9a21f61e' and m.get('sourceRowsSha256')=='399d3ac7ce1e7d903ba37b7243ea3c9d694712d9cb8f9fec06137125d7c89109' and m.get('sourceFiles')==381,'ACCEPTED_OLD03_MATERIALIZATION_PROOF_REQUIRED')
 restore29='t45-r3-ordinary29-auth-restore-20261116-01'
 raw29=read(B/'jobs'/restore29/'results/maintenance-auth-result.json')[0];public29=read(C/'jobs'/restore29/'results/maintenance-auth-result.json',1000)[0]
 need(sha(raw29)=='f0cb72700e78fd5097911e0169054272c66b570fad2dcf0b2572cc2f66c34039' and sha(public29)=='dd4e900aed60490397f99a14f6a275f8cf16239b764ab95799e569ca41aa0aed' and json.loads(raw29)==json.loads(public29),'EXACT_RESTORED29_RESULT_REQUIRED')
 restored29=json.loads(raw29)['result'];need(restored29.get('exactOriginalVerifierAndExpiryVerifiedPrivately')is True and restored29.get('naturalExpiryCountedAsRestoration')is False,'ACTUAL_ORIGINAL_AUTH29_RESTORATION_REQUIRED')
 for cid29 in ('8debce1e870690f3d27172d3f7a8161df3333b8f7016815a26f28efa9718c7b0','ff06e2310ac19dec78049c7b65b50aebb9a26237a9d5422eebbf42b3ddb3d4bb','6e8f8202a397ba735f8dc31d1e7d3016ef8836074d82c0ab70216761c39d3db3'):
  q29=subprocess.run(['/usr/bin/docker','inspect','--format','{"running":{{json .State.Running}},"pid":{{json .State.Pid}}}',cid29],capture_output=True,timeout=5);need(q29.returncode==0 and not q29.stderr and json.loads(q29.stdout)=={'running':False,'pid':0},'PREVIOUS29_CONTAINER_ACTIVE_OR_UNKNOWN')
 for grant in(GRANT,'5cc58239751e4e2a'):
  control=C.with_name('grant-'+grant);worker=B.with_name('grant-'+grant)
  for phase,key in JOBS.items():
   need(not any(os.path.lexists(p)for p in(control/'requests'/(key+'.json'),control/'requests'/(key+'.tmp'),control/'jobs'/key,control/'results'/(key+'.json'),worker/'jobs'/key)),'KEY_ALREADY_PRESENT_READ_ORIGINAL_ONLY')
 q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5);need(q.returncode==0 and not q.stdout.strip()and not q.stderr,'OPERATION_UNIT_ACTIVE_OR_UNKNOWN')
def load(raw,path,name):
 m=ModuleType(name);m.__file__=str(path);exec(compile(raw,str(path),'exec'),m.__dict__);return m
def original_wrapper_basis(raw,cfg):
 wrapper=load(raw,P/'admin_exec.py','original_absent20_wrapper')
 _,prior=wrapper.r3_continuity(cfg)
 need(prior.__class__.__name__=='Original02AbsentContinuation'
  and prior.policy_sha256=='faed7dec0ccd88d74745e47bbdca94bbb8a9095f550d8016945f38d76ead827e',
  'EXACT_EXISTING_ABSENT21_WRAPPER_REQUIRED')
 readonly=prior.readonly
 need(readonly.__class__.__name__=='ReadOnlyRecovery'
  and readonly.policy_sha256==BASIS[H/'failed19-readonly-recovery.json'],
  'EXACT_EXISTING_READONLY_WRAPPER_REQUIRED')
 prior.original_basis()
 prior.core.stopped_generation(prior.old.service)
 need(prior.child_settled('t45-first-20261110-r3-real-execute-20261114-06','writer'),'EXACT_ORIGINAL_WRITER_PROCESS_NOT_SETTLED')
 return readonly

def installed_wrapper(raw,cfg):
 wrapper=load(raw,P/'admin_exec.py','registration_readback');core,recovery=wrapper.r3_continuity(cfg)
 need(recovery.__class__.__name__=='Original02AbsentContinuation'and recovery.policy_sha256==sha(read(NEW_POLICY)[0]),'NEW_WRAPPER_NOT_BOUND')
 recovery.original_basis()
 recovery.core.stopped_generation(recovery.old.service)
 return recovery

def validate_policy_delta(policy, previous):
 need(set(policy)=={'format','grantId','startsAt','expiresAt','jobs'}
  and policy['format']=='T45_R3_DIRECT30_BATCHED_REAL_V1'
  and policy['grantId']==previous['grantId']==GRANT
  and type(policy['startsAt']) is type(policy['expiresAt']) is int
  and 0 < policy['startsAt'] < policy['expiresAt'] <= policy['startsAt']+7200000
  and set(policy['jobs'])==set(JOBS), 'EXACT_SEVEN_DIRECT_REAL_PHASES_REQUIRED')
 entries={'materialize':('materialize-batched-source.py','materialize-authorization.json'),
  'apply':('ordinary05_roles_job.py','host-authorization.json'),
  'start':('normal_service05_after08.py','service-start-authorization.json'),
  'install':('batched_install_host.py','install-authorization.json'),
  'writer':('batched_real_host.py','writer-authorization.json'),
  'stop':('normal05_preserve_stop.py','normal05-preserve-stop-input.json'),
  'restore':('ordinary05_roles_job.py','host-authorization.json')}
 limits={'materialize':300,'apply':300,'start':300,'install':900,'writer':3600,'stop':120,'restore':300}
 for phase,rule in policy['jobs'].items():
  need(set(rule)=={'jobId','script','authorityLeaf','bundlePins','timeoutSeconds','deadlineField'}
   and rule['jobId']==JOBS[phase] and (rule['script'],rule['authorityLeaf'])==entries[phase]
   and type(rule['timeoutSeconds']) is int and 1<=rule['timeoutSeconds']<=limits[phase]
   and rule['deadlineField']=='expiresAt' and type(rule['bundlePins']) is dict
   and 1<=len(rule['bundlePins'])<=127 and rule['script'] in rule['bundlePins']
   and rule['authorityLeaf'] not in rule['bundlePins']
   and all(type(k)is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,120}',k)
           and type(v)is str and re.fullmatch('[a-f0-9]{64}',v) for k,v in rule['bundlePins'].items()),
   'EXACT_DIRECT_REAL_RULE_REQUIRED')

def render_dispatcher(files):
 need(sha(files['module'])==HELPER and sha(files['dispatcherTemplate'])==TEMPLATE,'EXACT_WRAPPER_SOURCE_REQUIRED')
 policy=json.loads(files['policy']);need(set(policy)=={'format','grantId','startsAt','expiresAt','jobs'}and set(policy['jobs'])==set(JOBS),'EXACT_NEW_POLICY_KEYS_REQUIRED')
 needle=b'R3_ORIGINAL02_ABSENT_POLICY_SHA256 = None';template=files['dispatcherTemplate'];need(template.count(needle)==1,'EXACT_TEMPLATE_PLACEHOLDER_REQUIRED')
 dispatcher=template.replace(needle,('R3_ORIGINAL02_ABSENT_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
 compile(dispatcher,str(P/'admin_exec.py'),'exec');compile(files['module'],str(NEW_MODULE),'exec')
 return dispatcher

def register(a,files,authority):
 need(not any(os.path.lexists(p)for p in(AUDIT,NEW_MODULE,NEW_POLICY)),'REGISTRATION_ALREADY_PRESENT_OR_UNKNOWN_NO_REPLAY')
 for folder in(B,P,H,LOCK.parent):
  for path in[*reversed(folder.parents),folder]:
   s=path.lstat();need(path.resolve()==path and stat.S_ISDIR(s.st_mode)and s.st_uid==0 and not s.st_mode&0o022,'PROTECTED_REGISTRATION_DIRECTORY_REQUIRED')
 with os.fdopen(os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW),'r+b')as lock:
  need(identity(os.fstat(lock.fileno()))==a['oldIdentities']['executionLock']==LOCK_ID,'ORIGINAL_LOCK_CHANGED');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  old=snapshot(a);quiet_unused()
  core=load(old[P/'r3_write_continuity.py'][0],P/'r3_write_continuity.py','original_core')
  cfg=core.strict(core.read(P/'grant.json'))
  original_wrapper_basis(old[P/'admin_exec.py'][0],cfg)
  policy=core.strict(files['policy'])
  validate_policy_delta(policy,core.strict(old[H/'original05-absent22-continuation.json'][0]))
  need(policy['startsAt']==a['startsAt'] and now()<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),
       'EXACT_REGISTRATION_POLICY_WINDOW_REQUIRED')
  dispatcher=render_dispatcher(files)
  need(now()+30000<a['expiresAt'],'REGISTRATION_WINDOW_TOO_SHORT')
  AUDIT.mkdir(mode=0o700);sync(AUDIT.parent)
  put(AUDIT/'authorization.json',authority);put(AUDIT/'old-dispatcher.bin',old[P/'admin_exec.py'][0]);put(AUDIT/'old-policy.bin',old[H/'direct29-batched-real.json'][0]);put(AUDIT/'old-identities.json',pack(a['oldIdentities']))
  result={'status':'REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY','published':[],'businessDatabaseWrites':0,'automaticReplay':False};pending=P/'.direct27-fullchain-dispatcher.pending'
  try:
   put(NEW_MODULE,files['module'],0o644);result['published'].append('module')
   snapshot(a);quiet_unused()
   need(now()<a['expiresAt'] and not os.path.lexists(NEW_POLICY),'NEW_POLICY_ALREADY_PRESENT')
   put(NEW_POLICY,files['policy']);result['published'].append('policy')
   need(read(NEW_MODULE)[0]==files['module']and read(NEW_POLICY)[0]==files['policy'],'NEW_FILES_READBACK_DIFFERS')
   # The original dispatcher remains active until the verified replacement.
   installed_wrapper(dispatcher,cfg)
   put(pending,dispatcher,old[P/'admin_exec.py'][1][4]);snapshot(a);quiet_unused()
   need(now()<a['expiresAt']and read(P/'admin_exec.py')==old[P/'admin_exec.py'],'EXACT_DISPATCHER_IDENTITY_CAS_FAILED')
   put(AUDIT/'publish-intent.json',pack({'oldDispatcherSha256':OLD_DISPATCHER,'newDispatcherSha256':sha(dispatcher),'newPolicySha256':sha(files['policy']),'newModuleSha256':HELPER}))
   os.replace(pending,P/'admin_exec.py');sync(P);result['published'].append('dispatcher')
   need(read(P/'admin_exec.py')[0]==dispatcher,'PUBLISHED_DISPATCHER_READBACK_DIFFERS')
   snapshot(a,sha(dispatcher));quiet_unused();installed_wrapper(read(P/'admin_exec.py')[0],cfg)
   need(identity(os.fstat(lock.fileno()))==LOCK_ID,'ORIGINAL_LOCK_CHANGED_AFTER_PUBLICATION')
   result.update(status='EXACT_DIRECT30_START_DESCRIBE_REGISTERED_NO_NEW_PHASE_SUBMITTED',
    moduleSha256=HELPER,policySha256=sha(files['policy']),dispatcherSha256=sha(dispatcher),oldHistoryPreserved=True,originalLockPreserved=True,phaseSubmitted=False,rolesExecuted=False,postgresStarted=False)
  except BaseException as error:
   result.update(exceptionClass=type(error).__name__,safeCode=str(error)if isinstance(error,ValueError)and re.fullmatch('DIRECT30_START_DESCRIBE_REGISTRATION_[A-Z0-9_]+',str(error))else None)
   try:result['observedDispatcherSha256']=sha(read(P/'admin_exec.py')[0])
   except Exception:result['observedDispatcherSha256']=None
  put(AUDIT/'result.json',pack(result));return result
if __name__=='__main__':
 need(sys.platform=='linux'and os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0
  and sys.flags.isolated and sys.flags.no_site and Path(__file__)==ENTRY and len(sys.argv)==2
  and re.fullmatch('[a-f0-9]{64}',sys.argv[1]),'FIXED_ROOT_ENTRY_REQUIRED')
 os.umask(0o077);packet=sys.stdin.buffer.read(16*1024**2+1);need(len(packet)<=16*1024**2,'BOUNDED_PACKET_REQUIRED')
 a,files,authority=decode(json.loads(packet),sys.argv[1]);result=register(a,files,authority)
 print(json.dumps(result,sort_keys=True));raise SystemExit(0 if result['status']=='EXACT_DIRECT30_START_DESCRIBE_REGISTERED_NO_NEW_PHASE_SUBMITTED'else 2)
