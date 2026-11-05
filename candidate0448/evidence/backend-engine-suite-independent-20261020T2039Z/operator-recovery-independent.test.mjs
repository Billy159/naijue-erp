/** PURE extracted actual recovery logic. No process spawn, credentials, PostgreSQL or filesystem writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

assert.ok(process.env.PREPARED_SUPERVISOR_SOURCE, 'An explicit prepared-only source is required.');
const source = await readFile(process.env.PREPARED_SUPERVISOR_SOURCE, 'utf8');
const hash = createHash('sha256').update(source).digest('hex');
console.log(`PURE_REVIEWED_SOURCE_SHA256=${hash}`);
const begin = source.indexOf('async function retainForStopOnlyRecovery()');
const end = source.indexOf('\nconst adminEnv');
assert.ok(begin >= 0 && end > begin, 'The exact recovery function must exist.');
const recovery = source.slice(begin, end);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function simulate(reads, failStopCount = 0) {
  let sleeps = 0, readCount = 0, stopCalls = 0;
  const messages = [];
  const execute = new AsyncFunction('setTimeout', 'readFile', 'commandFile', 'stopOwnedServer', 'console', 'redact', `${recovery}\nreturn retainForStopOnlyRecovery();`);
  await execute(async delay => {
    assert.equal(delay, 500);
    assert.ok(++sleeps <= reads.length + 2, 'Synthetic deadline: an appended exact stop must not be lost.');
  }, async file => {
    assert.equal(file, 'SYNTHETIC_CONTROL_FILE_NO_IO');
    const item = reads[Math.min(readCount++, reads.length - 1)];
    if (item instanceof Error) throw item;
    return item;
  }, 'SYNTHETIC_CONTROL_FILE_NO_IO', async () => {
    if (++stopCalls <= failStopCount) throw new Error('SYNTHETIC_STOP_REMAINS_UNCERTAIN');
    return 'SYNTHETIC_STOP_VERIFIED';
  }, { error: value => messages.push(String(value)), log: value => messages.push(String(value)) }, String);
  return { sleeps, readCount, stopCalls, messages };
}

test('PURE actual recovery: ASCII prepare/run commands are ignored before a later exact stop', async () => {
  const prefix = 'prepare\nrun source\nrun-backend source\n';
  const result = await simulate([prefix, `${prefix}stop\n`]);
  assert.equal(result.stopCalls, 1);
  assert.equal(result.messages.filter(value => value.includes('command ignored')).length, 3);
});

test('PURE actual recovery: ignored multibyte command cannot skip a later appended exact stop', async () => {
  const prefix = '你🧪\n';
  const result = await simulate([prefix, `${prefix}stop\n`]);
  assert.equal(result.stopCalls, 1);
  assert.equal(result.messages.filter(value => value.includes('command ignored')).length, 1);
});

test('PURE actual recovery: transient control read failure retains holder until an exact stop', async () => {
  const result = await simulate([new Error('SYNTHETIC_CONTROL_READ_UNAVAILABLE'), 'stop\n']);
  assert.equal(result.readCount, 2);
  assert.equal(result.stopCalls, 1);
});

test('PURE actual recovery: uncertain stop retains control, ignores other commands and retries only a later exact stop', async () => {
  const prefix = 'stop\nprepare\nrun-backend source\nstop \n';
  const result = await simulate([prefix, `${prefix}stop\n`], 1);
  assert.equal(result.stopCalls, 2);
  assert.equal(result.messages.filter(value => value.includes('OWNED_STOP_STILL_UNCERTAIN')).length, 1);
  assert.equal(result.messages.filter(value => value.includes('command ignored')).length, 3);
  assert.equal(result.messages.at(-1), 'SYNTHETIC_STOP_VERIFIED');
});
