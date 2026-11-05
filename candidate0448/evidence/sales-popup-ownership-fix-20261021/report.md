# Sales reference popup ownership fix

## Result

The confirmed lifecycle defect is fixed in the cloud worktree. A sales page now
owns one `ExclusivePopupController` and one outside/Escape listener pair. Existing
reference selectors obtain a lease from that host rather than independently
keeping popups open. The supplied pure controller was reused without modification.

- Opening a different reference closes and synchronously aborts the old candidate
  scope before its replacement starts a transport.
- Outside pointerdown and Escape close and abort the active candidate.
- Explicit close/Escape restore focus only when focus was inside the control and
  its trigger remains connected, enabled, visible, and in the active read scope.
  Replacement, outside click, detail entry, advanced-filter removal, unmount and
  identity revocation do not refocus a stale or hidden trigger.
- Every actual reopening receives a fresh short-lived candidate scope; the
  existing guarded request startup remains StrictMode replay-safe.
- Old ignored-signal completions cannot reopen or populate another popup.
- Route unmount and read-identity revocation remove the page's listeners.

No native scalar filter, query contract, business rule, date formatting, CSS,
package dependency or popup presentation was changed.

## Same-shape reproduction

`fixed-observations.json` records the repaired equivalent of the original probe:

- After outside: 0 popups; first request aborted.
- After opening the second selector: 1 popup; 2 total transport starts across
  the two explicit opens; first request aborted, second request active.
- After identity revocation: 0 popups; all outstanding requests aborted.

The pre-fix observations were not overwritten. Run the new equivalent with:

    node evidence/sales-popup-ownership-fix-20261021/reproduce-sales-popup.mjs

## Verification

All saved runs passed against the source hashes in `source-sha256.json`:

1. `node apps/web/src/sales/tests/run-reference-popup-dom-tests.mjs`
   passed 5 focused synthetic DOM groups. Full output: `focused-dom.log`.
2. `node apps/web/src/sales/tests/run-dom-tests.mjs`
   passed all 18 existing sales DOM groups. Full output: `existing-sales-dom.log`.
3. The standalone fixed reproduction passed. Full output: `fixed-probe.log`.
4. `git diff --check` passed for the two modified existing sales source files.

Aggregate TypeScript/build/full-suite verification belongs to the coordinating
task and was not claimed by this focused worker. These synthetic DOM checks are
not actual-browser, network, PostgreSQL, performance, visual-parity, production
or release acceptance. Original Demo control replacement remains separate work.
No commit, push, server, local-computer access or database action was performed.
