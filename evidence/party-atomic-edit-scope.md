# Atomic customer/supplier edit delta

This scope supersedes the earlier unreleased name-only EDIT contract and corresponding narrower review evidence. It does not invalidate or change the approved KH/GYS numbering or text-normalization policies.

Source confirmation: frozen Demo frontend/basic-settings-v2.jsx lines 74–100 renders name and the edit-only enabled switch in the same Fields form. Lines 164–167 clone that form and submit it through one M.save call. Source SHA256: c16e44268ac75f50784c0ce8c8b45826eb267ec85c8cee06596d24ab2a0761fa.

Coordinated exact EDIT key set: action, requestKey, id, expectedVersion, name, enabled. enabled is a required boolean, with no omission/default or name-only compatibility path. CREATE and read/candidate/receipt routes and response shape remain unchanged. Direct DISABLE/RESTORE API commands remain available but imply neither new UI row buttons nor sequential form saves.

One application transaction performs one native compare-and-swap version increment and one matching sparse audit and receipt. Name-only, state-only, rename+disable and rename+restore proposals are valid; both fields unchanged is NO_PARTY_CHANGE. Every customer enabled true-to-false proposal checks the enabled-hall default dependency before any write. Sparse audit records actual changed keys only. Conflicts, guard failure or late audit/receipt failure cannot leave either proposed field partially saved. Exact successful replay returns the original result; changed content with the same key conflicts.

The 0006 native-audit transition guard now rejects EDIT only when both business fields are unchanged. Native code/identity/creation-time immutability, physical customer/supplier separation, current maintenance role checks, source-derived default dependency and numbering mechanics are unchanged.

Verification: scoped TypeScript exit 0, then 54 focused tests pass at test concurrency 2. Coverage includes combined atomic success, dependency rejection with no transient rename, exact replay/content conflict, stale concurrent CAS without mixed pairs, late rollback of both fields, strict required HTTP fields, one pg-protocol UPDATE/audit/receipt, and SQL-text edit-transition assertions. This is synthetic/protocol/SQL-text evidence only. No PostgreSQL connection, migration execution, network, account/credential creation, listener, install, commit, push or deployment occurred in this delta. 0006 is unexecuted source; the separate real-PG harness still pins 0001–0005.

Earlier evidence/party-maintenance-review.md and evidence/party-numbering-review.md describe their prior frozen source. They are not independent approval of this new atomic-edit delta; focused independent recheck must use the refreshed source manifest.
