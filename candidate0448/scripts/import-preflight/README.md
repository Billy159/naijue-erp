# Offline XLSX intake preflight (operator/developer tool)

This first slice reads cleaned `.xlsx` files directly. It is not a production-server
parser, an import/write endpoint, a database migration, or approval to load data.
It uses the existing Node 24 runtime and Python 3 standard library only. No new
package, package-lock change, database connection, SQL, image import, seed, or
source-file edit is involved.

## Run

From the repository root:

    node scripts/import-preflight/run.mjs --batch MY-BATCH --namespace approved.fixed-source --mode STAGED /path/to/cleaned-xlsx-directory > /path/to/offline-report.json

For a final supplied intake set, use `--mode FINAL`. For a later batch, an earlier
offline report (or its identityManifest object) can be supplied with
`--prior-manifest /path/to/earlier-report.json`. Keep the same approved fixed
source namespace. A prior mapping is only offline evidence, never proof that an
object has been written or approved in a database.

The caller chooses the input directory. Only its immediate `.xlsx` files are
read, without recursion. File names locate evidence and do not determine source
identity. Unsupported spreadsheet extensions are rejected rather than silently
interpreted as XLSX. JSON goes to stdout only; the caller chooses any report file.
Exit code 0 means no source ERROR inside this bounded slice, not import approval.
Exit code 2 reports source/package or operator-input rejection; exit code 3 means
input could not be fully read because of a tool capability/resource limit. Resource
caps are not business-invalid findings and never require the user to re-clean data.
Partial-read reports export no prior identity manifest. PENDING items and capability
limits must still be resolved before further work can be considered ready.

## What is implemented

- Original 18 business input sheets and their exact 154 ordered headers. Exact
  known guide/example names are excluded, not fuzzy-matched. `切换核准` is retained
  as raw evidence, never interpreted as an approved cutoff or absent-is-zero rule.
- Raw display strings, leading zeros, numeric XML decimal lexemes, formula/cache
  facts, style indices, workbook 1900/1904 date-system metadata, and styles XML.
  Phonetic annotations are not concatenated into source identifiers.
- Exact CNY yuan-to-integer-fen conversion using BigInt, at most two decimals and
  DECIMAL(18,2) bounds; signed exact int64 quantities. An actual blank price in a
  verified complete v0.3 price column means approved UNSET, with explicit state and
  provenance. Zero stays a distinct value; formulas/missing/unreadable facts remain
  UNKNOWN. Other unknown source facts remain null; negative stock stays negative. No float, rounding, exponent
  interpretation, automatic sign flip, fake value, or aggregation of duplicates.
- Original source IDs with program-generated deterministic internal IDs, per
  entity and fixed source namespace, independent of file name and row position.
  Missing source IDs do not trigger guessed natural-key generation. Numeric IDs
  and numeric values beyond Excel's 15-digit precision are flagged for source
  verification, not automatically converted or silently accepted.
- Current-batch and same-namespace prior-batch source references. Missing later
  references are PENDING in STAGED mode and ERROR in FINAL mode. Ambiguous,
  conflicting, invalid, or unresolved targets cannot become prior identity evidence.
- Duplicate source identities, customer/supplier/product/SKU codes, real SKU
  four-dimensional combinations, original line positions, warehouse+SKU balances,
  and conflicting barcode bindings. All conflict participants are blocked.
- Unresolved source issue gates and dependency propagation. A bad historical line
  or settlement blocks its whole document, including header and siblings. Source
  status and all original records remain preserved; nothing becomes a fake draft.
- Precise batch/file/sheet/Excel-row/source-ID/field/raw-value/rule/reason reports,
  distinct source ERROR, PENDING, and missing-program CAPABILITY outcomes.

## Optional historical account/hall recommendations

`11账户适用厅` keeps its original sheet name and two original headers
`*账户来源编号` and `*厅来源编号` for v0.3 compatibility. It is **optional historical
source recommendation data**, not an account permission, staff permission, or a
required master-data grant. The stars describe values needed only when a real
existing relationship row is supplied; they do not make the sheet or a relationship
for every account mandatory.

The sheet may be empty or omitted in either STAGED or FINAL mode. Its absence does
not produce `INPUT_SHEET_NOT_PRESENT`, remove an account, or require the user to
reassign accounts to halls. Existing filled relationships are preserved unchanged;
provided malformed relationships are reported against their own source rows, not
converted into permission restrictions on otherwise valid account master records.

The verified running behavior is that all normal accounts with an enabled, matching
payment method remain selectable. Historical source hall recommendations are
combined with qualifying accounts from the hall's recent effective approved sales
and only move recommendations to the top; they are not an allow-list. The offline
preflight does not invent the runtime recency window, tie-breaks, or sort algorithm.
Account maintenance UI/list has no applicable-hall input; detail may show a read-only
source hall range. See `docs/import-payment-account-guidance-v0.3-addendum.md` for the
standalone filling clarification. No existing or paused input workbook is rewritten.

