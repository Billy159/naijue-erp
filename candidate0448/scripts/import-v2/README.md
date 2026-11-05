# Read-only v2 intake slice

Run on Node 24 from the repository root:

```
node --test tests/import-v2.test.ts scripts/import-v2/preflight.test.mjs
node scripts/import-v2/run.mjs /absolute/path/to/private-bundle
```

No database driver, network, SQL, filesystem writes, dependency install or native import is invoked. stdout is a deterministic aggregate JSON report; errors omit source values/paths. Keep real input and reports outside Git. Tests create/remove only synthetic temporary fixtures. The runner does not authenticate an untrusted manifest: it proves internal hash consistency, explicitly not external approval.

Implemented: bounded streaming SHA256 and fatal UTF-8 decoding; relative regular-file paths with symlink rejection; exact ordered 18 business CSV headers against source-controlled schema-only contract; CSV quoting/newlines/chunk boundaries; literal strings including leading zeros/formula-looking text; blank-is-unknown; exact integer/cent arithmetic without rounding; source identity uniqueness; explicit business references; line identities; unique barcodes with tagged product/SKU targets (SKU rows also carry a product owner, which must agree); many old SKU identities per canonical coordinate; stock contributor target/alias agreement; signed sums and contributor counts per baseline; unit-set preservation and warehouse/unit and warehouse/product reconciliation. Limits: 1,024 files, 512 MiB/file, 2 GiB bundle, 1 million aggregate parsed data records, 128 columns, 65,536 characters/field, 4 million references. Schema metadata is bounded to 4 MiB. Hashes are checked again while parsing each input. Use a stable operator-owned local bundle; this is not a hostile concurrent filesystem sandbox.

Required-but-empty fields are counted by entity/column, retained as unknown, and set `wireRequiredFieldsValid=false`; never filled with fabricated defaults. A successful process exit means a report was produced, **not** that input is importable or all semantic checks passed. Inspect report gates. Missing business references are counted by source column/target entity and set `referenceTargetsValid=false`; raw identities are never repaired or exposed in the aggregate report. Structural/integrity/alias/conservation failures abort with nonzero exit. Every report has `importReady=false` and `noSql=true`.

Pure money-overlay primitives require exactly 32 independently trusted full identities `(file SHA256, sheet, row, source ID, field, raw value, exact approved cent value)` and reject extra, duplicate, missing or changed cells. Synthetic tests alter every identity component. The runner never applies or changes an overlay. With the explicit verification option below, it authenticates the approved artifact digest and joins original cells to canonical amounts; without that option original-cell verification remains NOT RUN. Canonical money strings must already be exact cents; no tolerance-based/global rounding exists.

All nonempty DATE/DATETIME cells remain raw and policy-required; no Excel serial interpretation, precision truncation, timezone or current-time fill. Schema defaults are not inferred. The report lists missing original-cell money linkage, date policy, dictionary/enum validation, creator-hall provenance authentication, native schema adapter, DB transaction/idempotency/read-back/restore/publication. Hash validation covers these evidence files but is not their semantic validation. This slice neither authorizes a barcode schema change nor replays historical stock.

This is **not** an import plan/payload generator, migration, catalogue loader or DB rehearsal. Aggregate warehouse counts are observed rather than hard-coded; acceptance of a specific 53-warehouse delivery requires comparing its expected counts and signed totals externally. No user rows, identities, source hashes or private fixture data belong in this directory.

The supplied generic schema still marks barcode SKU as required, while explicit PRODUCT scope intentionally has no SKU. The report distinguishes `wireRequiredFieldsValid=false` / the required-field count from `semanticBarcodeBindingsValid=true` and PRODUCT/SKU counts. This is a **conditional adapter/contract mismatch, not data loss or a cleaning error**. PRODUCT must stay PRODUCT; the adapter never selects or fabricates a SKU to satisfy an inherited required marker. Input schema and CSV are not changed.

`dictionaries/historical-customers.json` is hash-checked and structurally validated. Its exact text `sourceKey` may resolve a missing current-catalogue customer **only for historical SALES_HEADER customer references**, with `enabled=false`, `historicalOnly=true`, `visibleInCurrentCustomerList=false`. It is never promoted to an active customer or used for hall defaults. Duplicate/invalid supplement entries fail closed. Original actor identifiers are retained as evidence, not guessed staff/account FKs. Other dictionary domains remain unimplemented as reported.

The all-warehouse audit is checked against **every catalogue warehouse**, including zero-contributor warehouses (sum zero, no invented baseline rows). `stock.warehouses` and `warehouseAuditCoverage` describe the full catalogue; `warehousesWithContributors` is intentionally separate. Signed warehouse, warehouse/product and warehouse/unit sums all use BigInt. No unit conversion or semantic compatibility of mixed-unit groups is inferred. The CLI supports running with `node --max-old-space-size=768`; reference indexes aggregate repeated target identities instead of retaining one object per reference.

Historical financial differences are not balanced, recalculated, rounded or repaired by this slice. Exact-cent parsing is only a lexical/range check of the normalized CSV; it is not original-cell money approval verification or financial reconciliation. The original immutable bundle remains the evidence source, and this runner does not emit a native write payload.

