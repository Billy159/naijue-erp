# Whole-package FIT profile guard: offline candidate

Status: a narrow source candidate created **after the already delivered 10:45 complete ZIP**. It is not included in that ZIP, installed, deployed, or engine-validated. ISSUE-01 and PostgreSQL acceptance remain open. This report supplements, rather than replaces, `NUMERIC-FIT-PROFILE-20261104.md` and its historical verification boundary.

## Confirmed source gap

The whole-package INIT admits the retained legacy, numeric-fit, and staff-departure declarations. Before this candidate, its row validation did not restrict FIT by that declaration. Once the table-level numeric-fit successor was installed, a direct whole-package SQL request carrying a legacy declaration and FIT code `5` could reach native insertion without a profile-specific rejection. Application preflight already rejects that package. This is source analysis, not a demonstrated committed database exploit.

## Candidate change

Only the new `standard_whole_package_command_v2` body receives one FIT validation block:

- Read the declaration from the original initialization audit request, never from the chunk or its fields.
- Omitted or legacy declaration: exactly one uppercase ASCII letter, `^[A-Z]$`.
- Explicit numeric-fit or staff-departure declaration: exactly one uppercase ASCII letter or one of `3,5,6,7,8,9`, `^[A-Z356789]$`.
- Require JSON string input. Missing values, null, numbers, arrays, objects, empty and multi-character codes are rejected instead of being coerced, trimmed, padded, mapped, or rewritten.
- Use explicit `C` collation and fail-closed `IS DISTINCT FROM` checks.
- Validate while assembling the row list, before this command's receipt, audit, source-row writes and native record population. Both new and `EXISTING_VERIFIED` rows pass the same check.

The error is `WHOLE_FIT_SCHEMA_PROFILE_INVALID`, SQLSTATE `23514`. The original initialization allowlist still rejects unknown, malformed, and explicitly null declarations. Missing declarations retain the old letter-only compatibility path.

No table, constraint, routine signature, role, permission, trigger, legacy API, manual barcode, source mapping, or declaration hash is changed. No source fields are rewritten. Existing scalar, exact-row, receipt, actor, transaction, publication and deferred guards remain byte-identical.

The changed command body is pinned consistently in the access SQL and in both passes of the checked-in search-path hardening SQL. No other pin or permission text is changed.

- Prior command-body SHA-256: `30086edb37c34555f0833db665f62f77ccf72a5f7d0d785c22e35e9aa65411f3`.
- Candidate command-body SHA-256: `0d0547318a5a940639f288a73f08ebd9396b079b0c88810b7fa016870652d840`.

An existing installation is not upgraded by these source edits. Previously collected installed-catalog identities do not prove this candidate is installed and must not be relabeled or used to bypass exact catalog checks. This is not an in-place upgrade or rollback script.

## Offline evidence

`tests/whole-package-fit-profile-source.test.mjs` adds six source/contract checks. It proves that removing the new block restores the exact pre-change kernel file and function hashes, and replacing the new pins restores both exact pre-change pin files. It checks immutable INIT selection, placement before row preparation/native population, string/null handling, declared profile/pattern alignment, an ASCII and malformed-value predicate model, and generated hardening/catalog source agreement. The JavaScript predicate model does not execute PostgreSQL or validate PL/pgSQL semantics.

The focused run passed **68/68**, with zero skipped tests:

```sh
node --test tests/whole-package-fit-profile-source.test.mjs \
 tests/unified-import-numeric-fit-profile.test.mjs \
 tests/whole-package-kernel-source.test.mjs \
 tests/unified-whole-search-path.test.mjs \
 tests/unified-whole-catalog-gate.test.mjs \
 tests/unified-fresh27-sql-bundle.test.mjs \
 tests/fit-business-code-regression.test.ts \
 tests/whole-package-explicit-zero-source.test.ts
```

Independent read-only review found no concrete source defect and independently verified the body hash, unchanged predecessor code, source selection, null/type handling, guard placement, and all three coordinated pin occurrences.

Execution used Node `24.22.1`, not the repository's formal release-pinned Node `24.21.0`. These focused offline checks are not a clean-install or release-gate pass. No typecheck, build, real PostgreSQL connection/compilation, Mac, browser, production action, commit, push or deployment was performed.

## Required future engine cases, not run

On a separately authorized new empty isolated synthetic target with exact source, role and catalog identity, install and verify the candidate using the reviewed workflow. Do not reuse forbidden prior targets or alter old acceptance evidence.

1. Bypass application preflight and submit a valid original whole-package initialization with omitted declaration, then legacy declaration, followed by FIT string `5`. Require `WHOLE_FIT_SCHEMA_PROFILE_INVALID`; roll back and verify no committed prefix, receipt, audit or native row remains.
2. With each of those declarations, FIT `A` must still complete through ordinary full-package publication and deferred closure.
3. Under each explicit numeric-capable declaration, test `3,5,6,7,8,9,A,Z` through the real kernel and full closure. Preserve exact string, source identity, manual barcode and stock semantics.
4. Under every declaration, reject missing/null/JSON-number/bool/object/array codes, excluded digits `0,1,2,4`, multi-character `05`/`AA`, whitespace/newline suffixes, lowercase and non-ASCII lookalikes. Verify full rollback. Do not infer the PostgreSQL regex result from the JavaScript model.
5. Exercise both new and `EXISTING_VERIFIED` FIT paths where the setup lawfully permits them; the guard must precede existing-row acceptance as well as new insertion.
6. Keep unknown/null/non-string INIT declarations rejected. A chunk-supplied declaration must remain an invalid extra field and must not override INIT.
7. Verify exact replay, conflicting-plan rejection, observer invisibility, full deferred publication, original zero/known/unknown balances, and cleanup/stop evidence. Finish the separately scoped real product generation and scan checks already listed in the numeric-profile report.

The old per-chunk API was not changed or certified by this candidate. The whole-package installer already revokes its direct capability access. A different installation that intentionally exposes old entries alongside a widened table constraint needs a separate reviewed contract/entry-point assessment; these results do not claim to cover it.
