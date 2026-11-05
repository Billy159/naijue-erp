# Product specification modal shared style

Actual headed fixed d9a31824 RED: SpecModal width520 at1440 viewport, dual transfer panel clipped/inner horizontal scroll and truncated titles. Frozen product-arco.jsx already defines pc-wide780 and transfer sizing. Current SourceModal owns that same style, but SpecModal used a separate raw Arco Modal without attaching it.

Minimal correction: SourceModal optional wide prop defaults false; SpecModal reuses it. No new CSS override or layout redesign. Product editor DOM regression native exit0, product types exit0. Actual fixed build geometry/1440+900 and frozen pair pending at checkpoint.

Fixed 35ef9040 production build actually retested at1440/900: both color and fit dialogs width780/client780/scroll780, close/cancel works; production six-tab and price/discard regressions exit0. Frozen b8 actual same color dialog width780/client780/scroll780, exit0. Candidate900 and frozen1440 pixels inspected; complete titles and dual panels visible, no old horizontal clipping. Candidate paged source intentionally displays only loaded candidates and Load More, not falsely total all source.
Evidence: recovery/recheck-products-20261029/spec-green-1440 and spec-green-900; recovery/frozen-spec-modal-1828. Original red preserved; later price/discard failures in red are cascades from the deliberately retained failing modal, not independent production findings.
