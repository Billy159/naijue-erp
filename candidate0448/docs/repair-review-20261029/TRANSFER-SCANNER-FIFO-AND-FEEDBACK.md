# Transfer scanner queue and bounded feedback

The frozen Demo's transfer scan drawer clears each Enter immediately and queues exact barcode work in FIFO order. The production replica previously disabled input while resolving, losing rapid scans. This change queues in the actual replica carrier; each item uses the original session/controller and obtains its current draft revision at dequeue. Failed scans pause and discard queued tail; user edits, warehouse changes, close, scope denial and late responses cannot apply old scans.

Transfer-only lookup budget is 3000 ms, with immediate pending feedback. This is a new requested responsiveness target, not a frozen Demo performance guarantee. Timeout aborts and settles even readers that ignore AbortSignal; no automatic retry or late duplicate addition. Other users of the shared controller do not gain a default timeout. UI trimming matches frozen submit; stored barcode values and backend exact identity rules are unchanged.

Native evidence: portable original-source regression reproduced failures; patched actual carrier/session/controller 10/10 passed. Existing transfer proposal 11/11, original scanner input DOM and both type checks passed. Independent source review and selected original logs accompany this note.

Not yet accepted: actual headed keyboard scanning, physical scanner hardware, real PostgreSQL/save/approve/unapprove chain, latency distributions, or production network. No whole-system or release-ready claim. Frozen Demo and delivered ae7 source package remain unchanged.