## Optional original-money provenance verification

```
node --max-old-space-size=768 scripts/import-v2/run.mjs /absolute/path/to/private-bundle --approved-money-overlay-sha256=INDEPENDENT_APPROVED_HASH
```

Supply the digest from the separately approved artifact, **not** by reading the same untrusted manifest and treating its assertion as approval. No private digest or source identities are embedded in the repository. Missing this option leaves the original-money gate explicitly missing; providing a wrong pin fails closed. The artifact's actual bytes are checked against the pin through the streaming manifest-hash reader before its 32 entries are used.

The verifier releases the core indexes, indexes only canonical money fields, then streams `snapshots/all-business-source-rows.jsonl` with 4 MiB/line and one-million-row limits. All money-bearing source rows must match exactly one canonical row; source entity/ID, embedded source ID and original-file SHA catalogue must agree. Every approved change additionally matches file, sheet, row, field, exact raw value, exact approved normalized value and document identity. Each of the 32 approved cells must be consumed exactly once. Every other money cell must be byte-for-byte unchanged, including empty/unknown and lexical representation; numeric values never pass through Number/float. Unknown, additional, duplicate or missing original money rows fail closed. No tolerance authorizes any other rewrite.

This is verification of the sealed snapshots against the normalized CSVs, **not** re-reading original XLSX bytes or authenticating the whole manifest externally. It does not recompute financial balances, settlement directions or currency policy. `historicalAmountsRebalanced=false` describes the no-repair verification operation; it is not a new assertion that historical financial discrepancies disappeared. Creator-hall provenance remains a separate missing gate.

## Optional creator-hall source/rule verification

Add `--verify-creator-hall` (alone or alongside the independent money pin). This is a separate **source-and-rules** check, not a claim that the overlay authenticates itself. It indexes canonical hall/staff IDs and historical headers, verifies every overlay identity/coordinate/person/document, and recomputes only the approved rule: sales salesperson or transfer original creator → exact employee identity → that employee's hall. An absent/unmatched person or employee with no hall remains UNKNOWN. A warehouse is never a fallback input. Canonical hall, provenance and reason must match the decision exactly; comparison descriptors must agree with uploaded-original versus candidate hall.

A sequential streaming snapshot pass checks all header original positions, original creator-hall values and person IDs, plus every current employee hall against its own source row and source-file SHA catalogue. Missing/duplicate headers or staff source rows fail closed. All source evidence stays untouched, and the audit's original values and canonical reasons remain available. Derived hall context never becomes access-control authorization.

The result is deliberately `SOURCE_AND_RULES_VERIFIED`, not fully authenticated native data: `rawCreatorDisplay` and the original people's support-row pointers remain preserved/hash-covered but are **not semantically re-derived from the original support workbook**. The report keeps this limitation and external artifact authentication missing. This check neither overwrites source values nor authorizes a schema or permission change.

## Explicit approved v3 barcode exclusion selection

```
node --max-old-space-size=768 scripts/import-v2/run.mjs /absolute/path/to/base-v2 \
  --v3-amendment=/absolute/path/to/immutable-amendment \
  --v3-approval=/absolute/path/to/separately-trusted-approval.json
```

Both flags are required together; an approval inside the amendment is rejected. The operator supplies a separately trusted approval, not a bundle's self-asserted authorization. Its bytes must equal the packaged decision and bind the selection, base manifest, base barcode CSV, effective CSV, exclusion evidence and sorted exclusion-ID set. The base archive digest is cross-bound but the archive itself is **not rehashed**. Selected data and base manifest are externally bound; other amendment audit assertions are not thereby independently authenticated.

This narrowly supported decision excludes exactly 2,958 PRODUCT-bound barcode rows and selects exactly 15,018 remaining SKU-bound rows. The exclusion IDs must equal the original supplement's `productLevelBarcodes` source keys, whose sealed snapshot SHA must equal the original-input SHA catalogue. Every excluded original field and every retained effective field must be unchanged. Missing/extra/duplicate/non-PRODUCT exclusions, unknown/reintroduced target rows, changed raw fields and base-hash mismatches fail closed. The exact 18-entry selection replaces—not appends to—the BARCODE input; the other 17 entity paths, hashes and counts must match v2. Every amendment payload's byte count/hash and manifest seal are verified.

The effective report has only SKU-bound barcodes; the old generic required-SKU conflict is retained under `sourceV2BarcodeEvidence`, not misreported as an effective-input defect. Direct v2 invocation is unchanged. Exclusions, raw snapshots, audits and the replaced v2 barcode CSV are **evidence only, not import targets**, including not being generic source-row targets. Historical barcode snapshot text, products, SKU aliases, stock and historical amounts are untouched. No PRODUCT barcode native structure is required by this selection. This runner still emits only a report, never a target payload, SQL or DB write, and `importReady` remains false. Money/creator options can be combined with both v3 flags; source raw snapshots remain verification evidence, not the effective barcode target input.
