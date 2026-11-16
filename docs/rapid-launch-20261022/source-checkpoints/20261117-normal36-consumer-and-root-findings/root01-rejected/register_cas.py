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
ENTRY = B/'r3-normal36-registration-source-20261117-01/register_cas.py'
AUDIT = B/'r3-normal36-registration-cas-20261117-01'
NEW_MODULE = P/'r3_direct36_aux_prepare.py'
NEW_POLICY = H/'direct36-batched-real.json'
OLD_DISPATCHER = '5a06bf8de17ca75944934bb5c5676430a0f890bf9bec7ddcd71d804aebdc83bb'
HELPER = '9b5555137b5443d538401d61fc7cc2c689d17d79dfa4a14bd5a3ccc0967e57ea'
TEMPLATE = 'ef02748504b4ef455644f9228dd42faf62d816c10e292145507a1b6ea4488834'
BASIS = {Path(k):v for k,v in {'/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-35/results/normal-service-result.json': 'b7280b0c9d2152d38331ef966e786bd409955928516d53b87d38a724fffdb5d6',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-batched161-command-successor-20261116-01/results/batched161-command-update-result.json': '2698e7d0e259037adac1c92af3ce0942a11289469fe942f4f91f14e52b75eee5',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-01/results/final33-prepare-result.json': 'b9f2907655ed12d6e978a207cc05ddb0525091828517174039cf883692deab85',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-apply-20261116-01/results/maintenance-auth-result.json': 'e54cad2e1469c24084d95027021666659502dc6ef2bd7d045556868ec7bfddfe',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-restore-20261116-01/results/maintenance-auth-result.json': 'b01e7aef3d89c6a0655b87e0bc6cfe84c901aab021c059190bc986271258b099',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': '284344322fa3a4213f56991006359386314247b921dd1e527047f62dae7e02d9',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-first-r3-native-service-start-20261116-35.json': '0bd548166072b27a28adf2784f754fbc13774bfde68fd05b687831836cce2426',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-batched161-command-successor-20261116-01.json': '515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-final33-plan-prepare-20261116-01.json': 'd8ff6c3e9e4c3324d7d40b75429c133feeec77ed5afa45a6dc5791678c47d201',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary35-auth-apply-20261116-01.json': '3b24ffb55ccd8e5f75a4d498e088557c472519b6093fd7799439c33fd45870b0',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary35-auth-restore-20261116-01.json': 'e8b77fed8b54c3c31a59d82db724a378cfb41e6f4d523a10ac5acb63f83b3577',
 '/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64/results/t45-r3-ordinary35-preserve-stop-20261116-01.json': 'fb0a0503673a348504cbc7de62d5318fe1b60667789448e099b6189e4c805cd8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-20261110-r3-real-execute-20261114-02/r3-outer-terminal.json': 'ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-25/r3-outer-terminal.json': '79c3657f7f0051c1646215ee7e5149ecfb6e6fa31606750167bc2e8f3b3f5738',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-25/results/normal-service-result.json': 'c2a5ee898726e66ebb53e309cb39d803069fa1336f19fd5c50b016187f5e90be',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-26/r3-outer-terminal.json': '853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-26/results/normal-service-result.json': '5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-27/r3-outer-terminal.json': 'ba1caa324ceba9a191479d45bd6e1b497e78b5adc7946d21589c296a2e300cd4',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-27/results/normal-service-result.json': '808c633e8d7f11bac5e09efa21cbb3b40f39272a103b89af191624915b869609',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/r3-outer-terminal.json': '89afe4cb6651db43fe530961e62040ded2ee8ed8ead9bb720ca079776ffe1408',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/genuine-describe-process.json': 'fe03bd630a02acfc63a14369f23bed5620f7f89cd0f9484c83a80c4828d72ae4',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/normal-service-incomplete.json': 'd3d32bee8c9792f5cfe8354e050cfec3a07977af7e3b324826b2d84b4330526d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-28/results/normal-service-result.json': '94cdae517c242cc904c7f68d1b43f31ce01aa87f7f0089fc1de93fb77c2cc29f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/r3-outer-terminal.json': '30e747021f4775edb001b3ce1d7463b813b3240b99819ac1cd5236e4c22c8990',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/genuine-describe-process.json': '719a1bcdeffacf67c8d2e24a37fa4226fa4925439bc16610934185a189d26935',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/normal-service-incomplete.json': '70c903267ecca60c8b0de9e9dfb6a044d3060516690d30f3997e4c89bcb153ab',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-29/results/normal-service-result.json': '769ca923a3e9f15eb4a010d4e23a991ab06ce8bed759bd22f6d5580ae1a9c426',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-30/r3-outer-terminal.json': '34d2f5e0f7cf2fabf8192a340eda31dac53e8ab16cda8cc14fe6acba33b93ed4',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-30/results/genuine-describe-process.json': '8d57b0052484c4edff925f69d71da3c82c035152d559838214261db29c6ab165',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-30/results/normal-service-result.json': 'bcb378acfa698c2bc8f7018bb713acc61318e66bf4f14bc2830cdec51790730d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-31/r3-outer-terminal.json': '5246a9abdb987e4309c4bc6d181373623580b019fb32a5290d8677058d94ef21',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-31/results/genuine-describe-process.json': '241650153461d87f76ae1be79ed5fc9b6e019e772cad36e69b6c4e167d7e22eb',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-31/results/normal-service-result.json': '326773273e586e3d1864bda75c81f0f94c28dc537362bb7c1160796ccd43902d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-33/r3-outer-terminal.json': '93fae5ccba52c9f66788c1bba550b37e4e8271d4ba0e0b918ee15d4b6a42459e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-33/results/normal-service-incomplete.json': 'c30c24d57467bb950e0ddb0f8f2ef151375fe62532457cb8bf8018fef637cf5c',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-33/results/normal-service-result.json': 'd54bc926de87f10c3a5a1544a00a676e5a09ac818d439feb1b6c22884864bdc4',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-34/bundle/normal_service05_after08.py': 'c9e3fd6d53bc3a8c2c60222d1abb2435ddad82d1cba6b97dcaf9326405348693',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-34/bundle/normal_service05_after08_proof.py': '7822dfca50c4233433b4cb9fb040ba02f4748edac1841555ca3652cca4cbc4e5',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-34/r3-outer-terminal.json': '9a97f8c6702b0e1f1916c508bd1afb9c1c968200491e6226046d6ef584192c59',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-34/results/normal-service-incomplete.json': '86d02a8dc156a789aeb5bcee0b8f0320f8ccf96a61cba8a6e6816fd696e4ac61',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-34/results/normal-service-result.json': 'f4870f877c98e8075cf31754d7a46af631f4f780e0a775aa6ca1712f3980b6be',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-35/r3-outer-terminal.json': '0bd548166072b27a28adf2784f754fbc13774bfde68fd05b687831836cce2426',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-first-r3-native-service-start-20261116-35/results/normal-service-result.json': 'd282fea89a6c981c0a8fb3292bfa8843e82d4c99321e6fdbff23c9e844cbb899',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261115-01/r3-outer-terminal.json': '5d95d500adc1a2cbbccff93fee5512ed2dd5a38e83f7fe974ac7e94f0b76d5c2',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261115-01/results/batched-install-result.json': '5d82a437a9bae7cabf78a7dd8ce48776c48be0a8f875da1aa426d04160019d5f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261116-02/r3-outer-terminal.json': '01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-install-20261116-02/results/batched-install-result.json': 'e14e9b649d9b4d4864360384e93e059cdda80c37e769de91f2452abd1af87792',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root03-source-delta-20261116-01/r3-outer-terminal.json': 'db91c1ea3f1553308937748844d74a40dae1debd13747ef7d9ccb08e44aa08f8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root03-source-delta-20261116-01/results/batched-source-materialization.json': 'cdcaf09ad0325dc0d563b8191d6e0fa803f28b2ffe195ee81961b436f9420cec',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root04-source-delta-20261116-01/r3-outer-terminal.json': 'f9281d9e721000d0957da09fde525661ffb94005e3e82e809a39c35c9da85585',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root04-source-delta-20261116-01/results/batched-source-materialization.json': '8bb064ba27cbdaeb04b64408fee3ac2f2c7c9b28c7a7720761105ca1d7d191e1',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root05-source-delta-20261116-01/r3-outer-terminal.json': '2dbe906d654f7508845b53c868f3fee0520d3c03109dc09e7e28601c3788ef72',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root06-source-delta-20261116-01/r3-outer-terminal.json': '13cdb833a19ab30816660d1300f244ab41d3bd4485bcd8f50715d2b5b54e99c6',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched-root06-source-delta-20261116-01/results/batched-source-materialization.json': '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched161-command-successor-20261116-01/r3-outer-terminal.json': '515874b0f761b6de9fef10396e2fdc5a4e2be70cd562d8707ed602708ba5d1eb',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-batched161-command-successor-20261116-01/results/batched161-command-update-result.json': 'a474d758af30d53a4154f90081066213df351a33cb1226f976d6231ed7fdb020',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-input-materialize-20261116-01/r3-outer-terminal.json': '9a3734dccce2148ba03480df7f8f24a64a82b597e3b4a25c7b72790d40a079db',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-input-materialize-20261116-02/r3-outer-terminal.json': 'b959313cb4d054bd1017480781c280cecc787ce41ad0990cdd88c807d2f73004',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-input-materialize-20261116-02/results/final33-input-materialization-result.json': '556cb0e3a336aaed7c5c156cc531b90c0895a63c65d1020e91dcfe1b00bbdb58',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-01/r3-outer-terminal.json': 'd8ff6c3e9e4c3324d7d40b75429c133feeec77ed5afa45a6dc5791678c47d201',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-final33-plan-prepare-20261116-01/results/final33-prepare-result.json': '58ea7d796302112eb063bbcf99629d60c8422bcfcba38bf8a0afb60b8d5f24b7',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/r3-outer-terminal.json': 'c4b2c12d626712ed4eb9409560539d2bed6ce42e77922990d7f033ce60aab24a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/results/maintenance-auth-cleanup.json': '61b30a3bec3239c283faff791e876989e3bc4544e25f2611109cc24e603d1919',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary19-auth-restore-20261114-01/results/maintenance-auth-result.json': '2dce7c2a3b0315c9291f7f8c9076879dcadb2d2427ef71c1883653cf254e994d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/bundle/ordinary05_roles_job.py': '0d677daf02c1d567295efab3965dd8b90ce755188bb78b9b75cc8c56dea27451',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/r3-outer-terminal.json': '6d2005bfd5cc61e34fa5e25eb0e5ef58b7addfa0490306ef634221c591e63461',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-apply-20261115-01/results/maintenance-auth-result.json': '77f6c66f5252fb5238e4f3cc1ed8dff030efd00413c09876d09d8fa63f217b21',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/r3-outer-terminal.json': '977a2d3ff1bb03e9bb8304a541dbc8b3e250df2c26aa0efe17b917c504947825',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/results/maintenance-auth-cleanup.json': 'fe681d7e4075572131519c74f64802dc964d859230255e02697cca25e474ea9b',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-auth-restore-20261115-01/results/maintenance-auth-result.json': 'b275e1369531bb303ed0587a59a37af9215553afbedc782101ce2325ee8186ac',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-preserve-stop-20261115-01/r3-outer-terminal.json': '0a9ea80f2c52494c584e2dc7999766e725e604c9ec7d12c92af7424d1eb83a39',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary24-preserve-stop-20261115-01/results/normal05-preserve-stop-result.json': '24c937badca67b63d07d13a7e976dc6433c0468dc7de50cf100f20a6e5f096a0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/r3-outer-terminal.json': '1b82a691e39b0a72495542757664773a9a204f84bc3331da243ab7f6fb2be238',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '281f7858e447a0665ad02444c43e2eb971651415c99a8e8307ad0db3c7664acd',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary25-auth-restore-20261116-01/results/maintenance-auth-result.json': 'ecf79874833ade08d7f63aceb1d6a80b587f1644ce727c22d9bc591cd54ea74d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/r3-outer-terminal.json': 'c588bbc912a8b6bbe6c469abfd584c3b17b30ffe726bac331a5dfa3806587ba0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': 'a657740b94edbad211e2e78fafad67fb25c513c255ec592472e6b2fbc60164c6',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-apply-20261116-01/results/maintenance-auth-result.json': '0545e87f04e9a6f66de318e911f527003d8902ac787d1844567e02c400a998af',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/r3-outer-terminal.json': '944dfa9b110fd836ee9e99a8944446111b1e68808d92280a5d220e91cd67fc63',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '6bfcdbe6f9ef11e7816856e5e6672788461c75131f8a9f6a5c795aff65f34680',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary26-auth-restore-20261116-01/results/maintenance-auth-result.json': 'd521106c1c1a5a20601f7ad125dd2c254ff1879a78d25c5a299c0464ed527bd8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/r3-outer-terminal.json': '94933ecd1885265d8e84e1f7e3de72f0a73879f85ec490e5f3a0e0016761ad3e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': '9a241d91ebc2e1a69a2c3a0f144e6dbda09019a619ec8b3632ba2787fe04db9c',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-apply-20261116-01/results/maintenance-auth-result.json': '396f58878c782fc2f598ea637469c2f499a1ee88f2a902561628e3e95b13ee5d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/r3-outer-terminal.json': '957f0f26d7ed9272ea675c855a7726e9627af7946774b9b8827fb720d47aafe0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': 'b8286a2e7449b7b9e165975fd5492fc6084eea1d1b9322e1b5f57e40c4c57339',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-auth-restore-20261116-01/results/maintenance-auth-result.json': '90e8fc47b7df781cb325dc9e653510c2080da0e336748146e25d8751a4cc9fc7',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-preserve-stop-20261116-01/r3-outer-terminal.json': '2dc418392380fe9313facee2b85cf06d79ad2b1e8fcac1faedd6c0263d1fd04f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary27-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': 'a5aa0eecb1cfa711b922a1cbbd227a25b7316c93bcfc83dc4ab4c60f5a56d24a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/r3-outer-terminal.json': '163a6252ea1ca699392c5955be78077e86e0a7d7ba75991044ada741bb1c409d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': 'c455111cf4de0d73782c9bf04c0dbc2aedd6df2a92c2a2d5914a736942cd6b87',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-apply-20261116-01/results/maintenance-auth-result.json': '7d2dff965ccae19fc835bb669a622b9555dfc5532f4426bab5c6443e05657abc',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/r3-outer-terminal.json': '496966e4b649819a641dc72eab3a3a2ca65f3507f59f27d5d04144617d553db6',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '91477439a305528bf3a71041ab6db699cd8ae62869a3fd35c01c38249e648949',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary28-auth-restore-20261116-01/results/maintenance-auth-result.json': 'b8da5c9281edc26cc20c17702f0257fa1c95016a8744ae5a6eae7cf0c41ce5cc',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/r3-outer-terminal.json': 'a30a2a024f2456e15254c3b8fef18d041b25b094d9835db694895ae5fe04a105',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': '04b8975792ea7a646af2c586d537cf09bd5d5a0412635f88aa3c7cb731756469',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-apply-20261116-01/results/maintenance-auth-result.json': '0a0c1142c8cb922397ee48da2868b1bf973950b9f8a89721e0914477905fe483',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/r3-outer-terminal.json': '536e3726f2a4f0785e2ffc64fa8f89c82830652dd78ae29a773cf4c77a218004',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '1d50af6619b16eae16013ad0063b26cb5705eec58b49e156fffefd1ba3015b21',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary29-auth-restore-20261116-01/results/maintenance-auth-result.json': 'f0cb72700e78fd5097911e0169054272c66b570fad2dcf0b2572cc2f66c34039',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-apply-20261116-01/r3-outer-terminal.json': '2ef5d7101bf7b05d9b7d7d969c61571a265ca702c94e6e14dbd24d58cddc65ae',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': '947170d2ba5da0c54931f3be2bd9a9ea55ffd2069aee0efacc9f86f600ec3d24',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-apply-20261116-01/results/maintenance-auth-result.json': '5aacd4b10b4c4c914fcfc00db9f6dc57c3a61751f60e60668609822b165afabf',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-restore-20261116-01/r3-outer-terminal.json': '762af3ad2ca11c0b6675b942d0f0f33b3d53dba39d8d8f2decea0312e5547213',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '8d72b0d314a7775a67acb3ec6f65cbe86aa65ef5323488206d9b1550a80db2d4',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-auth-restore-20261116-01/results/maintenance-auth-result.json': 'fc22b1917a3ef1b67b259d8fb878416bb20f84dbb11cc26796233db19fa1039a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-preserve-stop-20261116-01/r3-outer-terminal.json': 'e52708fc14962a02d10906d25f9434268eb22ee4c36c754e75fc3b4bf70f2ddb',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary30-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': '62ed7abefdb356fa4a7098d16f54f887191340949587a5406e51b4687007e5f3',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-apply-20261116-01/r3-outer-terminal.json': '9dd63f536541ffc21857d584ed11e1336e85bf938c3923fcf23fe3625e450851',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-apply-20261116-01/results/maintenance-auth-cleanup.json': '228789d2f18e3f6a5c5315d01be64de87e26e65f5bb1b6aba3257183fe6b1db0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-apply-20261116-01/results/maintenance-auth-result.json': '1f045f18c4b5a7a026472d0b65e23535c5cd5e988774fc84b51fc5515a556eda',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-restore-20261116-01/r3-outer-terminal.json': '4541b36de09569184c0198d9573e5becdb01d7babf1fecc7ffd7d83d3a511c7d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '1b9cc4f95114b336f65bccfbd87e60d07b90d2b72d0e628d5b6a9795f483b87f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-auth-restore-20261116-01/results/maintenance-auth-result.json': '023d953c3fece2054074002486c6f355465cb8d70458ad1b6fc447cae8db5778',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-preserve-stop-20261116-01/r3-outer-terminal.json': '9ff56dfa1229233855b0cfacd9de65278bb6fd5b36dce0962e748d40c5455a49',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary31-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': 'dc995ed92abadab3f4a9c0a72c1ed361ce1ce45f5eb666fa6df42a71a9f47a92',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-apply-20261116-01/r3-outer-terminal.json': 'c4bf8e001c88ce6929d062ead377c0dbadae0ca0eaae079c75e871954c5a51c6',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-apply-20261116-01/results/maintenance-auth-result.json': 'c6f32cd3132c6505d620c7f7ef777050e860694c736213e60eb07eeb53f36859',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-restore-20261116-01/bundle/host-authorization.json': '6bb04430023adc383c6c999c5e76fbf73ca0bc521eb8def228c4f483b6fb546a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-restore-20261116-01/bundle/ordinary05_roles_job.py': 'ad07197b1e4785a2b13f9ee6cd62d14cf8010f0ab56de4e8e7956ce6934a5673',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-restore-20261116-01/r3-outer-terminal.json': '6d05f1bab9fccde6b178cd4496f38822434b6137b332eaa74dc9f10a15331e8c',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-restore-20261116-01/results/maintenance-auth-result.json': 'eba7deb6e9aa8091b2619794cf71261d282c377b485a6132f2058a6d9b190c71',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-restore-20261116-02/r3-outer-terminal.json': '7688b15851d8804dbb75d18827ddcfd7b09308af47b54acb18501aa418b3725d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-restore-20261116-02/results/maintenance-auth-cleanup.json': '3dba242155468f723fbd61b7185750fcdabfa928a3236b14dc7b9e558fa3dcac',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary33-auth-restore-20261116-02/results/maintenance-auth-result.json': '2c0380766ac61444cc791da8789b9ba841ee5a78dacff7d11fbc5c43bfd83725',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-apply-20261116-01/bundle/bundle-manifest.json': '544a6f1d3a87fb02a5a66ba701a199c5597e9e5fd3d86863e6c6faaa60df05a3',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-apply-20261116-01/bundle/host-authorization.json': '5467fa0e5bb89f7002bd7fa62a477acb9c5021dad9ad1297610bf61fcc0f6e5d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-apply-20261116-01/bundle/roles-authorization.json': '60ff1ff38900e1d07001486e05848124b1ed64bba0ea425357d4ac9006af16c6',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-apply-20261116-01/r3-outer-terminal.json': '39dd96689785ea6fc041eef092fd3097677f2e3ffbc3c5c6b56f2fce482c3600',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-apply-20261116-01/request.json': '39bcfdde2286969bd3fd9035ad5efcc0e42d279453b5f997c8ba2e9bd2505807',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-apply-20261116-02/r3-outer-terminal.json': '332b94742a14d99b267fe4b34fc212c4daa629e3e353b92c40e04207f2264ced',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-apply-20261116-02/results/maintenance-auth-cleanup.json': '7e26fcfb1e813c3edc39ddc639880f0154bc3c0ae2f8da4f9f859c461d8afc1e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-apply-20261116-02/results/maintenance-auth-result.json': '8bf75d6ba463b244ee3b236bee9b9d6fbe04e93a4d9851069aa142085838150a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-restore-20261116-01/r3-outer-terminal.json': '6ec792da7f9738b0d0983c2561b19129767ca6105fd800820f41bfc03fcd548a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-restore-20261116-01/results/maintenance-auth-cleanup.json': '7618a11fbdcdc59b9ccef529fb47d9103644c26faa7446644efc98a8c1ea8ed0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary34-auth-restore-20261116-01/results/maintenance-auth-result.json': '87e2d61a95d1b8d41e386028c6d3e21d96f5e348c349539cc64e0515e3cb5757',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-apply-20261116-01/r3-outer-terminal.json': '3b24ffb55ccd8e5f75a4d498e088557c472519b6093fd7799439c33fd45870b0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-apply-20261116-01/results/maintenance-auth-result.json': '2050ce32e573dc7f6d960dc2b2a917cc7a68da52d462b15d62bebc08752b57a8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-restore-20261116-01/r3-outer-terminal.json': 'e8b77fed8b54c3c31a59d82db724a378cfb41e6f4d523a10ac5acb63f83b3577',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-auth-restore-20261116-01/results/maintenance-auth-result.json': 'ca7ffc5eb4cb7ade449972579da939b39e96eb21d497bc9ca82e89e440744230',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-preserve-stop-20261116-01/r3-outer-terminal.json': 'fb0a0503673a348504cbc7de62d5318fe1b60667789448e099b6189e4c805cd8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs/t45-r3-ordinary35-preserve-stop-20261116-01/results/normal05-preserve-stop-result.json': 'f1d6ed4a422ff9dfe6db88ceb2eea7155c650af1d96d3b251ed9a90f57673951',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/active.json': '0e164d5f759af04b5976eff19f8e17796b6fafa9220a8a8af8341b9fb36898a8',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/bindings/writer.json': 'f6b60a9470edd408e2f2783e955669e9545b184c9e97a4f4fb4bf68cbea1ce01',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct24-batched-real.json': 'cb384d2176e3a8c4a46fd3ffb1ce1e4b82b293f41c5647310c10f1b8e8a10898',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct25-batched-real.json': '8c6a2a9fa827da4fd8a81cdfce37c379d743886a02170724cc6ca221129a3afa',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct26-batched-real.json': 'ae952f261ad8b59fd5342c20acc69a5585b027997003cd684299b30aeebb3525',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct27-batched-real.json': '89f49225c19c1043e4a4a59c876876972b49abb9d5e0b29bcb699d5d069b2094',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct28-batched-real.json': '56bb27580cf88df1c61491366da765a501dd84f9dce70033bf1c2a601cb84858',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct29-batched-real.json': 'faed7dec0ccd88d74745e47bbdca94bbb8a9095f550d8016945f38d76ead827e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct30-batched-real.json': 'fbb5bb55532d708103e0e70acd5512b8a77ab7538555938a30f179d2a3241b10',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct31-batched-real.json': 'a07d6db401cfc669bfb94a444cf0f310c4be0d416356cb92b481f79c537ff065',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct32-batched-real.json': '99ea865df185eef2cd1c01cc9303d5c08e9bd8d90202c8b9557b5723820fac6a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct33-batched-real.json': '542e78404c0493eb9b959af59f771437dd3017184022ef82e32b3c72b05d921d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct33-restore02-only.json': 'b91213cb9e127a8aa4d6dcc1298e86e0a318e270afdd9a7c97a92e0f032cebb3',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct34-batched-real.json': '6e6fa47124048960cc8fe835b13babcf443217c08fc4e85a2935defdd59a4f61',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/direct35-batched-real.json': '8ede4587599742ec45ad90eef7b01e43d21d83635ce2689c85181691dca679e7',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/failed19-readonly-recovery.json': '338d30dc3b3d39de130f0152899eeb92a1aa91c9c60d2073b06a2227bb4024cd',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/final33-input-reception-cached03.json': '5d861a567b4918c65a327f077f92c19cda778086c71730e9a2930287b38979e1',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/final33-input-reception-recovery.json': 'cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/final33-input-reception.json': 'cc67670964821aa412f735b84106e2dea8a24a485b2004370914fd6381045182',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent-continuation.json': '74dea44d2b88283b1946aea35baee9c216dee6c2e2f1b19f440446e8390c377a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent21-continuation.json': 'a85a825c170cdb7adfc4394d1a843511d0563668be4992955809dfed10af21da',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original02-absent21-inspect03.json': 'cbed4bf8f7c5bdf28ff7187d7cdde45aff7fe049bb640631a2f42c9bfc39374e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-apply02.json': '322a6ad5ab56f2ef268a9c93b5641d00c43b6076213652cd2289d411ae3e9a65',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-continuation.json': '9f24ba07d7251e35c58d91e409377a46f62988a65845da92d6c1899ea097307b',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original03-absent22-inspect04.json': 'a3b5b3e3f0616c6f23007f3cf0a7ed34aead49b5cf2e486ded76c99e3961e99a',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original04-absent22-continuation.json': 'd2698af3e4d2acebf3198c93086af46cc9e20007b2ed4cac6839cc865730e913',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original05-absent22-continuation.json': '27c9b661d7ade353bb42be2b23f104879462749c117779d971d3c4d5b9cd6282',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/original05-unknown22-inspect.json': '7fe44435553def39809cf8ad1a63532cd1aeb23f9bd8f1d45d13acef2d7c0e04',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-05-write-continuity/policy.json': '25f2e73242f24cbd78fc1d765a5f52e032ba89ea449c7f5f48ba9bd8a0190757',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct27-fullchain-registration-cas-20261116-01/old-dispatcher.bin': '4474fc511ed22a1e9c1a405ef81f35ddba2bdff2e0ba45c42e6ff18c0cf49cfb',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct28-start-describe-registration-cas-20261116-01/old-dispatcher.bin': 'f411beed0cd78307742f59aa6668a6e693ce8c6bae4b24e26182820a27869fec',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct29-start-describe-registration-cas-20261116-01/old-dispatcher.bin': '6b6b0d0aee71e95e989431bb6df822ab77cfa925fdeab1a12077b4feb1205842',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct30-start-describe-registration-cas-20261116-01/old-dispatcher.bin': 'e15c47bb947a402f87de40e9972161b577df78611dd7a8f87019ad2f48ea54ed',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct31-start-describe-registration-cas-20261116-01/old-dispatcher.bin': '5b6c3c83d362bcfaaf064e6427702c3eb7af995b8b823574ba55114a7d090b5c',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct33-after-preparation-registration-cas-20261116-01/result.json': 'c0321dc4084523b38909646179798eef2d2fd748ec85863bd651558532c3044e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct33-input02-registration-cas-20261116-02/result.json': '20afba865671f741fadbdc4f92c19d2099feb8627e67f2da13dba5c3d5650a2e',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-direct33-input02-registration-source-20261116-01/entry-result.json': '0a84a3b9ea7f91e5964f005b0934523a77feaee5d2474a1c8a354f82559ab987',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal34-apply02-registration-cas-20261117-01/old-dispatcher.bin': '5cfb0227b161475b3401ff5a7b402f4f758bc4052b2d110d6dc725ca34837782',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal34-apply02-registration-cas-20261117-01/result.json': '9c49d310a615b8b55f8e561b5c83436699532b4a334816edb4b9ec30824796d0',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal34-registration-cas-20261116-01/old-dispatcher.bin': '79032639a8125a4a29d274fb6d17cf94fa1455c05c06acce823f84f3fac7638f',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal34-registration-cas-20261116-01/result.json': 'cefee00f768b93e7b050fb7c2bf52cc76d2f9807d4f9603fcdb8deb3bacc909d',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-normal36-registration-cas-20261117-01/result.json': '88b096d36fa6f8fc1613d58e815c8e84dc58049d1ab2b368cc5a3c1e3074c145',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-restore33-only-registration-cas-20261116-01/old-dispatcher.bin': '149e2759ed0336e8c8a1823ca518da89d94040acdbe143f3e7bbd3b3222f61dc',
 '/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/r3-restore33-only-registration-cas-20261116-01/result.json': 'a9cc9d69ef8601b33116a1e2970a7b248f3b7252f8cbbde777b342e1179b3e69',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-27.json': '2640ef4df8bc3e2c64f31d327a41a1c4fddc9adf99584b68169ab854fe6c6dbb',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-28.json': 'd57946c9ff13ee5715787ee1d1f0a13fe1ffd2a2898fa76ecc82545a5d3d18ae',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-29.json': 'e50a7112cb48fc987b220a514e62e2e370b08bc3322bfa0ed42babc50d379568',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-30.json': 'abf3b3251289ebb5f40218f51991c1a3bafea4854097543be175ed400d9ce06c',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-31.json': '42e7a80f72519feed61892a4598f7f654005e9c44535aaee0ac6f4c66a3c112e',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-33.json': '6e80fa88fd64387f9cef4baf341a441ee5f4e4bddc26dce80a476e057cf0b2b8',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-34.json': 'a30976e3decacda1d23da2014cb32ed4d42d7295d7c9cc073060d4084653a34d',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-35.json': '82e15c91ea0b2b237ddada69e2345a78f28e1ee4301c45e859735853ba0a3ec0',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root04-20261116-01/source-materialization.json': '8bb064ba27cbdaeb04b64408fee3ac2f2c7c9b28c7a7720761105ca1d7d191e1',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root05-20261116-01/source-materialization.json': 'e8f8032b00601e976c094f0365064d0385d7af8f48f9f7bbb465dca896bf3a5e',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/source-materialization.json': '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/authority.json': '33bcd2fbe1a81631d710f46ab40bf2687cdc40162baf02de474951e85e17d69f',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/restored.json': 'adfe3f7b83825b304346292a84296b9f6d05d99edaab41db85dff39021979470',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary34-auth-20261116-01/authority.json': '06ada29693d1f82b137de12fe5ba9f2cd0be35419872bb6f5f6db97a506512e8',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary34-auth-20261116-01/restored.json': '381d10acbc171f793e785366d3b3b74899bd344bf67235e9fefd4601ee2666a2',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary35-auth-20261116-01/authority.json': '9e436ae9bed8f6d5dff1b2860e94b0f7490ebaacd8208d63d97c5884e5bc5322',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary35-auth-20261116-01/restored.json': '564feb3c3948d6590fdf5a6fb42532f44bdc5c0b059c6104cd288a3ec66b135f',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-27/cleanup.json': 'fda7c05908d7b94223901638b83a417d2d7f1c624d6d195abae6ede6fc0702e8',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-28/failed-start-cleanup.json': '395dd08471c95dda1f56f4959ae315d135fbec582ff97f489167a6033cc840b8',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-28/retained-ack.json': '7296e03b9865a67718c0e938058dd7990000a72535e3b00a5a94e7b5be7b1b83',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-29/failed-start-cleanup.json': '4bc125537c15b9593e663b07fc95ea96f07e170e809c9b4a58d106bef8ae06cf',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-29/retained-ack.json': 'ba6a0699b5b37a7b5e81bbd86ad5e8f9735e85f842da6449387c4ab91592a781',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-30/cleanup.json': '9073bc7b9f1d013e8c74833d5e5aac5fb630df84c4c27c9fd4628d6dc47f8e9a',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-31/cleanup.json': '929460035e9b5ab7c9a9a9639a69322b6879e590bf1827006ef3c94dcd6e86cf',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-31/retained-ack.json': '319c4f9b4e2fb871368d2ea07a6861316da74b65ce41d67b79f685db763d994d',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-33/failed-start-cleanup.json': 'b22542359e3fdc5738f2d282b1ea22dcb645ab9a737bd6d337fda445f465ff91',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-33/retained-ack.json': 'b3c1966bda82c89f40b12bd99625f2a83d1f3fcfecba40be629f8ac55644c442',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-34/failed-start-cleanup.json': '41838bb703af6a5326a91a5bcad1ef4abd51f290191d147d7519c4df46ac68d5',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-34/retained-ack.json': '773a34c1a5e3111e531ede3bacf24e7f96d92d47ff5435fef94b8be6e8203b4a',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-35/cleanup.json': 'ab6e59eaf1f99785d3f36e3b5e2d25510332cf81ed7ce1b120447dba0150346c',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-35/retained-ack.json': '7cb3a553fe96de7de11f35eff948da30f9933ae50403b5e0f7393b9671a5692a',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01/materialization-receipt.json': '556cb0e3a336aaed7c5c156cc531b90c0895a63c65d1020e91dcfe1b00bbdb58',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.before-r3-05-continuity.py': '5bf72fc20dfa597c81a9eb5ae8956c497a980b1497e2cfbfe8d469932b27ad49',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/admin_exec.py': '5a06bf8de17ca75944934bb5c5676430a0f890bf9bec7ddcd71d804aebdc83bb',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched.py': 'd60c68633383f5da9e5054d518010bb6a4f34d3a068c51f87fa738d6f36a6cef',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct24_batched_apply02.py': 'da4303f6597962842d0db5993396ca1012e2181ee2224ddec9f4bd01b1a69eef',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_batched.py': '57d8ea9c363f4c4db743b99bfacafdafecdb644d8e65894a416ec2a418aa2810',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct25_restore_precontainer.py': 'ec89f4f472f559e621974b8f8187308b1de0d4049ddb568c9a1aa5cd545aadea',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_batched.py': 'a4b5ef7bd42bad85089021095080785225c3efa7c6c7eef5b18029ada468e78d',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct26_restore_precontainer.py': '165c5c4c2c1f6d3f6b6ba9f555aee42d112b6881740b61384aed45d7669ace0b',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct27_batched.py': '45ee118981ebddd278240dc5bcd1ff0e05769092668e8021f8070c6ce0c04eba',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct28_batched.py': '0fa08870dbf5fec3daf5a2c4d2300e3719666091252cff9ac12ec8fcfacc3261',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct29_batched.py': '096f8ebca3ec5aee1f3091a18842e533e42932fb7b26d3da689e7a4d7a1de799',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct30_batched.py': '95b2054ea4c7c95ebcfbe6c1fc1a1ab893c1255c8e52cd91424e5fd3c0dc28ed',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct31_batched.py': '365a696b1ee113ce337e36c8159f6be28eccf3ce1e0a314ef61aeddaa76e93c9',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct32_batched.py': '4ff1a618c2e10c2119a16bd19a621d3c0c48a3ba92fe01229baec809fbb29316',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_after_preparation.py': 'a48f6fdbf1d1b1e18509588bde07f7e7506af29fcbd4c6acf65a5c0f3115ea97',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_batched.py': 'b700b3b5b13c20222aa00847d95ef31975ca25e5b5baae0f5ee98b95e43a085c',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_input02.py': 'a48f6fdbf1d1b1e18509588bde07f7e7506af29fcbd4c6acf65a5c0f3115ea97',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct33_restore02_only.py': '5aaa31f25ba1ed44a30c576fdd93df563646b3ad8b6c077632626a15da91e530',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct34_apply02.py': '3db008f0476be4413bd14d9014d2c3a5e2591618c03c6be74d5afd8a05c8cf09',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct34_normal.py': 'e539ceac12353067b4e5abe61e28766fa82843bc7446235a4be386236e3eb3ee',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_direct36_aux_prepare.py': '46741990f7567458e53e55a0dd79b6538d4361a49193508b68ef09db4b2ef7e4',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_failed19_readonly.py': '4c35abe0fc5ea65e6a3629bd6a690289d14586a790a1f2f2ce10cb3eb3cf808e',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input.py': '4441d264213d5abf3c2c4af1a56d7df0bd275f0a4587e66c1e1bf156c0793d3f',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input_cached03.py': '17b7c5af2072cb525be2a0c9d02db20bcb6dc89bb9b89063369ec0345223ad63',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_final33_input_recovery.py': '4ce801c947084c2d4870bac073cc85d844453d6b79e96129b065b94496e26722',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_continuation.py': '162dfa8b90549da125465cde04d0936cf2d0592c6702a763e13fc47dca0d4c2e',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent21_inspect03.py': 'fd84d560bc8903746fc31babfcab04e85f339ad1c2eff0bf31a5482a75d0591f',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original02_absent_continuation.py': '909abe203293f791cdaa909227a5a90e0ae16da2ab6fa45390d271f16f2ec19a',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_apply02.py': '720e1c9344650f55351e8654b409d7a3b3c9e38e442be06911893907911c814d',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_continuation.py': '982e5b0178bd69a07d0d659d8793033a36093283c16632ea7811a9f53588dd1f',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original03_absent22_inspect04.py': 'd39aac90e056fec55e23e1eea2086b62c52590edd61d7e438c55449a28401d95',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original04_absent22_continuation.py': '87c543d66e6a6d19f50d640cf8c1d483fb3e16a4eac4fcabcb6d1e1a2147a781',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_absent22_continuation.py': '16e54ec54cf945c086e547050fa7893e856b05e217f3b0b6feb650797e56e4fa',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_original05_unknown22_inspect.py': '32aecd9f5ee7079f243b78f89d5a58e051610e16e10490cb8a12538a74a9863f',
 '/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64/r3_write_continuity.py': '1fe4820114624e8a183a11c84a116106a4a679cb522119bc3bf0298e07c8347d'} .items()}
