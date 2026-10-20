# Independent sales query slice review

Reviewed on 2026-10-20, frozen-source confirmation at approximately 16:35 UTC.

## Result

No important actionable issue found in the five production files listed below. Suitable for a selective source commit within the existing synthetic/protocol-only verification boundary. This is not an assertion of production readiness or PostgreSQL execution certification.

## Exact reviewed production sources

Repository: `/workspace/shared/naijue-erp-rewrite`.

| SHA-256 | File |
| --- | --- |
| `5725565bb2cdb936c82df0b7ff0242ee4207206ed938372076652cb03227bb25` | `packages/application/src/sales-query-ports.ts` |
| `2f927b17caef3ddaf9090110cd512474673c5e67ca99245e1165210cf758ac61` | `packages/application/src/sales-query-validation.ts` |
| `05fad249fb74d2a5d7f8e98975b2530719a65049d87831d0a6b149eed212ecbc` | `packages/application/src/sales-query-service.ts` |
| `ddfe73bebfebb01d46be364b489b99058ee3b02c3b3c31a20363451fe00b96e4` | `adapters/postgres/src/sales-query-reader.ts` |
| `7f4202d1d3e0ad4622b3f317a5c2182c0b5828aa288e0a41bbcadfd17a1d615a` | `apps/api/src/sales-query-http.ts` |

I independently ran `sha256sum -c evidence/sales-query-sha256.txt`: all 11 listed entries returned OK, comprising the five production files, three test files, and three verification log/config files. I re-read the frozen production files. The only observed difference from my earlier static review was a type-level `as const` on the pricing-rule choices, with no runtime change. Hash validation of tests/logs is distinct from independently executing their tests; I did not rerun the owner's 21-test suite or scoped typecheck in this frozen-evidence confirmation.

The owner logs were also read directly: `evidence/sales-query-check.log` records 21 tests, 21 pass, 0 fail, exit code 0; `evidence/sales-query-typecheck.log` records a leaf scoped TypeScript check with exit code 0. The config names exactly the five production files and three test files. These are inspected owner-run results, not an independent rerun.

Schema files inspected (hashes confirmed on final readback):

- `0001_runtime_sales.sql`: `7ebdaec27630149f20ad6aa67075c2c688a2ed40bcc4718c031987d9af3a5cbf`.
- `0002_sales_pricing_facts.sql`: `14136328eafaf6db8957959d595226a51d6036c5dd44c21e70830c0640b88c98`.

## Findings and supporting checks

- Authentication and policy scope are explicit injected dependencies. Client actor/role/scope fields are rejected rather than trusted. Input/actor copies are captured before asynchronous policy work; scope validation fails closed for empty/malformed grants.
- The reader applies the same trusted scope and request filter predicate before list counts and list pages. Detail and history first gate the specific target by that scope. History count and page retain the target-scoped join. Settlement totals and account pages both intersect scope, filters, and APPROVED status; overall flow sums are not derived from the returned account page.
- All variable filter/scope/target/paging values are driver parameters. The number filter uses literal `strpos`, not unescaped SQL LIKE patterns. Stable unique tie-breakers support deterministic pagination.
- Fixed data-query counts: list 2, detail 3, history 3, settlement statistics 2, excluding BEGIN/COMMIT. No per-document hydration query loop or product/catalog preload. Page sizes are 20/50/100/200. Detail requests at most 2001 current lines and fails rather than truncating above 2000. Settlement detail uses the schema's enforced maximum of three rows and detects an excess row.
- Each read has one read-only REPEATABLE READ client transaction. Work failures roll back. BEGIN or uncertain COMMIT failures discard the client; rollback failure also discards and preserves both failures in AggregateError. Pool construction, listening, and migrations are absent.
- Actual `0001_runtime_sales.sql` and `0002_sales_pricing_facts.sql` were inspected. Referenced relations/columns and enum/nullability assumptions align; native foreign keys make list reference joins one-to-one. Audit metadata projection omits stored before/after JSON and private request hashes. Inactive lines are omitted, and unknown pre-0002 pricing facts remain null rather than inferred.
- Counts and numeric amounts use explicit SQL text casts. Exact counts become bigint and HTTP bigint values become decimal strings. Aggregate money decoding deliberately permits sums beyond the per-row decimal(18,2) cap. Invalid input and known transport errors have bounded safe responses; unknown trusted-provider/SQL details remain generic server errors. Responses are marked no-store.

## Independent scripted probes

Executed local in-process probes using injected fake clients only, without creating a database, listener, or network connection:

- Bad page, unsupported page size, invalid calendar date, padded number filter, and extra top-level scope fields all produced INVALID_SALES_QUERY.
- An empty restricted grant set produced FORBIDDEN.
- An exact count of 9007199254740993 remained 9007199254740993n.
- An aggregate numeric amount of 199999999999999999999999999999999999.98 remained exact integer minor units, with no single-row decimal cap.
- Successful read: BEGIN, two SELECTs, COMMIT, clean release.
- Work failure: BEGIN, SELECT, ROLLBACK, reusable clean release.
- BEGIN failure: client discarded.
- COMMIT failure: ROLLBACK attempted and client discarded.
- Work plus rollback failure: AggregateError and client discarded.

The initial commit-failure probe used an invalid fake page row and failed decoding before COMMIT; it was corrected to return an empty valid page, and the subsequent probe exercised and verified the COMMIT failure path stated above.

## Limitations

- No real PostgreSQL server, SQL parser/planner execution, migration execution, database fixture, or EXPLAIN was used. SQL syntax and schema compatibility were reviewed statically and protocol behavior was tested with scripted clients only.
- No real driver query cancellation was proved. AbortSignal checks bound application callback progress; they do not assert cancellation of SQL already running. This limit is explicit in the port/reader comments.
- These five files provide injectable boundaries, not a production authorization policy, authentication/session deployment, installed route composition, or production connection setup.
- No aggregate rerun, dependency install, network use, listener, migration, production-source edit, commit, or unrelated-file modification was performed for this review. Only this report was written on the final confirmation request.
