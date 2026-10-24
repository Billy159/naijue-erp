/** SYNTHETIC preview only. The production session/reader must never import this file.
 * Finite, read-only samples; no network, credentials, commands, receipts or mutable store. */
import type { OrganizationMaintenanceKind, OrganizationMaintenanceRecord, OrganizationReadListQuery, OrganizationReference } from '../../../../../../packages/application/src/organization-maintenance-ports.ts';
import { parseOrganizationDetailQuery, parseOrganizationListQuery } from '../../../../../../packages/application/src/organization-maintenance-validation.ts';
import type { PartyCandidateSearch, PartyKind, PartyRecord, PartySearch } from '../../../../src/parties/contracts.ts';
import { validId, validateCandidateSearch, validateSearch } from '../../../../src/parties/response-validation.ts';
import type { SettingsAuditItem, SettingsAuditModule } from '../../../../src/settings/audit/contracts.ts';
import { parseSettingsAuditQuery } from '../../../../src/settings/audit/http-reader.ts';
import { SETTINGS_AUDIT_FIELDS } from '../../../../../../packages/application/src/settings-audit-ports.ts';

const paths: Readonly<Record<string, OrganizationMaintenanceKind>> = Object.freeze({
  '/organization/halls': 'HALL', '/organization/warehouses': 'WAREHOUSE', '/staff': 'STAFF',
  '/accounts': 'ACCOUNT', '/payment/methods': 'PAYMENT_METHOD', '/payment/accounts': 'PAYMENT_ACCOUNT',
});
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const partyPath = new RegExp(`^/(customers|suppliers)(?:/(candidates|${uuidPattern}))?$`);
// IDs/counts follow the existing finite settings/party review fixtures.
const id = (number: number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const ordinal = (index: number) => String(index + 1).padStart(3, '0');
// A declared synthetic account/audit creation event, never an inferred business timestamp.
const sampleEventTime = '2000-01-01T00:00:00Z';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const failure = (status: number, code: string) => json({ error: { code, message: 'SYNTHETIC settings preview read only; no real service was called.' } }, status);
const pathname = (path: string) => path.split('?')[0]!.replace(/^\/api(?=\/)/, '');
function nativeRoute(path: string): { kind: OrganizationMaintenanceKind; detail: boolean } | null {
  const suffix = path.endsWith('/detail/query') ? '/detail/query' : path.endsWith('/query') ? '/query' : null;
  const kind = suffix ? paths[path.slice(0, -suffix.length)] : undefined;
  return kind ? { kind, detail: suffix === '/detail/query' } : null;
}
function paged<T>(items: readonly T[], query: { page: number; pageSize: number }) {
  return { page: query.page, pageSize: query.pageSize, total: items.length, items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize) };
}
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const hall = (index: number): OrganizationReference => ({ id: id(6100 + index), name: `SYNTHETIC 合成营业厅 ${ordinal(index)}`, enabled: index % 7 !== 6 });
const method = (index: number): OrganizationReference => ({ id: id(10100 + index), name: `SYNTHETIC 合成收款方式 ${ordinal(index)}`, enabled: index % 5 !== 4 });

