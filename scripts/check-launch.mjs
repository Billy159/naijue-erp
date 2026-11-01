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

function checkedRuntimeConcurrency(value) {
  if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 64)) {
    throw Error('INVALID_RUNTIME_TEST_CONCURRENCY');
  }
  return value;
}

export function parseLaunchArgs(args) {
  const usage = () => { throw Error('USAGE'); };
  if (!Array.isArray(args) || Object.getPrototypeOf(args) !== Array.prototype
      || Reflect.ownKeys(args).length !== args.length + 1) usage();
  const tokens = [];
  for (let i = 0; i < args.length; i++) {
    const entry = Object.getOwnPropertyDescriptor(args, String(i));
    if (!entry?.enumerable || !Object.hasOwn(entry, 'value') || typeof entry.value !== 'string') usage();
    tokens.push(entry.value);
  }
  const selected = {plan: false, acceptancePath: undefined, runtimeConcurrency: undefined}, seen = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const flag = tokens[i];
    if (seen.has(flag)) usage();
    seen.add(flag);
    if (flag === '--plan') selected.plan = true;
    else if (flag === '--acceptance') {
      const filename = tokens[++i];
      if (typeof filename !== 'string' || !path.isAbsolute(filename)) usage();
      selected.acceptancePath = filename;
    } else if (flag === '--runtime-test-concurrency') {
      const value = tokens[++i];
      if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) usage();
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number > 64) usage();
      selected.runtimeConcurrency = number;
    } else usage();
  }
  // Preserve the original CLI's mutually exclusive plan/acceptance modes.
  if (selected.plan && selected.acceptancePath !== undefined) usage();
  return Object.freeze(selected);
}

export function launchCommands(options = {}) {
  if (!options || Object.getPrototypeOf(options) !== Object.prototype
      || Reflect.ownKeys(options).some(key => key !== 'runtimeConcurrency')) throw Error('INVALID_RUNTIME_TEST_RESOURCES');
  const field = Object.getOwnPropertyDescriptor(options, 'runtimeConcurrency');
  if (field && (!field.enumerable || !Object.hasOwn(field, 'value'))) throw Error('INVALID_RUNTIME_TEST_RESOURCES');
  const runtimeConcurrency = checkedRuntimeConcurrency(field?.value);
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
    node('replica-runtime-tests', ['--test', ...(runtimeConcurrency === undefined ? [] : [`--test-concurrency=${runtimeConcurrency}`]), ...runtime]),
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

export function main(args = process.argv.slice(2), {spawn = spawnSync, output = console.log} = {}) {
  const selected = parseLaunchArgs(args);
  const commands = launchCommands({runtimeConcurrency: selected.runtimeConcurrency});
  const resources = selected.runtimeConcurrency === undefined ? {}
    : {runtimeResources: {replicaRuntimeTestConcurrency: selected.runtimeConcurrency}};
  if (selected.plan) {
    output(JSON.stringify({status: 'PLAN_NOT_RUN', commands, requiredAcceptance, ...resources}, null, 2)); return;
  }
  const get = (command, args) => {
    const out = spawn(command, args, {cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024});
    return out.status === 0 ? out.stdout.trim() : '';
  };
  let acceptance;
  if (selected.acceptancePath !== undefined) {
    try { acceptance = JSON.parse(readFileSync(selected.acceptancePath, 'utf8')); } catch { /* Missing proof stays blocked. */ }
  }
  const npmVersion = process.env.npm_execpath
    ? get(process.execPath, [process.env.npm_execpath, '--version']) : get('npm', ['--version']);
  const result = runLaunch({nodeVersion: process.versions.node, npmVersion,
    commit: fixedCheckoutCommit(root), acceptance, commands,
    run: ({command, args}) => spawn(command, args, {cwd: root, stdio: 'inherit'}).status});
  output(JSON.stringify({...result, ...resources}, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
