/** Pure target validation only. Importing this module never reads env, creates a pool or connects. */
export const DISPOSABLE_DATABASE_APPROVAL = "I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE";
export interface IntegrationSettings {
  readonly host: "127.0.0.1" | "::1";
  readonly port: number;
  readonly database: string;
  readonly user: "naijue_erp_test";
  readonly password: string;
}
type Environment = Readonly<Record<string, string | undefined>>;
function fail(reason: string): never { throw new Error(`PostgreSQL integration refused: ${reason}`); }

/** Intentionally ignores DATABASE_URL, PG* fallbacks and all .env files. Never include the URL in errors. */
export function integrationSettings(env: Environment, requireRunner = false): IntegrationSettings {
  if (env.NODE_ENV !== "test") fail("NODE_ENV must be exactly test");
  if (env.NAIJUE_PG_INTEGRATION !== DISPOSABLE_DATABASE_APPROVAL) fail("explicit disposable-database approval is missing");
  if (requireRunner && !/^[a-f0-9]{64}$/.test(env.NAIJUE_PG_RUNNER_MARKER ?? "")) fail("use scripts/run-postgres-integration.mjs --run");
  const raw = env.NAIJUE_PG_TEST_DATABASE_URL;
  if (!raw || raw !== raw.trim()) fail("supply the dedicated test URL, without surrounding whitespace");
  let url: URL;
  try { url = new URL(raw); } catch { return fail("the dedicated test URL is invalid"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) fail("only PostgreSQL URLs are allowed");
  if (url.search || url.hash) fail("URL options, socket overrides and fragments are not allowed");
  // Resolve localhost ourselves to loopback. Do not trust DNS, multi-host strings, tunnels or PGHOST.
  const hostname = url.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname)) fail("the target must be literal loopback or localhost");
  if (!/^\d{1,5}$/.test(url.port) || Number(url.port) < 1024 || Number(url.port) > 65535) fail("an explicit unprivileged local TCP port is required");
  let user: string; let password: string; let database: string;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); database = decodeURIComponent(url.pathname.slice(1)); }
  catch { return fail("the test URL contains invalid encoding"); }
  if (user !== "naijue_erp_test") fail("use the dedicated non-admin naijue_erp_test database role");
  if (!password || /[\u0000-\u001f\u007f]/u.test(password)) fail("a nonempty disposable-role password is required; ambient credentials are not used");
  if (!/^naijue_erp_test_[a-f0-9]{8,32}$/.test(database)) fail("the database must be naijue_erp_test_ followed by 8–32 lowercase hex characters");
  if (env.NAIJUE_PG_EXPECT_DATABASE !== database) fail("repeat the exact disposable database name in NAIJUE_PG_EXPECT_DATABASE");
  return Object.freeze({ host: hostname === "[::1]" ? "::1" : "127.0.0.1", port: Number(url.port), database, user: "naijue_erp_test", password });
}

/** Safe to show in diagnostics. In particular, this deliberately has no password or connection URL. */
export function safeTarget(settings: IntegrationSettings): string {
  return `${settings.host === "::1" ? "[::1]" : settings.host}:${settings.port}/${settings.database}`;
}

/** Acceptance scenario, not a storage mode. Only current schema 1–10 runs exist. Each invocation needs a fresh approved target. */
export type IntegrationSuite = "sparse-0001-0010" | "backend-0001-0010";
export function integrationSuite(env: Environment): IntegrationSuite {
  const value = env.NAIJUE_PG_TEST_SUITE;
  if (value !== "sparse-0001-0010" && value !== "backend-0001-0010")
    fail("explicit NAIJUE_PG_TEST_SUITE must be sparse-0001-0010 or backend-0001-0010; historical 1–5/1–8 names are not executable");
  return value;
}

/** Reject historical or unknown names before Pool construction. No compatibility writer flag is introduced. */
export function requireCurrentIntegrationSuite(suite: string): asserts suite is IntegrationSuite {
  if (suite !== "sparse-0001-0010" && suite !== "backend-0001-0010")
    fail("historical source only: current native writers require schema 1–10; select an explicit current suite on a fresh target");
}
