/** Reviewed immutable SQL bytes only. No pg import, environment lookup or connection. */
// Review this list explicitly when extending scope. Never glob migrations or pick up unreviewed 0009+.
export const MIGRATIONS = [
  [1, "0001_runtime_sales.sql", "7ebdaec27630149f20ad6aa67075c2c688a2ed40bcc4718c031987d9af3a5cbf"],
  [2, "0002_sales_pricing_facts.sql", "14136328eafaf6db8957959d595226a51d6036c5dd44c21e70830c0640b88c98"],
  [3, "0003_auth_sessions.sql", "5417cbf4fbca4737f8f842ef01ed4249be66b929bace1c2bb9f0f5a8f452bd29"],
  [4, "0004_transfer_runtime.sql", "a85dd812fdf561652433e6fc2da49024f95db1137e52b84170470ec5f937224d"],
  [5, "0005_product_read_fields.sql", "d10e6e8a96992fa0d233de30843ce1ac9751af59ea09e3fa8df9ff6cbf7ec42a"],
  [6, "0006_party_maintenance.sql", "13c82389abdc85856313da195a310fa74b1283140c0581b6696a48ffc85f3e6c"],
  [7, "0007_sparse_inventory_cutoff.sql", "ba99885d7c8cbb01e2a5cda6c6fce99a82c7c8691c26ba52c2137010430709e7"],
  [8, "0008_runtime_sparse_first_use.sql", "4ad006940ddf408a01d319941ce7eba80abefb571788beeb1e8c7edcf60f5765"]
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
