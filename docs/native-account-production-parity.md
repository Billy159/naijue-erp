# Native account eligibility, recommendations and original method identity

Source-only amendment to the current rewrite. User explicitly requested the verified
running production behavior and approved one missing settlement method-ID snapshot.
No actual intake data, live database, production migration or write host was used.

## Verified rule and clean input contract

Production app image: `20eea9b7258e90078cb24ed89abde93e9e4253416d7304073ae8cb18c35cb77f`.
Web image: `aa52934534a4d083988010753998efa32d7cd1c0856993b213ca5440e50ef02f`.
Frontend release: `637643643ca73c23baeb3cf7e60b3e8b074986c3e973bd126b7d4cb4a6f425d8`.
Parent supplied inspected running source, not a guess from historical data.

All enabled accounts belonging to the enabled selected method remain eligible
across halls. The current paymentAccount query REQUIRES canonical paymentMethodId;
other picker kinds reject it. Missing/invalid intent fails before connecting. There
is no all-method fallback and hall recommendation is never payment authorization.
The existing account/staff/hall identity and mandatory explicit form grant still
fail closed. SALESPERSON may request only the existing authorized own sales hall;
that does not make payment-account eligibility hall-owned.

Runtime settlement command/read contracts now contain a required paymentMethodId
property. Stored historical unknown is null; SAVE requires an explicit canonical
non-null ID. Runtime SAVE and APPROVE compare that intended ID to the actual
payment-account primary method under original-transaction SHARE locks, with both
account/method enabled. A row selected as M1/A cannot silently become M2/A because
A changed method between form lookup and first save. Runtime unchanged rows are
not the production import-only exemption. Method rename without ID change is fine.
No name matching, hidden map, current-account inference or request fallback exists.

## Approved single storage delta and writer

0010 adds only nullable `sales_settlement.payment_method_id_snapshot uuid` with
existing payment_method FK. Existing values remain unknown NULL; no backfill,
default, extra table or audit-JSON authority is added. Exact1–9 registry prefix is
required. First-install order is all1–10 migrations before products/settlements;
0009 separately requires an empty product table and explicit nine-price fixtures.
All current sales UoW transactions require schema10 before running their callback.
There is one clean writer, no old-schema production switch.

The existing INSERT SELECT captures actual pm.id in the original transaction only
when pm.id equals the explicit intended ID. For the same settlement ID and same
account, a preserved known or NULL original snapshot cannot be overwritten by
claiming a new method. Amount/direction edits preserve original name/ID snapshots;
a genuinely new settlement or changed account captures the actual matching pair.
Sparse equality/audit evidence includes method identity. Unknown runtime SAVE or
APPROVE fails; status-only UNAPPROVE/VOID may leave an unchanged unknown row intact
without guessing or rewriting its settlement. The CUTOFF_HISTORY command guard
and the existing historical posting prohibition are unchanged.

Safe method conflicts are SETTLEMENT_METHOD_MISMATCH and
IMMUTABLE_SETTLEMENT_METHOD (HTTP409). No private SQL/provider diagnostic is exposed.

## Recommendation parity and current-active mapping

One most-recent qualifying account per selected method is OR-unioned with all
accounts whose preserved valid source-hall relation includes the requested hall.
They share one recommended boolean bucket. Within both buckets the original base
account-ID order is retained, not name order and not account-by-account time rank.
Canonical native UUID order is the stable ID sequence; no label or new priority
business field is stored. No editable applicable-hall field/UI is introduced.

The original production SALE document_type denotes the whole sales family.
Native sales_header therefore includes SALE, RETURN and EXCHANGE without a new
business_type='SALE' filter. Native DATE business_date is the preserved business-day
fact; it is not a display timestamp. Recency order is business_date DESC NULLS LAST,
updated_at DESC, header ID DESC, then original settlement line_no ASC. Current enabled
account/method pairs and preserved original method ID must match before selecting
the first record, so a disabled/reassigned/unknown newer record cannot hide an
older qualifying record.

Native APPROVED status alone does NOT prove production current_effect_active.
Existing receipt/effect guards do not establish complete active coverage for every
possible approved header. One set-based SQL proof over bounded ordered documents
therefore requires exact current-line coverage by unreversed APPROVE ledger rows:
version, line identity, SKU, warehouse, business date, signed inverse quantity and
sales endpoint must all match, with no missing, duplicate or extra active effects.
The proof is computed once per candidate set, not once per account/page row.

Technical window:51 candidate headers detect overflow; at most50 enter proof,
2,000 lines/document and100,001-row sentinel windows stay inside SQL. Only one row
containing bounded account ID/status comes back, never all ledger/history rows.
If no recent is proven and older candidates exceed the window, or proof rows
exceed bounds, result degrades UNAVAILABLE. A proven newest qualifying result within
the ordered window is safe even if irrelevant older candidates exist.

CUTOFF_HISTORY has no implemented trustworthy current-active contribution proof
here. It is excluded from recent-use recommendations even when an original method
ID is known. Old unknown method IDs also cannot qualify. This is an explicit
history recommendation gap, NOT complete historical production parity and NOT an
eligibility/permission restriction. AVAILABLE metadata means runtime/source-hall
hints were read successfully, not that this history gap disappeared. A controlled
original-record import and valid active-contribution proof are still required.

## Optional hints never remove eligible accounts

Pure eligible count is authoritative outside the optional savepoint. The reader
uses a trusted configurable recommendation statement timeout: default250ms,
integer1–1000ms maximum. It does not extend an already tighter statement_timeout.
The setting is SET LOCAL only, restored before successful savepoint release.
No persistent server setting changes.

Recent proof and hint-ordered page use that same snapshot/savepoint. Timeout,
overflow, missing optional SQL/permission, or recommendation failure rolls back to
the savepoint, restoring the old setting, then reads the same globally eligible
accounts in ID order. Metadata is UNAVAILABLE, never a successful empty proof.
Recovery failure fails the whole read; aborted requests stay aborted. Core
identity/grant/selected-method/enabled/count/decoded identity failures never become
a permissive fallback or fake success. No raw diagnostics are returned.

## Verification and limits

Current focused evidence:281 passing synthetic/unit/scripted-pg/Fastify-inject tests
plus strict focused TypeScript. Coverage includes required method intent, no
connection on invalid query, global eligibility, SQL bounds/order/active-proof
predicates, timeout restoration/degradation/cancellation, same-client recovery,
new-row reassignment race, retained/runtime reassignment rejection, immutable
original identity, NULL readback/status-only preservation, sparse audit and safe
conflict responses. Exact commands and owned hashes are in
`evidence/account-production-parity/manifest.json`.

These do NOT execute PostgreSQL SQL/locks/savepoints/timeout behavior or measure
latency. The separately owned current1–10 genuine-PG harness is source preparation,
not a completed run. Full engine/current-active/order/concurrency acceptance and a
real catalogue completeness publisher/writehost remain outstanding. Previous1–8
artifacts and old test logs remain historical, not relabelled current acceptance.
No frontend/domain permissions, fake balances, private input, actual data reads,
credential changes, installations, production migrations or operations occurred.
