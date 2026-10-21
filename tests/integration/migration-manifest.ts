/** Reviewed immutable SQL bytes only. No pg import, environment lookup or connection. */
// Review this list explicitly when extending scope. Never glob migrations or pick up unreviewed 0009+.
export const MIGRATIONS = [
  [1, "0001_runtime_sales.sql", "7ebdaec27630149f20ad6aa67075c2c688a2ed40bcc4718c031987d9af3a5cbf"],
  [2, "0002_sales_pricing_facts.sql", "14136328eafaf6db8957959d595226a51d6036c5dd44c21e70830c0640b88c98"],
  [3, "0003_auth_sessions.sql", "5417cbf4fbca4737f8f842ef01ed4249be66b929bace1c2bb9f0f5a8f452bd29"],
  [4, "0004_transfer_runtime.sql", "7dc7c0b37fa03ef20b5a86f261b7d8a2185dd1d410caf57473d2661e6cce8f3e"],
  [5, "0005_product_read_fields.sql", "d10e6e8a96992fa0d233de30843ce1ac9751af59ea09e3fa8df9ff6cbf7ec42a"],
  [6, "0006_party_maintenance.sql", "13c82389abdc85856313da195a310fa74b1283140c0581b6696a48ffc85f3e6c"],
  [7, "0007_sparse_inventory_cutoff.sql", "ba99885d7c8cbb01e2a5cda6c6fce99a82c7c8691c26ba52c2137010430709e7"],
  [8, "0008_runtime_sparse_first_use.sql", "0988168c117517d8122564cecd41b66e9f34753b27e3b438cb53cbd3029d2262"]
] as const;

export const SPARSE_SCENARIOS = [
  "0006 independent party CREATE/EDIT/DISABLE/RESTORE, duplicate receipt, numbering, rollback and dependency guard",
  "0007 baseline COMMIT, native-only old trigger dispatch, exact import source/receipt/audit/balance and rollback",
  "IMPORT checkpoint unique index, server function shape and forced-index EXPLAIN without ANALYZE",
  "complete sparse publication, absent-is-zero versus missing coordinate, native scoped reader and candidates",
  "0008 first SALES and TRANSFER APPROVE/UNAPPROVE, repeated effects, duplicate replay and retained zeros",
  "two distinct documents really waiting on one absent inventory key, exact cumulative first-use outcome",
  "new sparse deferred corruption plus retained old transfer/reversal/source guards still reject"
] as const;

/** Additional current-schema backend scenarios, not a compatibility storage path or login/HTTP acceptance. */
export const BACKEND_SCENARIOS = [
  "disabled-account authentication STORAGE: committed session, rollback, account/session locks, sentinel hash version invalidation and revocation",
  "real schema rejects incoherent pricing intent, duplicate coordinate, invalid fit/image/numeric value and invalid session hash",
  "same sales document distinct-key SAVE version-CAS and insertion races: two real waits, one winner and one VERSION_CONFLICT",
  "same transfer document distinct-key SAVE version-CAS and insertion races: two real waits, one winner and one VERSION_CONFLICT",
  "signed independent RETURN/EXCHANGE native posting, settlement direction and linked inverse effects on current sparse scope",
  "native scoped sales list/detail/history/statistics, literal search, hidden scope and page beyond end",
  "native sales count/page share one real REPEATABLE READ snapshot across an intervening committed SAVE",
  "native product basics, exact three-SKU/two-size specifications and image METADATA only",
  "deferred transfer line-position uniqueness permits an actual two-line swap with sparse audit and no stock effect"
] as const;

/** Additional backend-suite preparation. Actual engine evidence requires a fresh guarded run; inject is not network/TLS acceptance. */
export const HTTP_READ_SCENARIOS = [
  "actual scrypt/auth service/PG store login: separate synthetic account, wrong password, secure cookie and current session",
  "authenticated native inventory matrix/candidates and bounded ledger keyset pages on published synthetic scope",
  "authenticated bounded sales/detail/history/statistics, transfer/detail and product reads with honest unavailable media",
  "explicit test-only scope exclusions and spoofed cookie/authorization/actor/origin rejection across native read plugins",
  "actual PG logout revocation blocks every read family; exact native business fixture snapshot unchanged and owned API pool closure"
] as const;

/** Separate genuine native-policy engine preparation, never a relabel of the explicit-test-policy scenarios above. */
export const NATIVE_POLICY_SCENARIOS = [
  "native profile plus canonical source-auth policy: actual A/B salesperson, ADMIN and WAREHOUSE logins with service-written multi-hall facts",
  "native current-hall sales scope versus genuine ADMIN/WAREHOUSE all scope over nonempty detail/history/references and approved sums",
  "native all-warehouse inventory/candidates/ledger includes actual other-hall disabled historical references; exact shared product targets",
  "canonical transfer scope hides actual B-only service draft from A; later unpublished warehouse correctly makes all-warehouse inventory NOT_READY",
  "current HTTP login/employment/role/hall fail closed and supplemental genuine-PG authorizers reject an explicitly stale captured hall",
  "native-role sessions revoke on logout, read-phase exact business snapshots stay unchanged and one owned API pool closes"
] as const;

/** Native transactional ACTION policy only; receipt inject explicitly uses test-only authentication. */
export const SALES_WRITE_AUTHORIZATION_SCENARIOS = [
  "native sales action matrix, preserved state/CAS, later-APPROVED original SAVE and GET-receipt via explicit TEST-ONLY AUTHENTICATION plus current disable recheck",
  "known-PID actual account/staff/hall metadata UPDATE waits while native command identity locks remain held through commit",
  "known-PID command waits for committed disable or ADMIN-to-SALESPERSON change and READ COMMITTED denies without business facts",
  "identity SELECT actually waits on staff before hall disable commits; separate current hall SELECT rejects without unauthorized business facts"
] as const;
