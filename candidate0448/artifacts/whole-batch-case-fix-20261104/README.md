# Actual PostgreSQL parse failure follow-on

The database worker reported actual combined79f9 installation failure at stage-combined.psql:179, LINE63, mapping_version IS DISTINCT FROM CASE ... THEN. The original actual log remains unchanged in cloud-pg-sales-20261104-0840e/client-66-stage-combined.stderr; this folder is source follow-on evidence, not a replacement actual run.

Minimal change: parenthesize exactly three CASE expression operands in the batch closure IF: mapping_version, inventory_mode, checkpoint expected. All existing predicates, string literals, whitespace and grants remain unchanged. before.sql preserves the exact prior SQL. source-red.log is the pre-change regression assertion failure. affected-closure.log retains a later old source-regex expectation failure; affected-closure-green.log records the updated exact-parentheses assertion and 24 passing affected tests. No test was removed or skipped.

Actual commands:

- node --test tests/whole-batch-closure-case-parse-regression.test.mjs (before fix: exit1)
- node --test tests/whole-batch-closure-*.test.mjs tests/whole-package-batch-closure-candidate.test.mjs tests/whole-package-closure-integration-candidate.test.mjs tests/whole-package-closure-successor-source.test.mjs tests/whole-package-sales-integration-candidate.test.mjs tests/whole-historical-reception-candidate.test.mjs (after fix: exit0,24pass)

SQL source SHA256: 3d6d3df968d2926a45d50efb89c158961e8e2f58a1f07d451fd81f117dc7b608
Closure body SHA256: 01e39386859cbb3e0617b9c89d1d7670a6b9db97af0a4e02b1d9a74460e30d5f
Combined SQL SHA256: 50e5c24d8f7f27fc4498510f51279f2261846da76dba5aa758a321ad470a37fb

No PostgreSQL execution, authentication, typecheck or build was performed by the source-fix worker. The sole database worker must independently freeze and retry the new source in a fresh isolated target. Source regression success is not PostgreSQL acceptance.