C=Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
JOBS = {'apply': 't45-r3-ordinary36-auth-apply-20261116-01', 'prepare': 't45-r3-final33-plan-prepare-20261116-02', 'restore': 't45-r3-ordinary36-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-36', 'stop': 't45-r3-ordinary36-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01'}
EXPECTED_RULES = {'apply': {'authorityLeaf': 'host-authorization.json',
           'authoritySha256': None,
           'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360',
                          'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5',
                          'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73',
                          'ordinary05_roles.py': 'f010b3043eb4ebba30150b0a8ee8e88e2d9d0d26908ee5e00df7c0408d9b1d8f',
                          'ordinary05_roles_job.py': 'ad91590cfd1fe67a01a82d343140708f091d95bb20f387fa8dd868706e7913e8',
                          'prior_preserved35.py': '370bffd7aef582f8406020bcf43e7894651c776e51f9c5ad59f9b52034d6e105',
                          'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a'},
           'deadlineField': 'expiresAt',
           'jobId': 't45-r3-ordinary36-auth-apply-20261116-01',
           'rolesAuthoritySha256': None,
           'script': 'ordinary05_roles_job.py',
           'sourceDirectory': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL36-SOURCE-SUCCESSOR-02/apply/bundle',
           'timeoutSeconds': 300},
 'prepare': {'authorityLeaf': 'host-authorization.json',
             'authoritySha256': None,
             'bundlePins': {'final33-run.mjs': '24a66dae1de539fb67e0b814242fd14597a821f37ff5cf8e1ae4ed9c3afa223f',
                            'final33_host.py': '85acf829edc4a8f51f5aa1e66d5de7b23dd6abc97d3d46ac0815d9f8de6ac5e6',
                            'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4',
                            'nonroot_input_access.py': '0dab63562102ded384773477bdcad0c01d3ff5d2aa076431bacf5bd973b43385',
                            'normal05_retained_stop.py': 'ba808098c6b5ab7af8b8478babab95790f47b2135b517a71f59b9fb26e5ec491',
                            'r3_05_cli.py': 'b5e48708ca9b910d0aa0f85c689540958534afb4ded346c4d598dca5d0aa6ad6',
                            'r3_05_runtime.py': 'cf31545ea399a7267fb75a801d0e57d14a7372e0ae9340e3b51cdd2c0284147b'},
             'deadlineField': 'expiresAt',
             'jobId': 't45-r3-final33-plan-prepare-20261116-02',
             'rolesAuthoritySha256': 'NOT_APPLICABLE',
             'script': 'final33_host.py',
             'sourceDirectory': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL36-SOURCE-SUCCESSOR-02/prepare/bundle',
             'timeoutSeconds': 780},
 'restore': {'authorityLeaf': 'host-authorization.json',
             'authoritySha256': None,
             'bundlePins': {'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360',
                            'normal_service04.py': '60059ac98adb07dcbe54724aa126043bd0c142a3fc3d619c8345e7a4e144bca5',
                            'normal_service04_proof.py': 'a4dac3679576102fd509ea4aa23906efd994d6a14c963586a5cfcebf09b52c73',
                            'ordinary05_roles.py': 'f010b3043eb4ebba30150b0a8ee8e88e2d9d0d26908ee5e00df7c0408d9b1d8f',
                            'ordinary05_roles_job.py': 'ad91590cfd1fe67a01a82d343140708f091d95bb20f387fa8dd868706e7913e8',
                            'prior_preserved35.py': '370bffd7aef582f8406020bcf43e7894651c776e51f9c5ad59f9b52034d6e105',
                            'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a'},
             'deadlineField': 'expiresAt',
             'jobId': 't45-r3-ordinary36-auth-restore-20261116-01',
             'rolesAuthoritySha256': None,
             'script': 'ordinary05_roles_job.py',
             'sourceDirectory': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL36-SOURCE-SUCCESSOR-02/restore/bundle',
             'timeoutSeconds': 300},
 'start': {'authorityLeaf': 'service-start-authorization.json',
           'authoritySha256': None,
           'bundlePins': {'batched161-run.mjs': 'e6c44f641a6306b286e98613e0e69781fd64d92a5533c4ced884646648375e8a',
                          'final33-run.mjs': '24a66dae1de539fb67e0b814242fd14597a821f37ff5cf8e1ae4ed9c3afa223f',
                          'fresh35-production-carrier.py': '40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360',
                          'normal_service05_after08.py': 'e39debb1bc94db8328c5c50fc2894491db01d396d4f5936bd13307506ac82d75',
                          'normal_service05_after08_proof.py': '642a056411ce012a8e125d622214b60ef5b9ea67f43bdaf277b5d9a553dd9d35',
                          'operator-host.mjs': '7c88c0fae43c544959b2834f81dfe32fec2b99fbedd9c1533494c68e109245ae',
                          'operator-manifest.json': 'c4795906bdfab154e5cd66305a3e9ec698cd1a0b23e3a896258b396540a42184',
                          'operator-stream-import-cli.mjs': '6836bb2aadbfcd81621e0a49143ff5a44b26c9a913c8b12b4925296037113e5e',
                          'operator-stream-program.mjs': 'fa0ca2e0e41fe83925155406959d683458671d647caf475ce6ebf0b9761c87f6',
                          'prior_preserved35.py': '370bffd7aef582f8406020bcf43e7894651c776e51f9c5ad59f9b52034d6e105',
                          'production-plan.json': '7a416900f8b3988dc51b118a928c277f252fad1f736928d72003b1f21e0ce17d',
                          'r3_05_cli.py': 'b3f963efd9e8b37b653bf9eeaf5e9bfdc71b689a0f45c100a1d95fb9348f05c0',
                          'r3_05_readonly.py': '933b094ea9da9372982ccf94a3bebc004aa50fd59f774b43d3532ded388fa7ec',
                          'r3_05_runtime.py': 'cf31545ea399a7267fb75a801d0e57d14a7372e0ae9340e3b51cdd2c0284147b',
                          'root06_material.py': '584a152728466cdcafac5552f9011976af3258c89af2c07fcbfaae2a445d2c8a',
                          'start_owned_describe.py': 'abf46f58a519f8e9c1c8abd3ff35482a94d02ae5ab9afd07fb01bdb66a7e33f6'},
           'deadlineField': 'expiresAt',
           'jobId': 't45-first-r3-native-service-start-20261116-36',
           'rolesAuthoritySha256': 'NOT_APPLICABLE',
           'script': 'normal_service05_after08.py',
           'sourceDirectory': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL36-SOURCE-SUCCESSOR-02/start/bundle',
           'timeoutSeconds': 300},
 'stop': {'authorityLeaf': 'normal05-preserve-stop-input.json',
          'authoritySha256': None,
          'bundlePins': {'normal05_preserve_stop.py': '0962a84910c8c62f1e34b35bde278b6ada7f39cc323f54ecae3391311e8b588b',
                         'normal05_retained_stop.py': 'ba808098c6b5ab7af8b8478babab95790f47b2135b517a71f59b9fb26e5ec491'},
          'deadlineField': 'expiresAt',
          'jobId': 't45-r3-ordinary36-preserve-stop-20261116-01',
          'rolesAuthoritySha256': 'NOT_APPLICABLE',
          'script': 'normal05_preserve_stop.py',
          'sourceDirectory': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL36-SOURCE-SUCCESSOR-02/stop/bundle',
          'timeoutSeconds': 120},
 'writer': {'authorityLeaf': 'host-authorization.json',
            'authoritySha256': None,
            'bundlePins': {'final33-run.mjs': '24a66dae1de539fb67e0b814242fd14597a821f37ff5cf8e1ae4ed9c3afa223f',
                           'final33_host.py': '85acf829edc4a8f51f5aa1e66d5de7b23dd6abc97d3d46ac0815d9f8de6ac5e6',
                           'fresh35-production-carrier.py': 'efa37e755b2ee8c5655311f2e9ef655b3dce7dbee629bd8c706c2d09341b29a4',
                           'nonroot_input_access.py': '0dab63562102ded384773477bdcad0c01d3ff5d2aa076431bacf5bd973b43385',
                           'normal05_retained_stop.py': 'ba808098c6b5ab7af8b8478babab95790f47b2135b517a71f59b9fb26e5ec491',
                           'r3_05_cli.py': 'b5e48708ca9b910d0aa0f85c689540958534afb4ded346c4d598dca5d0aa6ad6',
                           'r3_05_runtime.py': 'cf31545ea399a7267fb75a801d0e57d14a7372e0ae9340e3b51cdd2c0284147b'},
            'deadlineField': 'expiresAt',
            'jobId': 't45-r3-batched-real-execute-20261115-01',
            'rolesAuthoritySha256': 'NOT_APPLICABLE',
            'script': 'final33_host.py',
            'sourceDirectory': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL36-SOURCE-SUCCESSOR-02/writer/bundle',
            'timeoutSeconds': 3000}}
