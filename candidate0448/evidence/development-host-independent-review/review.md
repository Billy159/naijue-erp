# Independent development-host boundary review

Result: no blocking issues found in the frozen development-host source and documentation.

Scope: `apps/web/src/development-host/` and `docs/development-host.md`, against the unchanged application/authentication/route contracts at baseline `090ec77`. Reviewer did not edit implementation, documentation or owner tests. Full reviewed identities are in `reviewed-source.sha256` and `reviewed-application-dependencies.sha256`; all 13 new-source/document and 6 existing-application hashes matched before the final run.

Independent verification: `node evidence/development-host-independent-review/run-review.mjs` passed five focused groups on the final frozen source. See `final-result.log`.

1. Exact public configuration schema rejects 38 malformed/private settings and unsafe manifest paths; no account, principal, role, token or secret injection was introduced.
2. Actual offline split build emits manifest-wired HTML with only shell/host CSS links. Startup static-import closure excludes business leaves, Arco, preview and fixtures; a synthetic environment-secret sentinel was not present in emitted output. Existing separate route/action CSS and builder remain intact.
3. Cross-origin, HTTP and duplicate-root mounting fail before fetch. Inert mount does not authenticate, navigate or load business assets. Presentation switches do not grant authorization. Absent routes, party maintenance and new/write navigation remain disabled; inventory export/print remain disabled.
4. Pending route CSS cancellation prevents late mounting. Identity replacement aborts outstanding native-reader work before replacement UI, stale old-scope 401 cannot expire a newer identity, and app disposal removes identity, scopes, DOM and owned route CSS. No late response resurrects the owner.
5. Page-hide invalidates the owner; persisted page-show creates a fresh unresolved owner rather than restoring old identity/business content. Repeated page-show does not duplicate it. Explicit `verifyOnMount` makes one session check only, and cancellation rejects a late identity.

Read-only source review also verified that inventory receives only `actions: {}`, sales receives no command adapter, transfer receives only read/detail/product adapters, and no party/new-request-key capability is installed. Route display/composition flags are not server policy. Documentation accurately leaves actual hosting, TLS, cookie/CSRF/CSP, history routing, cache integrity, browser rendering, frozen-Demo visual parity and performance acceptance open.

Boundaries: offline esbuild plus jsdom and conspicuously synthetic mock fetch/CSS events only. No listener, browser, network request, database, production action, package install, broad aggregate rerun or concurrent TypeScript check was performed by this reviewer. Owner's focused typecheck/unit/DOM/build evidence is separate and is not relabelled as an independent rerun.

Historical harness diagnostic: `diagnostic-harness-html-regex.log` is a failed reviewer assertion which incorrectly treated lazy stylesheet names inside the non-executable JSON manifest as active HTML links. It was corrected to inspect the actual two link tags before both passing runs; it is not an implementation failure. `result.log` is the earlier passing review before the builder added accurate host-style metafile metadata; `final-result.log` is the post-freeze result.
