# Transfer/application integration checkpoint

`result.json` and the passing logs in this directory are the current checkpoint.
The source manifests freeze the application and approved shared inputs; the
transfer manifest is copied byte-for-byte from the independently accepted v2
freeze. `delta.sha256` contains changed application source plus the approved
shared frame/nav/style files and freshly generated source-structure evidence.
No temporary `.transfer-app-check-*` bundles are included.

`transfer-app-dom-historical-*` and `transfer-app-dom-trace.txt` are diagnostic
failed/interrupted runs, not successful evidence. They identify harness-only
selector/focus assertion defects. The final `transfer-app-dom.txt` has all six
groups passing against actual leaves/native readers and mocked HTTP/CSS events.

The existing composed eight-group test binds the pre-repair party controller
hash in `result.json`; the separately owned receipt-403 repair needs its own
acceptance. No source under parties is changed in this delta.

No browser/server/network/login/database/deployment or runtime performance/pixel
acceptance is implied. The portable inventory preview is over its Page budget;
its warning is retained in `inventory-preview-build.txt`.
