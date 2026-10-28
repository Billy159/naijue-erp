#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Python helpers remain self-contained when delivered by the existing T45 carrier.
// Only this generated block is copied; the JSON is the editable source of facts.
const root = new URL('../../', import.meta.url);
const begin = '# BEGIN GENERATED RELEASE CONTRACT';
const end = '# END GENERATED RELEASE CONTRACT';

export function contractBlock(contract, sourceBytes = Buffer.from(JSON.stringify(contract, null, 2) + '\n')) {
  const keys = ['format', 'migrationCount', 'fontLicense', 'runtimeSqlPatches', 'full', 'node', 'requestBodyBudgets'];
  if (!contract || Object.keys(contract).sort().join() !== keys.sort().join()
      || contract.format !== 'naijue-release-contract-v1' || contract.migrationCount !== 26
      || !Array.isArray(contract.runtimeSqlPatches) || !Array.isArray(contract.requestBodyBudgets)
      || !/^24\.[0-9]+\.[0-9]+$/.test(contract.node)) throw Error('INVALID_RELEASE_CONTRACT');
  const sources = new Set(), members = new Set(), routes = new Set();
  for (const row of contract.runtimeSqlPatches) {
    if (!/^adapters\/postgres\/patches\/[A-Za-z0-9_-]+\.sql$/.test(row.source)
        || row.member !== row.source.slice('adapters/postgres/'.length)
        || sources.has(row.source) || members.has(row.member)) throw Error('INVALID_RELEASE_PATCH');
    sources.add(row.source); members.add(row.member);
  }
  for (const row of contract.requestBodyBudgets) {
    if (!/^\/api\/[a-z0-9/-]+$/.test(row.path) || routes.has(row.path)
        || !Number.isSafeInteger(row.bytes) || row.bytes <= 0) throw Error('INVALID_RELEASE_BODY_BUDGET');
    routes.add(row.path);
  }
  // An ASCII JSON literal avoids Python escape or platform encoding differences.
  const literal = JSON.stringify(contract).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (literal.includes("'''")) throw Error('INVALID_RELEASE_LITERAL');
  const source = JSON.stringify({path: 'config/release-contract.json', bytes: sourceBytes.length,
    sha256: createHash('sha256').update(sourceBytes).digest('hex')});
  return `${begin}\n# Generated from config/release-contract.json; edit that source, then regenerate.\nRELEASE_CONTRACT = json.loads(r'''${literal}''')\nRELEASE_CONTRACT_SOURCE = json.loads(r'''${source}''')\n${end}`;
}

export async function generateReleaseContract(check = false) {
  const sourceBytes = await readFile(new URL('config/release-contract.json', root));
  const block = contractBlock(JSON.parse(sourceBytes), sourceBytes);
  const deployPath = new URL('scripts/release/deploy-candidate.py', root);
  const oldDeploy = await readFile(deployPath, 'utf8');
  const pattern = /# BEGIN GENERATED RELEASE CONTRACT[\s\S]*?# END GENERATED RELEASE CONTRACT/;
  if (!pattern.test(oldDeploy)) throw Error('RELEASE_CONTRACT_MARKERS_MISSING');
  const deploy = oldDeploy.replace(pattern, () => block);
  const bootPath = new URL('scripts/release/boot-entry.py', root);
  const oldBoot = await readFile(bootPath, 'utf8');
  const helper = createHash('sha256').update(deploy).digest('hex');
  const boot = oldBoot.replace(/DEPLOYMENT_FULL_SHA256 = '[a-f0-9]{64}'/, `DEPLOYMENT_FULL_SHA256 = '${helper}'`);
  if (check) {
    if (deploy !== oldDeploy || boot !== oldBoot) throw Error('RELEASE_CONTRACT_GENERATED_OUTPUT_STALE');
  } else {
    if (deploy !== oldDeploy) await writeFile(deployPath, deploy);
    if (boot !== oldBoot) await writeFile(bootPath, boot);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check') || process.argv.length > 3) throw Error('USAGE');
  await generateReleaseContract(process.argv.includes('--check'));
}