export function createSettingsPreviewTransport() {
  const native = new Map<OrganizationMaintenanceKind, readonly OrganizationMaintenanceRecord[]>();
  const parties = new Map<PartyKind, readonly PartyRecord[]>();
  let auditSamples: readonly SettingsAuditItem[] | null = null;
  function partyRows(kind: PartyKind): readonly PartyRecord[] {
    let result = parties.get(kind);
    if (!result) {
      result = Array.from({ length: 23 }, (_, index) => ({ id: id((kind === 'CUSTOMER' ? 910000 : 920000) + index), code: `SYN-${kind === 'CUSTOMER' ? 'C' : 'S'}-${ordinal(index)}`,
        name: `SYNTHETIC 合成${kind === 'CUSTOMER' ? '客户' : '供应商'} ${ordinal(index)}`, enabled: index % 5 !== 4, version: index === 22 ? 7 : 1, createdAt: null, updatedAt: null }));
      parties.set(kind, result);
    }
    return result;
  }
  function nativeRows(kind: OrganizationMaintenanceKind): readonly OrganizationMaintenanceRecord[] {
    const cached = native.get(kind); if (cached) return cached;
    const base = (number: number, index: number) => ({ id: id(number + index), version: index + 1, createdAt: null, updatedAt: null });
    let rows: readonly OrganizationMaintenanceRecord[];
    switch (kind) {
      case 'HALL': rows = Array.from({ length: 43 }, (_, index) => ({ ...base(6100, index), kind, name: hall(index).name, enabled: hall(index).enabled,
        defaultCustomer: index === 0 ? { id: id(910000), name: 'SYNTHETIC 合成客户 001', enabled: true } : null,
        defaultSalesWarehouse: index === 0 ? { id: id(7100), name: 'SYNTHETIC 合成仓库 001', enabled: true, hallId: id(6100) } : null })); break;
      case 'WAREHOUSE': rows = Array.from({ length: 27 }, (_, index) => ({ ...base(7100, index), kind, name: `SYNTHETIC 合成仓库 ${ordinal(index)}`, enabled: index % 6 !== 5, hall: hall(index % 43) })); break;
      case 'STAFF': rows = Array.from({ length: 25 }, (_, index) => {
        const role = (['ADMIN', 'WAREHOUSE', 'SALESPERSON'] as const)[index % 3]!, employed = index % 7 !== 6;
        return { ...base(8100, index), kind, name: `SYNTHETIC 合成员工 ${ordinal(index)}`, role, hall: role === 'SALESPERSON' ? hall(index % 43) : null,
          contact: null, employmentStatus: employed ? '在职' : '离职', account: index % 3 === 0 ? null
            : { id: id(8500 + index), loginName: `SYNTHETIC-staff-${ordinal(index)}`, loginEnabled: employed && index % 3 === 1, authVersion: 1, version: 2 } };
      }); break;
      case 'ACCOUNT': rows = nativeRows('STAFF').flatMap(row => row.kind === 'STAFF' && row.account ? [{ ...row.account, kind, createdAt: sampleEventTime, updatedAt: sampleEventTime,
        staff: { id: row.id, name: row.name, role: row.role, employmentStatus: row.employmentStatus, hallId: row.hall?.id ?? null } }] : []); break;
      case 'PAYMENT_METHOD': rows = Array.from({ length: 23 }, (_, index) => ({ ...base(10100, index), ...method(index), kind })); break;
      case 'PAYMENT_ACCOUNT': rows = Array.from({ length: 23 }, (_, index) => ({ ...base(11100, index), kind, name: `SYNTHETIC 合成资金账户 ${ordinal(index)}`, enabled: index % 5 !== 4,
        paymentMethod: method(index % 23), halls: index === 0 ? [hall(0), hall(20)] : index === 1 ? [] : [hall(index % 43)] })); break;
    }
    native.set(kind, rows); return rows;
  }
  function matches(row: OrganizationMaintenanceRecord, query: OrganizationReadListQuery): boolean {
    const display = row.kind === 'ACCOUNT' ? row.loginName : row.name;
    const search = row.kind === 'STAFF' ? `${display}\n${row.account?.loginName ?? ''}` : display;
    const normal = row.kind === 'STAFF' ? row.employmentStatus === '在职' : row.kind === 'ACCOUNT' ? row.loginEnabled : row.enabled;
    if (!search.toLowerCase().includes(query.search.toLowerCase()) || query.status !== 'all' && normal !== (query.status === 'normal')) return false;
    if (query.hallId !== null) {
      const found = row.kind === 'HALL' ? row.id === query.hallId : row.kind === 'WAREHOUSE' ? row.hall.id === query.hallId
        : row.kind === 'STAFF' ? row.hall?.id === query.hallId : row.kind === 'ACCOUNT' ? row.staff.hallId === query.hallId
          : row.kind === 'PAYMENT_ACCOUNT' ? row.halls.some(h => h.id === query.hallId) : false;
      if (!found) return false;
    }
    if ('role' in query && query.role && (row.kind !== 'STAFF' || row.role !== query.role)) return false;
    if ('loginStatus' in query && query.loginStatus === 'open' && (row.kind !== 'STAFF' || row.account?.loginEnabled !== true)) return false;
    if ('paymentMethodId' in query && query.paymentMethodId !== null && (row.kind !== 'PAYMENT_ACCOUNT' || row.paymentMethod.id !== query.paymentMethodId)) return false;
    return true;
  }
  function auditRows(): readonly SettingsAuditItem[] {
    if (!auditSamples) {
      const modules: readonly SettingsAuditModule[] = ['HALL', 'WAREHOUSE', 'STAFF', 'ACCOUNT', 'PAYMENT_METHOD', 'PAYMENT_ACCOUNT', 'CUSTOMER', 'SUPPLIER'];
      auditSamples = modules.map((module, index): SettingsAuditItem => {
        const row = module === 'CUSTOMER' || module === 'SUPPLIER' ? partyRows(module)[0]! : nativeRows(module as OrganizationMaintenanceKind)[0]!;
        const name = 'loginName' in row ? row.loginName : row.name, key = module === 'ACCOUNT' ? 'login_name' : 'name';
        const field = SETTINGS_AUDIT_FIELDS[module].find(item => item.key === key)!;
        return { id: id(750000 + index), operationId: id(760000 + index), occurredAt: sampleEventTime, module,
          object: { id: row.id, name, code: 'code' in row ? row.code : null }, actor: { accountId: null, staffId: null, name: null, loginName: null },
          action: 'CREATE', oldVersion: null, newVersion: row.version, changes: [{ field: key, label: field.label, before: { state: 'ABSENT' }, after: { state: 'VALUE', value: name } }], credentialActions: [] };
      });
    }
    return auditSamples;
  }
  function canHandle(path: string, methodName: string): boolean {
    const pathOnly = pathname(path);
    return methodName === 'POST' && (nativeRoute(pathOnly) !== null || pathOnly === '/settings/audit/query') || methodName === 'GET' && partyPath.test(pathOnly);
  }
  return Object.freeze({ canHandle, async request(input: string | URL, init: RequestInit): Promise<Response> {
    const url = new URL(String(input), 'https://settings.synthetic.invalid'), path = pathname(url.pathname), verb = init.method ?? 'GET';
    if (!canHandle(path, verb) || url.username || url.password || url.hash) throw new TypeError('Unsupported SYNTHETIC settings preview operation');
    if (init.signal?.aborted) throw new DOMException('SYNTHETIC read aborted', 'AbortError');
    const route = nativeRoute(path);
    if (route || path === '/settings/audit/query') {
      if (url.search || typeof init.body !== 'string') return failure(400, route ? 'INVALID_ORGANIZATION_QUERY' : 'INVALID_SETTINGS_AUDIT_QUERY');
      let body: unknown;
      try { body = JSON.parse(init.body) as unknown; } catch { return failure(400, 'INVALID_JSON'); }
      if (route) {
        try {
          if (route.detail) { const target = parseOrganizationDetailQuery(body); return json(nativeRows(route.kind).find(row => row.id === target) ?? null); }
          const query = parseOrganizationListQuery(body, route.kind);
          if ('loginStatus' in query && query.loginStatus === 'closed') return failure(503, 'STAFF_LOGIN_FILTER_NOT_READY');
          const rows = nativeRows(route.kind).filter(row => matches(row, query)).sort((a, b) => compare(a.kind === 'ACCOUNT' ? a.loginName : a.name, b.kind === 'ACCOUNT' ? b.loginName : b.name) || compare(a.id, b.id));
          return json({ kind: route.kind, ...paged(rows, query) });
        } catch { return failure(400, 'INVALID_ORGANIZATION_QUERY'); }
      }
      try {
        const query = parseSettingsAuditQuery(body);
        if (query.module !== 'ALL' && !['HALL','WAREHOUSE','STAFF','ACCOUNT','PAYMENT_METHOD','PAYMENT_ACCOUNT','CUSTOMER','SUPPLIER'].includes(query.module)) return failure(501, 'SETTINGS_PREVIEW_MODULE_NOT_IMPLEMENTED');
        const rows = auditRows().filter(row => (query.module === 'ALL' || row.module === query.module) && (query.objectId === null || row.object.id === query.objectId)
          && [row.object.name, row.object.code].join(' ').toLowerCase().includes(query.objectSearch.toLowerCase())
          && [row.actor.name, row.actor.loginName].join(' ').toLowerCase().includes(query.actorSearch.toLowerCase()) && (query.action === 'ALL' || row.action === query.action)
          && (!query.dateFrom || row.occurredAt !== null && row.occurredAt.slice(0, 10) >= query.dateFrom) && (!query.dateTo || row.occurredAt !== null && row.occurredAt.slice(0, 10) <= query.dateTo));
        return json(paged(rows, query));
      } catch { return failure(400, 'INVALID_SETTINGS_AUDIT_QUERY'); }
    }
    if (init.body != null) return failure(400, 'INVALID_PARTY_INPUT');
    const match = partyPath.exec(path)!;
    const kind: PartyKind = match[1] === 'customers' ? 'CUSTOMER' : 'SUPPLIER', target = match[2];
    try {
      const expected = target === 'candidates' ? ['search', 'page', 'pageSize'] : target ? [] : ['search', 'enabled', 'page', 'pageSize'];
      const keys = [...url.searchParams.keys()];
      if (keys.length !== expected.length || new Set(keys).size !== keys.length || !expected.every(key => url.searchParams.has(key))) return failure(400, 'INVALID_PARTY_INPUT');
      if (target && target !== 'candidates') {
        if (!validId(target)) return failure(400, 'INVALID_ID');
        const row = partyRows(kind).find(item => item.id === target); return row ? json(row) : failure(404, 'PARTY_NOT_FOUND');
      }
      const base = { search: url.searchParams.get('search')!, page: Number(url.searchParams.get('page')), pageSize: Number(url.searchParams.get('pageSize')) };
      const query = target === 'candidates' ? validateCandidateSearch(base as PartyCandidateSearch) : validateSearch({ ...base, enabled: url.searchParams.get('enabled') } as PartySearch);
      const rows = partyRows(kind).filter(row => [row.name, row.code].some(value => value.toLowerCase().includes(query.search.toLowerCase()))
        && (target === 'candidates' ? row.enabled : !('enabled' in query) || query.enabled === 'ALL' || row.enabled === (query.enabled === 'ENABLED')))
        .slice().sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
      return json(paged(target === 'candidates' ? rows.map(({ id, code, name }) => ({ id, code, name })) : rows, query));
    } catch { return failure(400, 'INVALID_PARTY_INPUT'); }
  } });
}
