# B05 native settings API v1 — read slice

`organization-maintenance-ports.ts` defines the safe discriminated DTOs for HALL,
WAREHOUSE, STAFF, ACCOUNT, PAYMENT_METHOD and PAYMENT_ACCOUNT. This read module
collects B05 settings without merging employee/account identities or customer/supplier
tables. Existing store-settings/party read APIs are unchanged.

Register `createOrganizationMaintenanceReadHttpPlugin` with the trusted session
authenticator and `new PostgresOrganizationMaintenanceReadUnitOfWork(new
PostgresMaintenanceCommandUnitOfWork(sharedPool))`. The same D1 driver checks current
identity/role; STAFF/ACCOUNT require ADMIN. Other families allow ADMIN or WAREHOUSE.
No caller role, default identity or constructor-created pool is used.

| Family prefix | Native kind |
| --- | --- |
| `/organization/halls` | HALL |
| `/organization/warehouses` | WAREHOUSE |
| `/staff` | STAFF |
| `/accounts` | ACCOUNT |
| `/payment/methods` | PAYMENT_METHOD |
| `/payment/accounts` | PAYMENT_ACCOUNT |

For every prefix, POST `/query` requires exactly
`{search,status,hallId,page,pageSize}`: status is normal/disabled/all; hallId is
explicit null or a real UUID; pageSize is 20/50/100. PAYMENT_METHOD has no hall
dimension and requires hallId:null. POST `/detail/query` requires exactly `{id}`
and returns the real record or null. Query strings/extra fields are rejected.

STAFF additionally accepts the exact six-field body consisting of those five
fields plus `role`: `""`, `ADMIN`, `WAREHOUSE` or `SALESPERSON`, under
`rapid-launch-20261022/STAFF-ROLE-READ-FILTER-TECHNICAL-FREEZE-v1.json`.
The empty string means all original roles, including unrecognized historical
role text; other values match the stored `staff.role` exactly. The role predicate
is parameterized inside the same matched CTE used by count and page. It grants no
authority: the actual current ADMIN check still runs before native page SQL.
Legacy five-field STAFF queries, all other families, name-only search, employment
and hall filters, ordering, pagination and nullable account DTOs are unchanged.
Other families reject the added role field. `loginStatus` is not accepted: its
no-account classification remains pending, and this change advertises no login
filter or inference about effective login eligibility.

PAYMENT_ACCOUNT additionally accepts its own exact six-field body: the original
five fields plus `paymentMethodId`, either explicit null for all methods or the
canonical UUID of an existing method identity to match. The filter compares the
stored `payment_account.payment_method_id` in the same matched CTE before count
and pagination. A valid UUID with no matching accounts returns an empty page;
invalid UUID input is rejected. Existing account status, hall membership, name
search, stable ordering and the complete multi-hall response remain unchanged.
Method enablement is not an extra read filter; disabled historical method
references remain readable. Current ADMIN or WAREHOUSE authorization still runs
before the account count/page query. Other kinds reject `paymentMethodId`, and
it cannot be combined with the STAFF-only `role` field. Legacy five-field reads
and all response DTOs remain unchanged; no new tables, fields, indexes, grants or
write contracts are introduced.

Lists return `{kind,page,pageSize,total,items}`. Count and one page are from one
SQL statement. STAFF normal/disabled means the stored 在职/离职 state; ACCOUNT
normal/disabled means its stored loginEnabled flag. An enabled login flag does not
override employment status or role checks. Hall filtering for payment accounts
uses their real multi-hall relation, never a first-hall guess.

Warehouse belongs to one actual hall. Hall DTOs show actual default customer and
default warehouse references, including the warehouse's own hallId so an old
cross-hall anomaly is not silently corrected. STAFF contains its optional distinct
account metadata; ACCOUNT contains its distinct staff reference. Password hashes,
tokens and credentials are never selected by these queries or returned by the DTO.
PAYMENT_ACCOUNT retains its method and all actual hall references.

Only user_account has native creation/update timestamps. All other DTO timestamp
fields are explicitly null; import/read/action time is not substituted. Disabled
reference labels and unknown historical personnel values retain their source facts.

This slice registers no command/receipt route for the six families and does not
report simulated saves. B05 write/receipt contracts are delivered in subsequent
slices. Product and existing customer/supplier command endpoints remain separate.
All validation so far is source/Node/scripted-protocol/inject; real-engine/HTTPS
composition and production deployment are not established by these files.
