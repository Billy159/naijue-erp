import type {ApprovedFundAccount, FundAccountApproval, FundAccountApprovalManifest} from "./private-fund-accounts.js";

const unavailable = (): never => { const error = new Error("Private ERP approval data is omitted from this source snapshot.") as Error & {code?: string}; error.code = "PRIVATE_CONFIGURATION_REQUIRED"; throw error; };
const redacted = "__PRIVATE_INPUT_REQUIRED__";
export type {ApprovedFundAccount, FundAccountApproval};
export const fundAccountUpdateRevision = redacted;
export const fundAccountUpdateSourceSha256 = redacted;
export const approvedFundAccountManifest = new Proxy(Object.create(null), {get: unavailable, ownKeys: unavailable}) as FundAccountApprovalManifest;
export function loadApprovedFundAccounts(): FundAccountApproval { return unavailable(); }
export function assertApprovedFundAccountsReady(): void { unavailable(); }
