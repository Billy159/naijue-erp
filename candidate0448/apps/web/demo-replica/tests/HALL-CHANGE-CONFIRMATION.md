# Hall-change confirmation

Native 2 RED cases (missing explicit confirmation and initial default marking clean draft dirty), then 22/22 proposal tests and typecheck passed. Fixed 2f2eed13 headed run exposed a real follow-up: Select closes its candidate popup before modal confirmation, invalidating a picker-reference-only CAS. Fixed 6512ce26 captures an already validated candidate before closing its menu and supplies a one-shot confirmation closure. It rejects changed draft/entries/line edit, a newer open picker, disposal and revoked scope. It never reconstructs a hall from text or a forged ID.

Only explicit confirmation clears hall-dependent references, completed/pending products, settlements and adjustment; date, business type, note and responsibility remain. Cancel does not mutate the original draft. Trusted initial employee default preserves the current dirty flag; intentional user edits remain dirty.

Dot native 22/22 + typecheck exit0. Fixed 6512ce26 production bytes, headed browser2: cancel preserves original hall/person; repeat and confirm switches hall; second hall customer recommendation changes; no pageerrors. Screenshot inspected. Evidence recovery/hall-change-20261029. Readonly synthetic browser proof, not a database business write. Existing clear-hall behavior and broader form workflows still require their own matrix checks.
