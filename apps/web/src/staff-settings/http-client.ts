import { HttpQueryError, type HttpQueryOptions } from '../transport/http-query.ts';
import { createOrganizationMaintenanceReadClient } from '../settings/stores/maintenance-http-client.ts';
import type { StaffSettingsReader, AccountSettingsReader } from './contracts.ts';
import { projectStaffSettingsRecord, projectAccountSettingsRecord } from './response-validation.ts';

/** B05-READ-v1 has no role/login-status filter or login-name staff search. */
export function createStaffSettingsHttpReader(options: HttpQueryOptions): StaffSettingsReader {
  const client = createOrganizationMaintenanceReadClient(options);
  return Object.freeze<StaffSettingsReader>({ capabilities: Object.freeze({}),
    async readList(read) {
      const query = read.parameters;
      if (query.role !== '' || query.loginStatus !== '') throw new HttpQueryError('not-implemented', 'STAFF_FILTER_NOT_AVAILABLE');
      if (!['在职', '离职', 'all'].includes(query.employmentStatus)) throw new HttpQueryError('invalid-request', 'INVALID_STAFF_QUERY');
      const result = await client.readList('STAFF', { search: query.search, status: query.employmentStatus === '在职' ? 'normal' : query.employmentStatus === '离职' ? 'disabled' : 'all',
        hallId: query.hallId, page: query.page, pageSize: query.pageSize }, read.signal);
      return { page: result.page, pageSize: result.pageSize, total: result.total, items: result.items.map(projectStaffSettingsRecord) };
    },
    async readDetail(read) {
      const result = await client.readDetail('STAFF', read.parameters.id, read.signal);
      return result === null ? null : projectStaffSettingsRecord(result);
    },
  });
}
/** Separate native account identity, never a credential read. */
export function createAccountSettingsHttpReader(options: HttpQueryOptions): AccountSettingsReader {
  const client = createOrganizationMaintenanceReadClient(options);
  return Object.freeze<AccountSettingsReader>({
    async readList(read) {
      const result = await client.readList('ACCOUNT', read.parameters, read.signal);
      return { page: result.page, pageSize: result.pageSize, total: result.total, items: result.items.map(projectAccountSettingsRecord) };
    },
    async readDetail(read) {
      const result = await client.readDetail('ACCOUNT', read.parameters.id, read.signal);
      return result === null ? null : projectAccountSettingsRecord(result);
    },
  });
}