## Security/resource profile

No archive extraction, formula evaluation, macro execution, or network is used.
DOCTYPE/ENTITY, external relationships, macro content, embedded objects, encrypted
archives, unsafe ZIP members/symlinks, duplicate members, package escape, and
unsupported compression are rejected. Legitimate OPC owner-relative paths such
as a worksheet's `../tables/table1.xml` resolve only inside the ZIP package.

Limits fail explicitly; data is not truncated: 64 files; 32 MiB compressed per
file/64 MiB per batch; 24 MiB per ZIP part; 64 MiB uncompressed per file/128 MiB per
batch; 2,048 ZIP entries per file; 128 sheets; 100,000 XML rows; 2,000,000 physical
and dense cell positions; 256 columns; 32,768 characters per source cell/formula;
32,000,000 aggregate source/style characters. XML trees are bounded during parse
at 500,000 elements, depth 64, 128 attributes/131,072 attribute characters per
element, and bounded text nodes. TS reports are capped at 50,000 issues; exceeding
a cap fails rather than returning an apparently complete partial report.

## Deliberately not completed

Every report permanently states `databaseExecuted:false`, `importReady:false`,
and `publishReady:false` for this implementation. `CHECKED_WITHIN_SCOPE` is never
full source, business, historical, database, or production acceptance.

The nine product prices are projected to explicit `purchasePrice`, `price`,
`wholesale5` through `wholesale10`, and `minimumPrice` facts. Each retains its
source header, raw cell, VALUE/UNSET/UNKNOWN state, exact yuan/minor-unit values,
and v0.3 blank provenance. This is not native writehost price authority;
`priceCompletenessVerified:false` remains explicit until a controlled creation/
import publisher actually validates and writes all nine keys. No SKU override is
created. Missing columns/keys are never equivalent to present empty template cells.

Date/time semantic parsing is not implemented. Raw Excel serials, date-system
metadata and styles are preserved; the tool does not guess a timezone or substitute
current time. This is a program gap to complete, not a demand that the user rewrite
dates as text. Full formal dictionaries, historical economics/state/snapshots/
identities, approved natural-key fallbacks, all nine native price fields, barcode
persistence, master-data writes, historical import, and baseline-aware historical
edits remain incomplete. Existing CUTOFF_HISTORY command protections remain intact.

Empty-target verification, actual source/cutoff/final-delta approvals and complete
warehouse/SKU coverage still block inventory publication. Missing stock rows are
not treated as zero. No business schema or table has been added.

## Lightweight tests

    node --test tests/import-preflight.test.ts
    python3 scripts/import-preflight/test_read_xlsx.py -v

Fixtures are explicitly synthetic temporary ZIP/XML workbooks. Tests exercise real
XLSX-to-CLI input and verify unchanged source bytes; they do not perform database
or real-business import acceptance.

## Optional original payment-method snapshot (one approved fact)

`15历史收退记录` still accepts its original eight columns unchanged. The only new
accepted layout appends exactly `原收款方式来源编号` as the ninth column, in that
position, without a required marker. This optional original source identifier
resolves through the existing `PAYMENT_METHOD` source mapping (`09收款方式`), with
one native target: `sales_settlement.payment_method_id_snapshot`. No new table or
unrelated business field is introduced by this intake contract.

The legacy `原方式显示名` is only a display snapshot, not the original method ID.
Neither it nor the account's current method supplies a missing historical ID. Old
eight-column inputs and genuine empty extension cells retain unknown/null, with
no extra missing-required-field error and no re-cleaning requirement. Unknown ID
facts are not eligible to generate a recent-account recommendation; other valid
account choices remain unaffected. An explicitly supplied but unresolved method
reference is reported at its original file/sheet/row/source ID/field, PENDING for
a later STAGED batch or ERROR for an unresolved FINAL source reference.

A source-backed developer supplement can be prepared later from actual original
records, keyed by the existing settlement source identity and with controlled
provenance. This slice implements the optional appended-column route only; it does
not claim a supplement loader or an automatic method-ID backfill. Original inputs
need not be rewritten or re-cleaned. New runtime settlements obtain their known
current method snapshot server-side, not from a client guess. Runtime capture,
recent recommendation eligibility and persistence are owned by the backend. A
provided/known ID alone does not make historical data recommendation-eligible:
effective approved history/active contribution and the current eligible account/
method pair must also satisfy the verified backend contract.

No paused actual input is read or modified by this developer-side clarification.
