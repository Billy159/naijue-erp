import {AsyncLocalStorage} from 'node:async_hooks';
import {constants} from 'node:fs';
import {lstat, open, realpath} from 'node:fs/promises';
import {createConnection} from 'node:net';
import {isDeepStrictEqual} from 'node:util';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {CAPACITY_VOLUMES} from './capacity-admission.ts';
import type {CapacityBytes, CapacityWriteKind} from './capacity-admission.ts';
import type {Fresh35ProductionGenerationBinding} from '../../../tools/unified-import/fresh35-host-session.mjs';
import type {ProductionCapacityLaunchConfiguration} from './production-capacity-launch.ts';

const ownerDirectory = '/run/naijue-rewrite/owner-live';
const statePath = ownerDirectory + '/owner-state.json';
const socketPath = ownerDirectory + '/capacity-accounting.sock';
const byteLimit = 65536;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const fail = (): never => { throw new Error('Current production owner authorization unavailable'); };
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) return fail();
  return value as Record<string, unknown>;
}

async function readOwnerState(): Promise<unknown> {
  for (const directory of [ownerDirectory, '/run/naijue-rewrite']) {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) return fail();
  }
  // /run may resolve through the system's standard root-owned alias.
  const file = await open(statePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat({bigint:true});
    if (!before.isFile() || before.uid !== 0n || before.nlink !== 1n || (before.mode & 0o022n) ||
        before.size <= 0n || before.size > BigInt(byteLimit)) return fail();
    const buffer = Buffer.alloc(Number(before.size) + 1);
    const {bytesRead} = await file.read(buffer, 0, buffer.length, 0);
    const identity = (s: typeof before) => [s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
    if (BigInt(bytesRead) !== before.size || identity(before) !== identity(await file.stat({bigint:true})) ||
        identity(before) !== identity(await lstat(statePath,{bigint:true}))) return fail();
    return parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,bytesRead)));
  } finally { await file.close(); }
}

async function ownerRequest(request: object, timeout: number): Promise<unknown> {
  const stat = await lstat(socketPath);
  if (!stat.isSocket() || stat.uid !== 0 || await realpath(socketPath) !== await realpath(ownerDirectory) + '/capacity-accounting.sock') return fail();
  return await new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    const timer = setTimeout(() => socket.destroy(new Error('Capacity owner reply unavailable')),timeout);
    let size = 0;
    const chunks: Buffer[] = [];
    socket.on('error',reject);
    socket.once('close',() => { clearTimeout(timer); reject(new Error('Capacity owner reply incomplete')); });
    socket.once('connect',() => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data',(chunk: Buffer) => {
      size += chunk.length;
      if (size > byteLimit) socket.destroy(new Error('Capacity owner reply too large'));
      else chunks.push(chunk);
    });
    socket.once('end',() => {
      try {
        const line = new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
        if (!line.endsWith('\n') || line.indexOf('\n') !== line.length - 1) return fail();
        resolve(parseStrictJson(line));
      } catch(error) { reject(error); }
      finally { socket.destroy(); }
    });
  });
}

export interface ProductionAccounting {
  assertOpen(): Promise<void>;
  assertOperational(): Promise<void>;
  assertFreshOpen(): void;
  reserve(reservationId: string, kind: CapacityWriteKind, observedAt: number, freeBytes: CapacityBytes): Promise<{
    status: string; admitted?: Record<CapacityWriteKind,number>; active?: Record<CapacityWriteKind,number>; chargedBytes?: CapacityBytes;
  }>;
  complete(reservationId: string, kind: CapacityWriteKind, known: boolean): Promise<void>;
}

