# Original-runtime / synthetic real-HTTP browser host

This TEST harness is **not** part of runtime commit `0905e799...`. It mounts the
**canonical copied renderer** reached by `scripts/release/build-production.mjs`,
not the alternative `src/application` renderer. Runtime
Git/blob closure, one locked candidate React dependency tree, this harness's
source manifest, the separately frozen OPT00 helpers and frozen DTO profiles are
bound independently in `build-identity.json`. No production runtime is edited.

From the authorized checkout, using exact Node24.21.0/npm11.9.0:

```sh
node --test tests/performance/opt00/browser-host/host.test.mjs
node tests/performance/opt00/browser-host/build.mjs \
  ABS_CLEAN_RUNTIME_REPO EXACT_RUNTIME_40SHA ABS_FRESH_OUTPUT \
  ABS_PREPARATION_SOURCE_MANIFEST EXPECTED_HELPER_MANIFEST_SHA256
node ABS_FRESH_OUTPUT/server-source/tests/performance/opt00/browser-host/serve.mjs \
  ABS_FRESH_OUTPUT ABS_V2_PROFILES_MANIFEST EXPECTED_PROFILE_MANIFEST_SHA256 \
  58601 25 ABS_FRESH_RAW_OUTPUT
```

Only `127.0.0.1` binds. Host/Origin and manifest asset paths fail closed. Each
original API request crosses **actual HTTP** and an explicitly synthetic25ms
server delay (not network throttling and **not DB execution**). All command,
preparation and receipt endpoints fail501; this is ready-only, not write proof.

Open `/sales/distinct30` or `/transfer/distinct30` (also `few`, `lines200`). A3
defaults to **FIRST_LIST_OPEN**: stay on the original list, select sample identity,
click **准备计时**, then the TARGET row's original document-number/**查看** button.
Canonical DRAFTs automatically open editing; entering once then cancelling is
already warm. **WARM_MODIFY** is a separately labelled optional readonly-page
Modify scenario, never first cold edit. The capture handler starts the browser
monotonic timer before that original handler runs. No route/business mutation
is performed by the observer. Ready requires
ALL saved line identities/quantities in enabled actual inputs, transfer's
dictionary coverage and rendered axes, streamed request completion, then two
animation frames. A form shell or optimistic footer count alone never suffices.
No business behavior or DOM is faked. Raw request logs and received quantities
are separate from timing, all DTOs retain original validators. Transfer axes are
verified per original group, not by a global union of shared size IDs. Sales's
extra pending blank entry is not mistaken for a saved line.

The server ARM boundary and actual original-action click are distinct. Raw output keeps
both windows; browser calls are correlated to real server requests by response
request ID. The second transfer-detail read is included if the original Modify
action starts it; neither33 nor34 is prefilled as a measured total. Raw output
includes total click-to-ready, last observed owning detail **stream-body**
completion-to-ready, ALL detail calls, and after-detail actual HTTP request IDs.
The body boundary is not claimed as DB time or decoder/paint duration.

Cancel/error observations have terminal ABORTED/FAILED receipts with null
editReadyMs; the explicit harness cancellation does not change business state.
A60s browser observation deadline is only a FAILED outcome, never readiness;
if the browser disappears, the server writes FAILED at120s. Credential endpoints
are rejected without reading their body; nested credential log keys are redacted.

A4 uses the controller-approved **NETWORK_COLD_VALIDATED** bounded protocol:
each `cold-1`, `repeat-1`, `repeat-2` is the SAME first-list-entry workflow in a
fresh normal application document followed by native hard reload. Each must
prove positive browser transfer plus actual HTTP200/body-byte/manifest-hash
correlation for relevant resources; actual currently linked scripts/styles
must already be completed resources at ready. Server/client no-store is
mandatory. Repeated samples are NOT WARM_MODIFY. Independent browser context
is NOT VERIFIED when native private windows/DevTools are disabled by policy;
never change policy, flags or profiles to bypass it, and never clear user
cookies/global site data. No DB-cache-flush or new-process claim. A failed
resource proof is not accepted cold just because its sample label says cold.
Context independence is never inferred from the `cold-1` label. Profiles are verified unchanged before
and after each sample, once per boundary not once per timed request. Metadata
fetches/assets are retained in raw logs but not hidden in API-read counts.
Use a fresh raw output directory for an independent run; samples cannot overwrite.
Do not sample while the formal gate is using CPU. Three samples are not P95.
`mainThreadMs` and real database metrics stay null; ResourceTiming is raw only.

Stopping the foreground server uses Ctrl-C/SIGTERM for its verified own PID.
This source can rebuild the host; external directories contain only builds,
large generated profiles and raw/browser evidence. PNGs are local QA, not part
of a source package.

## A4 explicit AFTER preparation (no implicit runtime upgrade)

A3 source/build/raw and its18 BEFORE samples are immutable separate evidence.
The three browser observation leaves (`entry.tsx`, `readiness.mjs`,
`action-boundary.mjs`) remain byte-identical; metadata is counted by the same
actual-click / all-successful-body / complete-input+dictionary / two-frame
instrumentation. No times or target counts are prefilled.

