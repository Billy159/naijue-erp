"""Existing original-lock CAS pattern, limited to final input receiver registration."""
from pathlib import Path
from types import ModuleType
import base64
import fcntl
import hashlib
import json
import os
import re
import socket
import stat
import subprocess
import sys
import time

GRANT = 'b16447fbc81f4d64'
B = Path('/root/erp-release-20261006-01-worker/grant-' + GRANT)
P = Path('/usr/local/lib/naijue-erp-night/grant-' + GRANT)
H = B / 'r3-05-write-continuity'
LOCK = B.with_name('grant-5cc58239751e4e2a') / 'execution.lock'
LOCK_ID = [66304,12224849,0,0,420,1,0,1791828307183940015,1791828307183940015]
ENTRY = B / 'r3-direct33-after-preparation-registration-source-20261116-01/register_cas.py'
AUDIT = B / 'r3-direct33-after-preparation-registration-cas-20261116-01'
NEW_MODULE = P / 'r3_direct33_after_preparation.py'
NEW_POLICY = H / 'direct33-batched-real.json'
OLD_DISPATCHER = '97830e4ec03442e83e0cc6c00467abdddd6a36f61249553184676524c3634309'
HELPER = 'a48f6fdbf1d1b1e18509588bde07f7e7506af29fcbd4c6acf65a5c0f3115ea97'
TEMPLATE = '61d8544978d8818f2b13c4a400a9c083b8d3dd12ab2d393af46401b0d7d9dfae'
BASIS = {Path(k):v for k,v in {'/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_absent22_continuation.py': '16e54ec54cf945c086e547050fa7893e856b05e217f3b0b6feb650797e56e4fa',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original05-absent22-continuation.json': '27c9b661d7ade353bb42be2b23f104879462749c117779d971d3c4d5b9cd6282',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_unknown22_inspect.py': '32aecd9f5ee7079f243b78f89d5a58e051610e16e10490cb8a12538a74a9863f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original05-unknown22-inspect.json': '7fe44435553def39809cf8ad1a63532cd1aeb23f9bd8f1d45d13acef2d7c0e04',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original04_absent22_continuation.py': '87c543d66e6a6d19f50d640cf8c1d483fb3e16a4eac4fcabcb6d1e1a2147a781',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original04-absent22-continuation.json': 'd2698af3e4d2acebf3198c93086af46cc9e20007b2ed4cac6839cc865730e913',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_inspect04.py': 'd39aac90e056fec55e23e1eea2086b62c52590edd61d7e438c55449a28401d95',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-inspect04.json': 'a3b5b3e3f0616c6f23007f3cf0a7ed34aead49b5cf2e486ded76c99e3961e99a',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_apply02.py': '720e1c9344650f55351e8654b409d7a3b3c9e38e442be06911893907911c814d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-apply02.json': '322a6ad5ab56f2ef268a9c93b5641d00c43b6076213652cd2289d411ae3e9a65',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_continuation.py': '982e5b0178bd69a07d0d659d8793033a36093283c16632ea7811a9f53588dd1f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-continuation.json': '9f24ba07d7251e35c58d91e409377a46f62988a65845da92d6c1899ea097307b',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_continuation.py': '162dfa8b90549da125465cde04d0936cf2d0592c6702a763e13fc47dca0d4c2e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent21-continuation.json': 'a85a825c170cdb7adfc4394d1a843511d0563668be4992955809dfed10af21da',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_inspect03.py': 'fd84d560bc8903746fc31babfcab04e85f339ad1c2eff0bf31a5482a75d0591f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent21-inspect03.json': 'cbed4bf8f7c5bdf28ff7187d7cdde45aff7fe049bb640631a2f42c9bfc39374e',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent_continuation.py': '909abe203293f791cdaa909227a5a90e0ae16da2ab6fa45390d271f16f2ec19a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent-continuation.json': '74dea44d2b88283b1946aea35baee9c216dee6c2e2f1b19f440446e8390c377a',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_failed19_readonly.py': '4c35abe0fc5ea65e6a3629bd6a690289d14586a790a1f2f2ce10cb3eb3cf808e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/failed19-readonly-recovery.json': '338d30dc3b3d39de130f0152899eeb92a1aa91c9c60d2073b06a2227bb4024cd',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py': '97830e4ec03442e83e0cc6c00467abdddd6a36f61249553184676524c3634309',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_write_continuity.py': '1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.before-r3-05-continuity.py': '5bf72fc20dfa597c81a9eb5ae8956c497a980b1497e2cfbfe8d469932b27ad49',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/policy.json': '25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/active.json': '0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/bindings/writer.json': 'f6b60a9470edd408e2f2783e955669e9545b184c9e97a4f4fb4bf68cbea1ce01',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-20261110-r3-real-execute-20261114-02/r3-outer-terminal.json': 'ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/r3-outer-terminal.json': 'c4b2c12d626712ed4eb9409560539d2bed6ce42e77922990d7f033ce60aab24a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/results/maintenance-auth-result.json': '2dce7c2a3b0315c9291f7f8c9076879dcadb2d2427ef71c1883653cf254e994d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/results/maintenance-auth-cleanup.json': '61b30a3bec3239c283faff791e876989e3bc4544e25f2611109cc24e603d1919',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched.py': 'd60c68633383f5da9e5054d518010bb6a4f34d3a068c51f87fa738d6f36a6cef',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct24-batched-real.json': 'cb384d2176e3a8c4a46fd3ffb1ce1e4b82b293f41c5647310c10f1b8e8a10898',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/r3-outer-terminal.json': '6d2005bfd5cc61e34fa5e25eb0e5ef58b7addfa0490306ef634221c591e63461',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/results/maintenance-auth-result.json': '77f6c66f5252fb5238e4f3cc1ed8dff030efd00413c09876d09d8fa63f217b21',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/bundle/ordinary05_roles_job.py': '0d677daf02c1d567295efab3965dd8b90ce755188bb78b9b75cc8c56dea27451',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched_apply02.py': 'da4303f6597962842d0db5993396ca1012e2181ee2224ddec9f4bd01b1a69eef',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-preserve-stop-20261115-01/r3-outer-terminal.json': '0a9ea80f2c52494c584e2dc7999766e725e604c9ec7d12c92af7424d1eb83a39',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-preserve-stop-20261115-01/results/normal05-preserve-stop-result.json': '24c937badca67b63d07d13a7e976dc6433c0468dc7de50cf100f20a6e5f096a0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/r3-outer-terminal.json': '977a2d3ff1bb03e9bb8304a541dbc8b3e250df2c26aa0efe17b917c504947825',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/results/maintenance-auth-result.json': 'b275e1369531bb303ed0587a59a37af9215553afbedc782101ce2325ee8186ac',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/results/maintenance-auth-cleanup.json': 'fe681d7e4075572131519c74f64802dc964d859230255e02697cca25e474ea9b',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_batched.py': '57d8ea9c363f4c4db743b99bfacafdafecdb644d8e65894a416ec2a418aa2810',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_restore_precontainer.py': 'ec89f4f472f559e621974b8f8187308b1de0d4049ddb568c9a1aa5cd545aadea',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct25-batched-real.json': '8c6a2a9fa827da4fd8a81cdfce37c379d743886a02170724cc6ca221129a3afa',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-25/r3-outer-terminal.json': '79c3657f7f0051c1646215ee7e5149ecfb6e6fa31606750167bc2e8f3b3f5738',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-25/results/normal-service-result.json': 'c2a5ee898726e66ebb53e309cb39d803069fa1336f19fd5c50b016187f5e90be',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/r3-outer-terminal.json': '1b82a691e39b0a72495542757664773a9a204f84bc3331da243ab7f6fb2be238',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/results/maintenance-auth-result.json': 'ecf79874833ade08d7f63aceb1d6a80b587f1644ce727c22d9bc591cd54ea74d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '281f7858e447a0665ad02444c43e2eb971651415c99a8e8307ad0db3c7664acd',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_batched.py': 'a4b5ef7bd42bad85089021095080785225c3efa7c6c7eef5b18029ada468e78d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct26-batched-real.json': 'ae952f261ad8b59fd5342c20acc69a5585b027997003cd684299b30aeebb3525',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root03-source-delta-20261116-01/r3-outer-terminal.json': 'db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root03-source-delta-20261116-01/results/batched-source-materialization.json': 'cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/r3-outer-terminal.json': 'c588bbc912a8b6bbe6c469abfd584c3b17b30ffe726bac331a5dfa3806587ba0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/results/maintenance-auth-result.json': '0545e87f04e9a6f66de318e911f527003d8902ac787d1844567e02c400a998af',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': 'a657740b94edbad211e2e78fafad67fb25c513c255ec592472e6b2fbc60164c6',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-26/r3-outer-terminal.json': '853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-26/results/normal-service-result.json': '5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_restore_precontainer.py': '165c5c4c2c1f6d3f6b6ba9f555aee42d112b6881740b61384aed45d7669ace0b',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/r3-outer-terminal.json': '944dfa9b110fd836ee9e99a8944446111b1e68808d92280a5d220e91cd67fc63',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/results/maintenance-auth-result.json': 'd521106c1c1a5a20601f7ad125dd2c254ff1879a78d25c5a299c0464ed527bd8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '6bfcdbe6f9ef11e7816856e5e6672788461c75131f8a9f6a5c795aff65f34680',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct27_batched.py': '45ee118981ebddd278240dc5bcd1ff0e05769092668e8021f8070c6ce0c04eba',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct27-batched-real.json': '89f49225c19c1043e4a4a59c876876972b49abb9d5e0b29bcb699d5d069b2094',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/r3-outer-terminal.json': '94933ecd1885265d8e84e1f7e3de72f0a73879f85ec490e5f3a0e0016761ad3e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/results/maintenance-auth-result.json': '396f58878c782fc2f598ea637469c2f499a1ee88f2a902561628e3e95b13ee5d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': '9a241d91ebc2e1a69a2c3a0f144e6dbda09019a619ec8b3632ba2787fe04db9c',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-27/r3-outer-terminal.json': 'ba1caa324ceba9a191479d45bd6e1b497e78b5adc7946d21589c296a2e300cd4',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-27/results/normal-service-result.json': '808c633e8d7f11bac5e09efa21cbb3b40f39272a103b89af191624915b869609',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-27.json': '2640ef4df8bc3e2c64f31d327a41a1c4fddc9adf99584b68169ab854fe6c6dbb',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-preserve-stop-20261116-01/r3-outer-terminal.json': '2dc418392380fe9313facee2b85cf06d79ad2b1e8fcac1faedd6c0263d1fd04f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': 'a5aa0eecb1cfa711b922a1cbbd227a25b7316c93bcfc83dc4ab4c60f5a56d24a',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-27/cleanup.json': 'fda7c05908d7b94223901638b83a417d2d7f1c624d6d195abae6ede6fc0702e8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/r3-outer-terminal.json': '957f0f26d7ed9272ea675c855a7726e9627af7946774b9b8827fb720d47aafe0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/results/maintenance-auth-result.json': '90e8fc47b7df781cb325dc9e653510c2080da0e336748146e25d8751a4cc9fc7',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': 'b8286a2e7449b7b9e165975fd5492fc6084eea1d1b9322e1b5f57e40c4c57339',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct27-fullchain-registration-cas-20261116-01/old-dispatcher.bin': '4474fc511ed22a1e9c1a405ef81f35ddba2bdff2e0ba45c42e6ff18c0cf49cfb',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct28_batched.py': '0fa08870dbf5fec3daf5a2c4d2300e3719666091252cff9ac12ec8fcfacc3261',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct28-batched-real.json': '56bb27580cf88df1c61491366da765a501dd84f9dce70033bf1c2a601cb84858',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct28-start-describe-registration-cas-20261116-01/old-dispatcher.bin': 'f411beed0cd78307742f59aa6668a6e693ce8c6bae4b24e26182820a27869fec',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-28.json': 'd57946c9ff13ee5715787ee1d1f0a13fe1ffd2a2898fa76ecc82545a5d3d18ae',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-28/failed-start-cleanup.json': '395dd08471c95dda1f56f4959ae315d135fbec582ff97f489167a6033cc840b8',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-28/retained-ack.json': '7296e03b9865a67718c0e938058dd7990000a72535e3b00a5a94e7b5be7b1b83',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/r3-outer-terminal.json': '163a6252ea1ca699392c5955be78077e86e0a7d7ba75991044ada741bb1c409d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/results/maintenance-auth-result.json': '7d2dff965ccae19fc835bb669a622b9555dfc5532f4426bab5c6443e05657abc',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': 'c455111cf4de0d73782c9bf04c0dbc2aedd6df2a92c2a2d5914a736942cd6b87',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/r3-outer-terminal.json': '89afe4cb6651db43fe530961e62040ded2ee8ed8ead9bb720ca079776ffe1408',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/normal-service-result.json': '94cdae517c242cc904c7f68d1b43f31ce01aa87f7f0089fc1de93fb77c2cc29f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/r3-outer-terminal.json': '496966e4b649819a641dc72eab3a3a2ca65f3507f59f27d5d04144617d553db6',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/results/maintenance-auth-result.json': 'b8da5c9281edc26cc20c17702f0257fa1c95016a8744ae5a6eae7cf0c41ce5cc',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '91477439a305528bf3a71041ab6db699cd8ae62869a3fd35c01c38249e648949',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/normal-service-incomplete.json': 'd3d32bee8c9792f5cfe8354e050cfec3a07977af7e3b324826b2d84b4330526d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/genuine-describe-process.json': 'fe03bd630a02acfc63a14369f23bed5620f7f89cd0f9484c83a80c4828d72ae4',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct29_batched.py': '096f8ebca3ec5aee1f3091a18842e533e42932fb7b26d3da689e7a4d7a1de799',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct29-batched-real.json': 'faed7dec0ccd88d74745e47bbdca94bbb8a9095f550d8016945f38d76ead827e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct29-start-describe-registration-cas-20261116-01/old-dispatcher.bin': '6b6b0d0aee71e95e989431bb6df822ab77cfa925fdeab1a12077b4feb1205842',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-29.json': 'e50a7112cb48fc987b220a514e62e2e370b08bc3322bfa0ed42babc50d379568',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-29/failed-start-cleanup.json': '4bc125537c15b9593e663b07fc95ea96f07e170e809c9b4a58d106bef8ae06cf',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-29/retained-ack.json': 'ba6a0699b5b37a7b5e81bbd86ad5e8f9735e85f842da6449387c4ab91592a781',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/r3-outer-terminal.json': 'a30a2a024f2456e15254c3b8fef18d041b25b094d9835db694895ae5fe04a105',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/results/maintenance-auth-result.json': '0a0c1142c8cb922397ee48da2868b1bf973950b9f8a89721e0914477905fe483',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': '04b8975792ea7a646af2c586d537cf09bd5d5a0412635f88aa3c7cb731756469',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/r3-outer-terminal.json': '30e747021f4775edb001b3ce1d7463b813b3240b99819ac1cd5236e4c22c8990',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/normal-service-result.json': '769ca923a3e9f15eb4a010d4e23a991ab06ce8bed759bd22f6d5580ae1a9c426',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/r3-outer-terminal.json': '536e3726f2a4f0785e2ffc64fa8f89c82830652dd78ae29a773cf4c77a218004',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/results/maintenance-auth-result.json': 'f0cb72700e78fd5097911e0169054272c66b570fad2dcf0b2572cc2f66c34039',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '1d50af6619b16eae16013ad0063b26cb5705eec58b49e156fffefd1ba3015b21',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/normal-service-incomplete.json': '70c903267ecca60c8b0de9e9dfb6a044d3060516690d30f3997e4c89bcb153ab',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/genuine-describe-process.json': '719a1bcdeffacf67c8d2e24a37fa4226fa4925439bc16610934185a189d26935',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct30_batched.py': '95b2054ea4c7c95ebcfbe6c1fc1a1ab893c1255c8e52cd91424e5fd3c0dc28ed',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct30-batched-real.json': 'fbb5bb55532d708103e0e70acd5512b8a77ab7538555938a30f179d2a3241b10',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct30-start-describe-registration-cas-20261116-01/old-dispatcher.bin': 'e15c47bb947a402f87de40e9972161b577df78611dd7a8f87019ad2f48ea54ed',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root04-source-delta-20261116-01/r3-outer-terminal.json': 'f9281d9e721000d0957da09fde525661ffb94005e3e82e809a39c35c9da85585',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root04-source-delta-20261116-01/results/batched-source-materialization.json': '8bb064ba27cbdaeb04b64408fee3ac2f2c7c9b28c7a7720761105ca1d7d191e1',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-apply-20261116-01/r3-outer-terminal.json': '2ef5d7101bf7b05d9b7d7d969c61571a265ca702c94e6e14dbd24d58cddc65ae',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-apply-20261116-01/results/maintenance-auth-result.json': '5aacd4b10b4c4c914fcfc00db9f6dc57c3a61751f60e60668609822b165afabf',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': '947170d2ba5da0c54931f3be2bd9a9ea55ffd2069aee0efacc9f86f600ec3d24',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-30/r3-outer-terminal.json': '34d2f5e0f7cf2fabf8192a340eda31dac53e8ab16cda8cc14fe6acba33b93ed4',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-30/results/normal-service-result.json': 'bcb378acfa698c2bc8f7018bb713acc61318e66bf4f14bc2830cdec51790730d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-preserve-stop-20261116-01/r3-outer-terminal.json': 'e52708fc14962a02d10906d25f9434268eb22ee4c36c754e75fc3b4bf70f2ddb',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': '62ed7abefdb356fa4a7098d16f54f887191340949587a5406e51b4687007e5f3',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-restore-20261116-01/r3-outer-terminal.json': '762af3ad2ca11c0b6675b942d0f0f33b3d53dba39d8d8f2decea0312e5547213',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-restore-20261116-01/results/maintenance-auth-result.json': 'fc22b1917a3ef1b67b259d8fb878416bb20f84dbb11cc26796233db19fa1039a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '8d72b0d314a7775a67acb3ec6f65cbe86aa65ef5323488206d9b1550a80db2d4',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-30.json': 'abf3b3251289ebb5f40218f51991c1a3bafea4854097543be175ed400d9ce06c',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-30/cleanup.json': '9073bc7b9f1d013e8c74833d5e5aac5fb630df84c4c27c9fd4628d6dc47f8e9a',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root04-20261116-01/source-materialization.json': '8bb064ba27cbdaeb04b64408fee3ac2f2c7c9b28c7a7720761105ca1d7d191e1',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-30/results/genuine-describe-process.json': '8d57b0052484c4edff925f69d71da3c82c035152d559838214261db29c6ab165',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct31_batched.py': '365a696b1ee113ce337e36c8159f6be28eccf3ce1e0a314ef61aeddaa76e93c9',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct31-batched-real.json': 'a07d6db401cfc669bfb94a444cf0f310c4be0d416356cb92b481f79c537ff065',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct31-start-describe-registration-cas-20261116-01/old-dispatcher.bin': '5b6c3c83d362bcfaaf064e6427702c3eb7af995b8b823574ba55114a7d090b5c',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-apply-20261116-01/r3-outer-terminal.json': '9dd63f536541ffc21857d584ed11e1336e85bf938c3923fcf23fe3625e450851',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-apply-20261116-01/results/maintenance-auth-result.json': '1f045f18c4b5a7a026472d0b65e23535c5cd5e988774fc84b51fc5515a556eda',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': '228789d2f18e3f6a5c5315d01be64de87e26e65f5bb1b6aba3257183fe6b1db0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-31/r3-outer-terminal.json': '5246a9abdb987e4309c4bc6d181373623580b019fb32a5290d8677058d94ef21',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-31/results/normal-service-result.json': '326773273e586e3d1864bda75c81f0f94c28dc537362bb7c1160796ccd43902d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261115-01/r3-outer-terminal.json': '5d95d500adc1a2cbbccff93fee5512ed2dd5a38e83f7fe974ac7e94f0b76d5c2',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261115-01/results/batched-install-result.json': '5d82a437a9bae7cabf78a7dd8ce48776c48be0a8f875da1aa426d04160019d5f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-preserve-stop-20261116-01/r3-outer-terminal.json': '9ff56dfa1229233855b0cfacd9de65278bb6fd5b36dce0962e748d40c5455a49',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': 'dc995ed92abadab3f4a9c0a72c1ed361ce1ce45f5eb666fa6df42a71a9f47a92',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-restore-20261116-01/r3-outer-terminal.json': '4541b36de09569184c0198d9573e5becdb01d7babf1fecc7ffd7d83d3a511c7d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-restore-20261116-01/results/maintenance-auth-result.json': '023d953c3fece2054074002486c6f355465cb8d70458ad1b6fc447cae8db5778',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '1b9cc4f95114b336f65bccfbd87e60d07b90d2b72d0e628d5b6a9795f483b87f',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-31.json': '42e7a80f72519feed61892a4598f7f654005e9c44535aaee0ac6f4c66a3c112e',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-31/cleanup.json': '929460035e9b5ab7c9a9a9639a69322b6879e590bf1827006ef3c94dcd6e86cf',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-31/retained-ack.json': '319c4f9b4e2fb871368d2ea07a6861316da74b65ce41d67b79f685db763d994d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-31/results/genuine-describe-process.json': '241650153461d87f76ae1be79ed5fc9b6e019e772cad36e69b6c4e167d7e22eb',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct32_batched.py': '4ff1a618c2e10c2119a16bd19a621d3c0c48a3ba92fe01229baec809fbb29316',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct32-batched-real.json': '99ea865df185eef2cd1c01cc9303d5c08e9bd8d90202c8b9557b5723820fac6a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root05-source-delta-20261116-01/r3-outer-terminal.json': '2dbe906d654f7508845b53c868f3fee0520d3c03109dc09e7e28601c3788ef72',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root05-20261116-01/source-materialization.json': 'e8f8032b00601e976c094f0365064d0385d7af8f48f9f7bbb465dca896bf3a5e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261116-02/r3-outer-terminal.json': '01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261116-02/results/batched-install-result.json': 'e14e9b649d9b4d4864360384e93e059cdda80c37e769de91f2452abd1af87792',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input.py': '4441d264213d5abf3c2c4af1a56d7df0bd275f0a4587e66c1e1bf156c0793d3f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/final33-input-reception.json': 'cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input_recovery.py': '4ce801c947084c2d4870bac073cc85d844453d6b79e96129b065b94496e26722',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/final33-input-reception-recovery.json': 'cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input_cached03.py': '17b7c5af2072cb525be2a0c9d02db20bcb6dc89bb9b89063369ec0345223ad63',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/final33-input-reception-cached03.json': '5d861a567b4918c65a327f077f92c19cda778086c71730e9a2930287b38979e1',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_batched.py': 'b700b3b5b13c20222aa00847d95ef31975ca25e5b5baae0f5ee98b95e43a085c',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct33-batched-real.json': '0d18b5d6e60e4709f814bc43bc64d6f725445a6c4df38425e5f0fe2cc56ebcd5',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-input-materialize-20261116-01/r3-outer-terminal.json': '9a3734dccce2148ba03480df7f8f24a64a82b597e3b4a25c7b72790d40a079db',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct33-input02-registration-source-20261116-01/entry-result.json': '0a84a3b9ea7f91e5964f005b0934523a77feaee5d2474a1c8a354f82559ab987',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_input02.py': 'a48f6fdbf1d1b1e18509588bde07f7e7506af29fcbd4c6acf65a5c0f3115ea97',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct33-input02-registration-cas-20261116-02/result.json': '20afba865671f741fadbdc4f92c19d2099feb8627e67f2da13dba5c3d5650a2e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-input-materialize-20261116-02/r3-outer-terminal.json': 'b959313cb4d054bd1017480781c280cecc787ce41ad0990cdd88c807d2f73004',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-input-materialize-20261116-02/results/final33-input-materialization-result.json': '556cb0e3a336aaed7c5c156cc531b90c0895a63c65d1020e91dcfe1b00bbdb58',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01/materialization-receipt.json': '556cb0e3a336aaed7c5c156cc531b90c0895a63c65d1020e91dcfe1b00bbdb58',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root06-source-delta-20261116-01/r3-outer-terminal.json': '13cdb833a19ab30816660d1300f244ab41d3bd4485bcd8f50715d2b5b54e99c6',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root06-source-delta-20261116-01/results/batched-source-materialization.json': '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/source-materialization.json': '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171'}.items()}
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
JOBS={'apply': 't45-r3-ordinary33-auth-apply-20261116-01', 'catalog_update': 't45-r3-batched161-command-successor-20261116-01', 'materialize': 't45-r3-batched-root06-source-delta-20261116-01', 'prepare': 't45-r3-final33-plan-prepare-20261116-01', 'restore': 't45-r3-ordinary33-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-33', 'stop': 't45-r3-ordinary33-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01', 'input_materialize': 't45-r3-final33-input-materialize-20261116-02'}
EXPECTED_RULES={'apply': {'authorityLeaf': 'host-authorization.json',
           'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360',
                          'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5',
                          'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73',
                          'ordinary05_roles.py': '8aecb0391192cf6bff140b0a618c0a63fe8b5d61c17bc9edfaa45830b3fc767d',
                          'ordinary05_roles_job.py': 'ad07197b1e4785a2b13f9ee6cd62d14cf8010f0ab56de4e8e7956ce6934a5673',
                          'prior_completed32.py': 'bb36323d8e7f903362ec6b71e1d640055bd3b3c4def1d709dc7adbbb9d4f565d',
                          'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a'},
           'deadlineField': 'expiresAt',
           'jobId': 't45-r3-ordinary33-auth-apply-20261116-01',
           'script': 'ordinary05_roles_job.py',
           'timeoutSeconds': 300},
 'catalog_update': {'authorityLeaf': 'catalog-update-authorization.json',
                    'bundlePins': {'batched161_command_update_host.py': 'e41643cb77cc547624528a1e32f3df00753338c9abb1721dcabfa3a778c01ba1',
                                   'catalog-pg-driver.mjs': 'cdfb4fdeb6919364c5795c1e2ccb6f58650337b0b7bc59aa71d102b3e9a1a87f',
                                   'catalog-successor-run.mjs': 'dff38300b814c5223944c55a331b3d53cdebcd303dea474a2f72d0946420b2af',
                                   'catalog_transport.py': '15c33ed77afd8339475f7b62a36c9f5454e16d7e84f20c4a15405343ab051be5',
                                   'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4',
                                   'normal05_retained_stop.py': '0fd199cf22397f23ddb4e3c3590f63154b67358190530c5cadda76db257ddf28'},
                    'deadlineField': 'expiresAt',
                    'jobId': 't45-r3-batched161-command-successor-20261116-01',
                    'script': 'batched161_command_update_host.py',
                    'timeoutSeconds': 780},
 'input_materialize': {'authorityLeaf': 'input-materialization-authorization.json',
                       'bundlePins': {'final33_input_host.py': '596dc616ba5f91f7dbf532d76a0764f87debee2a718910d5c1f86bf70b81fe6a',
                                      'input-profile.json': '71b861440bc6368da3f2c0b6293fc87af6af0de77991b145c9f7c74daf9663c7',
                                      'materialize_first_r1.py': '27a393b3b50eb60fa33963396172bc7b001862878314a0fe2ace0188ed449f56'},
                       'deadlineField': 'expiresAt',
                       'jobId': 't45-r3-final33-input-materialize-20261116-02',
                       'script': 'final33_input_host.py',
                       'timeoutSeconds': 300},
 'materialize': {'authorityLeaf': 'materialize-authorization.json',
                 'bundlePins': {'0028_batched_history_hall_provenance.sql': 'd677eebb66c8e7f1d6327ca83d5d244a1ac646b4d108a0ee1a16d81710d46dc4',
                                'COMMAND-SUCCESSOR-161-BODIES.json': '58daf1854a1d09f710c98a45e9895ca25302257727ac274865a4a1507e5278b3',
                                'COMMAND-SUCCESSOR-161-DEFINITIONS.json': 'e8fde77cd17c203bda75d9cb1a1c665d69fe5d20c77a0b7e901a731a2af4c9b3',
                                'COMMAND-SUCCESSOR-161-MODEL.json': '6bd0ce4cd15347e082edaab43fcec856af2f4b7a56d2cb1708266786503e99fd',
                                'COMMAND-SUCCESSOR-PINS.json': '849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7',
                                'batched-stream-cli-state.mjs': '609879727a851cf6a79a4ab589096cb0cfe560476557ae9ef5d42d826df7613c',
                                'batched161-run.mjs': '6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4',
                                'fresh35-admin154-record-v1.mjs': '49455ce58e9999fdad82806683f59537916989515b58e54f926f91a720f56c06',
                                'fresh35-combined-catalog-v1.mjs': '319f4ac30157d2922dc8d62b5108d5656a375c059e322466f7f933d32d7746eb',
                                'fresh35-combined-source-v1.mjs': 'a848a4ee942a3922535cb5315212717233f3227159ffb4a9067e56373ee3e27b',
                                'fresh35-host-session.mjs': '0a10be276269c1aadb3420acaddaed0dce3f1a033bbf9b4d2320ddfe80ecf60b',
                                'historical-sales-hall-evidence.ts.json': '51d86fe02d21c3349c1c025196f03caf35a042bdf697fdae1ae12ecf32b96b6e',
                                'materialize-batched-source.py': '7968cf74bffbeacb6710925e67db4d4c85f6811cfdeda81f7eb42aca402bd818',
                                'r3-service20-entry.mjs': 'a36f2a10911f19682e488bd1432924f4616f8e7b5007691e4ac50caafe3a68f6',
                                'r3-service20-retained-import.mjs': 'e911e92001f2f59efdbb3611faf80ec68b66aa5f2059fa964231b9910faa1aca',
                                'sales-historical-hall-projection.ts.json': '3140883b2964412e38146e52320a579da608584f2dd815317d5b142133524f5f',
                                'source-description.json': '6ae38a43efeea1a146fae71fb1cd8d9996d70ec5df2362ebb9e8461d707c2d2e',
                                'source-rows.json': '078f2c0019df117ae9a32e2276feebca9094ce6dc91e5eaede3f8d9201202fe9',
                                'unified-historical-sales-hall-evidence.ts.json': '37e27090c3b50008d415be8f2b8c9574fb1a4157ac4d3c86f3967257f371d94f',
                                'whole-host-session.mjs': 'a4e62e6bfe45957078946ace0475eaa35a867ca649ec7634ac2da5548ba8b4da'},
                 'deadlineField': 'expiresAt',
                 'jobId': 't45-r3-batched-root06-source-delta-20261116-01',
                 'script': 'materialize-batched-source.py',
                 'timeoutSeconds': 300},
 'prepare': {'authorityLeaf': 'host-authorization.json',
             'bundlePins': {'final33-run.mjs': 'bdb646493a204e776f211483d1af8ce70812434c1892457b616774c4c3b1498b',
                            'final33_host.py': '1708e40ce73420215963b4b0a500ae924ffe9ef1281166da264cd50e530a2497',
                            'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4',
                            'nonroot_input_access.py': '0dab63562102ded384773477bdcad0c01d3ff5d2aa076431bacf5bd973b43385',
                            'normal05_retained_stop.py': '0fd199cf22397f23ddb4e3c3590f63154b67358190530c5cadda76db257ddf28',
                            'r3_05_cli.py': 'b5e48708ca9b910d0aa0f85c689540958534afb4ded346c4d598dca5d0aa6ad6',
                            'r3_05_runtime.py': '95c79a9054763fe5bf144fc76d41b92a76d4008d02012ddbd8e66180c07ff13c'},
             'deadlineField': 'expiresAt',
             'jobId': 't45-r3-final33-plan-prepare-20261116-01',
             'script': 'final33_host.py',
             'timeoutSeconds': 780},
 'restore': {'authorityLeaf': 'host-authorization.json',
             'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360',
                            'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5',
                            'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73',
                            'ordinary05_roles.py': '8aecb0391192cf6bff140b0a618c0a63fe8b5d61c17bc9edfaa45830b3fc767d',
                            'ordinary05_roles_job.py': 'ad07197b1e4785a2b13f9ee6cd62d14cf8010f0ab56de4e8e7956ce6934a5673',
                            'prior_completed32.py': 'bb36323d8e7f903362ec6b71e1d640055bd3b3c4def1d709dc7adbbb9d4f565d',
                            'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a'},
             'deadlineField': 'expiresAt',
             'jobId': 't45-r3-ordinary33-auth-restore-20261116-01',
             'script': 'ordinary05_roles_job.py',
             'timeoutSeconds': 300},
 'start': {'authorityLeaf': 'service-start-authorization.json',
           'bundlePins': {'batched161-run.mjs': '6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4',
                          'final33-run.mjs': 'bdb646493a204e776f211483d1af8ce70812434c1892457b616774c4c3b1498b',
                          'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360',
                          'normal_service05_after08.py': 'defd7f48ad1d9f9ea5586c193cd3002fcd9ebc37695e7daa6f242b7add0c2a66',
                          'normal_service05_after08_proof.py': '1b8550677d727949873efc42afaa25b5d243e31f3e6f5266ff97c97bda68f3c0',
                          'operator-host.mjs': '7c88c0fae43c544959b2834f81dfe32fec2b99fbedd9c1533494c68e109245ae',
                          'operator-manifest.json': 'c4795906bdfab154e5cd66305a3e9ec698cd1a0b23e3a896258b396540a42184',
                          'operator-stream-import-cli.mjs': '6836bb2aadbfcd81621e0a49143ff5a44b26c9a913c8b12b4925296037113e5e',
                          'operator-stream-program.mjs': 'fa0ca2e0e41fe83925155406959d683458671d647caf475ce6ebf0b9761c87f6',
                          'prior_completed32.py': 'bb36323d8e7f903362ec6b71e1d640055bd3b3c4def1d709dc7adbbb9d4f565d',
                          'production-plan.json': '7a416900f8b3988dc51b118a928c277f252fad1f736928d72003b1f21e0ce17d',
                          'r3_05_cli.py': 'b3f963efd9e8b37b653bf9eeaf5e9bfdc71b689a0f45c100a1d95fb9348f05c0',
                          'r3_05_readonly.py': '225dae5a38eeef11c246ce1abe7d3d3fce7098f46fc9acf391f86280bff8f3ab',
                          'r3_05_runtime.py': '95c79a9054763fe5bf144fc76d41b92a76d4008d02012ddbd8e66180c07ff13c',
                          'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a',
                          'start_owned_describe.py': '1c8521a278f849263d933fb8a9babebfcd8eb4ded1653b2afaf5d618153cddf1'},
           'deadlineField': 'expiresAt',
           'jobId': 't45-first-r3-native-service-start-20261116-33',
           'script': 'normal_service05_after08.py',
           'timeoutSeconds': 300},
 'stop': {'authorityLeaf': 'normal05-preserve-stop-input.json',
          'bundlePins': {'normal05_preserve_stop.py': 'f5aa06859c7019769c64786f60c26e5a3f8ac154b4edbe30f9d0888cfcf3caa6',
                         'normal05_retained_stop.py': '0fd199cf22397f23ddb4e3c3590f63154b67358190530c5cadda76db257ddf28'},
          'deadlineField': 'expiresAt',
          'jobId': 't45-r3-ordinary33-preserve-stop-20261116-01',
          'script': 'normal05_preserve_stop.py',
          'timeoutSeconds': 120},
 'writer': {'authorityLeaf': 'host-authorization.json',
            'bundlePins': {'final33-run.mjs': 'bdb646493a204e776f211483d1af8ce70812434c1892457b616774c4c3b1498b',
                           'final33_host.py': '1708e40ce73420215963b4b0a500ae924ffe9ef1281166da264cd50e530a2497',
                           'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4',
                           'nonroot_input_access.py': '0dab63562102ded384773477bdcad0c01d3ff5d2aa076431bacf5bd973b43385',
                           'normal05_retained_stop.py': '0fd199cf22397f23ddb4e3c3590f63154b67358190530c5cadda76db257ddf28',
                           'r3_05_cli.py': 'b5e48708ca9b910d0aa0f85c689540958534afb4ded346c4d598dca5d0aa6ad6',
                           'r3_05_runtime.py': '95c79a9054763fe5bf144fc76d41b92a76d4008d02012ddbd8e66180c07ff13c'},
            'deadlineField': 'expiresAt',
            'jobId': 't45-r3-batched-real-execute-20261115-01',
            'script': 'final33_host.py',
            'timeoutSeconds': 3000}}