export function createProductionGeneration(input: unknown, proofSha256: string, config: Pick<ProductionCapacityLaunchConfiguration,'process'|'window'|'probeTimeoutMillis'>,
  ports = {readState:readOwnerState, request:ownerRequest, now:Date.now}) {
  const {maxOwnerStateAgeMs, capacityWindowId, appContainerId} = record(input,['maxOwnerStateAgeMs','capacityWindowId','appContainerId']);
  if (!digest(proofSha256) || !digest(capacityWindowId) || !digest(appContainerId) || !integer(maxOwnerStateAgeMs) || maxOwnerStateAgeMs === 0 || config.process.pid !== 1) return fail();

  const ownerStateAge = maxOwnerStateAgeMs;
  const privateRead = new AsyncLocalStorage<boolean>();
  let binding: {proof:Fresh35ProductionGenerationBinding; assertCurrent:()=>Promise<void>} | undefined;
  let last: {sequence:number; observedAt:number; value:unknown; open:boolean} | undefined;
  let reads: Promise<unknown> = Promise.resolve();

  function fresh(observedAt: number) {
    const now = ports.now();
    return integer(now) && observedAt <= now && now - observedAt < ownerStateAge;
  }
  function checkState(openRequired: boolean): Promise<void> {
    // Serialize observations so an overlapping read cannot roll back the last seen sequence.
    const result = reads.then(async () => {
      if (!binding) return fail();
      const state = record(await ports.readState(),['generationProofSha256','owner','postgres','app',
        'capacityWindowToken','sequence','observedAt','writeAdmission']);
      await binding.assertCurrent();
      const {sequence,observedAt} = state;
      if (state.generationProofSha256 !== proofSha256 || !isDeepStrictEqual(state.owner,binding.proof.owner) ||
          !isDeepStrictEqual(state.postgres,binding.proof.postgres) || !integer(sequence) || !integer(observedAt) ||
          observedAt < binding.proof.checkedAt || !fresh(observedAt) ||
          (state.writeAdmission !== 'OPEN' && state.writeAdmission !== 'CLOSED') ||
          (last && (sequence < last.sequence || observedAt < last.observedAt ||
            (sequence === last.sequence && !isDeepStrictEqual(last.value,state))))) return fail();
      const app = state.app === null ? null : record(state.app,['containerId','process']);
      if (state.capacityWindowToken !== null && typeof state.capacityWindowToken !== 'string') return fail();
      // An otherwise current observation supersedes older OPEN states even if
      // its APP or capacity binding no longer authorizes this process.
      last = {sequence,observedAt,value:state,open:false};
      const open = state.writeAdmission === 'OPEN';
      if (app === null ? open : app.containerId !== appContainerId || !isDeepStrictEqual(app.process,config.process)) return fail();
      if ((open || state.capacityWindowToken !== null) && state.capacityWindowToken !== config.window.token) return fail();
      last.open = open;
      if (openRequired && !open) return fail();
    });
    reads = result.catch(() => { if (last) last.open = false; });
    return result;
  }

  const common = (reservationId: string) => ({capacityWindowId, capacityWindowToken:config.window.token, reservationId});
  async function account(action: 'reserve'|'read'|'settle', reservationId: string, kind: CapacityWriteKind,
    observation?: {observedAt:number; freeBytes:Record<string,string>}) {
    const response = record(await ports.request({action,...common(reservationId),...observation,...(action === 'reserve' ? {kind} : {})},
      config.probeTimeoutMillis), ['status','reservation','usage']);
    const {status} = response;
    if (typeof status !== 'string') return fail();
    if (['CLOSED','WINDOW_MISMATCH','PROBE_UNAVAILABLE','WINDOW_BUDGET_EXHAUSTED','IN_FLIGHT_LIMIT',
         'LOW_WATER','RESERVATION_CONFLICT','BAD_REQUEST'].includes(status)) {
      if (response.reservation !== null || response.usage !== null) return fail();
      return {status};
    }
    const expected = {reserve:['RESERVED','ALREADY_RESERVED'],read:['FOUND','ABSENT'],settle:['SETTLED','ALREADY_SETTLED']}[action];
    if (!expected.includes(status)) return fail();
    if (status === 'ABSENT') {
      if (response.reservation !== null) return fail();
    } else {
      const reservation = record(response.reservation,['reservationId','kind','processInstanceId','state']);
      if (reservation.reservationId !== reservationId || reservation.kind !== kind ||
          reservation.processInstanceId !== config.window.binding.processInstanceId ||
          !['IN_FLIGHT','SETTLED'].includes(String(reservation.state)) ||
          (status === 'RESERVED' && reservation.state !== 'IN_FLIGHT') ||
          ((status === 'SETTLED' || status === 'ALREADY_SETTLED') && reservation.state !== 'SETTLED')) return fail();
    }
    const usage = record(response.usage,['admitted','active','chargedBytes']);
    const counts = (value: unknown) => {
      const {session,upload} = record(value,['session','upload']);
      if (!integer(session) || !integer(upload)) return fail();
      return {session,upload};
    };
    const amounts = record(usage.chargedBytes,CAPACITY_VOLUMES);
    const chargedBytes = Object.fromEntries(CAPACITY_VOLUMES.map(key => {
      const amount = amounts[key];
      if (typeof amount !== 'string' || !/^(0|[1-9][0-9]*)$/.test(amount)) return fail();
      return [key,BigInt(amount)];
    })) as CapacityBytes;
    const admitted = counts(usage.admitted), active = counts(usage.active);
    if (active.session > admitted.session || active.upload > admitted.upload) return fail();
    return {status,admitted,active,chargedBytes};
  }
  const readBack = (reservationId: string, kind: CapacityWriteKind) => account('read',reservationId,kind).catch(() => undefined);
  const accounting: ProductionAccounting = {
    assertOpen: () => checkState(true),
    assertOperational: () => checkState(!privateRead.getStore()),
    assertFreshOpen() { if (!last?.open || !fresh(last.observedAt)) return fail(); },
    async reserve(reservationId,kind,observedAt,freeBytes) {
      let reply;
      try {
        reply = await account('reserve',reservationId,kind,{observedAt,
          freeBytes:Object.fromEntries(CAPACITY_VOLUMES.map(key=>[key,String(freeBytes[key])]))});
      } catch { await readBack(reservationId,kind); return fail(); }
      if (reply.status === 'ALREADY_RESERVED' || reply.status === 'RESERVATION_CONFLICT') await readBack(reservationId,kind);
      return reply;
    },
    async complete(reservationId,kind,known) {
      if (known) {
        const reply = await account('settle',reservationId,kind).catch(() => undefined);
        if (reply?.status === 'SETTLED' || reply?.status === 'ALREADY_SETTLED') return;
      }
      await readBack(reservationId,kind);
    },
  };
  return {
    accounting,
    async bind(value: Fresh35ProductionGenerationBinding, assertCurrent:()=>Promise<void>) {
      if (binding || value.owner.linuxBootId !== config.process.linuxBootId) return fail();
      binding = {proof:value,assertCurrent};
      await checkState(false);
    },
    assertOperational: accounting.assertOperational,
    privateRead<T>(work: () => T): T { return privateRead.run(true,work); },
  };
}
export type ProductionGeneration = ReturnType<typeof createProductionGeneration>;
