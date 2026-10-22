export { StaffSettingsController } from './controller.ts';
export type { StaffSettingsProps, StaffSettingsReader, StaffSettingsRecord, StaffRoleOption } from './contracts.ts';
// Lazy-import staff-page.tsx on explicit route activation; no eager React/CSS load.
export { createStaffSettingsHttpReader, createAccountSettingsHttpReader } from './http-client.ts';
export type { AccountSettingsReader, AccountSettingsRecord } from './contracts.ts';
