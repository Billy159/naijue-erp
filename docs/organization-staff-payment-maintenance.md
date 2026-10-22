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
