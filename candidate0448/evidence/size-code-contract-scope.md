# Nullable source size-code contract correction

Approved field catalog allows absent source codes and legitimate code 900 in multiple groups. Existing SQL0001 already allows NULL and does not make size.code globally unique, but the domain SizeRow interface incorrectly required string. Changed the type to string | null only; no database or business-data changes.

Added a typed synthetic test preserving one absent code and two equal codes on distinct IDs. Seven catalog tests passed. Direct existing local TypeScript whole-tree check exited0 at this change; other concurrent work is not included in this commit or claimed complete. No dependency installation, PG, migration, source-code guessing, import or deployment.

Rollback: revert this two-source-leaf change and its evidence.
