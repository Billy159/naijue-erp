import { DomainError, requireDomain } from "../../domain/src/errors.ts";
import { entityId, version } from "../../domain/src/values.ts";
import type { PartyActor, PartyCommand, PartyKind, PartySearch } from "./party-maintenance-ports.ts";

function invalid(): never { throw new DomainError("INVALID_PARTY_INPUT", "Request does not match the independent party contract"); }
export function partyObject(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) invalid();
  const row = input as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) invalid();
  return row;
}
export function partyKind(input: unknown): PartyKind { if (input !== "CUSTOMER" && input !== "SUPPLIER") invalid(); return input; }
export function partyRequestKey(input: unknown): string { if (typeof input !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(input)) invalid(); return input; }
export function partyName(input: unknown): string {
  // Do not silently normalize text or codes. NUL is not PostgreSQL text; 2048 is a transport safeguard.
  if (typeof input !== "string" || input.trim().length === 0 || input.includes("\0") || input.length > 2048) invalid();
  return input;
}
export function checkedPartyActor(input: PartyActor): PartyActor {
  if (!input || typeof input !== "object" || !["accountId", "hallId", "role"].every(key => Object.hasOwn(input, key))) throw new Error("Invalid trusted party actor");
  if (!["ADMIN", "WAREHOUSE", "SALESPERSON"].includes(input.role)) throw new Error("Invalid trusted party role");
  try { return Object.freeze({ accountId: entityId("account", input.accountId), hallId: input.hallId === null ? null : entityId("hall", input.hallId), role: input.role }); }
  catch { throw new Error("Invalid trusted party actor identity"); }
}
export function parsePartyCommand(input: unknown, actor: PartyActor, kind: PartyKind): PartyCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const action = (input as Record<string, unknown>).action;
  if (!["CREATE", "EDIT", "DISABLE", "RESTORE"].includes(action as string)) invalid();
  const keys = action === "CREATE" ? ["action", "requestKey", "name"] : action === "EDIT" ? ["action", "requestKey", "id", "expectedVersion", "name"] : ["action", "requestKey", "id", "expectedVersion"];
  const row = partyObject(input, keys); const requestKey = partyRequestKey(row.requestKey);
  if (action === "CREATE") return { kind, actor, action, requestKey, name: partyName(row.name) };
  if (typeof row.id !== "string" || typeof row.expectedVersion !== "number" || row.expectedVersion > 2147483647) invalid();
  const id = entityId(kind === "CUSTOMER" ? "customer" : "supplier", row.id); const expectedVersion = version(row.expectedVersion);
  if (action === "EDIT") return { kind, actor, action, requestKey, id, expectedVersion, name: partyName(row.name) };
  return { kind, actor, action: action as "DISABLE" | "RESTORE", requestKey, id, expectedVersion };
}
export function parsePartySearch(input: unknown, candidates: boolean, wire = false): PartySearch {
  // Fastify fast-querystring uses its own empty prototype; copy only own query keys.
  const candidate = wire && input && typeof input === "object" && !Array.isArray(input) ? { ...input } : input;
  const row = partyObject(candidate, candidates ? ["search", "page", "pageSize"] : ["search", "enabled", "page", "pageSize"]);
  if (typeof row.search !== "string" || row.search.length > 200 || row.search.includes("\0")) invalid();
  const number = (value: unknown): number => {
    if (wire) { if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) invalid(); value = Number(value); }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid(); return value;
  };
  const page = number(row.page); const pageSize = number(row.pageSize);
  if (![20, 50, 100].includes(pageSize) || !Number.isSafeInteger((page - 1) * pageSize)) invalid();
  const enabled = candidates ? "ENABLED" : row.enabled;
  if (enabled !== "ALL" && enabled !== "ENABLED" && enabled !== "DISABLED") invalid();
  return { search: row.search, page, pageSize: pageSize as PartySearch["pageSize"], enabled };
}
export function assertAllocatedPartyCode(input: unknown): asserts input is string {
  requireDomain(typeof input === "string" && input.trim().length > 0 && !input.includes("\0"), "INVALID_ALLOCATED_CODE", "Trusted allocator must return a nonempty exact code");
}