COMPLETED={'input_materialize': {'leaf': 'final33-input-materialization-result.json',
                       'marker': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01/materialization-receipt.json',
                       'publicResultSha256': '796bdede6fc7f7ce464c5ca3966963335f80e24f4fc9248aedb3d10776417d64',
                       'requestKey': 't45-r3-final33-input-materialize-20261116-02',
                       'rootResultSha256': '556cb0e3a336aaed7c5c156cc531b90c0895a63c65d1020e91dcfe1b00bbdb58',
                       'terminalSha256': 'b959313cb4d054bd1017480781c280cecc787ce41ad0990cdd88c807d2f73004',
                       'value': {'PGConnections': 0,
                                 'archiveMembers': [31, 34],
                                 'businessDatabaseWrites': False,
                                 'deliveryIndexSha256': '954bbd6508725fa0e9f38140d4ef8830d266d10d5ec8f9556db6196c8412d88f',
                                 'elapsedSeconds': 68.479,
                                 'manifestSha256': '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
                                 'minimumFreeBytes': 30064771072,
                                 'preflightIndex': {'bytes': 2329927680,
                                                    'sha256': 'b5a6e1449795ccd4eef72de1599335633e2ee55cd076a7a0a920e9c4b063e9dd'},
                                 'preflightSummary': {'bytes': 58708922,
                                                      'sha256': '6751463c596b0330faf7851c255bf972cbede3cfad6c0fed027e5befd137336d'},
                                 'profileSha256': '71b861440bc6368da3f2c0b6293fc87af6af0de77991b145c9f7c74daf9663c7',
                                 'requestKey': 't45-r3-final33-input-materialize-20261116-02',
                                 'sourceInputsOverwritten': False,
                                 'state': 'FINAL33_PRIVATE_INPUTS_MATERIALIZED_NO_PG_OR_PRECHECK_REPLAY',
                                 'targetDirectory': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01',
                                 'targetIdentity': {'device': 66304, 'inode': 13665604}}},
 'materialize': {'leaf': 'batched-source-materialization.json',
                 'marker': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/source-materialization.json',
                 'publicResultSha256': '0bd916e2d757a93de11853899f8ca69d2b884a60c3104b80286daa2687311e7e',
                 'requestKey': 't45-r3-batched-root06-source-delta-20261116-01',
                 'rootResultSha256': '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171',
                 'terminalSha256': '13cdb833a19ab30816660d1300f244ab41d3bd4485bcd8f50715d2b5b54e99c6',
                 'value': {'automaticReplay': False,
                           'changedFiles': 16,
                           'databaseConnections': 0,
                           'databaseWrites': 0,
                           'inheritedUnchangedFiles': 371,
                           'installerRunnerSha256': '6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4',
                           'liveCatalogVerified': False,
                           'nodeModulesChanged': False,
                           'originalSourcePreserved': True,
                           'predecessorMaterializationSha256': 'e8f8032b00601e976c094f0365064d0385d7af8f48f9f7bbb465dca896bf3a5e',
                           'requestKey': 't45-r3-batched-root06-source-delta-20261116-01',
                           'serviceStarted': False,
                           'sourceDescriptionSha256': '6ae38a43efeea1a146fae71fb1cd8d9996d70ec5df2362ebb9e8461d707c2d2e',
                           'sourceFiles': 387,
                           'sourceRoot': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/operation',
                           'sourceRowsSha256': '078f2c0019df117ae9a32e2276feebca9094ce6dc91e5eaede3f8d9201202fe9',
                           'sourceSetSha256': 'd20f9f89091f7a0c1006fdadf0c5fecc7711dc7398d8e2cf0471789c2f9ea898',
                           'state': 'EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'}}}


