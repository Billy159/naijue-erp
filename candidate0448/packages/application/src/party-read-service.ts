import type { PartyActor, PartyKind, PartyReadDependencies, PartyReadIntent, PartyScopedRead, PartyRecord } from "./party-read-ports.ts";
import { checkedPartyActor, parsePartySearch, partyKind } from "./party-maintenance-validation.ts";
import { entityId, version } from "../../domain/src/values.ts";
import { requireDomain } from "../../domain/src/errors.ts";

function bag(value: unknown, keys: readonly string[]): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === keys.length
    && keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return !!d && "value" in d; });
}
export function activePartyRead(signal: AbortSignal): void {
  requireDomain(signal instanceof AbortSignal && !signal.aborted, "PARTY_READ_ABORTED", "Party read aborted");
}
/** Shared defensive check for the service and native read-only adapter; never authorizes by itself. */
export function checkedPartyReadScope(read: PartyScopedRead): PartyScopedRead {
  activePartyRead(read.signal); const actor = checkedPartyActor(read.actor), input = read.intent;
  const detail = input?.operation === "DETAIL";
  requireDomain(bag(input, detail ? ["kind", "operation", "id"] : ["kind", "operation", "query"]), "INVALID_PARTY_INPUT", "Invalid party read intent");
  const kind = partyKind(input.kind); let intent: PartyReadIntent;
  if (detail) {
    if (input.operation !== "DETAIL") throw Error("Invalid trusted party detail intent");
    intent = Object.freeze({ kind, operation: "DETAIL", id: entityId(kind === "CUSTOMER" ? "customer" : "supplier", input.id) });
  } else {
    requireDomain(input.operation === "LIST" || input.operation === "CANDIDATES", "INVALID_PARTY_INPUT", "Read-only party operation required");
    requireDomain(bag(input.query, ["search", "enabled", "page", "pageSize"]), "INVALID_PARTY_INPUT", "Invalid party search");
    const query = parsePartySearch(input.query, false);
    requireDomain(input.operation !== "CANDIDATES" || query.enabled === "ENABLED", "FORBIDDEN", "Party candidates require enabled-only scope");
    intent = Object.freeze({ kind, operation: input.operation, query: Object.freeze(query) });
  }
  const grant = read.grant;
  requireDomain(bag(grant, ["kind", "operation", "targetId"]) && grant.kind === intent.kind && grant.operation === intent.operation
    && grant.targetId === (intent.operation === "DETAIL" ? intent.id : null), "FORBIDDEN", "Exact party read grant required");
  return Object.freeze({ actor, intent, grant: Object.freeze({ kind: grant.kind, operation: grant.operation, targetId: grant.targetId }), signal: read.signal });
}
export function checkedPartyReadRecord(row: PartyRecord, kind: PartyKind): PartyRecord {
  if (!bag(row, ["id", "code", "name", "enabled", "version", "createdAt", "updatedAt"])) throw Error("Invalid trusted party record");
  try { entityId(kind === "CUSTOMER" ? "customer" : "supplier", row.id); version(row.version); }
  catch { throw Error("Invalid trusted party record identity/version"); }
  if (row.version > 2147483647 || typeof row.code !== "string" || !row.code.trim() || row.code.includes("\0")
    || typeof row.name !== "string" || !row.name.trim() || row.name.includes("\0") || typeof row.enabled !== "boolean"
    || [row.createdAt, row.updatedAt].some(t => t !== null && (typeof t !== "string" || !Number.isFinite(Date.parse(t)))))
    throw Error("Invalid trusted party record fields");
  return Object.freeze({ ...row });
}
export function createPartyReadService(dependencies: PartyReadDependencies) {
  if (typeof dependencies?.authorization?.authorize !== "function" || typeof dependencies?.reader?.search !== "function" || typeof dependencies.reader.detail !== "function")
    throw new TypeError("Party reads require explicit read-only authorization and reader");
  async function scope(actorInput: PartyActor, intent: PartyReadIntent, signal: AbortSignal): Promise<PartyScopedRead> {
    activePartyRead(signal); const actor = checkedPartyActor(actorInput);
    const grant = await dependencies.authorization.authorize(actor, intent, signal);
    return checkedPartyReadScope({ actor, intent, grant, signal });
  }
  return Object.freeze({
    async search(actor: PartyActor, kindInput: PartyKind, input: unknown, candidates: boolean, signal: AbortSignal) {
      const kind = partyKind(kindInput), query = Object.freeze(parsePartySearch(input, candidates));
      const read = await scope(actor, Object.freeze({ kind, operation: candidates ? "CANDIDATES" : "LIST", query }), signal);
      const result = await dependencies.reader.search(read); activePartyRead(signal);
      if (!result || result.page !== query.page || result.pageSize !== query.pageSize || !Number.isSafeInteger(result.total) || result.total < 0
        || !Array.isArray(result.items) || result.items.length > query.pageSize || result.items.length !== Math.min(query.pageSize, Math.max(0, result.total - (query.page - 1) * query.pageSize)))
        throw Error("Invalid trusted party page");
      const known = new Set<string>(), items = result.items.map(item => {
        const row = checkedPartyReadRecord(item, kind);
        if (known.has(row.id) || query.enabled !== "ALL" && row.enabled !== (query.enabled === "ENABLED")) throw Error("Invalid trusted party candidate/filter output");
        known.add(row.id); return candidates ? { id: row.id, code: row.code, name: row.name } : row;
      });
      return { ...result, items };
    },
    async detail(actor: PartyActor, kindInput: PartyKind, idInput: string, signal: AbortSignal) {
      const kind = partyKind(kindInput), id = entityId(kind === "CUSTOMER" ? "customer" : "supplier", idInput);
      const read = await scope(actor, Object.freeze({ kind, operation: "DETAIL", id }), signal);
      const value = await dependencies.reader.detail(read); activePartyRead(signal);
      requireDomain(value !== undefined, "PARTY_NOT_FOUND", "Party is unavailable");
      const row = checkedPartyReadRecord(value, kind); if (row.id !== id) throw Error("Mismatched trusted party detail target"); return row;
    },
  });
}
