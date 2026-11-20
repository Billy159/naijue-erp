import type { ActorContext } from './ports.ts';
import type { StoreSettingsKind, StoreSettingsReadDependencies, StoreSettingsReadIntent, StoreSettingsScopedRead } from './store-settings-read-ports.ts';
import { activeStoreSettingsRead, checkedStoreSettingsActor, checkedStoreSettingsGrant, parseStoreSettingsDetailQuery, parseStoreSettingsListQuery, validateStoreSettingsDetail, validateStoreSettingsPage } from './store-settings-read-validation.ts';

/** Inert directory/detail reads. Explicit server policy on EVERY request; no role,
 * transaction candidate, native-import or browser-provided authority fallback. */
export function createStoreSettingsReadService(dependencies: StoreSettingsReadDependencies) {
  if (typeof dependencies?.authorization?.authorize !== 'function' || typeof dependencies.reader?.readList !== 'function' || typeof dependencies.reader.readDetail !== 'function') throw new TypeError('Store settings reads require explicit trusted authorization and reader');
  async function read<T>(actor: ActorContext, intent: StoreSettingsReadIntent, signal: AbortSignal, work: (read: StoreSettingsScopedRead) => Promise<T>): Promise<T> {
    const currentActor = checkedStoreSettingsActor(actor); activeStoreSettingsRead(signal);
    const grant = checkedStoreSettingsGrant(await dependencies.authorization.authorize(currentActor, intent, signal), intent); activeStoreSettingsRead(signal);
    const result = await work(Object.freeze({ actor: currentActor, intent, grant, signal })); activeStoreSettingsRead(signal); return result;
  }
  return Object.freeze({
    async readList(actor: ActorContext, kind: StoreSettingsKind, input: unknown, signal: AbortSignal) {
      if (kind !== 'stores' && kind !== 'warehouses') throw new TypeError('Unknown store settings kind');
      const parameters = parseStoreSettingsListQuery(input, kind);
      return read(actor, Object.freeze({ kind, operation: 'list', parameters }), signal, async scoped => validateStoreSettingsPage(await dependencies.reader.readList(scoped), kind, parameters, scoped.grant));
    },
    async readDetail(actor: ActorContext, kind: StoreSettingsKind, input: unknown, signal: AbortSignal) {
      if (kind !== 'stores' && kind !== 'warehouses') throw new TypeError('Unknown store settings kind');
      const parameters = parseStoreSettingsDetailQuery(input);
      return read(actor, Object.freeze({ kind, operation: 'detail', parameters }), signal, async scoped => validateStoreSettingsDetail(await dependencies.reader.readDetail(scoped), kind, parameters, scoped.grant));
    }
  });
}
