# PostgreSQL adapter boundary

pg is pinned and available locally. No Pool/client is constructed, no database is contacted, no DDL/migration/seed/import is included, and no credentials are generated.

The SalesUnitOfWork port requires document CAS/locking, unique actor+request key, immutable ledger insertion, unique reversal target, canonical SKU/warehouse/customer references, unique line identities, and atomic commit of document/lines/settlements, balances, ledger, audit and receipt. A real adapter must enforce these in PostgreSQL and pass independent concurrent/fault/rollback tests before production claims.

Current negative inventory is legal. Missing coverage must not become zero. Historical cutoff inventory is a separate baseline: imported history is not reapproved/reposted. The selected baseline-aware historical edit effect is not implemented in this foundation, so that command branch fails closed rather than reversing a nonexistent original posting or duplicating a full effect.
