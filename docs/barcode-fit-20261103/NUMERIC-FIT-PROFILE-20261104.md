# Explicit numeric-fit profile: offline repair and remaining engine checks

## Finding and correction

The archived `prepare-barcode-package04.mjs` changed the synthetic fit to `5` but retained the legacy declaration hash. Its `fit.jsonl:1 code FIELD_TYPE` and subsequent `REGISTRY_TARGET_ROW_MISSING` are the expected rejection of that package. The generic legacy fixture and its contract must not be widened.

A separate fixture now selects the existing numeric-fit declaration explicitly:

- Generator: `tests/fixtures/unified-import/numeric-fit-synthetic-package.mjs`.
- Regression: `tests/unified-import-numeric-fit-profile.test.mjs`.
- Legacy hash: `e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9`.
- Numeric-fit hash: `7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274`.
- Staff-departure successor, which also supports numeric fit: `9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a`.

This is a **fixture correction plus regression coverage**, not a runtime contract change. The existing metadata checker, preflight, plan binding, request compiler and SQL adapter already carry the explicit numeric profile. No original contract hash, production code, SQL routine or access pin was changed for this correction.

The new fixture changes only the synthetic fit/color examples and selected declaration. Existing registry IDs, manually provided barcode, exact inventory quantities, warehouse/hall assignments, source locators and decision reports remain unchanged. Historical fit `A` is still valid; it is never silently mapped to a digit. This fixture does not create the later barcode-generation example product.

## Reproduce offline

Run from the repository with a supported Node 24 runtime. The output directory must not exist. This writes a new synthetic package and opens no PostgreSQL connection:

```sh
node tests/fixtures/unified-import/numeric-fit-synthetic-package.mjs \
  --output /absolute/new-synthetic-numeric-fit-package
```

Use the printed `manifest_sha256` in the normal explicit `stream-preflight`/`stream-prepare` commands. Keep reports outside the input directory. The fixture does not authorize a target or supply credentials.

```sh
node --test tests/unified-import-numeric-fit-profile.test.mjs
```

## Verified offline

- Legacy declaration rejects numeric `5` and continues to accept historical `A`.
- Numeric declaration accepts `3,5,6,7,8,9,A,Z` and rejects `0,1,2,4,05,a,AA` and empty input. Both whole-package validation and streaming preflight agree.
- Numeric and staff-departure profiles preserve the same declaration in manifest, preflight summary, plan binding and initialization request.
- Ordinary streaming requests match the complete whole-package compiler byte-for-byte as JavaScript objects. Repeated preparation produces identical plan and operation bindings; changed profile changes those bindings.
- Coalesced requests retain the declared profile and exact fit fields. Changed summary profile and unknown declaration are rejected.
- A mock SQL transport receives the exact initialization profile and fit row. This is not database execution.
- Source inspection finds all three declaration hashes in the SQL allowlist, and the install renderer orders the numeric-fit constraint successor before the whole-package kernel. This is not an installed-catalog or engine assertion.
- Pure 2026 generation with product segment `2026001`, fit `5`, color `001`, and size `900` returns `552026001001900` without rewriting the existing manual barcode. Pure generation with fit `A` rejects rather than inferring a mapping.

## Still required on a separately authorized new empty synthetic target

No PostgreSQL instance, Mac, browser or production system was used for this correction. The following are **NOT RUN**, and ISSUE-01 remains open until their results are recorded:

1. Verify the source snapshot, fresh target identity, installed numeric-fit successor, whole-package kernel and access/catalog evidence.
2. Import and publish the explicit numeric-fit package in the normal single-transaction path. Confirm stored fit `5`, unchanged manual barcode, exact zero/known/unknown semantics, and the original hall/warehouse ownership.
3. Perform an exact rerun and verify no duplicate writes. Test a materially changed request/plan against that same published identity and verify a conflict without additional changes. Matching offline request keys are not proof of engine replay behavior.
4. Through the real application, create the separately scoped synthetic 2026 product with segment `2026001`, generate and bind its `552026001001900` barcode, then scan that exact value and verify the intended SKU. Confirm historical `A` and manually supplied barcodes remain unchanged and unknown stock is not rendered as zero.
5. Record command logs, target/source identity, screenshots and cleanup/stop evidence. Do not reuse a forbidden prior target, edit real-source mapping or deploy this fixture to production.

The SQL source allows recognized schema hashes and uses the installed numeric-fit table constraint. This offline report does not assert independent profile-sensitive SQL rejection for an intentionally forged legacy initialization followed by a numeric fit row; that lower-level negative case has not been executed.
