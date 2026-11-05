import type { PartyActor, PartyKind, PartySearch, PartyRecord, PartyPage, PartyCandidate } from "./party-maintenance-ports.ts";
export type { PartyActor, PartyKind, PartySearch, PartyRecord, PartyPage, PartyCandidate };
export type PartyReadIntent = { readonly kind: PartyKind; readonly operation: "LIST" | "CANDIDATES"; readonly query: PartySearch }
  | { readonly kind: PartyKind; readonly operation: "DETAIL"; readonly id: string };
export interface PartyReadGrant { readonly kind: PartyKind; readonly operation: PartyReadIntent["operation"]; readonly targetId: string | null }
/** Deliberate independent directory read capability, never a maintenance/receipt grant. */
export interface PartyReadAuthorization { authorize(actor: PartyActor, intent: PartyReadIntent, signal: AbortSignal): Promise<PartyReadGrant> }
export interface PartyScopedRead { readonly actor: PartyActor; readonly intent: PartyReadIntent; readonly grant: PartyReadGrant; readonly signal: AbortSignal }
export interface PartyReadReader {
  search(read: PartyScopedRead): Promise<PartyPage<PartyRecord>>;
  detail(read: PartyScopedRead): Promise<PartyRecord | undefined>;
}
export interface PartyReadDependencies { readonly authorization: PartyReadAuthorization; readonly reader: PartyReadReader }
