# Open implementation items (not a release checklist pass)

Current confirmed remote commit is 231e53b on codex/clean-erp-foundation. Later cloud commits are not automatically on GitHub. Full feature gaps remain in the approved project completion Page and scope reports.

## Targeted follow-ups from cross-slice review

- CLOSED in a3f1502: sales now records sparse key/changed-line/settlement before/after evidence and skips unchanged native detail writes. Independent6 targeted probes plus85 focused/130 combined tests passed; realPG is still unverified. Transfer equivalent is in f8ebc86.
- CLOSED in a3f1502: sales fingerprint binds stable account and actual business command, not transient hall context; receipt replay still rechecks current permission. Transfer equivalent is in f8ebc86. Do not re-open these resolved source defects without new evidence.
- Inventory HTTP/application boundary is implemented, but PostgreSQL snapshot reader, approved cutoff coverage/readiness facts and production composition are still missing. The bounded web transport is implemented in 2f33776. Missing balances must not be defaulted to zero.
- Product drawer and backend read source are reviewed and committed (92f0349 / 121eecc). A separate complete product-only synthetic preview is delivered in the project Space; the full combined portable preview still exceeds the Page 256KiB cap and has not replaced the smaller inventory preview. Real browser and exact Demo appearance remain unverified.
- Authentication UI and bounded query transports are committed (f08c036 / 2f33776). Root test discovery includes both. The empty inventory size-column boundary mismatch is fixed; production root/session/provider composition still remains.
- Dormant real-PostgreSQL integration test source is committed in 9272fa4, with eight connection-free guard/assertion checks passing. Actual PostgreSQL execution remains NOT RUN. It pins only migrations 0001–0005 and does not cover party maintenance or later schemas.
- Customer/supplier maintenance with approved KH/GYS numbering and sales list/detail UI passed scoped independent review and are committed (97f6138 / c79e9aa), not yet integrated into a production root. One coherent detail contract and bounded filter references are being completed next. Do not treat synthetic test passes as operational availability.

No line in this document authorizes a database write, migration execution, deployment, credentials, local task, or permission change. The code implementation follows the user's approved rewrite scope; production validation is a separate stage.
