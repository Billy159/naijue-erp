# Independent customer and supplier maintenance

## Implemented boundary

Customer and supplier remain physically independent native tables from migration 0001. Each table has its own unique exact text code. Same code or name across the two tables is legal. There is no dual-role flag, subject merge, copy-by-name or combined maintenance endpoint.

The implementation adds:

- Create, atomically edit name and enabled status, disable and restore with native version compare-and-swap.
- Server-assigned new IDs/codes; no code input on create and no code field in edit.
- Original existing code and original nullable creation timestamp are preserved verbatim.
- Bounded independent name/code substring search and 20/50/100 pagination.
- Enabled-only minimal candidates for business selectors; disabled rows remain available through maintenance detail/list to authorized maintainers and existing historical FKs are not deleted.
- Explicit current server-session authentication adapter with origin/cookie ambiguity rejection. The source-derived maintenance policy permits ADMIN and WAREHOUSE; SALESPERSON can obtain business candidates but cannot maintain/list/detail/inspect receipts. Hosts must explicitly wire authentication and authorization. There are no default credentials or inferred client roles.
- Global authenticated-account/request-key idempotency using the existing sales/transfer advisory-lock namespace and operation_receipt uniqueness. Replays return the original result even after later changes, but reauthorize current access. Different content or another kind using that key conflicts.
- Native CUSTOMER/SUPPLIER receipt/audit provenance using real generated target FKs in the existing closed shared union. Audit contains changed name/enabled keys and native old/new versions only; initial creation includes initial code/name/enabled/version. It is not a full snapshot/version-reconstruction platform.
- Enabled hall default-customer dependency protection. The disable path locks the customer and checks enabled halls. A native hall assignment/enable trigger acquires a share lock on that same customer and requires it enabled, preventing a successful assignment/disable race. Disabled hall references do not block, matching the source dependency rule.
- Retained customer/supplier rows cannot be physically deleted. There is no DELETE endpoint. Existing sales/product/hall reference types are unchanged.

## HTTP contract

Register createPartyMaintenanceHttpPlugin with explicit dependencies and an authenticator such as createPartySessionAuthenticator. Registration creates no listener, database, accounts, credentials or data.

Two explicit families: /customers and /suppliers.

- POST /{family}/commands: action CREATE, requestKey and name.
- POST /{family}/commands: action EDIT, requestKey, id, expectedVersion, name and enabled (required boolean). This is one atomic form save, not rename followed by a status request.
- POST /{family}/commands: action DISABLE or RESTORE, requestKey, id and expectedVersion.
- GET /{family}?search=&enabled=ALL&page=1&pageSize=20. All four fields are required; enabled is ALL, ENABLED or DISABLED.
- GET /{family}/candidates?search=&page=1&pageSize=20. It cannot request disabled or all candidates.
- GET /{family}/{id} for authorized maintenance detail.
- GET /{family}/receipts/{requestKey} for the authenticated account's reauthorized original receipt.

EDIT accepts rename-only, state-only or combined changes while requiring both proposed fields. It advances version once and emits one receipt/audit. If both values are unchanged it returns NO_PARTY_CHANGE without writing. Any customer transition from enabled to disabled checks the enabled-hall default dependency before writing either field. DISABLE/RESTORE remain separate explicit API actions; they do not imply new UI row controls or a fallback multi-request form save.

Command and query key sets are exact. Unknown fields including code, usage, tags, actor and kind are rejected rather than stripped. Versions and page values must be canonical integers; duplicate query fields are rejected. Request keys are preserved exactly. POST bodies require application/json and have an 8192-byte bound. Errors do not echo authentication, policy, SQL or provider details. Responses are no-store.

## Approved independent KH/GYS allocation

The user explicitly approved new customer codes KH000001 onward and new supplier codes GYS000001 onward, independently increasing. Existing/imported original codes remain unchanged and generated codes remain read-only. This supersedes the Demo's merged V2-CP numbering.

Wire createApprovedPartyCodeAllocator() into PartyDependencies.codes. It delegates to the same native PostgreSQL transaction's reserveCustomerCode/reserveSupplierCode methods. Construction still requires explicit dependencies; there is no implicit database or test fallback.

0006 defines two independent bigint NO CYCLE sequences. Each reservation acquires its own kind-specific advisory transaction lock, reads the current sequence and the highest exact-prefix all-digit existing code in that same physical table, then advances beyond both. The existing-code query orders significant decimal digit strings by length and lexical value instead of numeric-casting imported text; only one highest row is returned. Existing disabled records count too. Large leading-zero suffixes are evaluated exactly without altering their stored code. Nonmatching prefixes, case or nonnumeric suffixes are untouched and do not control this scheme.

Six digits is minimum padding, not a 999999 business limit: KH999999 is followed by KH1000000. Signed bigint (9223372036854775807) is only the technical sequence storage boundary. Exhaustion fails explicitly with PARTY_CODE_EXHAUSTED before an unsafe reservation or native insert; it does not wrap, round, silently skip a conflicting maximum, or renumber originals.

The per-kind transaction lock stays held through native row/audit/receipt commit or rollback, so concurrent same-kind creates cannot select the same counter. Customer and supplier have separate counters/locks. Native inserts also acquire the matching lock, so explicit new-row writes cannot slip between the existing-code check and generated insert. The per-table UNIQUE(code) remains the final collision guard. A colliding original is rejected for resolution, never silently changed. This does not add or enable a legacy importer.

Reservations use native setval and do not roll back with the business transaction. Failed or rolled-back commands may therefore leave gaps. This is not gapless numbering. Exact successful request replay returns its recorded result and consumes no new number. The allocator never rewrites or scans a historical audit snapshot to derive current codes.

Test-only SYNTHETIC-* allocators remain explicit fixtures, not production wiring. Runtime database grants and authorized host plugin composition must be configured separately; no accounts or grants are created by this implementation.

## Persistence and verification limits

0006_party_maintenance.sql is additive source, extending existing 0001/0004 contracts. It has not been applied or connected to any database. No business seeds, legacy import, account creation, credential creation, server start, install, push or deployment occurred.

54 focused checks cover application lifecycle/rollback/replay/policies, synthetic non-listening HTTP/session handling, injected pg-protocol behavior and SQL-text contracts. These are not PostgreSQL-engine constraint, trigger, isolation or race evidence. An authorized disposable-engine test remains necessary before production use, alongside explicit approved allocator wiring, runtime grants and host route composition.

## Atomic edit evidence supersedes the narrower draft

The frozen Demo basic-settings-v2.jsx Fields implementation (lines 74–100) includes name and the edit-only enabled switch in one form. Its save handler (lines 164–167) clones the form and makes one M.save call. The earlier unreleased name-only EDIT restriction was an implementation choice, not a user business rule. It is replaced by the exact required name+enabled command above, without a name-only compatibility default.

Earlier maintenance/numbering reviews cover their then-frozen source and do not establish this amended edit contract or native audit transition. The new atomic-edit scope/evidence and source manifest supersede that narrower edit evidence; numbering and normalization policies are unchanged. Migration 0006 remains SQL source only and has not run. The separate real-PostgreSQL harness still pins migrations 0001–0005, so none of these checks constitutes 0006 engine evidence.
