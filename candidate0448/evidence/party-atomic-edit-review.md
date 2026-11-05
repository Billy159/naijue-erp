# Independent recheck: atomic customer/supplier EDIT

Date: 2026-10-20 UTC. Repository: `/workspace/shared/naijue-erp-rewrite`.

## Verdict and scope

No blocking P1/P2 source defect found in the exact frozen atomic-edit delta. EDIT now requires both proposed name and boolean enabled, validates the combined transition before writing, and saves the pair through one native CAS/version increment, one sparse audit and one receipt. There is no name-only compatibility/default path.

Independent verification passed: 54 focused checks, scoped strict TypeScript exit 0, and six additional pure/synthetic/injected-protocol review probes. This is not PostgreSQL-engine or deployment acceptance.

The previous maintenance and numbering reports remain unchanged as records of their earlier freezes. This report supersedes their narrower name-only EDIT discussion, not the independent KH/GYS policy, numbering implementation, immutable original codes, or other unchanged contracts.

Frozen manifest: `evidence/party-source-sha256.txt`, SHA-256 `06f9bc32764cdb4981a6a8aa83a5b72b15868677aa3f42f2e6de7d6008d7817d`. All 18 entries matched before and after review.

Principal delta hashes:

- `party-maintenance-ports.ts`: `96d652dd7eb9b02e2951d52a859e717c4d941210eca90e807aa19f8444828183`.
- `party-maintenance-validation.ts`: `9dccee7922e9fd16cebecdd232ffe32ce3f4fc29cf6b74216f30c95006587a23`.
- `party-maintenance-service.ts`: `7844fdeda4984b4442d974ad429179d84948f5c5e2c0f2ba7e779f012ab649bb`.
- `0006_party_maintenance.sql`: `13c82389abdc85856313da195a310fa74b1283140c0581b6696a48ffc85f3e6c`.
- Scope record `evidence/party-atomic-edit-scope.md`: `83eb1ee78328e2395a503b69bf60131e231c0ae13250e755941eb6244a099b3c`.

The numbering source and PG adapter remain byte-identical to the preceding numbering review: `party-numbering.ts` hash `8517e8bf065026192dc2c282dd641f122f2765b619f05200230fbcf14c1288fd`; `party-maintenance-store.ts` hash `d39c59ea8ec31d5147e8661d7ddf3527e8f8dfde8795723d8615439d7129849c`.

## Source confirmation and findings

1. Frozen Demo source was read directly at `/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/frontend/basic-settings-v2.jsx`. SHA-256 matches the scope record: `c16e44268ac75f50784c0ce8c8b45826eb267ec85c8cee06596d24ab2a0761fa`. Lines 82 and 96 place name and the edit-only enabled switch in the same Fields form; lines 164–167 clone that form into one M.save request. The coordinated atomic pair follows that save boundary. This finding does not reintroduce the Demo's merged parties/tags design.

2. `party-maintenance-ports.ts:12–15` requires enabled for EDIT. Validation's exact six-key set and explicit typeof boolean check reject omitted, undefined, string, numeric, null, hidden and inherited compatibility values (`party-maintenance-validation.ts:25–38`). Name byte preservation and other command contracts are unchanged.

3. The service rejects NO_PARTY_CHANGE only when both business fields are unchanged. Expected-version/storage checks precede mutation. It computes proposed enabled, then checks every CUSTOMER enabled true-to-false transition, including rename+disable, before calling put (`party-maintenance-service.ts:45–61`). A blocked proposal cannot transiently save just the rename. Rename-only, state-only, combined disable and combined restore remain valid when otherwise authorized.

4. One put sends name and enabled in the same unchanged native UPDATE with the locked old-version predicate (`party-maintenance-store.ts:104–121`). Sparse audit compares actual old/new values, so it includes both changed fields or only the one that changed, plus version, never unchanged code/creation time (`party-maintenance-service.ts:10–12,61–67`). Late audit/receipt failure remains inside the same UoW rollback boundary.

5. 0006's native guard still prohibits identity/code/creation-time changes, enforces one version increment and checks any native customer disable against enabled-hall defaults (`0006:88–94`). Its EDIT audit transition now rejects an unchanged pair using AND, permitting a name change, enabled change, or both (`0006:139–147`). The existing dedicated DISABLE/RESTORE restrictions and sparse audit equality checks remain intact.

6. The request fingerprint includes both required proposed fields. Exact successful replay precedes new clock/ID/allocation/write work and returns the original recorded result after current authorization, even after subsequent edits; changing either field under the original key conflicts (`party-maintenance-service.ts:21–33`).

## Independent verification evidence

All commands used existing dependencies, were run sequentially, and wrote review evidence outside the implementation tree. No expensive aggregate check was run.

- `node --test --test-concurrency=2 tests/party-*.test.ts apps/api/src/party-maintenance-http.test.ts`: 54 passed, zero failed. Log `/workspace/shared/erp-rewrite-planning/party-atomic-edit-review-focused.log`; SHA-256 `a5968eb126feb4e3bb70d6fdbf732ab33ad21d1c09f413cf203acb5755cdcf19`.
- `./node_modules/.bin/tsc --noEmit -p evidence/party-typecheck.json`: exit 0. Log `/workspace/shared/erp-rewrite-planning/party-atomic-edit-review-typecheck.log`; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `node --test --test-concurrency=2 /workspace/shared/erp-rewrite-planning/party-atomic-edit-review-probes.mjs`: six passed, zero failed. Source SHA-256 `69a6f04de22e3b0a8d5c58bb949e68e48ff8c6bc3f91a90126040a2042f644b7`; log `/workspace/shared/erp-rewrite-planning/party-atomic-edit-review-probes.log`, SHA-256 `c69826e6418e41c2229e77ebd9fb68aae1a478061b72a8779649f84389f70dcc`.

Novel probes cover exact required/noncoercing fields; all 32 name/state proposals across customer/supplier and sparse audit combinations; dependency rejection before any put with same-key retry after clearance; rename+restore and original replay after later changes without new side effects; 16 competing-CAS/late-failure orderings; and injected PG combined restore producing one UPDATE/audit/receipt without a disable-only dependency query. Fixtures explicitly serialize synthetic transactions; these are not real PostgreSQL race demonstrations.

Supplied evidence was also inspected: `evidence/party-targeted-check.log` SHA-256 `b14cb245e63708c423ec0f22f5182f49ddb0d8be9d8f4de603c6391831e84ce3`; `evidence/party-verification.json` SHA-256 `c6bb0944eb3b1b7d04152d202635475c02b11003292cc4155f1fab593275729b`.

## Remaining gates

Real disposable PostgreSQL execution of the exact 0006 source remains required, particularly combined EDIT provenance, no-op rejection, both dependency-race orderings, CAS conflicts, deferred audit/receipt failures, and existing numbering/sales/transfer regressions. The current real-PG harness still pins 0001–0005 (`tests/integration/database.ts:8–14`) and cannot count as 0006 evidence. Runtime grants, trusted host composition and customer/supplier frontend/backend acceptance also remain open.

No real database connection, migration execution, network operation, implementation edit, listener, account/credential creation, install, commit, push or deployment was performed. Prior reports were preserved.
