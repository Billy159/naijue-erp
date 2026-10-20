# Open implementation items (not a release checklist pass)

Current confirmed remote commit is 231e53b on codex/clean-erp-foundation. Later cloud commits are not automatically on GitHub. Full feature gaps remain in the approved project completion Page and scope reports.

## Targeted follow-ups from cross-slice review

- Sales audit currently copies all retained line values on each operation. Align it with approved sparse key/changed-line before/after evidence without losing source facts, native old/new version fields, idempotency or transaction atomicity. Do not use audit JSON as a reconstructed business source. Transfer is correcting this in its in-progress slice; preserve file ownership until it finishes.
- Sales request fingerprint currently includes ActorContext.hallId. Review and test same original business request + stable account/key after trusted hall/role context changes. Receipt replay should recheck current permission, while dynamic authorization context should not turn unchanged business content into a spurious key-content conflict. Transfer has independently reproduced the analogous role/hall issue and is correcting its own implementation.
- Inventory HTTP/application boundary is implemented, but PostgreSQL snapshot reader, approved cutoff coverage/readiness facts and real web transport/composition are still missing. Missing balances must not be defaulted to zero.
- Product drawer source is being reviewed. Full portable preview exceeds the Page 256KiB cap, so do not replace the approved smaller Page preview with an oversized payload or remove features to claim successful delivery. Split output remains available; real browser and exact Demo appearance remain unverified.

No line in this document authorizes a database write, migration execution, deployment, credentials, local task, or permission change. The code implementation follows the user's approved rewrite scope; production validation is a separate stage.
