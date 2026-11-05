# Demo restoration regression completion

The original full run is preserved, including its exit1. Its dependency, type, build, 1078 tests and preceding DOM checks passed. Only the portable single-page smoke test assumed the obsolete default FIT display. The test now proves merged multi-SKU cells cannot dispatch arbitrary SKU actions, explicitly enables FIT, and verifies the original negative cell and exact identity without extra reads. Production code is unchanged.

The corrected smoke and all remaining aggregate commands passed on frozen 1adca3a. Reusing the unchanged passing prefix avoids rerunning valid checks; this is composite verification, not a claimed single fresh check:all exit0. See RESULT.json and complete logs.
