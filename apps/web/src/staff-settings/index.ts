export { StaffSettingsController, createStaffSettingsWorkspace } from './controller.ts';
export type { StaffSettingsProps, StaffSettingsReader, StaffSettingsRecord, StaffRoleOption } from './contracts.ts';
// Lazy-import staff-page.tsx on explicit route activation; no eager React/CSS load.
export { createStaffSettingsHttpReader, createAccountSettingsHttpReader, createStaffSettingsCommandClient } from './http-client.ts';
export type { AccountSettingsReader, AccountSettingsRecord } from './contracts.ts';

export type { StaffEditorOptions, StaffWorkspaceOptions, StaffSettingsWorkspace, StaffEditorIntent } from './controller.ts';
export { StaffClientError } from './contracts.ts';
export type { StaffCommand, StaffCommandClient, StaffCommandResult, StaffCommandReceipt, StaffReceiptIdentity } from './contracts.ts';
