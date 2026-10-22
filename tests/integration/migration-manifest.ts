/** Exact reviewed CURRENT SQL bytes only. No pg import, environment lookup or connection. */
import { FROZEN_0001_0008_MIGRATIONS } from "./frozen-0001-0008-manifest.ts";
// Historical prefix is retained verbatim for evidence; current execution ALWAYS applies all ten migrations.
export const MIGRATIONS = [
  ...FROZEN_0001_0008_MIGRATIONS,
  [9, "0009_catalogue_prices_barcodes.sql", "bb12e54d7b4989d5b6fe608a9582f4c887980eb19be839f74005d54eb0ac530e"],
  [10, "0010_sales_settlement_method_snapshot.sql", "e7e80a1ddb24b4c6aa622aa7e0eff10b4e57670dc77ad148e7b99a27029acc1f"]
] as const;

/** Separate opt-in source manifest for a NEW fresh synthetic schema15 target.
 * Existing MIGRATIONS/suites and prior schema11 evidence remain unchanged.
 * Bytes/registry recognition are not migration authorization or engine PASS. */
export const NATIVE_IMPORT_SCHEMA15_MIGRATIONS = [
  ...MIGRATIONS,
  [11, "0011_history_storage.sql", "67d9cb6df4e46c6807330b7ed7dd22305a4d331b111b85275f900caaf5d14965"],
  [12, "0012_history_header_native_reference.sql", "4a42df55804be3f7fb41fca3230364f392ed4338e3a0a80934f7debe7a04b512"],
  [13, "0013_native_party_import.sql", "950f32f8b1298fadd5de4f45be5ec6dc4bc7783db501456c41778f52374f5d54"],
  [14, "0014_native_catalogue_import.sql", "5bc80dd2997c2accf6cc1e492e8db98dbb6dbb6be29034b8417f15d94f2f8022"],
  [15, "0015_native_import_record_accounting.sql", "0cadbcc3dbd76a1e3546e6db983adac7d2b129ad76fcb99eba43cfaf0068794a"],
] as const;


/** Separate history typed synthetic16 chain; exact schema15 suite is unchanged. */
export const HISTORY_TYPED_SCHEMA16_MIGRATIONS = [
  ...NATIVE_IMPORT_SCHEMA15_MIGRATIONS,
  [16, "0016_history_insert_dispatch.sql", "518fd6edcadb30f130061986c2074e61f2884a184a731269ab60c9f9afbb8620"],
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

/** Current10 method identity: actual native rules and same-transaction synthetic completeness proof. NOT RUN. */
export const METHOD_IDENTITY_SCENARIOS = [
  "native M1/A capture, same-ID rename preserves original method/account names, eligibility and immutable original-key replay",
  "account A changes M1→M2: stored original stays M1, runtime SAVE/APPROVE and forged same-row M2 reject with exact no-effect snapshots",
  "intentional new settlement/new account captures verified M2/B and valid runtime recent recommendation",
  "explicit stored-NULL negative fixture remains unknown across read/reversal, never inferred or eligible as a recent-method fact",
  "original-transaction FOR SHARE actually blocks non-key account method/account enabled/method enabled updates until COMMIT",
  "three actual metadata-change lock waits recheck committed facts, reject without key/effects, then explicit original-key recovery/replay"
] as const;

/** Independent fresh payment17 target; old15/16 suites retain exact meaning. */
export const NATIVE_PAYMENT_SCHEMA17_MIGRATIONS = [
  ...HISTORY_TYPED_SCHEMA16_MIGRATIONS,
  [17, "0017_native_payment_import.sql", "d999f9531d925cd320d0d42cf02e00fc6e21b4c010eedb4b90e5e26f1da9b874"],
] as const;

/** SQL-codec-only fresh18 preparation. Does not enable any application writer or publication. */
export const HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS = [
  ...NATIVE_PAYMENT_SCHEMA17_MIGRATIONS,
  [18, "0018_history_typed_publication.sql", "8cd5595ebfc360564928e456b05e74fa8540bd82bea09ce2e253e4240b9871da"],
] as const;

/** Independent fresh19 publication suite only. Prior exact18 STAGE evidence stays fixed. */
export const HISTORY_TYPED_PUBLICATION_SCHEMA19_MIGRATIONS = [
  ...HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS,
  [19, "0019_history_typed_publish_gate.sql", "d77d7a50d55fafde4a829817b805a7e295dd06c8c62afcc8363b38e1670ae99b"],
] as const;
