/** Reviewer-only guard for connection-free plan/pure assertion checks. Never engine evidence. */
import { registerHooks } from "node:module";

const blocked = new Set(["pg", "net", "tls", "dns", "dgram", "http", "https", "http2", "undici", "child_process"]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const plain = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
    if (blocked.has(plain) || plain.startsWith("pg/")) throw new Error(`Independent source-only guard blocked module: ${specifier}`);
    return nextResolve(specifier, context);
  }
});
const original = process.env;
process.env = new Proxy(original, {
  get(target, property, receiver) {
    if (typeof property === "string" && (/^PG/u.test(property) || /^NAIJUE_PG/u.test(property) || property === "DATABASE_URL")) {
      throw new Error(`Independent source-only guard blocked credential/target environment access: ${property}`);
    }
    return Reflect.get(target, property, receiver);
  }
});
