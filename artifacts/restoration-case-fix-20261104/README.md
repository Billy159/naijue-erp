# Restoration CASE grammar follow-on

The sole database worker reported an actual earlier batch-closure IF/CASE parse failure. Static follow-on inspection found five same-form bare CASE operands in the restoration extension; live PostgreSQL had not reached these five. Their source-regression failure is not five actual database failures.

Minimal delta: five CASE operands following IS DISTINCT FROM are parenthesized. The settlement successor body hash and exact source pin are recalculated; original source is retained as before.sql. No business predicates, ACLs or triggers are relaxed. Assignment CASE expressions and CASE inside parenthesized SQL queries remain unchanged.

Source regression command: node --test tests/historical-restoration-case-parse-regression.test.mjs (before change exit1).
Affected command: node --test tests/whole-batch-closure-*.test.mjs tests/whole-package-batch-closure-candidate.test.mjs tests/whole-package-closure-integration-candidate.test.mjs tests/whole-package-closure-successor-source.test.mjs tests/whole-package-sales-integration-candidate.test.mjs tests/whole-historical-reception-candidate.test.mjs tests/historical-original-restoration-sql-source.test.mjs tests/historical-restoration-case-parse-regression.test.mjs (exit0,35pass).

Restoration source SHA256: 6e4b8775df74b6574820ad1d6199f1e1fdd9ae4514af7e5ae73717c90693921d
Settlement body SHA256: 4d8c62b7383a82871be4217d6bd79f3b1ceb35ffe35302224d507f82765bd268
Combined SQL SHA256: f6016dc5878e533cf7aba58df713f7a10cc322657cf93030a24b8b985530259b

No PostgreSQL execution, typecheck or build by this worker. Real installation retry remains with the sole database worker.
