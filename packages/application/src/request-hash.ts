import { createHash } from "node:crypto";
import { requireDomain } from "../../domain/src/errors.ts";

/** Deterministic typed encoding: property order is irrelevant, array/line order and bigint/string types remain distinct. */
export function requestHash(value: unknown): string {
  const seen = new Set<object>();
  function encode(item: unknown): string {
    if (item === null) return "null;";
    if (typeof item === "string") return "s" + JSON.stringify(item);
    if (typeof item === "bigint") return "i" + item.toString() + ";";
    if (typeof item === "boolean") return item ? "true;" : "false;";
    if (typeof item === "number") {
      requireDomain(Number.isSafeInteger(item), "INVALID_REQUEST", "Request numbers must be safe integers");
      return "n" + item.toString() + ";";
    }
    requireDomain(typeof item === "object" && !seen.has(item), "INVALID_REQUEST", "Unsupported or cyclic request value");
    seen.add(item);
    let result: string;
    if (Array.isArray(item)) result = "[" + item.map(encode).join(",") + "]";
    else {
      requireDomain(Object.getPrototypeOf(item) === Object.prototype, "INVALID_REQUEST", "Only plain request objects are supported");
      const record = item as Record<string, unknown>;
      result = "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + encode(record[key])).join(",") + "}";
    }
    seen.delete(item);
    return result;
  }
  return createHash("sha256").update(encode(value)).digest("hex");
}
