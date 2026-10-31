# Non-empty finite preview — real application service, memory only

The `--sales-chain` fixture intentionally starts empty; a successful zero-result query is not a read failure. `--sales-preview` additionally creates six clearly labelled synthetic documents through actual HTTP SAVE/APPROVE commands: saved and approved SALE, RETURN, EXCHANGE. No static approved document is imported and no production rules are replaced.

First native RED: missing seed module. Second real RED: old fixture IDs shared the first eight characters, producing duplicate visible document numbers. Fixture now uses real randomUUID IDs (production generator unchanged). Dot native `sales-preview-20261029/green2`: 8/8 service tests PASS, including all three complete lifecycles, exact balance changes, receipt replay, unique visible numbers, and replay preserving a user unapproval. No PG/production/credentials. Older interactive windows are not reset.
