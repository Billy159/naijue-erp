export { AccountSettingsController, createAccountSettingsWorkspace } from './controller.ts';
export type { AccountEditorOptions, AccountWorkspaceOptions, AccountSettingsWorkspace } from './controller.ts';
export { createAccountSettingsHttpReader, createAccountSettingsCommandClient } from './http-client.ts';
export { AccountClientError, initialAccountSettingsQuery } from './contracts.ts';
export type { AccountSettingsProps, AccountSettingsRecord, AccountSettingsReader, AccountCommand, AccountCommandClient, AccountCommandResult, AccountCommandReceipt, AccountReceiptIdentity } from './contracts.ts';
// Lazy-import account-page.tsx only when the F1 account route is explicitly activated.
