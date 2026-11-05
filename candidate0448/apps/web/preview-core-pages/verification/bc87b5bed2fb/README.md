# Portable preview evidence: bc87b5bed2fb

This directory archives the already completed three-page portable preview build
and five-group synthetic JSDOM smoke for the exact source checkpoint
`bc87b5bed2fb8f55ff9fd46a01f518d239fcc02a`. The original build/DOM logs, verification
manifest, consumed-input hashes and provenance reports were copied byte-for-byte
from `artifacts/bc87b5bed2fb/`. No source, compiler, build, typecheck or DOM test was
rerun during this archival step. The prior 38a1a9d preview evidence is preserved.

## Archived artifact identity

- HTML filename: `three-core-pages-synthetic-test-only-bc87b5bed2fb.html`.
- Size: 1,365,449 bytes.
- SHA-256: `b058a56e353628bfaca294a608a1248d1b74ff4402d1b70bda70f6bd7c92baf5`.
- Consumed-input snapshot SHA-256:
  `08145638cce32f4b63cebb7f14dc90163cb64e8c006a0f0c186776ceba750181`.
- The large HTML and emitted metafile are intentionally not copied into this
  directory. The original ignored artifact remains in its per-commit directory.
- The HTML exceeds the 262,144-byte embed cap and fits the 10 MiB reference cap.

## Exact consumed-runtime provenance

The build consumed 76 repository source files: 69 actual production source inputs
and seven explicitly isolated preview inputs. The existing builder proved its
consumed runtime sources matched the named checkpoint and did not change during
compilation. The final proof compared their hashes against that same requested
commit and the working files.

Later commits `d24dc431f5a6fb1a0ca70aaefba22d8a45c2a216` and
`e4aa8b2663da5984486ddc63b2f95e2a92ca0950` do not alter any of those 76 consumed
inputs. The later native-acceptance evidence checkpoint
`140324c3bef083bcd950e4a6152bc384d3078d46` also leaves all 76 unchanged. These
are source-hash comparisons, not another build or test run. The archive records
the current working-file comparison in `archival-provenance.json`.

`final-provenance-historical-head-advance.txt` preserves the first final-proof
attempt's overly strict HEAD-equality stop after the successful build/smoke. HEAD
had advanced to d24; no runtime input mismatch or artifact failure occurred.
The successful proof checks actual consumed bytes instead of requiring an
unrelated repository HEAD to remain unchanged.

`copied-evidence.sha256` binds the eight original copied reports and logs.
`archival-provenance.json` records their sizes/hashes, the 76-input comparisons
and unchanged prior-38 verification hashes. Original reports remain unedited,
including their original absolute artifact path and observation times.

## Honest verification boundary

The existing five groups exercised the actual portable shared menu and inventory,
sales full-page read-only detail, transfer detail, product actions and interruption
cleanup with isolated synthetic fixtures. They recorded zero external-resource
requests, network attempts or runtime errors in that JSDOM run.

This is an all-in-one offline synthetic preview, deliberately including inline
sales detail CSS and a preview-only resolved readiness callback. It is not a real
browser, screenshot/pixel, production lazy-loading/waterfall, performance,
authenticated real-data, database, deployment or Space-embed acceptance result.
No upload or commit was performed by this archival step.
