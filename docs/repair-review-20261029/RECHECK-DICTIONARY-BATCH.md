# Original dictionary entries P15–P18

Fixed d9a31824 actual headed production build, closed synthetic reads.
P15: color search, 50 rows, second page, jump99 clamped to true last page, tab return retains size: PASS listed steps.
P16: size-group headings/member column, 50 rows, tab roundtrip, nonempty 男装 search: PASS listed steps.
P17: fits 50/tab roundtrip/no-result/clear: PASS; add/cancel unavailable under this build capability, PARTIAL. No permission weakening.
P18: actual four seasons, 50/tab roundtrip, no-result and first Escape clears native search: PASS listed steps.

First run observed stale previous query before React input event settled, producing three test assertion failures. Independent second run explicitly pumps events before networkidle and records actual corresponding response, exit0. No production fix was required. Existing read fixture is reused, not fake pagination totals. Frozen same-state pairing is still separate.
