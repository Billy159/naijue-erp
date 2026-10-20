/** PURE simulated startup/control faults, not PostgreSQL, provisioning, credentials or engine evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';

const path = process.env.PREPARED_SUPERVISOR_SOURCE;
assert.ok(path, 'Explicit prepared supervisor source is required; no default target/source.');
const original = await readFile(path, 'utf8');
const body = original.replace(/^import .*;\n/gmu, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function simulate({ initFails = false, startFails = false, firstStopFails = false, statusFails = false, multibyteRecovery = false } = {}) {
  const calls = [], messages = [], writes = [];
  let statusCalls = 0, stopCalls = 0, sleeps = 0, controlReads = 0;
  const mockProcess = { env: {}, execPath: 'SYNTHETIC_NODE_NEVER_EXECUTED', exitCode: undefined, stdout: { write: value => messages.push(String(value)) } };
  const spawn = (program, args, options) => {
    calls.push({ program, args: [...args] });
    const child = new EventEmitter();
    child.stdin = new EventEmitter(); child.stdin.end = () => {};
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdio = [child.stdin, child.stdout, child.stderr];
    let code = 0, output = '';
    if (program === 'python') { code = initFails ? 1 : 0; output = initFails ? 'SYNTHETIC_INIT_FAILURE' : 'SYNTHETIC_INIT_OK'; }
    else if (program.endsWith('/pg_ctl') && args.includes('start')) { code = startFails ? 1 : 0; output = startFails ? 'SYNTHETIC_START_ACK_UNKNOWN' : 'SYNTHETIC_START_OK'; }
    else if (program.endsWith('/psql')) { code = 1; output = 'SYNTHETIC_POST_START_SETUP_FAILURE'; }
    else if (program.endsWith('/pg_ctl') && args.includes('status')) {
      statusCalls++;
      if (statusFails && statusCalls === 1) { code = 4; output = 'SYNTHETIC_STATUS_UNCERTAIN'; }
      else if (stopCalls > 0 && !(firstStopFails && stopCalls === 1)) { code = 3; output = 'SYNTHETIC_OWNED_SERVER_NOT_RUNNING'; }
      else { code = 0; output = 'SYNTHETIC_OWNED_SERVER_RUNNING'; }
    } else if (program.endsWith('/pg_ctl') && args.includes('stop')) {
      stopCalls++; code = firstStopFails && stopCalls === 1 ? 1 : 0; output = code ? 'SYNTHETIC_STOP_UNCERTAIN' : 'SYNTHETIC_STOP_OK';
    } else assert.fail('Unexpected simulated command, no real process may be launched.');
    queueMicrotask(() => { child.stdout.emit('data', Buffer.from(output)); child.emit('exit', code, null); });
    assert.equal(typeof options.env, 'object');
    return child;
  };
  const read = async file => {
    assert.ok(file.endsWith('/commands.txt'), 'Only bounded control file may be read on fault paths.');
    controlReads++;
    if (multibyteRecovery) return controlReads === 1 ? '你🧪\n' : '你🧪\nstop\n';
    return controlReads === 1 ? 'prepare\nrun ignored\nrun-backend ignored\n' : 'prepare\nrun ignored\nrun-backend ignored\nstop\n';
  };
  const write = async (file, value) => { writes.push({ file, value: String(value) }); };
  const console = { log: value => messages.push(String(value)), error: value => messages.push(String(value)) };
  const sleep = async delay => { assert.equal(delay, 500); assert.ok(++sleeps < 8, 'Synthetic recovery must terminate through an explicit stop.'); };
  const random = () => ({ toString: () => 'SYNTHETIC_IN_MEMORY_ONLY_NOT_A_USABLE_CREDENTIAL' });
  const cryptoHash = () => assert.fail('Migration hashing/engine path must never be entered during startup-fault simulation.');
  await new AsyncFunction('spawn', 'randomBytes', 'createHash', 'readFile', 'writeFile', 'appendFile', 'setTimeout', 'process', 'console', body)(
    spawn, random, cryptoHash, read, write, async () => {}, sleep, mockProcess, console);
  assert.equal(mockProcess.exitCode, 1);
  assert.ok(messages.some(message => message.includes('STARTUP_FAILURE_BEFORE_READY')));
  assert.ok(!messages.some(message => message.startsWith('READY_FOR_COMMAND_FILE:')));
  assert.ok(!messages.some(message => message.includes('ENGINE_RUN_START')));
  assert.ok(!calls.some(call => call.program === mockProcess.execPath));
  for (const call of calls.filter(call => call.program.endsWith('/pg_ctl'))) {
    assert.equal(call.args[0], '-D'); assert.ok(call.args[1].endsWith('/data'));
  }
  assert.ok(writes[0].file.endsWith('/commands.txt') && writes[0].value === '', 'Bounded file is initialized before simulated initdb.');
  return { calls, messages, stopCalls, statusCalls, controlReads };
}

test('PURE operator startup fault: setup failure after owned start verifies orderly stop and retains data', async () => {
  const result = await simulate();
  assert.equal(result.stopCalls, 1); assert.equal(result.statusCalls, 2); assert.equal(result.controlReads, 0);
  assert.ok(result.messages.includes('OWNED_SERVER_STOPPED_AND_VERIFIED_DATA_RETAINED'));
});
test('PURE operator startup fault: failed start acknowledgement checks/stops only owned directory', async () => {
  const result = await simulate({ startFails: true });
  assert.equal(result.stopCalls, 1); assert.equal(result.statusCalls, 2);
  assert.ok(!result.calls.some(call => call.program.endsWith('/psql')));
});
test('PURE operator startup fault: uncertain stop retains holder and ignores every non-stop recovery command', async () => {
  const result = await simulate({ firstStopFails: true });
  assert.equal(result.stopCalls, 2); assert.equal(result.controlReads, 2);
  assert.ok(result.messages.some(message => message.includes('CLEANUP_UNCERTAIN_CREDENTIAL_HOLDER_RETAINED')));
  assert.equal(result.messages.filter(message => message.includes('Recovery is stop-only; command ignored')).length, 3);
  assert.ok(result.messages.includes('OWNED_SERVER_STOPPED_AND_VERIFIED_DATA_RETAINED'));
});
test('PURE operator startup fault: uncertain status never becomes ready and needs exact stop recovery', async () => {
  const result = await simulate({ statusFails: true });
  assert.equal(result.stopCalls, 1); assert.equal(result.controlReads, 2);
  assert.ok(result.messages.some(message => message.includes('OWNED_STARTUP_CLEANUP_UNCERTAIN')));
});
test('PURE operator startup fault: initdb failure cannot stop an unstarted server or run SQL', async () => {
  const result = await simulate({ initFails: true });
  assert.equal(result.calls.length, 1); assert.equal(result.stopCalls, 0); assert.equal(result.statusCalls, 0);
  assert.ok(result.messages.some(message => message.includes('NO_SERVER_START_ATTEMPTED')));
});

test('PURE operator recovery: ignored Unicode line cannot hide a later exact stop', async () => {
  const result = await simulate({ firstStopFails: true, multibyteRecovery: true });
  assert.equal(result.stopCalls, 2); assert.equal(result.controlReads, 2);
  assert.equal(result.messages.filter(message => message.includes('Recovery is stop-only; command ignored')).length, 1);
  assert.ok(result.messages.includes('OWNED_SERVER_STOPPED_AND_VERIFIED_DATA_RETAINED'));
  assert.match(original, /offset \+= line\.length \+ 1;/u);
  assert.match(original, /commandOffset \+= line\.length \+ 1;/u);
  assert.doesNotMatch(original, /Buffer\.byteLength\(line/u);
});
