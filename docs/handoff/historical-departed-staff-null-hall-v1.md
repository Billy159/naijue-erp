# Historical departed staff null-hall approval V1

This is an operator input outside the standard package. It is not a business-field addition. The local controller must identify the two user-approved original staff identities; examples below are synthetic and must not be substituted for the actual identities. Other departed rows without approval and all active salespeople still require a hall.

## Exact input

UTF-8 JSON, closed keys:

```json
{"format_version":"HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1","source_namespace":"synthetic.unified.v1","evidence_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","staff":[{"source_key":"original-staff-id-1","target_id":"10000000-0000-0000-0000-000000000001","source_refs":[{"file_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sheet":"SYNTHETIC","row":2}]}]}
```

- `source_namespace`: exact package namespace.
- `source_key` and `target_id`: exact stable staff registry binding, not a name or temporary row number.
- `source_refs`: original pinned provenance; locator row is provenance only, never permanent identity. Reference order does not change authorization.
- `evidence_sha256`: a pinned source file evidencing approval. Hashes do not independently prove original truth. The operator reviews the exact two identities and passes the approval file SHA-256 separately from the package.
- Staff records retain `role="SALESPERSON"`, `employment_status="离职"`, `hall_id=null`, original source references, and the existing nullable departure date where the selected profile supports it. No user account, login, role change or fake hall is created.

`readHistoricalStaffHallApproval({bytes, trustedSha256, sourceNamespace, sourceHashes})` rejects mismatched file hashes, namespace, source hashes, duplicate source keys/target IDs, unsupported fields and missing references. Its frozen capability is passed as `historicalStaffHallApproval` to ordinary validation/build/whole compilation and stream preflight/plan. A plain JSON copy cannot grant authorization.

## Wire and installation

The compiler includes `historical_staff_hall_approval={utf8,sha256}` in the plan digest and INITIALIZE payload. Stream summary bindings and stream plans bind the same bytes; stream planning requires the independently verified capability again. The existing authorized initializer establishes the immutable INIT audit. Imported STAFF is checked against that audit, not a per-row `approved=true` supplied by the package. Source refs, source key, target ID and departed state must match. Existing account references reject the null-hall exception. Existing enabled-account and active-staff guards remain unchanged.

Install successor `adapters/postgres/patches/0027_historical_staff_null_hall_successor.sql` after the zero-amount archive successor, using the registered combined installer. It changes only the exact existing whole-command body, retaining function metadata, owner, ACL, triggers and all transaction guards. No new database table/column/function/role is required. Predecessor/successor fingerprints are in its closed replacement specification; never manually append this SQL to an installed catalog.

The SQL candidate must still be parsed and executed against the isolated PostgreSQL target by the local Codex/assigned database verifier. Source composition and synthetic compiler tests are not database acceptance.

## Required local checks

1. Freeze reviewed approval bytes and separate SHA, fill the actual two identities, and pin approval evidence in source_files. Do not place credentials in this input.
2. Install the complete combined version; verify its install record, command fingerprint and restricted roles.
3. Preflight the same package and approval through ordinary and stream paths. Confirm both exact departed rows accepted; remove approval/change identity/change source refs/change status to active and confirm rejection.
4. Execute one minimal synthetic whole package with the two exact approvals. Read back null halls and departed statuses; confirm no user_account rows exist for those staff. Verify original provenance from import audit.
5. Repeat the same request; verify no duplicates. Inject a later failure; verify full rollback, including staff. Verify inventory remains at the fixed November 2 12:00 Beijing baseline.

No real identities, source Excel rows, databases or credentials were accessed to develop this contract.

## Review corrections

Approval parsing uses the existing strict JSON parser and fatal UTF-8 decoder: duplicate keys, BOM/invalid encoding, unknown fields and ambiguous locators are rejected. Source reference rows are JSON numbers in the positive int32 range, and duplicate references are rejected. Key/sheet text cannot be blank, have surrounding whitespace or contain ASCII control characters. SQL applies the same locator restrictions and rejects duplicate JSON keys before converting the approval text to jsonb.

Every ordinary and full streaming preflight rebinds the capability's evidence hash and every locator hash to the **current** manifest source inventory. A capability previously valid for another inventory under the same namespace cannot supply missing evidence. The approved bytes are operator-reviewed input; a matching hash does not prove the original facts by itself.
