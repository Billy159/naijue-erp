# Recorded LIVE V7 release contract: source-validation checkpoint

This is an inactive source checkpoint, not a deployment or database authorization.

The non-CORE API now requires RECORDED_LIVE_LEDGER_PAIRS_V7. Release and boot configuration previously admitted only historical V1/V6. This change adds the explicit recorded-live-ledger-v7 descriptor and packages the existing additive ledger SQL. Historical profile meanings and default selection remain unchanged. SQL is not automatically executed and the SQL artifact grants no access.

V7 metadata must carry exactly six fields, including both boolean-true ACL/storage proofs. Catalog and identity envelopes remain exact, and target, source, catalog hash, migrations, purpose and independent-review checks remain mandatory. Missing or older evidence is refused.

The complete changed deployment helper was independently source-reviewed before separately adopting its exact hash in boot and rollback. Generator self-approval remains prohibited. Three boot historical pins and the rollback historical FULL pin were not changed.

## Executed source/contract evidence, 2026-10-30 UTC

- Tests first: V7 absent on baseline produced the expected descriptor/package/boot refusal failures; original source guards remained intact.
- Initial candidate: V7 Node5 and Python9 passed; generator deliberately refused changed unreviewed helper bytes after refreshing generated facts.
- Independently reviewed deployment helper SHA256: 4620ca2f1672e18991644a2da5398633eae19d75cb60057245590ebe2e3f8b25.
- Subsequent broad regression found three failures caused by rollback still pinning the old helper. Existing tests were retained and only the reviewed capacity pin was aligned.
- Final candidate generator --check: exit0. All release Node57 tests: PASS. All release Python82 tests: PASS. These include bounded synthetic protocol/process/loopback tests, not a formal deployment.
- Reviewed aligned rollback SHA256: ffcfea799ba235753109d425e2ce48308b1ba1a6f29172920a8f4273b5e63950.

## Still unverified / not implemented by this change

V7 target provisioning and minimum ACL execution, ordinary runtime-login catalog observation, real PG commit/rollback guards and ledger balances, full HTTP/browser business chains on that target, actual formal network deployment and rollback, remote GitHub publication. Metadata fixture booleans do not prove target state. Historical/import balances remain unknown. Source archives and pushes are not a launch acceptance.
