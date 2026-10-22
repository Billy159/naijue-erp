import type { ReadScope } from '../../loading/read-scope.ts';
import type { PartyClient } from '../../parties/contracts.ts';
import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../../transport/http-query.ts';
import type { OrganizationListQuery, OrganizationMaintenanceKind, OrganizationMaintenancePage, OrganizationMaintenanceRecord } from '../../../../../packages/application/src/organization-maintenance-ports.ts';
import { parseOrganizationDetailQuery, parseOrganizationListQuery, projectOrganizationRecord } from '../../../../../packages/application/src/organization-maintenance-validation.ts';
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


const organizationPaths: Readonly<Record<OrganizationMaintenanceKind, string>> = Object.freeze({
  HALL: '/organization/halls', WAREHOUSE: '/organization/warehouses', STAFF: '/staff',
  ACCOUNT: '/accounts', PAYMENT_METHOD: '/payment/methods', PAYMENT_ACCOUNT: '/payment/accounts',
});
export interface OrganizationSettingsReadClient {
  readList(kind: OrganizationMaintenanceKind, parameters: OrganizationListQuery, signal: AbortSignal): Promise<OrganizationMaintenancePage>;
  readDetail(kind: OrganizationMaintenanceKind, id: string, signal: AbortSignal): Promise<OrganizationMaintenanceRecord | null>;
}
function organizationPath(kind: OrganizationMaintenanceKind): string {
  if (!Object.hasOwn(organizationPaths, kind)) throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_KIND');
  return organizationPaths[kind];
}
function organizationInput<T>(work: () => T): T {
  try { return work(); } catch (error) { if (error instanceof HttpQueryError) throw error; throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_QUERY'); }
}
function organizationPage(value: unknown, kind: OrganizationMaintenanceKind, query: OrganizationListQuery): OrganizationMaintenancePage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings page');
  const page = value as Record<string, unknown>;
  const keys = ['kind', 'page', 'pageSize', 'total', 'items'];
  if (Object.keys(page).length !== keys.length || !keys.every(key => Object.hasOwn(page, key)) || page.kind !== kind
    || page.page !== query.page || page.pageSize !== query.pageSize || typeof page.total !== 'number'
    || !Number.isSafeInteger(page.total) || page.total < 0 || !Array.isArray(page.items)
    || page.items.length !== Math.min(query.pageSize, Math.max(0, page.total - (query.page - 1) * query.pageSize))) throw new Error('Invalid settings page');
  const items = page.items.map(item => projectOrganizationRecord(item, kind));
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate settings identity');
  return { kind, page: query.page, pageSize: query.pageSize, total: page.total, items };
}
/** Frozen B05-READ-v1 only: six native families, twelve POST reads, no command
 * or receipt route. Shared HTTP retains same-origin cookies, bounds and aborts. */
export function createOrganizationMaintenanceReadClient(options: HttpQueryOptions): OrganizationSettingsReadClient {
  const http = createHttpJsonQuery(options);
  return Object.freeze<OrganizationSettingsReadClient>({
    readList(kind, parameters, signal) {
      const path = organizationPath(kind), query = organizationInput(() => parseOrganizationListQuery({ ...parameters }, kind));
      return http.post(`${path}/query`, query, signal, value => organizationPage(value, kind, query));
    },
    readDetail(kind, id, signal) {
      const path = organizationPath(kind), target = organizationInput(() => parseOrganizationDetailQuery({ id }));
      return http.post(`${path}/detail/query`, { id: target }, signal, value => {
        if (value === null) return null;
        const item = projectOrganizationRecord(value, kind);
        if (item.id !== target) throw new Error('Wrong settings detail target');
        return item;
      });
    },
  });
}
function storeReadProjection(item: OrganizationMaintenanceRecord) {
  if (item.kind === 'HALL') return { kind: 'stores' as const, id: item.id, name: item.name, enabled: item.enabled, version: item.version, createdAt: null, updatedAt: null,
    defaultCustomer: item.defaultCustomer ? { id: item.defaultCustomer.id, name: item.defaultCustomer.name } : null,
    defaultWarehouse: item.defaultSalesWarehouse ? { id: item.defaultSalesWarehouse.id, name: item.defaultSalesWarehouse.name } : null };
  if (item.kind === 'WAREHOUSE') return { kind: 'warehouses' as const, id: item.id, name: item.name, enabled: item.enabled, version: item.version, createdAt: null, updatedAt: null,
    hall: { id: item.hall.id, name: item.hall.name }, stockFacts: null };
  throw new Error('Wrong native settings kind');
}
/** Existing view projection over the new frozen native read API. Native default
 * warehouse hallId remains available from the shared client for future commands. */
export function createOrganizationStoreSettingsReader(options: HttpQueryOptions): StoreSettingsBrowserReader {
  const client = createOrganizationMaintenanceReadClient(options);
  return Object.freeze<StoreSettingsBrowserReader>({
    async readList(kind, read) {
      if (kind !== 'stores' && kind !== 'warehouses') throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_KIND');
      const page = await client.readList(kind === 'stores' ? 'HALL' : 'WAREHOUSE', read.parameters, read.signal);
      return { page: page.page, pageSize: page.pageSize, total: page.total, items: page.items.map(storeReadProjection) };
    },
    async readDetail(kind, read) {
      if (kind !== 'stores' && kind !== 'warehouses') throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_KIND');
      const item = await client.readDetail(kind === 'stores' ? 'HALL' : 'WAREHOUSE', read.parameters.id, read.signal);
      return { item: item === null ? null : storeReadProjection(item) };
    },
  });
}
export function createOrganizationSettingsDirectory(input: {
  readonly scope: ReadScope; readonly http: HttpQueryOptions; readonly customers?: Pick<PartyClient, 'candidates'>;
}): SettingsDirectoryReader {
  const client = createOrganizationMaintenanceReadClient(input.http);
  return Object.freeze<SettingsDirectoryReader>({ async read(kind, parameters, signal) {
    const combined = AbortSignal.any([input.scope.signal, signal]);
    if (!input.scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    if (kind === 'customers') {
      if (!input.customers) throw new HttpQueryError('not-implemented', 'CUSTOMER_DIRECTORY_NOT_CONFIGURED');
      const result = await input.customers.candidates('CUSTOMER', { search: parameters.search, page: parameters.page, pageSize: parameters.pageSize }, combined);
      if (!input.scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
      return { ...result, items: result.items.map(item => ({ id: item.id, name: item.name })) };
    }
    if (kind === 'warehouses' && !parameters.hallId) throw new HttpQueryError('invalid-request', 'WAREHOUSE_HALL_REQUIRED');
    const nativeKind = kind === 'halls' ? 'HALL' : kind === 'warehouses' ? 'WAREHOUSE' : kind === 'payment-methods' ? 'PAYMENT_METHOD' : null;
    if (!nativeKind) throw new HttpQueryError('invalid-request', 'INVALID_SETTINGS_DIRECTORY');
    const page = await client.readList(nativeKind, { search: parameters.search, status: 'normal', hallId: kind === 'warehouses' ? parameters.hallId : null, page: parameters.page, pageSize: parameters.pageSize }, combined);
    if (!input.scope.active || combined.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    return { page: page.page, pageSize: page.pageSize, total: page.total, items: page.items.map(item => {
      if (item.kind !== 'HALL' && item.kind !== 'WAREHOUSE' && item.kind !== 'PAYMENT_METHOD') throw new Error('Wrong directory kind');
      return { id: item.id, name: item.name };
    }) };
  } });
}