def need(ok, code):
    if not ok:
        raise ValueError('FINAL33_AFTER_PREPARATION_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def now():
    return time.time_ns() // 1000000


def pack(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def identity(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns]


def read(path,owner=0):
 need(path.resolve()==path,'CANONICAL_INPUT_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_uid==owner and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=4*1024**2,'PROTECTED_INPUT_REQUIRED')
  raw=f.read(4*1024**2+1);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'INPUT_CHANGED')
 return raw,identity(s)


def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def put(path, raw, mode=0o600):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb') as stream:
        need(stream.write(raw) == len(raw), 'SHORT_WRITE')
        stream.flush()
        os.fchown(stream.fileno(), 0, 0)
        os.fchmod(stream.fileno(), mode)
        os.fsync(stream.fileno())
    sync(path.parent)


def scope():
    return dict(format='T45_FINAL33_AFTER_PREPARATION_CAS_V1', grantId=GRANT,
                oldDispatcherSha256=OLD_DISPATCHER, newModuleSha256=HELPER,
                dispatcherTemplateSha256=TEMPLATE, newModulePath=str(NEW_MODULE),
                newPolicyPath=str(NEW_POLICY), publishOrder=['module', 'policy', 'dispatcher'],
                sourceRegistrationOnly=True, businessDatabaseWrites=0, oldHistoryChanged=False)


def validate_policy_delta(policy, previous):
 need(set(policy)=={'format','grantId','startsAt','expiresAt','jobs'}
  and policy['format']=='T45_R3_DIRECT33_BATCHED_REAL_V1'
  and policy['grantId']==previous['grantId']==GRANT
  and type(policy['startsAt']) is type(policy['expiresAt']) is int
  and 0 < policy['startsAt'] < policy['expiresAt'] <= policy['startsAt']+10800000
  and set(policy['jobs'])==set(JOBS), 'EXACT_DIRECT_REAL_PHASES_REQUIRED')
 entries={'input_materialize':('final33_input_host.py','input-materialization-authorization.json'),
  'prepare':('final33_host.py','host-authorization.json'),
  'materialize':('materialize-batched-source.py','materialize-authorization.json'),
  'apply':('ordinary05_roles_job.py','host-authorization.json'),
  'start':('normal_service05_after08.py','service-start-authorization.json'),
  'catalog_update':('batched161_command_update_host.py','catalog-update-authorization.json'),
  'writer':('final33_host.py','host-authorization.json'),
  'stop':('normal05_preserve_stop.py','normal05-preserve-stop-input.json'),
  'restore':('ordinary05_roles_job.py','host-authorization.json')}
 limits={'input_materialize':300,'prepare':780,'materialize':300,'apply':300,'start':300,'catalog_update':780,'writer':3000,'stop':120,'restore':300}
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
 need(policy['expiresAt']==policy['startsAt']+10800000,'EXACT_THREE_HOUR_POLICY_REQUIRED')
 role_pins=[]
 for phase,expected in EXPECTED_RULES.items():
  rule=policy['jobs'][phase];actual=dict(rule);pins=dict(actual['bundlePins'])
  if phase in ('apply','restore'):
   need('roles-authorization.json'in pins,'DYNAMIC_ROLE_PIN_REQUIRED');role_pins.append(pins.pop('roles-authorization.json'))
  actual['bundlePins']=pins
  need(actual==expected,'FROZEN75_STATIC_RULES_DIFFER')
 need(len(role_pins)==2 and role_pins[0]==role_pins[1],'SAME_DYNAMIC_ROLES_PIN_REQUIRED')


def render(files):
    need(set(files)=={'module','policy','dispatcherTemplate'} and sha(files['module'])==HELPER and sha(files['dispatcherTemplate'])==TEMPLATE,'EXACT_AFTER_PREPARATION_SOURCE_REQUIRED')
    validate_policy_delta(json.loads(files['policy']),{'grantId':GRANT})
    needle=b'R3_ORIGINAL02_ABSENT_POLICY_SHA256 = None'
    need(files['dispatcherTemplate'].count(needle)==1,'EXACT_POLICY_PLACEHOLDER_REQUIRED')
    result=files['dispatcherTemplate'].replace(needle,('R3_ORIGINAL02_ABSENT_POLICY_SHA256 = '+repr(sha(files['policy']))).encode())
    compile(result,str(P/'admin_exec.py'),'exec');compile(files['module'],str(NEW_MODULE),'exec')
    return result


def decode(packet, expected):
    need(set(packet) == {'authorization', 'files'}, 'EXACT_PACKET_REQUIRED')
    raw = base64.b64decode(packet['authorization'], validate=True)
    need(sha(raw) == expected, 'EXTERNAL_AUTHORITY_DIFFERS')
    a = json.loads(raw)
    fixed = scope()
    need(set(a) == set(fixed) | {'sourceSha256', 'sourcePins', 'oldIdentities', 'startsAt', 'expiresAt',
                               'authorizationReference', 'independentReviewSha256'}
         and all(a[key] == value for key, value in fixed.items())
         and type(a['startsAt']) is type(a['expiresAt']) is int
         and a['startsAt'] <= now() < now() + 30000 < a['expiresAt'] <= a['startsAt'] + 900000
         and a['sourceSha256'] == sha(read(Path(__file__))[0]), 'FINITE_EXACT_AUTHORITY_REQUIRED')
    need(type(a['authorizationReference']) is str and 0 < len(a['authorizationReference']) <= 512
         and type(a['independentReviewSha256']) is str
         and re.fullmatch('[a-f0-9]{64}', a['independentReviewSha256']),
         'REVIEW_REFERENCE_REQUIRED')
    need(set(packet['files']) == set(a['sourcePins']) == {'module', 'policy', 'dispatcherTemplate'}
         and set(a['oldIdentities']) == {str(path) for path in BASIS} | {'executionLock'}, 'EXACT_INPUT_KEYS_REQUIRED')
    files = {key: base64.b64decode(value, validate=True) for key, value in packet['files'].items()}
    need(all(0 < len(data) <= 4*1024**2 and sha(data) == a['sourcePins'][key]
             for key, data in files.items()), 'EXACT_PACKET_BYTES_REQUIRED')
    render(files)
    return a, files, raw


def snapshot(a,dispatcher=OLD_DISPATCHER,policy=None):
    for path,pin in BASIS.items():
        raw,meta=read(path)
        expected=dispatcher if path==P/'admin_exec.py' else policy if path==NEW_POLICY and policy is not None else pin
        replaced=(path==P/'admin_exec.py' and dispatcher!=OLD_DISPATCHER)or(path==NEW_POLICY and policy is not None)
        need(sha(raw)==expected and (replaced or meta==a['oldIdentities'][str(path)]),'ORIGINAL_BASIS_CHANGED')


def consumer(dispatcher,cfg,module_raw=None,policy_raw=None):
    wrapper=ModuleType('exact_input02_dispatcher');wrapper.__file__=str(P/'admin_exec.py')
    exec(compile(dispatcher,wrapper.__file__,'exec'),wrapper.__dict__)
    core,hold=wrapper.r3_continuity(cfg)
    need(hold.__class__.__name__=='Original02AbsentContinuation','EXACT_MAIN9_CONTINUATION_REQUIRED')
    if module_raw:need(read(NEW_MODULE)[0]==module_raw and read(NEW_POLICY)[0]==policy_raw,'INSTALLED_INPUT02_BYTES_DIFFER')
    hold.original_basis();hold.historical_install();core.stopped_generation(hold.old.service)
    return core,hold


def check_completed_value(phase, terminal, value):
    expected = COMPLETED[phase]
    need((terminal.get('jobId'),terminal.get('status'),terminal.get('exitCode'),terminal.get('phaseStarted')) == (expected['requestKey'],'COMPLETED',0,True),'COMPLETED_TERMINAL_DIFFERS')
    need(value == expected['value'],'COMPLETED_RESULT_VALUE_DIFFERS')


def completed_preparation():
    result={}
    for phase, expected in COMPLETED.items():
        key=expected['requestKey']
        terminal=read(B/'jobs'/key/'r3-outer-terminal.json')[0]
        public_terminal=read(C/'results'/(key+'.json'),1000)[0]
        root=read(B/'jobs'/key/'results'/expected['leaf'])[0]
        public=read(C/'jobs'/key/'results'/expected['leaf'],1000)[0]
        marker=read(Path(expected['marker']))[0]
        need(sha(terminal)==expected['terminalSha256'] and terminal==public_terminal,'COMPLETED_TERMINAL_BYTES_DIFFER')
        need(sha(root)==expected['rootResultSha256'] and sha(public)==expected['publicResultSha256'] and root==marker,'COMPLETED_RESULT_OR_MARKER_SHA_DIFFERS')
        value=json.loads(root);need(value==json.loads(public),'COMPLETED_RESULT_OBJECTS_DIFFER')
        check_completed_value(phase,json.loads(terminal),value)
        if phase=='input_materialize':
            target=Path(value['targetDirectory']);s=target.lstat()
            need(target.resolve()==target and stat.S_ISDIR(s.st_mode) and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13665604,0,61035,0o750),'COMPLETED_INPUT_TARGET_IDENTITY_DIFFERS')
        else:
            for target in (Path(value['sourceRoot']).parent,Path(value['sourceRoot'])):
                s=target.lstat();need(target.resolve()==target and stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o755,'COMPLETED_SOURCE_TARGET_DIFFERS')
        result[phase]={k:v for k,v in expected.items() if k!='leaf'}
        result[phase].update(terminalBytesEqual=True,resultObjectsEqual=True,markerEqualsRoot=True)
    return result


def quiet():
    need(not os.path.lexists(P/'artifact-staging-authorization.json'),'PREVIOUS_INPUT_POLICY_NOT_WITHDRAWN')
    pgdata=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/fresh35-first-production-20261110-r3/data')
    need(not os.path.lexists(pgdata/'postmaster.pid'),'DATABASE_NOT_STOPPED')
    completed=completed_preparation()
    for grant in (GRANT,'5cc58239751e4e2a'):
        worker=B.with_name('grant-'+grant);control=C.with_name('grant-'+grant)
        for phase,key in JOBS.items():
            if grant==GRANT and phase in COMPLETED:continue
            need(not any(os.path.lexists(x)for x in (worker/'jobs'/key,control/'jobs'/key,control/'requests'/(key+'.json'),control/'requests'/(key+'.tmp'),control/'results'/(key+'.json'))),'REMAINING_KEY_PRESENT_NO_REPLAY')
    q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stdout.strip() and not q.stderr,'ACTIVE_OPERATION_OR_UNKNOWN')
    return completed


