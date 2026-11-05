/** Genuine paired M06 source-module brands. No PG/client/DDL/approval is created.
 * The original source loader is never edited or temporarily restored in active.
 * Caller supplies a separately retained portable source root, not a trust label. */
import { readFile, lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { captureData } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
const need = (ok, code) => { if (!ok) throw Error(code); };
const hash = value => createHash('sha256').update(value).digest('hex');
export const COHORT_INPUT_SHA256 = '4c60f9edfb6f19caef3ab5e7baa509e1cb686226d5a287bbead8e0b2e5ba27b1';
export const ORIGINAL_SOURCE_FINGERPRINT = '726d84f1303bcb5deb599c19de89f8cdfad89c8f365e34fa36ca4de49051bcbb';
const moduleNames = Object.freeze({ sourcePlan: 'tests/integration/runtime26-baseline/schema-objects-only/source-plan.mjs',
  v22Carrier: 'tests/integration/runtime26-baseline/schema-objects-only/v22-carrier.mjs',
  sourceObserver: 'tests/integration/runtime26-baseline/schema-objects-only/observer.mjs' });
const genuinePlans = new WeakMap(), genuineFiles = new WeakMap();
async function canonicalRead(file) {
  const before = await lstat(file);
  need(before.isFile() && !before.isSymbolicLink() && before.size <= 8 * 1024 * 1024 && await realpath(file) === file, 'CANONICAL_SOURCE_COHORT_FILE_REQUIRED');
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const held = await fd.stat(); need(held.dev === before.dev && held.ino === before.ino, 'SOURCE_COHORT_DESCRIPTOR_CHANGED');
    const bytes = await fd.readFile(), after = await lstat(file);
    need(after.isFile() && !after.isSymbolicLink() && after.dev === before.dev && after.ino === before.ino
      && after.size === bytes.length && await realpath(file) === file, 'SOURCE_COHORT_CHANGED_DURING_READ'); return bytes;
  } finally { await fd.close(); }
}
export async function loadPairedSourcePlan(input) {
  const args = captureData(input, ['sourceRoot']);
  need(typeof args.sourceRoot === 'string' && path.isAbsolute(args.sourceRoot) && path.resolve(args.sourceRoot) === args.sourceRoot,
    'EXPLICIT_PRIMITIVE_PORTABLE_SOURCE_ROOT_REQUIRED');
  const root = args.sourceRoot, rootStat = await lstat(root);
  need(rootStat.isDirectory() && !rootStat.isSymbolicLink() && await realpath(root) === root, 'CANONICAL_SOURCE_ROOT_REQUIRED');
  need(!process.env.NODE_OPTIONS && !process.env.NODE_PATH && process.env.NODE_PG_FORCE_NATIVE === undefined, 'NO_COHORT_PRELOAD_OR_NATIVE_DRIVER_OVERRIDE');
  const bindingBytes = await canonicalRead(fileURLToPath(new URL('./SOURCE-COHORT-INPUTS.json', import.meta.url)));
  need(hash(bindingBytes) === COHORT_INPUT_SHA256, 'FROZEN_SOURCE_COHORT_BINDING_CHANGED');
  const binding = JSON.parse(bindingBytes.toString('utf8'));
  need(binding.format === 'PORTABLE_M06_SOURCE_COHORT_INPUTS_V1' && Array.isArray(binding.files), 'CLOSED_M06_SOURCE_COHORT_BINDING_REQUIRED');
  const check = async () => { for (const file of binding.files) {
    need(typeof file.path === 'string' && !path.isAbsolute(file.path) && !file.path.split('/').includes('..')
      && typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/.test(file.sha256), 'CLOSED_RELATIVE_SOURCE_COHORT_FILE_REQUIRED');
    need(hash(await canonicalRead(path.join(root, file.path))) === file.sha256, 'PAIRED_SOURCE_COHORT_BYTES_CHANGED:' + file.path);
  } };
  await check();
  const modules = {};
  for (const [key, relative] of Object.entries(moduleNames)) {
    need(binding.files.some(file => file.path === relative), 'PINNED_PAIRED_MODULE_REQUIRED');
    modules[key] = await import(pathToFileURL(path.join(root, relative)).href);
  }
  const plan = await modules.sourcePlan.loadPlan(); modules.sourcePlan.assertPlan(plan);
  need(plan.sourceFingerprint === ORIGINAL_SOURCE_FINGERPRINT && plan.files.length === 40 && plan.routines.length === 137,
    'AUTHENTIC_ORIGINAL_40_137_SOURCE_PLAN_REQUIRED');
  await modules.sourcePlan.assertSources(plan); await check();
  const cohort = Object.freeze({ root, sourceFingerprint: plan.sourceFingerprint, inputBindingSha256: COHORT_INPUT_SHA256,
    sourcePlan: modules.sourcePlan, v22Carrier: modules.v22Carrier, sourceObserver: modules.sourceObserver,
    scope: 'REAL_MODULE_WEAKSET_PAIRING_ONLY_NOT_TARGET_METADATA_OR_ISSUER_APPROVAL' });
  genuinePlans.set(plan, cohort); for (const file of plan.files) genuineFiles.set(file, cohort);
  return Object.freeze({ plan, cohort });
}
export function assertPlan(plan) {
  const cohort = genuinePlans.get(plan); need(cohort, 'LOAD_REAL_PAIRED_SOURCE_PLAN_FIRST_NO_CAST_OR_SELF_BRAND');
  return cohort.sourcePlan.assertPlan(plan); // Always the original module's WeakSet.
}
export async function sourceBytes(file) {
  const cohort = genuineFiles.get(file); need(cohort, 'GENUINE_PAIRED_SOURCE_FILE_REQUIRED'); return cohort.sourcePlan.sourceBytes(file);
}
export function sourceCohortFor(plan) { assertPlan(plan); return genuinePlans.get(plan); }