COMPLETED = {'input_materialize': {'leaf': 'final33-input-materialization-result.json',
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
        raise ValueError('NORMAL34_REGISTRATION_' + code)


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
    return dict(format='T45_NORMAL36_REGISTRATION_CAS_V1', grantId=GRANT,
                oldDispatcherSha256=OLD_DISPATCHER, newModuleSha256=HELPER,
                dispatcherTemplateSha256=TEMPLATE, newModulePath=str(NEW_MODULE),
                newPolicyPath=str(NEW_POLICY), publishOrder=['module', 'policy', 'dispatcher'],
                sourceRegistrationOnly=True,businessDatabaseWrites=0,oldHistoryChanged=False,
                predecessorClosureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',
                completedPreparationNeverReissued=True)


USED = {'apply': {'exitCode': 0,
           'leaf': 'maintenance-auth-result.json',
           'publicResultSha256': '15d9d4dba833eb105683e51880a46c9aab037f90cdd57530ad139e91d87b2de7',
           'requestKey': 't45-r3-ordinary33-auth-apply-20261116-01',
           'rootResultSha256': 'c6f32cd3132c6505d620c7f7ef777050e860694c736213e60eb07eeb53f36859',
           'terminalSha256': 'c4bf8e001c88ce6929d062ead377c0dbadae0ca0eaae079c75e871954c5a51c6',
           'terminalStatus': 'COMPLETED',
           'value': {'SQL36OrBusinessImport': False,
                     'automaticReplay': False,
                     'cleanup': {'automaticReplay': False,
                                 'cid': '3810c1d477355494d289aa74eb6e9ea6b52907509ec3cd14bfa0b9cb15615d53',
                                 'confirmed': True,
                                 'createAttempted': True,
                                 'exitCode': 0,
                                 'oomKilled': False,
                                 'ownContainerStopped': True,
                                 'ownedPidAbsent': True,
                                 'requestKey': 't45-r3-ordinary33-auth-apply-20261116-01',
                                 'sourceDataPreserved': True,
                                 'stage': 'READ_BACK_OWN_CONTAINER_STOP'},
                     'newDatabaseOrRole': False,
                     'normal08Or05Started': False,
                     'phase': 'apply',
                     'requestKey': 't45-r3-ordinary33-auth-apply-20261116-01',
                     'result': {'authenticationAttempted': False,
                                'automaticReplay': False,
                                'credentialValidUntilByRole': {'erp35_admin_20261110_r3': 1794845751546,
                                                               'erp35_controller_20261110_r3': 1794845631546},
                                'membershipsOrRoleAttributesChanged': False,
                                'newRoles': 0,
                                'privateRecoveryBasisRetained': True,
                                'requestKey': 't45-r3-ordinary33-auth-apply-20261116-01',
                                'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3'],
                                'runtimeAuthChanged': False,
                                'status': 'EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK'},
                     'status': 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'}},
 'restore01': {'exitCode': 2,
               'leaf': 'maintenance-auth-result.json',
               'publicResultSha256': '43546173512cf80af6f66350e1a10a41a71d7d1dc0154791d8c967839deab6e9',
               'requestKey': 't45-r3-ordinary33-auth-restore-20261116-01',
               'rootResultSha256': 'eba7deb6e9aa8091b2619794cf71261d282c377b485a6132f2058a6d9b190c71',
               'terminalSha256': '6d05f1bab9fccde6b178cd4496f38822434b6137b332eaa74dc9f10a15331e8c',
               'terminalStatus': 'FAILED',
               'value': {'automaticReplay': False,
                         'phase': 'restore',
                         'privateRecoveryBasisAndPartialStatePreserved': True,
                         'requestKey': 't45-r3-ordinary33-auth-restore-20261116-01',
                         'safeCode': 'ORDINARY05_FAILED_START_SOURCE_DIFFERS',
                         'status': 'FINITE_AUTH_STEP_UNCONFIRMED_ORIGINAL_KEY_ONLY'}},
 'restore02': {'exitCode': 0,
               'leaf': 'maintenance-auth-result.json',
               'publicResultSha256': '9ed1bcd12e87ad1f08ca136c88dc5435a36bc25986606467a7fe9756934d8142',
               'requestKey': 't45-r3-ordinary33-auth-restore-20261116-02',
               'rootResultSha256': '2c0380766ac61444cc791da8789b9ba841ee5a78dacff7d11fbc5c43bfd83725',
               'terminalSha256': '7688b15851d8804dbb75d18827ddcfd7b09308af47b54acb18501aa418b3725d',
               'terminalStatus': 'COMPLETED',
               'value': {'SQL36OrBusinessImport': False,
                         'automaticReplay': False,
                         'cleanup': {'automaticReplay': False,
                                     'cid': '7116f4db51edec7d962c259b4a2f32d63845414075ac732a4f92beb65ca7b024',
                                     'confirmed': True,
                                     'createAttempted': True,
                                     'exitCode': 0,
                                     'oomKilled': False,
                                     'ownContainerStopped': True,
                                     'ownedPidAbsent': True,
                                     'requestKey': 't45-r3-ordinary33-auth-restore-20261116-02',
                                     'sourceDataPreserved': True,
                                     'stage': 'READ_BACK_OWN_CONTAINER_STOP'},
                         'newDatabaseOrRole': False,
                         'normal08Or05Started': False,
                         'phase': 'restore',
                         'requestKey': 't45-r3-ordinary33-auth-restore-20261116-02',
                         'result': {'automaticReplay': False,
                                    'databaseStillStopped': True,
                                    'exactOriginalVerifierAndExpiryVerifiedPrivately': True,
                                    'membershipsOrRoleAttributesChanged': False,
                                    'naturalExpiryCountedAsRestoration': False,
                                    'privateRecoveryBasisRetained': True,
                                    'requestKey': 't45-r3-ordinary33-auth-restore-20261116-01',
                                    'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3'],
                                    'runtimeAuthChanged': False,
                                    'status': 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'},
                         'status': 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'}},
 'start': {'exitCode': 2,
           'leaf': 'normal-service-result.json',
           'publicResultSha256': '66fe7f92a7bf0c9d6c550551b7d75ded06e63c2ac4e8497597d9038f30b1f944',
           'requestKey': 't45-first-r3-native-service-start-20261116-33',
           'rootResultSha256': 'd54bc926de87f10c3a5a1544a00a676e5a09ac818d439feb1b6c22884864bdc4',
           'terminalSha256': '93fae5ccba52c9f66788c1bba550b37e4e8271d4ba0e0b918ee15d4b6a42459e',
           'terminalStatus': 'FAILED',
           'value': {'automaticRetry': False,
                     'requestKey': 't45-first-r3-native-service-start-20261116-33',
                     'safeCode': 'DESCRIBE_NATIVE_FAILED_READ_PRIVATE_PROCESS_RECEIPT',
                     'status': 'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY'}}}
ORIGINAL_JOBS = {'apply': 't45-r3-ordinary33-auth-apply-20261116-01',
 'catalog_update': 't45-r3-batched161-command-successor-20261116-01',
 'input_materialize': 't45-r3-final33-input-materialize-20261116-02',
 'materialize': 't45-r3-batched-root06-source-delta-20261116-01',
 'prepare': 't45-r3-final33-plan-prepare-20261116-01',
 'restore': 't45-r3-ordinary33-auth-restore-20261116-01',
 'start': 't45-first-r3-native-service-start-20261116-33',
 'stop': 't45-r3-ordinary33-preserve-stop-20261116-01',
 'writer': 't45-r3-batched-real-execute-20261115-01'}
CUSTODY = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01')
CUSTODY_FILES = ['/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/original-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/finite-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/applied.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/restore-attempt.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary34-auth-20261116-01/original-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary34-auth-20261116-01/finite-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary34-auth-20261116-01/applied.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary34-auth-20261116-01/restore-attempt.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary35-auth-20261116-01/original-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary35-auth-20261116-01/finite-auth.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary35-auth-20261116-01/applied.json', '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary35-auth-20261116-01/restore-attempt.json']
BOOT = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-33')
ROLE_SHA = '33bcd2fbe1a81631d710f46ab40bf2687cdc40162baf02de474951e85e17d69f'
CLEANUP_SHA = 'b22542359e3fdc5738f2d282b1ea22dcb645ab9a737bd6d337fda445f465ff91'
INCOMPLETE_SHA = 'c30c24d57467bb950e0ddb0f8f2ef151375fe62532457cb8bf8018fef637cf5c'


RESTORE_CLEANUP_SHA = '3dba242155468f723fbd61b7185750fcdabfa928a3236b14dc7b9e558fa3dcac'

RESTORED_SHA = 'adfe3f7b83825b304346292a84296b9f6d05d99edaab41db85dff39021979470'

PRIOR_SERVICE = {'containerId': '823a830fffb5adf106f6d98cf92809e2900f93ce753ddaaf2c78a52ce6242383',
 'containerStartedAt': '2026-11-16T14:39:10.568097848Z',
 'postmasterStart': '2026-11-16 14:39:11.919988+00',
 'proofSha256': '6e80fa88fd64387f9cef4baf341a441ee5f4e4bddc26dce80a476e057cf0b2b8',
 'serviceKey': 't45-first-r3-native-service-start-20261116-33'}

PRIOR_BINDINGS = {'previousCleanupSha256': 'b22542359e3fdc5738f2d282b1ea22dcb645ab9a737bd6d337fda445f465ff91',
 'previousCurrentProofSha256': '6e80fa88fd64387f9cef4baf341a441ee5f4e4bddc26dce80a476e057cf0b2b8',
 'previousIncompleteRootSha256': 'c30c24d57467bb950e0ddb0f8f2ef151375fe62532457cb8bf8018fef637cf5c',
 'previousResultSha256': '66fe7f92a7bf0c9d6c550551b7d75ded06e63c2ac4e8497597d9038f30b1f944',
 'previousRetainedAckSha256': 'b3c1966bda82c89f40b12bd99625f2a83d1f3fcfecba40be629f8ac55644c442',
 'previousTerminalSha256': '93fae5ccba52c9f66788c1bba550b37e4e8271d4ba0e0b918ee15d4b6a42459e',
 'restoreResultSha256': '9ed1bcd12e87ad1f08ca136c88dc5435a36bc25986606467a7fe9756934d8142',
 'restoreTerminalSha256': '7688b15851d8804dbb75d18827ddcfd7b09308af47b54acb18501aa418b3725d'}

OLD_CONTAINERS = [('t45-r3-ordinary33-auth-apply-20261116-01', '3810c1d477355494d289aa74eb6e9ea6b52907509ec3cd14bfa0b9cb15615d53'),
 ('t45-r3-ordinary33-auth-restore-20261116-02', '7116f4db51edec7d962c259b4a2f32d63845414075ac732a4f92beb65ca7b024'),
 ('t45-first-r3-native-service-start-20261116-33', '823a830fffb5adf106f6d98cf92809e2900f93ce753ddaaf2c78a52ce6242383')]

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
 need(len(role_pins)==2 and role_pins[0]==role_pins[1] and role_pins[0] not in (ROLE_SHA,REFUSED_ROLE_SHA,CLOSED34_ROLE_SHA,'9e436ae9bed8f6d5dff1b2860e94b0f7490ebaacd8208d63d97c5884e5bc5322'),'NEW34_SAME_DYNAMIC_ROLES_PIN_REQUIRED')


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
         and set(a['oldIdentities']) == {str(path) for path in BASIS} | {'executionLock'} | set(CUSTODY_FILES), 'EXACT_INPUT_KEYS_REQUIRED')
    files = {key: base64.b64decode(value, validate=True) for key, value in packet['files'].items()}
    need(all(0 < len(data) <= 4*1024**2 and sha(data) == a['sourcePins'][key]
             for key, data in files.items()), 'EXACT_PACKET_BYTES_REQUIRED')
    render(files)
    return a, files, raw


def snapshot(a,dispatcher=OLD_DISPATCHER,policy=None):
    for private in CUSTODY_FILES:
        need(identity(Path(private).lstat())==a['oldIdentities'][private],'ORIGINAL_PRIVATE_CUSTODY_CHANGED')
    for path,pin in BASIS.items():
        raw,meta=read(path,1000 if str(path).startswith(str(C)+'/') else 0)
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


def validate_used_value(phase,terminal,value):
    e=USED[phase]
    need((terminal.get('jobId'),terminal.get('taskId'),terminal.get('grantId'),terminal.get('status'),terminal.get('exitCode'),terminal.get('phaseStarted'))==(e['requestKey'],'T45',GRANT,e['terminalStatus'],e['exitCode'],True),'EXACT_USED_TERMINAL_REQUIRED')
    need(value==e['value'],'EXACT_USED_RESULT_REQUIRED')

REFUSED_KEY = 't45-r3-ordinary34-auth-apply-20261116-01'
REFUSED_TERMINAL_SHA = '39dd96689785ea6fc041eef092fd3097677f2e3ffbc3c5c6b56f2fce482c3600'
REFUSED_REQUEST_SHA = '39bcfdde2286969bd3fd9035ad5efcc0e42d279453b5f997c8ba2e9bd2505807'
REFUSED_HOST_SHA = '5467fa0e5bb89f7002bd7fa62a477acb9c5021dad9ad1297610bf61fcc0f6e5d'
REFUSED_ROLE_SHA = '60ff1ff38900e1d07001486e05848124b1ed64bba0ea425357d4ac9006af16c6'
REFUSED_MANIFEST_SHA = '544a6f1d3a87fb02a5a66ba701a199c5597e9e5fd3d86863e6c6faaa60df05a3'
REFUSED_TERMINAL = {'atUTC': '2026-11-16T16:22:59.960926+00:00',
 'businessAcceptanceClaimed': False,
 'elapsedSeconds': 0.04957998695317656,
 'errorCode': 'R3_CONTINUITY_DIRECT33_EXACT_FINITE_AUTHORITY_REQUIRED',
 'exitCode': 2,
 'exports': [],
 'finishedAtUTC': '2026-11-16T16:23:00.036362+00:00',
 'grantId': 'b16447fbc81f4d64',
 'jobId': 't45-r3-ordinary34-auth-apply-20261116-01',
 'phaseStarted': False,
 'privateLogsExported': False,
 'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
 'status': 'REFUSED_R3_CONTINUITY_BEFORE_PHASE',
 'taskId': 'T45',
 'unit': 'naijue-erp-op-b16447fb-cec65c8ea6c4'}
REFUSED_REQUEST = {'args': [],
 'businessCutoverConfirmed': False,
 'gateEvidence': {},
 'grantId': 'b16447fbc81f4d64',
 'jobId': 't45-r3-ordinary34-auth-apply-20261116-01',
 'manifestSha256': '544a6f1d3a87fb02a5a66ba701a199c5597e9e5fd3d86863e6c6faaa60df05a3',
 'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
 'script': 'ordinary05_roles_job.py',
 'taskEvidence': {},
 'taskId': 'T45',
 'timeoutSeconds': 300}

def refused_apply34_history():
    # Immutable original-key evidence only. Do not require future custody/PG state here.
    job=B/'jobs'/REFUSED_KEY
    terminal=read(job/'r3-outer-terminal.json')[0]
    public=read(C/'results'/(REFUSED_KEY+'.json'),1000)[0]
    request=read(job/'request.json')[0]
    need(sha(terminal)==REFUSED_TERMINAL_SHA and terminal==public and json.loads(terminal)==REFUSED_TERMINAL,'EXACT_APPLY34_BEFORE_PHASE_REFUSAL_REQUIRED')
    need(sha(request)==REFUSED_REQUEST_SHA and json.loads(request)==REFUSED_REQUEST and REFUSED_REQUEST['args']==[],'EXACT_ORIGINAL_APPLY34_EMPTY_ARGS_REQUIRED')
    need(REFUSED_TERMINAL['phaseStarted'] is False and REFUSED_TERMINAL['exports']==[] and REFUSED_TERMINAL['status']=='REFUSED_R3_CONTINUITY_BEFORE_PHASE' and REFUSED_TERMINAL['exitCode']==2 and REFUSED_TERMINAL['errorCode']=='R3_CONTINUITY_DIRECT33_EXACT_FINITE_AUTHORITY_REQUIRED','NO_EXECUTED_APPLY_OR_FAKE_RESTORE_ALLOWED')
    for leaf,pin in [('host-authorization.json',REFUSED_HOST_SHA),('roles-authorization.json',REFUSED_ROLE_SHA),('bundle-manifest.json',REFUSED_MANIFEST_SHA)]:
        need(sha(read(job/'bundle'/leaf)[0])==pin,'EXACT_REFUSED_APPLY34_BUNDLE_REQUIRED')
    need(not os.path.lexists(job/'phase.private.log') and not any(os.path.lexists(job/'results'/leaf) for leaf in ('maintenance-auth-intent.json','maintenance-auth-inside.json','maintenance-auth-cleanup.json','maintenance-auth-result.json')),'ORIGINAL_REFUSED_KEY_CHILD_EVIDENCE_PRESENT')
    return {'requestKey':REFUSED_KEY,'terminalSha256':REFUSED_TERMINAL_SHA,'requestSha256':REFUSED_REQUEST_SHA,'phaseStarted':False,'credentialWriteOccurred':False}

CLOSED34 = {'apply': {'leaf': 'maintenance-auth-result.json',
           'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL34-APPLY02-RUNTIME-01/ACTUAL-APPLY02-COMPLETED.json',
           'publicResultSha256': '66ea27022fff743d9c3d35127e34b739c541c0cf079449bd0514e7d39341bf4e',
           'requestKey': 't45-r3-ordinary34-auth-apply-20261116-02',
           'rootResultSha256': '8bf75d6ba463b244ee3b236bee9b9d6fbe04e93a4d9851069aa142085838150a',
           'terminal': {'atUTC': '2026-11-16T17:06:01.626403+00:00',
                        'businessAcceptanceClaimed': False,
                        'elapsedSeconds': 7.8824917650199495,
                        'exitCode': 0,
                        'exports': ['maintenance-auth-cleanup.json',
                                    'maintenance-auth-inside.json',
                                    'maintenance-auth-intent.json',
                                    'maintenance-auth-result.json'],
                        'finishedAtUTC': '2026-11-16T17:06:09.532614+00:00',
                        'grantId': 'b16447fbc81f4d64',
                        'jobId': 't45-r3-ordinary34-auth-apply-20261116-02',
                        'phaseStarted': True,
                        'privateLogsExported': False,
                        'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
                        'status': 'COMPLETED',
                        'taskId': 'T45',
                        'unit': 'naijue-erp-op-b16447fb-0ca75689a0cd'},
           'terminalSha256': '332b94742a14d99b267fe4b34fc212c4daa629e3e353b92c40e04207f2264ced',
           'typedSha256': '428e0a98fd9355d3643e37caa52f3c03c8044850c5ca0f52fef5aa01aa5c4aa3',
           'value': {'SQL36OrBusinessImport': False,
                     'automaticReplay': False,
                     'cleanup': {'automaticReplay': False,
                                 'cid': '5b05f408fcdbc653fbd3c66d5b731bbfb7e054fd505f313a03ed6a13bee1ab69',
                                 'confirmed': True,
                                 'createAttempted': True,
                                 'exitCode': 0,
                                 'oomKilled': False,
                                 'ownContainerStopped': True,
                                 'ownedPidAbsent': True,
                                 'requestKey': 't45-r3-ordinary34-auth-apply-20261116-02',
                                 'sourceDataPreserved': True,
                                 'stage': 'READ_BACK_OWN_CONTAINER_STOP'},
                     'newDatabaseOrRole': False,
                     'normal08Or05Started': False,
                     'phase': 'apply',
                     'requestKey': 't45-r3-ordinary34-auth-apply-20261116-02',
                     'result': {'authenticationAttempted': False,
                                'automaticReplay': False,
                                'credentialValidUntilByRole': {'erp35_admin_20261110_r3': 1794855778097,
                                                               'erp35_controller_20261110_r3': 1794855658097},
                                'membershipsOrRoleAttributesChanged': False,
                                'newRoles': 0,
                                'privateRecoveryBasisRetained': True,
                                'requestKey': 't45-r3-ordinary34-auth-apply-20261116-01',
                                'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3'],
                                'runtimeAuthChanged': False,
                                'status': 'EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK'},
                     'status': 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'}},
 'restore': {'leaf': 'maintenance-auth-result.json',
             'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL34-APPLY02-RUNTIME-01/restore/ACTUAL-RESTORE34-COMPLETED.json',
             'publicResultSha256': '62238aac84a4aa016b3e07cc91112ffa79a15b196c8543d36b56d827cf0f88eb',
             'requestKey': 't45-r3-ordinary34-auth-restore-20261116-01',
             'rootResultSha256': '87e2d61a95d1b8d41e386028c6d3e21d96f5e348c349539cc64e0515e3cb5757',
             'terminal': {'atUTC': '2026-11-16T17:16:43.897038+00:00',
                          'businessAcceptanceClaimed': False,
                          'elapsedSeconds': 7.397153850004543,
                          'exitCode': 0,
                          'exports': ['maintenance-auth-cleanup.json',
                                      'maintenance-auth-inside.json',
                                      'maintenance-auth-intent.json',
                                      'maintenance-auth-result.json'],
                          'finishedAtUTC': '2026-11-16T17:16:51.330035+00:00',
                          'grantId': 'b16447fbc81f4d64',
                          'jobId': 't45-r3-ordinary34-auth-restore-20261116-01',
                          'phaseStarted': True,
                          'privateLogsExported': False,
                          'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
                          'status': 'COMPLETED',
                          'taskId': 'T45',
                          'unit': 'naijue-erp-op-b16447fb-18a2321e30d2'},
             'terminalSha256': '6ec792da7f9738b0d0983c2561b19129767ca6105fd800820f41bfc03fcd548a',
             'typedSha256': '1dab92bb68f7a6051205fec4de10e476a9ba018a7f4fffcaadb933c604d62703',
             'value': {'SQL36OrBusinessImport': False,
                       'automaticReplay': False,
                       'cleanup': {'automaticReplay': False,
                                   'cid': 'a77e815a9151ccb73d0f9b99cffeef404115ac62996ac0f20c6e151f9443e893',
                                   'confirmed': True,
                                   'createAttempted': True,
                                   'exitCode': 0,
                                   'oomKilled': False,
                                   'ownContainerStopped': True,
                                   'ownedPidAbsent': True,
                                   'requestKey': 't45-r3-ordinary34-auth-restore-20261116-01',
                                   'sourceDataPreserved': True,
                                   'stage': 'READ_BACK_OWN_CONTAINER_STOP'},
                       'newDatabaseOrRole': False,
                       'normal08Or05Started': False,
                       'phase': 'restore',
                       'requestKey': 't45-r3-ordinary34-auth-restore-20261116-01',
                       'result': {'automaticReplay': False,
                                  'databaseStillStopped': True,
                                  'exactOriginalVerifierAndExpiryVerifiedPrivately': True,
                                  'membershipsOrRoleAttributesChanged': False,
                                  'naturalExpiryCountedAsRestoration': False,
                                  'privateRecoveryBasisRetained': True,
                                  'requestKey': 't45-r3-ordinary34-auth-restore-20261116-01',
                                  'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3'],
                                  'runtimeAuthChanged': False,
                                  'status': 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'},
                       'status': 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'}},
 'start': {'leaf': 'normal-service-result.json',
           'path': '/Users/billy/Desktop/Workspace/project-007-业务管理系统/naijue-erp-v0.0.1/outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL34-APPLY02-RUNTIME-01/start/ACTUAL-START34-RESULT.json',
           'publicResultSha256': 'c8207babd477b0e2dad89021de225cbb2841dd192b580e7aa384fb3ea67b5d76',
           'requestKey': 't45-first-r3-native-service-start-20261116-34',
           'rootResultSha256': 'f4870f877c98e8075cf31754d7a46af631f4f780e0a775aa6ca1712f3980b6be',
           'terminal': {'atUTC': '2026-11-16T17:11:16.351790+00:00',
                        'businessAcceptanceClaimed': False,
                        'elapsedSeconds': 45.36728393100202,
                        'exitCode': 2,
                        'exports': ['genuine-describe-process.json',
                                    'normal-service-create-attempt.json',
                                    'normal-service-incomplete.json',
                                    'normal-service-intent.json',
                                    'normal-service-result.json'],
                        'finishedAtUTC': '2026-11-16T17:12:01.768648+00:00',
                        'grantId': 'b16447fbc81f4d64',
                        'jobId': 't45-first-r3-native-service-start-20261116-34',
                        'phaseStarted': True,
                        'privateLogsExported': False,
                        'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
                        'status': 'FAILED',
                        'taskId': 'T45',
                        'unit': 'naijue-erp-op-b16447fb-c0c1b8ab2f2f'},
           'terminalSha256': '9a97f8c6702b0e1f1916c508bd1afb9c1c968200491e6226046d6ef584192c59',
           'typedSha256': '09a37c519d0ca0433191977dd9d1f2466ceb0337d7763b284e1a03c19b1afd8d',
           'value': {'automaticRetry': False,
                     'requestKey': 't45-first-r3-native-service-start-20261116-34',
                     'safeCode': 'DESCRIBE_NATIVE_FAILED_READ_PRIVATE_PROCESS_RECEIPT',
                     'status': 'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY'}}}
CLOSED34_SERVICE = {'containerId': '3ebc60712697f9a4fe8bd333fec07a6128b57a9c7b879c865332859acc237967',
 'containerStartedAt': '2026-11-16T17:11:20.986520431Z',
 'postmasterStart': '2026-11-16 17:11:22.392132+00',
 'proofSha256': 'a30976e3decacda1d23da2014cb32ed4d42d7295d7c9cc073060d4084653a34d',
 'serviceKey': 't45-first-r3-native-service-start-20261116-34'}
CLOSED34_BINDINGS = {'previousCleanupSha256': '41838bb703af6a5326a91a5bcad1ef4abd51f290191d147d7519c4df46ac68d5',
 'previousCurrentProofSha256': 'a30976e3decacda1d23da2014cb32ed4d42d7295d7c9cc073060d4084653a34d',
 'previousIncompleteRootSha256': '86d02a8dc156a789aeb5bcee0b8f0320f8ccf96a61cba8a6e6816fd696e4ac61',
 'previousResultSha256': 'c8207babd477b0e2dad89021de225cbb2841dd192b580e7aa384fb3ea67b5d76',
 'previousRetainedAckSha256': '773a34c1a5e3111e531ede3bacf24e7f96d92d47ff5435fef94b8be6e8203b4a',
 'previousTerminalSha256': '9a97f8c6702b0e1f1916c508bd1afb9c1c968200491e6226046d6ef584192c59',
 'restoreResultSha256': '62238aac84a4aa016b3e07cc91112ffa79a15b196c8543d36b56d827cf0f88eb',
 'restoreTerminalSha256': '6ec792da7f9738b0d0983c2561b19129767ca6105fd800820f41bfc03fcd548a'}
CLOSED34_INCOMPLETE_SHA = '86d02a8dc156a789aeb5bcee0b8f0320f8ccf96a61cba8a6e6816fd696e4ac61'
CLOSED34_INCOMPLETE_PUBLIC_SHA = '069347c8b42ed65d61feec264ec85d16b42138b10505d75b0d886fbf93116f97'
CLOSED34_ROLE_SHA = '06ada29693d1f82b137de12fe5ba9f2cd0be35419872bb6f5f6db97a506512e8'
CLOSED34_RESTORED_SHA = '381d10acbc171f793e785366d3b3b74899bd344bf67235e9fefd4601ee2666a2'
CLOSED34_BOOT=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-34')
CLOSED34_CUSTODY=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary34-auth-20261116-01')

def closed34_history():
    for row in CLOSED34.values():
        key=row['requestKey'];terminal=read(B/'jobs'/key/'r3-outer-terminal.json')[0];public_t=read(C/'results'/(key+'.json'),1000)[0]
        root=read(B/'jobs'/key/'results'/row['leaf'])[0];public=read(C/'jobs'/key/'results'/row['leaf'],1000)[0]
        need(sha(terminal)==row['terminalSha256'] and terminal==public_t and json.loads(terminal)==row['terminal'],'EXACT_CLOSED34_TERMINAL_REQUIRED')
        need(sha(root)==row['rootResultSha256'] and sha(public)==row['publicResultSha256'] and json.loads(root)==json.loads(public)==row['value'],'EXACT_CLOSED34_RESULT_REQUIRED')
    start=CLOSED34['start'];restore=CLOSED34['restore'];incomplete=read(B/'jobs'/start['requestKey']/'results/normal-service-incomplete.json')[0]
    public=read(C/'jobs'/start['requestKey']/'results/normal-service-incomplete.json',1000)[0]
    need(sha(incomplete)==CLOSED34_INCOMPLETE_SHA and sha(public)==CLOSED34_INCOMPLETE_PUBLIC_SHA and json.loads(incomplete)==json.loads(public),'EXACT_CLOSED34_INCOMPLETE_PAIR_REQUIRED')
    inc=json.loads(incomplete);clean_raw=read(CLOSED34_BOOT/'failed-start-cleanup.json')[0];clean=json.loads(clean_raw)
    need(sha(clean_raw)==CLOSED34_BINDINGS['previousCleanupSha256'] and inc['successfulResultHandoff'] is False and inc['pid']==0 and inc['cid']==CLOSED34_SERVICE['containerId'] and all(inc[k] is True for k in ('confirmed','containerStopped','createAttempted','runtimeMaterialPreserved','currentProofPresent','retainedAckValidated')),'ACTUAL_FAILED34_AFTER_C_ACK_REQUIRED')
    need(inc['cleanStop']==dict(clean,cleanupLeaf='failed-start-cleanup.json',cleanupSha256=sha(clean_raw)) and clean['originalPGDATAAndCleanStateVerified'] is True and clean['dataDirectoryIdentity']=={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':448},'ACTUAL_FAILED34_CLEAN_ORIGINAL_DATA_REQUIRED')
    proof_raw=read(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-34.json'))[0]
    need(sha(proof_raw)==CLOSED34_SERVICE['proofSha256']==inc['currentProofSha256'],'EXACT_CLOSED34_C_REQUIRED')
    proof=json.loads(proof_raw);birth=proof['sharedPostgresNamespace']['container']
    need(proof['requestKey']==CLOSED34_SERVICE['serviceKey'] and birth['id']==CLOSED34_SERVICE['containerId'] and birth['startedAt']==CLOSED34_SERVICE['containerStartedAt'] and proof['physical']['postmasterStart']==CLOSED34_SERVICE['postmasterStart'] and proof['dataDirectoryIdentity']==clean['dataDirectoryIdentity'],'EXACT_REAL34_TUPLE_REQUIRED')
    ack=read(CLOSED34_BOOT/'retained-ack.json')[0]
    need(sha(ack)==CLOSED34_BINDINGS['previousRetainedAckSha256']==inc['retainedAckSha256'] and json.loads(ack)=={'requestKey':CLOSED34_SERVICE['serviceKey'],'proofSha256':CLOSED34_SERVICE['proofSha256'],'serviceLeaseExpiresAt':proof['sharedPostgresNamespace']['serviceLeaseExpiresAt']},'EXACT_CLOSED34_ACK_REQUIRED')
    inside=restore['value']['result']
    need(inside['requestKey']==restore['requestKey'] and inside['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inside['databaseStillStopped'] is True and all(inside[k] is False for k in ('naturalExpiryCountedAsRestoration','runtimeAuthChanged','membershipsOrRoleAttributesChanged')),'ACTUAL_34_AUTH_RESTORED_REQUIRED')
    need(sha(read(CLOSED34_CUSTODY/'authority.json')[0])==CLOSED34_ROLE_SHA and sha(read(CLOSED34_CUSTODY/'restored.json')[0])==CLOSED34_RESTORED_SHA and json.loads(read(CLOSED34_CUSTODY/'restored.json')[0])==inside,'EXACT_34_ORIGINAL_AUTH_SAFE_RECEIPT_REQUIRED')
    for phase in ('apply','restore'):
        row=CLOSED34[phase];value=row['value'];raw=read(B/'jobs'/row['requestKey']/'results/maintenance-auth-cleanup.json')[0]
        need(json.loads(raw)==value['cleanup'] and all(value['cleanup'][k] is True for k in ('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved')),'CLOSED34_MAINTENANCE_CLEANUP_REQUIRED')
    for phase,row in CLOSED34.items():
        key=row['requestKey'];cid=CLOSED34_SERVICE['containerId'] if phase=='start' else row['value']['cleanup']['cid']
        q=subprocess.run(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}',cid],capture_output=True,timeout=5)
        need(q.returncode==0 and not q.stderr and json.loads(q.stdout)=={'id':cid,'running':False,'pid':0,'operation':key},'EXACT_CLOSED34_CONTAINERS_STOPPED_REQUIRED')
    return {'service':CLOSED34_SERVICE,'restoredSha256':CLOSED34_RESTORED_SHA,'closureKind':'FAILED_AFTER_C_ACK_CLEAN_STOP_AUTH_RESTORED'}

def required_history():
    completed_preparation()
    for phase,e in USED.items():
        key=e['requestKey'];terminal=read(B/'jobs'/key/'r3-outer-terminal.json')[0];public_t=read(C/'results'/(key+'.json'),1000)[0]
        root=read(B/'jobs'/key/'results'/e['leaf'])[0];public=read(C/'jobs'/key/'results'/e['leaf'],1000)[0]
        need(sha(terminal)==e['terminalSha256'] and terminal==public_t,'EXACT_USED_TERMINAL_BYTES_REQUIRED')
        need(sha(root)==e['rootResultSha256'] and sha(public)==e['publicResultSha256'] and json.loads(root)==json.loads(public),'EXACT_USED_RESULT_OBJECTS_REQUIRED')
        validate_used_value(phase,json.loads(terminal),json.loads(root))
    raw=read(B/'jobs'/USED['start']['requestKey']/'results/normal-service-incomplete.json')[0]
    public=read(C/'jobs'/USED['start']['requestKey']/'results/normal-service-incomplete.json',1000)[0]
    need(sha(raw)==INCOMPLETE_SHA and sha(public)=='d7e124a976e99842833af3f93c5da2faf9ff4ddaf3bb1cb25c0bbd36841a531a' and json.loads(raw)==json.loads(public),'EXACT_INCOMPLETE_PAIR_REQUIRED')
    incomplete=json.loads(raw);cleanup=read(BOOT/'failed-start-cleanup.json')[0];clean=json.loads(cleanup)
    need(sha(cleanup)==CLEANUP_SHA and incomplete.get('successfulResultHandoff') is False and incomplete.get('pid')==0
         and incomplete.get('cid')==PRIOR_SERVICE['containerId'] and all(incomplete.get(k) is True for k in ('confirmed','containerStopped','createAttempted','currentProofPresent','retainedAckPresent','retainedAckValidated','runtimeMaterialPreserved')),'REAL_FAILED33_AFTER_ACK_REQUIRED')
    need(incomplete['cleanStop']==dict(clean,cleanupLeaf='failed-start-cleanup.json',cleanupSha256=CLEANUP_SHA)
         and clean['status']=='NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED' and clean['requestKey']==USED['start']['requestKey']
         and clean['originalPGDATAAndCleanStateVerified'] is True and clean['dataDirectoryIdentity']=={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':448},'REAL_FAILED33_CLEAN_STOP_REQUIRED')
    proof=read(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-33.json'))[0]
    need(sha(proof)==PRIOR_SERVICE['proofSha256']==incomplete['currentProofSha256'],'ACTUAL_FAILED33_C_CHANGED')
    p=json.loads(proof);birth=p['sharedPostgresNamespace']['container']
    need(p['requestKey']==PRIOR_SERVICE['serviceKey'] and birth['id']==PRIOR_SERVICE['containerId'] and birth['startedAt']==PRIOR_SERVICE['containerStartedAt'] and p['physical']['postmasterStart']==PRIOR_SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==clean['dataDirectoryIdentity'],'ACTUAL_FAILED33_SERVICE_CHANGED')
    ack=read(BOOT/'retained-ack.json')[0]
    need(sha(ack)==PRIOR_BINDINGS['previousRetainedAckSha256']==incomplete['retainedAckSha256'] and json.loads(ack)=={'requestKey':PRIOR_SERVICE['serviceKey'],'proofSha256':PRIOR_SERVICE['proofSha256'],'serviceLeaseExpiresAt':p['sharedPostgresNamespace']['serviceLeaseExpiresAt']},'ACTUAL_VALIDATED_FAILED33_ACK_REQUIRED')
    restore=USED['restore02']['value'];inside=restore['result']
    need(inside['requestKey']==USED['restore01']['requestKey'] and inside['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inside['databaseStillStopped'] is True and all(inside[k] is False for k in ('naturalExpiryCountedAsRestoration','runtimeAuthChanged','membershipsOrRoleAttributesChanged')),'ACTUAL_RESTORE02_ORIGINAL_AUTH_REQUIRED')
    raw=read(B/'jobs'/USED['restore02']['requestKey']/'results/maintenance-auth-cleanup.json')[0]
    need(sha(raw)==RESTORE_CLEANUP_SHA and json.loads(raw)==restore['cleanup'] and all(restore['cleanup'][k] is True for k in ('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved')),'ACTUAL_RESTORE02_CLEANUP_REQUIRED')
    need(sha(read(CUSTODY/'authority.json')[0])==ROLE_SHA and sha(read(CUSTODY/'restored.json')[0])==RESTORED_SHA and json.loads(read(CUSTODY/'restored.json')[0])==inside,'ACTUAL_SAFE_RESTORATION_RECEIPT_REQUIRED')
    failed=B/'jobs'/USED['restore01']['requestKey']
    need(not any(os.path.lexists(failed/'results'/leaf) for leaf in ('maintenance-auth-intent.json','maintenance-auth-inside.json','maintenance-auth-cleanup.json')),'RESTORE01_PRE_INNER_REFUSAL_CHANGED')
    identities={}
    for path in CUSTODY_FILES:
        p=Path(path);s=p.lstat();need(p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400 and 0<s.st_size<=65536,'PRIVATE_CUSTODY_METADATA_REQUIRED');identities[path]=identity(s)
    for key,cid in OLD_CONTAINERS:
        q=subprocess.run(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}',cid],capture_output=True,timeout=5)
        need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=4096 and json.loads(q.stdout)=={'id':cid,'running':False,'pid':0,'operation':key},'EXACT_OLD33_CONTAINER_NOT_STOPPED')
    refused_apply34_history()
    closed34_history()
    return identities

def quiet():
    need(not os.path.lexists(P/'artifact-staging-authorization.json'),'UNRELATED_STAGING_AUTHORITY_PRESENT')
    state=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
    need(not any(os.path.lexists(p) for p in (state/'state/native-services/ordinary36-auth-20261116-01',state/'state/native-services'/JOBS['start'],state/'authority/fresh35-current-production-service-v2-service-36.json',state/'state/fresh35-first-production-20261110-r3/ordinary36-auth-capture-20261116-01',state/'state/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-02')),'NEW36_STATE_ALREADY_PRESENT_NO_REPLAY')
    oldplan=state/'state/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-01'
    need(not any(os.path.lexists(oldplan/name) for name in ('batched-plan.sqlite','original-initializer.json')),'FAILED_PREPARE01_PLAN_OR_INITIALIZER_PRESENT')
    pg=state/'state/fresh35-first-production-20261110-r3/data';s=pg.lstat()
    need(pg.resolve()==pg and stat.S_ISDIR(s.st_mode) and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13502421,61035,61035,0o700) and not os.path.lexists(pg/'postmaster.pid'),'ORIGINAL_DATA_STOPPED_REQUIRED')
    required_history()
    for grant in (GRANT,'5cc58239751e4e2a'):
        worker=B.with_name('grant-'+grant);control=C.with_name('grant-'+grant)
        for key in JOBS.values():
            need(not any(os.path.lexists(p) for p in (worker/'jobs'/key,control/'jobs'/key,control/'requests'/(key+'.json'),control/'requests'/(key+'.tmp'),control/'results'/(key+'.json'))),'NEW36_OR_WRITER_KEY_PRESENT_NO_REPLAY')
    q=subprocess.run(['/usr/bin/systemctl','list-units','--no-legend','--plain','--state=active,activating,deactivating','naijue-erp-op-b16447fb-*.service','naijue-erp-op-5cc58239-*.service'],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stdout.strip() and not q.stderr,'ACTIVE_OPERATION_OR_UNKNOWN')
    q=subprocess.run(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}}}', 'ed42d33a198fe1c35a72d5c27b3c138d2cd5e8bc892a73d39f83fc77c88c8c14'],capture_output=True,timeout=5)
    need(q.returncode==0 and not q.stderr and json.loads(q.stdout)=={'id':'ed42d33a198fe1c35a72d5c27b3c138d2cd5e8bc892a73d39f83fc77c88c8c14','running':False,'pid':0},'SUCCESSFUL35_PRESERVED_SERVICE_MUST_STAY_STOPPED')
    return completed_preparation()


def register(a, files, authority):
    need(os.geteuid() == 0 and socket.gethostname() == 'naijue-server', 'EXACT_ROOT_HOST_REQUIRED')
    need(not any(os.path.lexists(path) for path in (AUDIT, NEW_MODULE, NEW_POLICY,
             P / '.normal36-dispatcher.pending')), 'ALREADY_PRESENT_OR_UNKNOWN_READ_ORIGINAL_ONLY')
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
        need(policy['startsAt']==a['startsAt'] and now()+5100000<policy['expiresAt']<=int(cfg['expiresAtEpoch']*1000),'EXACT_NEW_UNUSED_WINDOW_REQUIRED')
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
        put(AUDIT / 'old-policy.bin',read(H/'direct35-batched-real.json')[0])
        put(AUDIT / 'old-identities.json', pack(a['oldIdentities']))
        result = dict(status='REGISTRATION_UNKNOWN_READ_ORIGINAL_AUDIT_ONLY', published=[],
                      automaticReplay=False, businessDatabaseWrites=0)
        try:
            put(NEW_MODULE, files['module'], 0o644)
            result['published'].append('module')
            snapshot(a)
            quiet()
            need(not os.path.lexists(NEW_POLICY),'NORMAL35_POLICY_ALREADY_PRESENT')
            put(NEW_POLICY,files['policy'])
            result['published'].append('policy')
            consumer(new, cfg, files['module'], files['policy'])
            put(P / '.normal36-dispatcher.pending', new, 0o755)
            snapshot(a)
            quiet()
            need(now() < a['expiresAt'], 'REGISTRATION_EXPIRED_BEFORE_CAS')
            put(AUDIT / 'publish-intent.json', pack(dict(oldDispatcherSha256=OLD_DISPATCHER,
                dispatcherSha256=sha(new), moduleSha256=HELPER, policySha256=sha(files['policy']))))
            os.replace(P / '.normal36-dispatcher.pending', P / 'admin_exec.py')
            sync(P)
            result['published'].append('dispatcher')
            snapshot(a,sha(new))
            quiet()
            consumer(read(P / 'admin_exec.py')[0], cfg, files['module'], files['policy'])
            need(identity(os.fstat(lock.fileno())) == LOCK_ID, 'ORIGINAL_LOCK_CHANGED_AFTER_CAS')
            result.update(status='EXACT_NORMAL36_REGISTERED_NO_PHASE_SUBMITTED',
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
    raise SystemExit(0 if outcome['status'] == 'EXACT_NORMAL36_REGISTERED_NO_PHASE_SUBMITTED' else 2)