def register(a, files, authority):
    need(os.geteuid() == 0 and socket.gethostname() == 'naijue-server', 'EXACT_ROOT_HOST_REQUIRED')
    need(not any(os.path.lexists(path) for path in (AUDIT, NEW_MODULE,
             P / '.direct33-after-preparation-dispatcher.pending')), 'ALREADY_PRESENT_OR_UNKNOWN_READ_ORIGINAL_ONLY')
    for folder in (B, P, H, LOCK.parent):
        for path in [*reversed(folder.parents), folder]:
            s = path.lstat()
            need(path.resolve() == path and stat.S_ISDIR(s.st_mode) and s.st_uid == 0
                 and not s.st_mode & 0o022, 'PROTECTED_DIRECTORY_REQUIRED')
    with os.fdopen(os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW), 'r+b') as lock:
        need(identity(os.fstat(lock.fileno())) == a['oldIdentities']['executionLock'] == LOCK_ID, 'ORIGINAL_LOCK_CHANGED')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        snapshot(a)
        quiet()
        old = read(P / 'admin_exec.py')[0]
        cfg = json.loads(read(P / 'grant.json')[0])
        core, prior = consumer(old, cfg)
        policy = core.strict(files['policy'])
        validate_policy_delta(policy,{'grantId':GRANT})
        need(sha(read(NEW_POLICY)[0])=='0d18b5d6e60e4709f814bc43bc64d6f725445a6c4df38425e5f0fe2cc56ebcd5'
             and policy['startsAt']==a['startsAt'] and now()+5100000<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'EXACT_NEW_UNUSED_WINDOW_REQUIRED')
        candidate=ModuleType('candidate_input02_main');candidate.__file__=str(NEW_MODULE)
        exec(compile(files['module'],candidate.__file__,'exec'),candidate.__dict__)
        original_read=core.read
        core.read=lambda path,**kw:files['policy'] if path==NEW_POLICY else original_read(path,**kw)
        try:
            proposed=candidate.Original02AbsentContinuation(prior.readonly,cfg,sha(files['policy']))
            proposed.original_basis();proposed.historical_install();core.stopped_generation(proposed.old.service)
        finally:core.read=original_read
        new = render(files)
        need(now() + 30000 < a['expiresAt'], 'REGISTRATION_WINDOW_TOO_SHORT')
        AUDIT.mkdir(mode=0o700)
        sync(AUDIT.parent)
        put(AUDIT / 'authorization.json', authority)
        put(AUDIT / 'old-dispatcher.bin', old)
        put(AUDIT / 'old-policy.bin',read(NEW_POLICY)[0])
        put(AUDIT / 'old-identities.json', pack(a['oldIdentities']))
        result = dict(status='REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY', published=[],
                      automaticReplay=False, businessDatabaseWrites=0)
        try:
            put(NEW_MODULE, files['module'], 0o644)
            result['published'].append('module')
            snapshot(a)
            quiet()
            pending_policy=H/'.direct33-after-preparation-policy.pending'
            need(not os.path.lexists(pending_policy),'POLICY_PENDING_PRESENT')
            put(pending_policy,files['policy'])
            snapshot(a);quiet()
            os.replace(pending_policy,NEW_POLICY);sync(H)
            result['published'].append('policy')
            consumer(new, cfg, files['module'], files['policy'])
            put(P / '.direct33-after-preparation-dispatcher.pending', new, 0o755)
            snapshot(a,policy=sha(files['policy']))
            quiet()
            need(now() < a['expiresAt'], 'REGISTRATION_EXPIRED_BEFORE_CAS')
            put(AUDIT / 'publish-intent.json', pack(dict(oldDispatcherSha256=OLD_DISPATCHER,
                dispatcherSha256=sha(new), moduleSha256=HELPER, policySha256=sha(files['policy']))))
            os.replace(P / '.direct33-after-preparation-dispatcher.pending', P / 'admin_exec.py')
            sync(P)
            result['published'].append('dispatcher')
            snapshot(a,sha(new),sha(files['policy']))
            quiet()
            consumer(read(P / 'admin_exec.py')[0], cfg, files['module'], files['policy'])
            need(identity(os.fstat(lock.fileno())) == LOCK_ID, 'ORIGINAL_LOCK_CHANGED_AFTER_CAS')
            result.update(status='EXACT_MAIN9_AFTER_PREPARATION_WINDOW_REGISTERED_NO_PHASE_SUBMITTED',
                          dispatcherSha256=sha(new), moduleSha256=HELPER, policySha256=sha(files['policy']),
                          oldHistoryPreserved=True, originalLockPreserved=True, phaseSubmitted=False)
        except BaseException as error:
            result['exceptionClass'] = type(error).__name__
            message = str(error)
            result['safeCode'] = message if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]{1,160}', message) else None
            try:
                result['observedDispatcherSha256'] = sha(read(P / 'admin_exec.py')[0])
            except Exception:
                result['observedDispatcherSha256'] = None
        put(AUDIT / 'result.json', pack(result))
        return result


if __name__ == '__main__':
    encoded = sys.stdin.buffer.read(1048577)
    need(0 < len(encoded) <= 1048576 and len(sys.argv) == 2, 'BOUNDED_ORIGINAL_STDIN_REQUIRED')
    approved, files, raw = decode(json.loads(encoded), sys.argv[1])
    outcome = register(approved, files, raw)
    print(json.dumps(outcome, sort_keys=True))
    raise SystemExit(0 if outcome['status'] == 'EXACT_MAIN9_AFTER_PREPARATION_WINDOW_REGISTERED_NO_PHASE_SUBMITTED' else 2)
