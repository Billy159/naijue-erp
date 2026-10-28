#!/usr/bin/env node
// Finite V2 launch checks. This does not install, migrate, start or deploy an app.
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const release = JSON.parse(readFileSync(path.join(root, 'config/release-contract.json'), 'utf8'));
export const toolchain = Object.freeze({node: release.node, npm: /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager)?.[1]});
export const requiredAcceptance = Object.freeze([
  ...Array.from({length: 15}, (_, i) => `B${String(i + 1).padStart(2, '0')}`).filter(id => id !== 'B12'),
  'P01', 'P02', 'P03', 'P04', 'P05', 'PF01', 'PF02', 'A01', 'A02',
  'H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'D01', 'ROOT_CLEAN_INSTALL'
]);

export function fixedCheckoutCommit(directory) {
  const git = args => spawnSync('git', args, {cwd: directory, encoding: 'utf8', maxBuffer: 1024 * 1024});
  try {
    const top = git(['rev-parse', '--show-toplevel']);
    // An archive under a worktree must never borrow that parent's HEAD.
    if (top.status !== 0 || realpathSync(top.stdout.trim()) !== realpathSync(directory)) return '';
    const head = git(['rev-parse', 'HEAD']);
    if (head.status !== 0 || !/^[a-f0-9]{40}$/.test(head.stdout.trim())
        || git(['diff', '--quiet', 'HEAD', '--']).status !== 0) return '';
    return head.stdout.trim();
  } catch { return ''; }
}

function testsUnder(directory) {
  return readdirSync(path.join(root, directory), {recursive: true, withFileTypes: true})
    .filter(entry => entry.isFile() && /\.test\.(?:mjs|ts)$/.test(entry.name))
    .map(entry => path.relative(root, path.join(entry.parentPath, entry.name))).sort();
}

export function launchCommands() {
  const runtime = testsUnder('apps/web/demo-replica/frontend/runtime');
  const imports = testsUnder('scripts/import-v3');
  if (!runtime.length || !imports.length) throw Error('CURRENT_RUNTIME_TESTS_MISSING');
  const node = (id, args) => ({id, command: process.execPath, args});
  const npm = process.env.npm_execpath
    ? {command: process.execPath, prefix: [process.env.npm_execpath]}
    : {command: 'npm', prefix: []};
  return [
    node('module-boundaries', ['scripts/check-module-boundaries.mjs']),
    node('production-api-types', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.launch-api.json']),
    node('replica-runtime-types', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'apps/web/demo-replica/tsconfig.runtime.json']),
    node('replica-runtime-tests', ['--test', ...runtime]),
    node('import-v3-tests', ['--test', ...imports]),
    node('release-contract-current', ['scripts/release/generate-release-contract.mjs', '--check']),
    node('release-tests', ['--test', 'scripts/release/build-production.test.mjs', 'scripts/release/pack.test.mjs', 'scripts/release/release-file-contract.test.mjs']),
    node('commit-outcomes', ['--test', 'tests/runtime-document-commit-outcome.test.ts', 'tests/authentication-commit-outcome.test.ts', 'tests/cross-layer-contract-fixtures.test.mjs']),
    node('launch-runner-tests', ['--test', 'scripts/check-launch.test.mjs']),
    // check:all already includes check/typecheck/build/smoke/npm test: do not repeat those wrappers.
    {id: 'existing-root-check-all', command: npm.command, args: [...npm.prefix, 'run', 'check:all']}
  ];
}

export function checkAcceptance(value, commit, read = filename => readFileSync(filename)) {
  const entries = Array.isArray(value?.entries) ? value.entries : [];
  const result = [];
  for (const taskId of requiredAcceptance) {
    const matches = entries.filter(entry => entry?.taskId === taskId);
    const entry = matches[0];
    if (value?.candidateCommit !== commit || matches.length !== 1 || entry.status !== 'PASS'
        || entry.level !== 'ACTUAL_REQUIRED_SCOPE') {
      result.push({taskId, status: 'BLOCKED_ENV', reason: 'CURRENT_ACCEPTED_SCOPE_EVIDENCE_REQUIRED'}); continue;
    }
    try {
      const ref = entry.receipt;
      if (!ref || !path.isAbsolute(ref.path) || !Number.isSafeInteger(ref.bytes) || ref.bytes <= 0
          || ref.bytes > 2 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw Error();
      const bytes = read(ref.path);
      if (bytes.length !== ref.bytes || createHash('sha256').update(bytes).digest('hex') !== ref.sha256) throw Error();
      result.push({taskId, status: 'PASS', receiptSha256: ref.sha256});
    } catch { result.push({taskId, status: 'BLOCKED_ENV', reason: 'EXACT_ACCEPTED_RECEIPT_UNAVAILABLE'}); }
  }
  return result;
}

export function runLaunch({nodeVersion, npmVersion, commit, acceptance, commands, run, readReceipt}) {
  const environment = typeof toolchain.npm === 'string' && nodeVersion === toolchain.node && npmVersion === toolchain.npm;
  const result = {candidateCommit: commit, nodeVersion, npmVersion,
    requiredToolchain: toolchain, status: 'BLOCKED_ENV', local: [], acceptance: checkAcceptance(acceptance, commit, readReceipt)};
  if (!environment || !/^[a-f0-9]{40}$/.test(commit)) {
    result.reason = 'EXACT_NODE_NPM_AND_FIXED_COMMIT_REQUIRED'; return result;
  }
  for (const command of commands) {
    try {
      const code = run(command);
      result.local.push({id: command.id, status: code === 0 ? 'PASS' : 'FAIL', exitCode: code});
    } catch { result.local.push({id: command.id, status: 'FAIL', reason: 'COMMAND_NOT_COMPLETED'}); }
  }
  result.status = result.local.some(row => row.status === 'FAIL') ? 'FAIL'
    : result.acceptance.some(row => row.status !== 'PASS') ? 'BLOCKED_ENV' : 'PASS';
  return result;
}

function main() {
  const args = process.argv.slice(2);
  if (!(args.length === 0 || args.length === 1 && args[0] === '--plan'
      || args.length === 2 && args[0] === '--acceptance' && path.isAbsolute(args[1]))) throw Error('USAGE');
  const commands = launchCommands();
  if (args[0] === '--plan') {
    console.log(JSON.stringify({status: 'PLAN_NOT_RUN', commands, requiredAcceptance}, null, 2)); return;
  }
  const get = (command, args) => {
    const out = spawnSync(command, args, {cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024});
    return out.status === 0 ? out.stdout.trim() : '';
  };
  let acceptance;
  if (args[0] === '--acceptance') {
    try { acceptance = JSON.parse(readFileSync(args[1], 'utf8')); } catch { /* Missing proof stays blocked. */ }
  }
  const npmVersion = process.env.npm_execpath
    ? get(process.execPath, [process.env.npm_execpath, '--version']) : get('npm', ['--version']);
  const result = runLaunch({nodeVersion: process.versions.node, npmVersion,
    commit: fixedCheckoutCommit(root), acceptance, commands,
    run: ({command, args}) => spawnSync(command, args, {cwd: root, stdio: 'inherit'}).status});
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
