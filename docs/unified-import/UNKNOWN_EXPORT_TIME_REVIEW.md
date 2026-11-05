# Unknown inventory export time

`inventory_source.exported_at` may be explicit `null`. Do not replace an unknown
export time with the cutoff, file mtime, ingestion time, current time, or a guessed
timezone offset. A present export time must still pass the original offset-instant
validation. The actual cutoff and source timezone remain mandatory and unchanged.

## Independent current-effective alignment review

For a null export time, a source hash listed by the package is not enough.
`readCurrentEffectiveAlignmentEvidence` consumes an external, independently
reviewed JSON file and its separately obtained trusted SHA256. The JSON uses the
closed `CURRENT_EFFECTIVE_ALIGNMENT_V1` contract:

- `scope`: `CURRENT_EFFECTIVE`.
- `source_namespace`: the exact package namespace.
- `inventory_file_sha256`: the original inventory-file hash, not the approval hash.
- `inventory_exported_at`: `null`.
- `cutoff_at`: the exact independently established inventory cutoff.
- `registry_sha256`: the current central identity-registry hash.
- `document_files`: exactly `sales_header`, `sales_line`, `sales_settlement`,
  `transfer_header`, `transfer_line`, in that order. Each item carries the exact
  `table`, `relative_path`, `bytes`, `sha256`, and `row_count` from the reviewed set.
- `reviewed_by`: the responsible authorized reviewer's identity.
- `review_reference`: the independently retained approval record reference.
- `alignment_basis`: the source evidence and method supporting the alignment.
- `decision`: `CURRENT_EFFECTIVE_DOCUMENTS_MATCH_INVENTORY_CUTOFF`.

The authorized reviewer must establish from the original sources that these exact
documents represent the effective set at that inventory cutoff. A content hash
only binds their declaration to exact bytes. Neither a different hash, a person's
name, nor the declaration itself proves business truth. The software does not
authenticate the reviewer, inspect the original workbooks, or create approval.
The external reviewer/controller is responsible for supplying the approved pin
through the authorized channel and retaining the original review evidence.

The manifest's `document_cutoff_alignment.evidence_sha256` must equal the approved
review-file SHA. Its `source_files` metadata must contain exactly one matching
hash/byte-size pin. It must not reuse the inventory-file SHA. The trusted reader
copies and verifies the input bytes, rejects unknown or duplicate JSON fields and
malformed bindings, and creates an immutable, process-local capability. A parsed
object, clone, self-asserted boolean, or repinned package is not that capability.
Ordinary preflight and stream metadata both require it for unknown export times.
Known-time packages retain their previous compatible admission path, except that
an inventory-file hash cannot masquerade as separate alignment evidence. That
legacy path still does not certify the truth of the declared timestamp.

All original row, relation, `is_current`, registry, report, cutoff, and stock guards
continue to run. Current-effective evidence cannot waive any of them. Exact
document byte changes require a new independently reviewed alignment file and pin.

## CLI inputs and limits

`stream-preflight`, `stream-prepare`, `stream-import`, `stream-verify`, and
`whole-import` accept the paired options:

```
--current-effective-alignment /outside/package/review.json
--current-effective-alignment-sha256 <independently-approved-sha256>
```

The 64 KiB review file must resolve outside the package. The bounded reader rejects
symlink input files and changes during reading. It never computes a trusted pin
and grants approval to itself. The ordinary whole-package reader preserves the
same capability; the stream planner rechecks the capability against the manifest
and binds its descriptor into the summary used for request generation.

The offline preflight also accepts separate paired
`--historical-line-amount-evidence` / `--historical-line-amount-evidence-sha256`
and `--source-occurrence-evidence` / `--source-occurrence-evidence-sha256` options.
Those offline review inputs are not execution permissions and are not accepted by
the execution CLIs.

## Existing absent-zero approvals stay independent

This change does not infer zero from absence. Existing explicit-zero approval
still binds the original inventory hash, exact cutoff, namespace, warehouse/SKU,
zero quantity, independently approved JSONL bytes, and each Merkle membership
proof. Each approved key must appear exactly once. Listed stock is never replaced.
An approved absence's `source_refs.row` and `approval_row` are **approval JSONL
line numbers**, not original inventory Excel row numbers. Its source reference
uses the approval-file SHA and `sheet:null`; the embedded proof separately retains
the original inventory-file SHA and cutoff.

## Verification boundary

`tests/unified-inventory-source-time.test.ts` uses synthetic data only. It covers
unknown/null preservation; missing, cloned, tampered, or transplanted evidence;
identity/cutoff/document-pin mismatches; approval-line semantics; materialized and
streamed plan/request parity; and actual offline preflight/preparation CLI calls.
No business database is connected. Generated request equality is not execution.

Actual PostgreSQL execution, physical target identity, runtime catalog/ACL,
installer/root/Mac wiring, real source accuracy, independent human approval, and
production behavior remain **NOT TESTED** by this suite. No real input was read,
no PostgreSQL table was changed, and no deployment or push was performed.
