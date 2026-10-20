import './check-toolchain.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, fileRecords, writeJson, sha256} from './files.mjs';
import {evidenceTask} from './task-artifacts.mjs';

rmSync(resolve(root, 'dist'), {recursive: true, force: true});
for (const script of ['build-backend.mjs', 'build-frontend.mjs']) {
  const result = spawnSync(process.execPath, [resolve(root, 'scripts', script)], {cwd: root, stdio: 'inherit'});
  if (result.error || result.status !== 0) {
    rmSync(resolve(root, 'dist'), {recursive: true, force: true});
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }
}
const toolchain = JSON.parse(readFileSync(resolve(root, 'config/toolchain.json'), 'utf8'));
writeJson(resolve(root, 'dist/build-manifest.json'), {
  version: 1, task: evidenceTask, applicationStage: 'foundation', productionReady: false,
  baseline: 'b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3', node: toolchain.node, npm: toolchain.npm,
  lockSha256: sha256(readFileSync(resolve(root, 'package-lock.json'))),
  packageSha256: sha256(readFileSync(resolve(root, 'package.json'))),
  backendSources: fileRecords(resolve(root, 'server')), backendOutput: fileRecords(resolve(root, 'dist/server')),
  frontendSources: fileRecords(resolve(root, 'frontend')).filter(f => !f.path.startsWith('verification/')),
  publicationPolicySha256: sha256(readFileSync(resolve(root, 'config/frontend-release.json'))),
  frontendManifestSha256: sha256(readFileSync(resolve(root, 'dist/frontend-manifest.json'))),
});
console.log(`${evidenceTask} local application build: PASS (foundation; production gates pending)`);
