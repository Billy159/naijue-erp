/** New exact source-byte/command authorization. Not a runtime capability or publication receipt. */
import { assertFixture, need, SHA, freeze } from './fixture.mjs';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
import { validateCutoffImportCommand } from '../../../../../packages/application/src/inventory-cutoff-import.ts';

export function snapshotSource(value, seen = new Set()) {
  if (value === null || ['string', 'boolean', 'bigint'].includes(typeof value)) return value;
  if (typeof value === 'number') { need(Number.isSafeInteger(value), 'FINITE_TYPED_SOURCE_NUMBER_REQUIRED'); return value; }
  need(value && typeof value === 'object' && !seen.has(value), 'FINITE_PLAIN_SOURCE_DATA_REQUIRED'); seen.add(value);
  const array = Array.isArray(value);
  need(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype), 'PLAIN_OWN_SOURCE_DATA_REQUIRED');
  const keys = Reflect.ownKeys(value); need(keys.every(key => typeof key === 'string'), 'NO_SYMBOL_SOURCE_KEYS');
  const result = array ? [] : {};
  if (array) {
    const length = Object.getOwnPropertyDescriptor(value, 'length').value;
    need(keys.length === length + 1 && keys.every(key => key === 'length' || /^(0|[1-9]\d*)$/.test(key) && Number(key) < length), 'DENSE_SOURCE_ARRAY_REQUIRED');
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'OWN_DATA_SOURCE_REQUIRED');
      result.push(snapshotSource(descriptor.value, seen));
    }
  } else for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'OWN_DATA_SOURCE_REQUIRED');
    Object.defineProperty(result, key, { value: snapshotSource(descriptor.value, seen), enumerable: true });
  }
  seen.delete(value); return freeze(result);
}

export function createReferenceSourceAuthorizer(input, readArtifact) {
  const fixture = assertFixture(input); need(typeof readArtifact === 'function', 'EXPLICIT_NEW_ARTIFACT_READER_REQUIRED');
  async function verify() {
    for (const expected of fixture.artifacts) {
      const read = await readArtifact(expected.path);
      need(Buffer.isBuffer(read) && Object.getPrototypeOf(read) === Buffer.prototype, 'EXACT_ARTIFACT_BUFFER_REQUIRED');
      const bytes = Buffer.from(read);
      need(bytes.length === expected.bytes && SHA(bytes) === expected.sha256 && bytes.equals(Buffer.from(expected.utf8)),
        'NEW_REFERENCE_ARTIFACT_BYTES_REQUIRED:' + expected.path);
    }
    return freeze({ scope: 'NEW_REFERENCE_SOURCE_BYTES_ONLY_NOT_A_RECEIPT', artifacts: 3,
      datasetId: fixture.datasetId, manifestSha256: fixture.commands[0].sourceHash });
  }
  return freeze({ verify, async assertAllowed(actorAccountId, inputCommand) {
    need(typeof actorAccountId === 'string' && actorAccountId === fixture.reference.actor.accountId, 'EXACT_NEW_SOURCE_ACTOR_REQUIRED');
    const command = snapshotSource(inputCommand); validateCutoffImportCommand(command);
    const index = fixture.commands.findIndex(expected => expected.requestKey === command.requestKey);
    need(index >= 0 && requestHash(command) === fixture.commandHashes[index], 'EXACT_COMPLETE_NEW_SOURCE_COMMAND_REQUIRED');
    await verify(); return freeze({ datasetId: fixture.datasetId, commandIndex: index, commandSha256: fixture.commandHashes[index] });
  } });
}
