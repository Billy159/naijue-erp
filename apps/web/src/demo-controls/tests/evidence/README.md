# Focused proof for the unwired Demo control candidate

Scope: only apps/web/src/demo-controls. These are focused checks, not a complete
repo/compiler/build/runtime/browser/parity pass. No production Select wiring or existing
source edit is part of this extraction; the pure controller may be integrated by
a separate behavior-fix owner. No commit was made by this worker.

The four numbered successful logs retain complete merged stdout/stderr, not
filtered tails. Each includes its command, cwd, start/finish timestamps and exit
code. 01-focused-typecheck.log has zero bytes of raw compiler output because the
focused compiler succeeded silently; its envelope and JSON record distinguish
that success from a missing log.

- 00-initial-typecheck-diagnostics.transcript.txt: verbatim historical diagnostic
  copy from the visible tool transcript. The original raw output was NOT saved.
  It must not be described as a full original log. The two initial typing issues
  were fixed before successful reruns.
- 01-focused-typecheck.log and focused-typecheck-result.json: full successful
  focused compiler invocation. Compiler lane was coordinated with the inventory
  lifecycle owner; no aggregate compiler was run here.
- 02-popup-ownership.log: full eight-test pure ownership run.
- 03-source-and-boundary.log: exact frozen source/line-range hashes, 21 unchanged
  scoped CSS declaration rules, installed leaf hashes and lazy bundle boundaries.
- 04-action-dom.log: actual installed Arco StrictMode DOM checks. Known installed
  Arco React 19 element.ref compatibility warnings are preserved, not filtered.
- focused-test-results.json: machine-readable command/exit/output-byte records.

Other earlier development runs were not saved as raw log files. The DOM harness
was corrected to await Arco's normal exit animation and to include legacy keyCode
27 in the synthesized Escape event used by the installed Arco hotkey handler.
Final tests also verify that a closing popup cannot commit stale option clicks.
These historical notes are not substitutes for missing full earlier outputs.

Source identity:
- ../../source-provenance.json records original frozen commit, whole-file SHA256,
  inclusive line-range hashes, exact copied CSS lines, installed Arco stylesheet
  hashes, exclusions and adapter changes.
- FROZEN_SOURCE_SHA256SUMS is the original frontend file's whole-byte SHA256.
  Verify from the frozen export's root, not from this repository.
- SOURCE_SHA256SUMS covers every candidate source/doc/config/test file outside
  this evidence directory. Verify from apps/web/src/demo-controls.
- SHA256SUMS covers this evidence package except itself. Verify from this directory.

The original export is source-only here. No real-browser/pixel/layout acceptance,
production integration, new model/database field or old ERP data bridge is claimed.
