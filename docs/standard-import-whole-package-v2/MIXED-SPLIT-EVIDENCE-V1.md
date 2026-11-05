# Mixed-sales split declaration verifier V1

## Scope and status

`tools/unified-import/mixed-split-evidence.mjs` implements a standalone, pure,
bounded successor **declaration verifier**. It performs no file, database,
network, account, permission, import or publication actions. Existing receiving
contracts, hashes, SQL and command entrypoints are unchanged.

This is not yet an importable sidecar contract. Streaming preparation, immutable
SQL proof storage/receipt binding and real database reconciliation must consume
and persist the same evidence before any production entrypoint may accept it as
split admission. The existing V1 report has a one-to-one count contract; do not
quietly replace its original counts with output counts in an actual import.

The isolated verifier checks a normalized output-package fixture with existing
V1 validators, then checks its *separate* original/output-count declaration. Its
success result always includes:

- `state: DECLARATION_CONSERVATION_VERIFIED`
- `source_truth_verified: false`
- `database_proof_verified: false`
- `import_admission_ready: false`

This verifies only explicitly listed split groups. Unlisted output rows retain
the existing 1:1 count convention; the verifier cannot discover that a caller
omitted a real original split or lied about the original source. Local cleaning
must separately compare the complete actual source inventory with these groups.

## Narrow supported transformation

One explicitly identified original mixed document becomes exactly one SALE and
one RETURN, both CUTOFF_HISTORY. The caller supplies every original line and
settlement's target ID. No line or settlement is divided. No return is inferred
from a negative sign. No discount, actor, date, price, payment direction, account,
unknown value or source identity is inferred.

- All original header scalar facts except original number and economic totals
  must equal both output headers. Original number remains in evidence; output
  numbers can differ.
- Every original line maps once to an output line. Every original settlement
  maps once to an output settlement. All scalar row facts except generated IDs,
  parent ID and target row ordinal remain exactly equal, including nulls and
  string representations. Original ordinal remains separately recorded.
- Every output child row belonging to the two headers must be accounted for.
  Target IDs, original source keys, and original file/sheet/row locators cannot
  be reused within the same entity type, including across declared groups.
- A line's known allocated discount is required. Missing allocation evidence
  rejects; V1 does not invent proportional or absolute-quantity shares.
- Existing normal receiving validators still enforce each output's quantity,
  price, totals, allocations, statuses, permissions-independent references and
  settlement consistency. They do not establish original truth.

If original evidence is insufficient, leave the source item unresolved rather
than creating a fabricated declaration. Split-a-line, distributed-settlement,
multiple-SALE or multiple-RETURN variants need a later reviewed profile.

## Exact input shape

Input is strict JSON text, at most 16 MiB, with duplicate keys rejected. The
version is `MIXED_SALES_SPLIT_EVIDENCE_V1`. Top-level fields:

- `format_version`
- `output_manifest_sha256`: SHA-256 of UTF-8 `JSON.stringify(outputPackage.manifest)`
  with no appended newline. Existing package validation first checks manifest
  pins against the records/artifact bytes. This encoding is exact and is not a
  claim of canonical JSON equivalence under reordering.
- `original_counts`, `output_counts`: each has exactly `sales_header`,
  `sales_line`, `sales_settlement`, with safe nonnegative integer counts.
- `groups`: 1–10,000 groups. Each has exactly `group_key`, `original_header`,
  `output_header_ids`, `lines`, `settlements`.

An original header has exactly `source_key`, `source_refs`, `fields`. Every
original line/settlement additionally has `original_line_no` and `output_id`.
`fields` has the exact closed key list exported as `mixedSplitFactKeys`. Each
source locator is `{file_sha256, sheet, row}`, refers to a package-pinned original
source file and must be retained by the exact mapped output record. A hash is a
locator/binding, not evidence that the cleaned values were read correctly.

## Conservation checks

All totals use BigInt minor units, never floating point. Quantities and all row
facts are preserved one-for-one. Source line amounts sum to original gross;
known line allocations sum to original discount; gross minus discount equals
original net. The two output headers' gross, discount and net sum exactly to
those original totals. For APPROVED original documents, every RECEIVE minus
REFUND amount must equal original net. DRAFT/VOID do not gain a fabricated paid
balance requirement; their individual output rules remain enforced.

For each affected table:

    original_count = output_count - mapped_output_count + declared_original_count

The header mapping makes one source header and two outputs explicit. Lines and
settlements in this profile remain one-for-one. The full evidence text hash and
output-manifest hash are returned so downstream reviewed storage can bind the
exact declaration. Neither hash independently authenticates source truth.

## Synthetic verification and remaining work

Tests: `tests/historical-mixed-split-evidence.test.ts` with the shared explicit
synthetic fixture in `tests/fixtures/unified-import/mixed-split-synthetic.ts`.
Run under Node 24.21.0:

    node --test tests/historical-mixed-split-evidence-multigroup.test.mjs tests/historical-mixed-split-evidence.test.ts tests/historical-mixed-split-intake.test.ts tests/historical-signed-sale-intake.test.ts tests/unified-import-package.test.ts

Coverage includes original/output count differences, missing/duplicate rows,
source locator identity, account/direction/unknown fact changes, exact penny
mismatches beyond Number-safe integers and the previously accepted balanced
output mutation. No PostgreSQL, browser, typecheck, real data or performance
acceptance was performed by this slice.

Before runtime integration: finalize the versioned package report representation
without changing old V1 meaning; require evidence for every transformed group;
stream the same checks; persist immutable evidence and exact package binding in
the existing controlled import transaction; and verify the stored groups on
readback, replay, rollback and post-cutoff inventory behavior.

## Review checkpoint — 2026-11-04 03:10 UTC

Independent review found original identity text needed stronger rejection. The
verifier now rejects blank, malformed Unicode and control-character text in
original numbers, group/source keys and sheet locators. V1 fact arrays are fixed
and frozen; a receiving-schema key change rejects pending a reviewed successor.

Six retained multi-group tests were added from the independent probes. The .mjs suite is explicitly named above because the root npm test glob does not discover it. The combined command above passed **135/135**. Review also independently probed
38 retained scalar fact/NULL mutations and two-group omission, cross-group line
mapping and reused payment-source locators. Initial fixture-testing failure from
attempting to extend the already frozen receiving schema is retained in the
external review logs; the final test checks a separate synthetic successor
schema instead. No original schema was mutated.
