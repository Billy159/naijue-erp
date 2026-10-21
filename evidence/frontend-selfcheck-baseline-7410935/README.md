# Frontend baseline behavior findings

Baseline 7410935, 2026-10-21. These are original failing behavior observations before subsequent fixes, not a claim about the later working tree. Actual components were exercised in synthetic JSDOM; no real browser, production data or pixel acceptance.

1. React StrictMode effect replay permanently disposes the retained inventory query and candidate query. Default production createApplication itself does not enable StrictMode, so this is not a claim that all production mounts fail.
2. Inventory display settings does not dismiss on Escape/outside click or move focus inside.
3. Sales reference selectors allow simultaneous popups and live requests; outside click fails to abort. Identity revocation correctly aborts both.
4. Candidate-search Enter reaches the main inventory form uncancelled. This confirms an implicit-submit risk, but JSDOM does not execute the native browser default, so no actual browser request is claimed.

Scripts retain original workspace import paths for reproducibility; bundled dependencies are deliberately excluded. Original observations and complete probe logs are retained unchanged. Fix status must be read from later evidence, not inferred from this baseline.
