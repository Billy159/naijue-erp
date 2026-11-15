# DB installation fix03

Source-only fix for DB02 installation text. The six-argument command CREATE FUNCTION at DB02 source-slices.sql line3124 omitted its SQL statement semicolon before REVOKE at3126. The renderer directly appended a pg_get_functiondef-derived definition, which ends in a newline without a SQL statement terminator. Fix the installation renderer only; preserve the canonical definition used by EXPECTED161.

source-slices.sql differs from frozen DB02 by exactly one inserted semicolon. Function bodies, canonical definitions, all161 expected routines, signatures, owner/ACL and declaration order remain unchanged. render-successor.py is the corrected generator in its original task-directory layout, not an independent runner. The two diffs show the complete change.

The first real SQL-core attempt failed installation without retaining an error message or SQLSTATE. This is a definite static source defect, not proof of that run's first actual error. No PostgreSQL/parser execution or server action was performed by D1. Original failed root, DB01, DB02 and HOST01 remain unchanged. HOST01 still contains old DB02 SQL; do not present HOST01 unchanged as adopting fix03.

The main controller coordinates any diagnostic run and any exact new installation input after QB checks. Original-byte DB02 diagnosis and fixed03 installation are different inputs; preserve their identity and do not silently replace or replay a consumed attempt. No execution permit is supplied by this packet.
