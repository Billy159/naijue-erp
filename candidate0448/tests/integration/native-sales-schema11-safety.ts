/** Pure gate; importing never constructs a Pool or opens credentials. */
import { integrationSettings } from "./safety.ts";
export const NATIVE_SALE_SCHEMA11_SUITE = "native-sale-published-source-0001-0011";
export function nativeSaleSchema11Settings(env: Readonly<Record<string, string | undefined>>, requireRunner = false) {
  if (env.NAIJUE_PG_TEST_SUITE !== NATIVE_SALE_SCHEMA11_SUITE)
    throw new Error("Native SALE schema11 refused: exact native-sale-published-source-0001-0011 suite required; no historical/schema10 result reuse");
  if (requireRunner && !/^[a-f0-9]{64}$/.test(env.NAIJUE_PG_RUNNER_MARKER ?? ""))
    throw new Error("Native SALE schema11 refused: use scripts/run-postgres-native-sales-schema11.mjs --run-native-sales-schema11");
  return integrationSettings(env, requireRunner);
}
