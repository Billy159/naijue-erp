import type { ReadScope } from '../../loading/read-scope.ts';
import type { PartyClient } from '../../parties/contracts.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import type { StoreSettingsBrowserReader } from './contracts.ts';
import type { SettingsDirectoryReader } from './maintenance-contracts.ts';

/** Adapts ONLY already-existing reads; no unapproved URL or maintenance command. */
export function createStoreSettingsMaintenanceDirectory(input: {
  readonly scope: ReadScope; readonly reader: StoreSettingsBrowserReader;
  readonly customers?: Pick<PartyClient, 'candidates'>;
}): SettingsDirectoryReader {
  return Object.freeze({ async read(kind, parameters, signal) {
    const scope = input.scope;
    if (!scope.active || signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    const combined = AbortSignal.any([scope.signal, signal]);
    if (kind === 'customers') {
      if (!input.customers) throw new HttpQueryError('not-implemented', 'CUSTOMER_DIRECTORY_NOT_CONFIGURED');
      const page = await input.customers.candidates('CUSTOMER', { search: parameters.search, page: parameters.page, pageSize: parameters.pageSize }, combined);
      if (!scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
      return { ...page, items: page.items.map(item => ({ id: item.id, name: item.name })) };
    }
    if (kind === 'payment-methods') throw new HttpQueryError('not-implemented', 'PAYMENT_DIRECTORY_NOT_CONFIGURED');
    if (kind === 'warehouses' && !parameters.hallId) throw new HttpQueryError('invalid-request', 'WAREHOUSE_HALL_REQUIRED');
    const page = await input.reader.readList(kind === 'halls' ? 'stores' : 'warehouses', {
      identity: scope.identity, routeInstanceId: scope.routeInstanceId, entityId: scope.entityId, signal: combined,
      parameters: { search: parameters.search, status: 'normal', hallId: kind === 'warehouses' ? parameters.hallId : null, page: parameters.page, pageSize: parameters.pageSize },
    });
    if (!scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    return { ...page, items: page.items.map(item => ({ id: item.id, name: item.name })) };
  } } satisfies SettingsDirectoryReader);
}
