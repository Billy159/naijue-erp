import type {PartyRole, PartyApprovalManifest} from "./private-party-roles.js";

const unavailable = (): never => { const error = new Error("Private ERP approval data is omitted from this source snapshot.") as Error & {code?: string}; error.code = "PRIVATE_CONFIGURATION_REQUIRED"; throw error; };
export type {PartyRole};
export const approvedPartyManifest = new Proxy(Object.create(null), {get: unavailable, ownKeys: unavailable}) as PartyApprovalManifest;
export const approvedPartyCounts = new Proxy(Object.create(null), {get: unavailable, ownKeys: unavailable}) as PartyApprovalManifest["counts"];
export function assertApprovedPartyRolesReady(): void { unavailable(); }
export function approvedPartyRole(_code: string): PartyRole|null|undefined { return unavailable(); }
