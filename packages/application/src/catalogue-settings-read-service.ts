import type { ActorContext } from './ports.ts';
import type { CatalogueSettingsReadDependencies, CatalogueSettingsReadIntent, CatalogueSettingsScopedRead } from './catalogue-settings-read-ports.ts';
import { activeCatalogueSettingsRead, checkedCatalogueSettingsActor, checkedCatalogueSettingsGrant, parseCatalogueSettingsListQuery, parseCatalogueSettingsTreeQuery, validateCatalogueSettingsPage, validateCatalogueSettingsTreeGrant } from './catalogue-settings-read-validation.ts';

/** Inert read-only composition. No default identities, policies, data or permission inference. */
export function createCatalogueSettingsReadService(dependencies: CatalogueSettingsReadDependencies) {
  if (typeof dependencies?.authorization?.authorize !== 'function' || !['readCategories', 'readColors', 'readFits'].every(method => typeof dependencies.reader?.[method as keyof typeof dependencies.reader] === 'function')) throw new TypeError('Catalogue settings reads require explicit trusted authorization and reader');
  async function read<T>(actor: ActorContext, intent: CatalogueSettingsReadIntent, signal: AbortSignal, work: (read: CatalogueSettingsScopedRead) => Promise<T>): Promise<T> {
    const currentActor = checkedCatalogueSettingsActor(actor); activeCatalogueSettingsRead(signal);
    const grant = checkedCatalogueSettingsGrant(await dependencies.authorization.authorize(currentActor, intent, signal), intent); activeCatalogueSettingsRead(signal);
    const value = await work(Object.freeze({ actor: currentActor, intent, grant, signal })); activeCatalogueSettingsRead(signal); return value;
  }
  return Object.freeze({
    async readCategories(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseCatalogueSettingsTreeQuery(input);
      return read(actor, Object.freeze({ kind: 'categories', operation: 'tree', parameters }), signal,
        async scoped => validateCatalogueSettingsTreeGrant(await dependencies.reader.readCategories(scoped), scoped.grant));
    },
    async readColors(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseCatalogueSettingsListQuery(input);
      return read(actor, Object.freeze({ kind: 'colors', operation: 'list', parameters }), signal,
        async scoped => validateCatalogueSettingsPage(await dependencies.reader.readColors(scoped), parameters));
    },
    async readFits(actor: ActorContext, input: unknown, signal: AbortSignal) {
      const parameters = parseCatalogueSettingsListQuery(input);
      return read(actor, Object.freeze({ kind: 'fits', operation: 'list', parameters }), signal,
        async scoped => validateCatalogueSettingsPage(await dependencies.reader.readFits(scoped), parameters));
    }
  });
}
