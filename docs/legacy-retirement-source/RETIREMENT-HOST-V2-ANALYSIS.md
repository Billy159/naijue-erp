# Fresh35 V2 evidence analysis adapter

This is an offline analysis bridge, not a reviewed evidence profile or an installation host.

## Input and source boundary

The selected predecessor capture is the stopped, isolated synthetic 178-routine database `synthetic_schema178v2_20261105_r2`. Its evidence checksum-list SHA256 is `700f43affb2bdb035b4f50dab9613613db9498eec67bf2ab5d81e6f0f723d3e5`, and its candidate-manifest SHA256 is `649c7b5b8ad5df48d77ace39745b20e4a16e2122326f7a6fea950850cc2a8b8d`. The application schema dump SHA256 is `94b2ff3c5507f9dfaf5dd5858346a4deeab92f8a0599db8968f53e7efa6991f8`.

The adapter verifies all 87 checksum-listed files, including empty stdout/stderr files. It rejects missing or additional directory entries, nonregular files, symbolic directory aliases, symbolic files, oversized reads and changes detected while a file is read. Every core artifact is then passed through the unchanged V2 candidate validator, which checks exact SQL, hashes, context, physical identity, snapshot, projection consistency and the declared 177-file source binding.

The capture binding remains `3cd0da8932bb59eb58e585e8f6aad9d894f334351b4ce97c8b370a36c48e0fb6`, with predecessor source spec `88db01d978e0777d4f8a6fa4ca0d0918d80832cccf9300bb3ff5148b2990a86e`. No source pin or old evidence is rewritten. The newly added adapter is independently hashed and is explicitly outside those 177 captured source pins. Its later use does not claim that the adapter itself ran during the predecessor capture.

## API

`loadFresh35EvidenceV2Analysis(root, directory)` returns an immutable, privately branded `UNREVIEWED_PREDECESSOR_ANALYSIS` object. The object includes the original V2 source-target, capture context, dump, catalog collections, the fresh consistency report, artifact pins and the independently hashed adapter source.

`requireFresh35EvidenceV2Analysis(value)` accepts only an object created in this module instance. The brand establishes the data-loading path, not safety approval or execution authority.

`assertFresh35EvidenceV2AnalysisCurrent(value)` rechecks the current 177-file source binding and the loaded adapter bytes. Source-projection consumers call it before and after their work and bind their own new analysis code separately. A changed receiver or structural source is refused, not relabeled as covered by the existing capture.

The separate `modelEvidence` property bridges the shape expected by the existing pure `projectFresh35CoreMetadata` function:

- V2 `predecessorSourceSpecSha256` becomes the explicitly derived `source_spec_sha256` field.
- The owner remains the recorded V2 target owner.
- The controller is this capture's fixed role selector, `schema178v2_controller_20261105_r2`, checked for exactly one matching role row. It is not inferred from `actor` and does not assert any permission or ACL review.
- Raw catalog collections, dump and artifact hashes are retained. The original V2 target is not changed.

This bridge has no V1 private evidence brand. It cannot feed `buildFresh35CatalogPostconditions`, and its fields cannot substitute for a reviewed installation record.

## Still closed

All safety-review, execution-provenance, catalog-completeness, engine-verification, reviewed-registration, installation, host and admission flags remain false. Hash verification here selects and checks evidence bytes; it does not authenticate execution provenance or perform the outstanding independent safety review.

`loadReviewedFresh35EvidenceV2`, `openReviewedFresh35Host`, and the installed-record loader/publisher remain unchanged and refuse. No database is connected, no SQL is run, no credentials are created, and no previously denied safety operation is retried.

The 35-table projection and metadata model are separate offline deliverables. Actual installation and import still require the authorized review and execution path, a distinct fresh target, full structural verification, a protected fixed installation record, and the existing host/admission checks. The stopped predecessor identity is not reusable.

## Focused verification

Run with the already collected evidence directory, without PostgreSQL:

`FRESH35_V2_ANALYSIS_EVIDENCE_DIR=/path/to/evidence node --test tests/fresh35-catalog-evidence-v2-adapter.test.mjs`

Tests cover the real capture, deep immutability, cloned and invented brands, old-renderer/host refusal, missing or changed evidence, caller rehashing, symbolic/nonregular/oversized files, directory aliases and extra approval files, source drift, and separate adapter-source binding. Evidence-dependent tests skip when the directory is not provided; such skips are not evidence validation.