`build.mjs` accepts the original five arguments, then optional phase and reviewed
source-manifest path/hash. Default `BEFORE_OPT00` is **hard-pinned** to0905e799 /
a2735e89, not any arbitrary newer clean commit. `AFTER_OPT01_A_R2` REQUIRES a
controller-reviewed exact manifest (external SHA256 supplied separately):

- `format`: `opt00-controller-reviewed-after-runtime-v2`;
- `phase`: `AFTER_OPT01_A_R2`;
- `protocol`: exact exported `AFTER_PROTOCOL` (STRING13 SKU tuples, string-state
  product tuples, wire version2, domain version1, exact v2 endpoint);
- `beforeOrigin`: exact exported `BEFORE_ORIGIN` (original runtime commit/tree,
  unchanged v2 dataset/profile-manifest/logical-data hashes);
- `runtimeCommit`, `runtimeTree`: controller-supplied exact CLEAN AFTER candidate;
- `productionSources`: exactly the seven reviewed OPT01-A paths, each with
  `path`, actual `bytes`, actual `sha256`. No symlinks/missing/changed files.

The builder checks clean Git HEAD/tree, every reviewed source SHA, actual
production Gitblob input closure and locked dependency closure, then repeats
source checks after compilation. It freezes the reviewed manifest as a hashed
artifact. The server independently validates phase binding and the unchanged
BEFORE provenance of all six profiles. No profile JSON is relabeled to AFTER;
`phaseBinding.actualRuntime` and `phaseBinding.beforeOrigin` are separate from
harness/helper/profile hashes in build, raw and server identity.

Only AFTER permits `/current-form/saved-edit-sku-batch-v2/query`. The synthetic
projection reuses the original query parser/context/SKU ordering and joins the
frozen current **readable product list** by exact identity/code/name/group,
with complete group membership. Mere SKU existence/group is NOT eligibility.
Absent product => explicit `UNAVAILABLE` without a group; inconsistent facts
reject. This is a reviewed synthetic read projection, NOT a PostgreSQL/source
admission proof or save/approve authority. Legacy SKU array and dictionary
paging stay unchanged; all command/prepare endpoints still fail501.

The projector first produces the original domain-version1 objects. Only AFTER
loads `encodeCurrentFormSavedEditSkuBatchWireV2` from the selected clean runtime's
existing API module and encodes that domain to final STRING V2. BEFORE never
loads/requires the newer export. Missing optional current-product group is
explicit `UNAVAILABLE`; conflicting code/name/explicit group is rejected, not
repaired from a SKU. There is no local tuple-encoder fallback.

The Node server graph redirects production imports to that selected runtime,
copies its actual Gitblob-verified module closure and permits builtin external
dependencies only. Browser and Node production closures/hashes are separately
recorded; no API/Node import is added to the browser entry/graph. Both source
and dependency checks run after compilation too. The CLI must execute the
verified copied server artifact, not active WIP `serve.mjs`; unknown or changed
artifacts/manifest/source paths fail before listening. Pure unit fixtures prove
that active-WIP API bytes are excluded and a BEFORE branch never loads a module
whose new AFTER export does not exist. Actual dual-runtime build/HTTP evidence
remains separately pending until controller authorizes it.

Offline contract command (no server/build/PG/timing):

```sh
node --test tests/performance/opt00/browser-host/host.test.mjs \
  tests/performance/opt00/browser-host/canonical-profile.test.mjs \
  tests/performance/opt00/browser-host/after-profile.test.mjs
```

AFTER build/host/timed sampling needs separately approved clean candidate,
reviewed manifest/hash and quiet window. A3 BEFORE used eight prior task tabs
and retained successive sample editor tabs (9..26) in a reused ordinary process.
That browser-state limitation is recorded, not silently declared equivalent to
a cleaned AFTER browser. Before comparison, controller must approve either a
reproduced equivalent ordering/state or a new matched BEFORE/AFTER control
protocol; do not claim isolated-context or P95/PG/optimization acceptance.

Controller-approved matched-control plan (NOT yet an execution receipt): same
frozen A4 source, one C03 BEFORE host and one separately reviewed clean AFTER
host, both present throughout. Keep six already recorded background task tabs
(main system pages plus final A3 sales200/transfer200); use ONE visible sample
tab for all36 measurements. For each scenario, alternate B-cold/A-cold,
B-repeat1/A-repeat1, B-repeat2/A-repeat2. Each navigation creates a fresh full
list document followed by native hard reload; no sample editor tabs accumulate.
The same fixed25ms/no-store/v2 facts, original click, complete readiness,
request-ID windows and actual transferred-resource proof apply to both phases.
Record starting/ending tab sets and abort comparability on unexpected changes.
These new matched samples do not overwrite/relabel the old A3 eighteen. They
still need controller's C08 approval, independent A4 review and quiet-window GO.

A4 R2 explicitly rejects the superseded v1 AFTER phase/manifest/metadata URI
and the withdrawn numeric/eighth-codec proposal. The source set is exactly the
seven final reviewed production leaves. No increase to the original8MiB body
limit, input reduction or silent truncation is permitted; final owner wire-v2
capacity evidence and actual client decoder, not small fixture success, gate
AFTER source approval.
