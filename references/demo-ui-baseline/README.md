# Distributable frozen Demo UI reference subset

Source is fixed to commit `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3` (tag convention `8877-final-baseline`). Every source byte was read with `git show <commit>:<sourcePath>`. This is a reference subset, NOT a standalone Demo, formal build, test result, independent acceptance or deployment.

## Start here

- MANIFEST.json: full original source SHA256, selected exact line ranges, destination bytes and SHA256.
- SOURCE-MAP.json: local provenance roots and repository-relative mapping. Remote Dot uses relative package paths.
- INTERACTION-REFERENCE.md: applicable visual/interaction references and later business-rule overrides.
- source/frontend/: 28 verbatim CSS files and 7 component sources without actual business record literals. Components retain old global/bridge references for context; do not add this directory to the production build.
- excerpts/frontend/: 11 Markdown documents containing exact frozen UI snippets. No empty-data replacement or fabricated runnable version.

## Styling and adaptation

The index.html excerpt records original CSS cascade order. basic-settings-v2.css is imported by its JSX source. CSS and Arco components depend on Demo context; adapt by scope to the existing React19/Arco2.66.16 application, retaining one rendering/state owner per region. Original defaults, disabled rules, numeric conversions, DOM enhancers and old global state are not new backend contracts.

## Explicit omissions / missing inputs

- Screenshots: 0. No browser was started. Existing frozen Demo screenshots lack sufficient evidence that every visible value is synthetic, so none was distributed. v14 synthetic screenshots cannot stand in for frozen Demo. Controller can arrange a synthetic-only capture with viewport/DPR/build/provenance evidence later.
- No product-media originals/thumbnails, product-media-thumbnails.js, real-data bridge, model/master data/catalogue/funds literal datasets, fixture/mock modules, databases/backups, employee/customer phone values, accounts, configuration/secrets, runtime scripts or bundles.
- No font binaries. Four `assets/fonts/jakarta-{400,500,600,700}.woff2` references in ui-tokens.css are intentionally unresolved. Font/resource closure and pixel parity are NOT claimed.
- No complete Demo dependencies, actual backend/auth/data/media/import inputs. This subset does not satisfy B01 or B06 runtime/data prerequisites.

## Remote Dot handoff

Use repository path `references/demo-ui-baseline/`; local absolute paths in metadata are provenance only. The complete Demo, controlled media and real business inputs remain private references. Ask the controller for an explicitly approved controlled transfer if needed; do not fetch databases, private historical Git contents or browser records to fill gaps. Continue UI work from these snippets while recording missing screenshots/fonts/real-service chains as not tested. Current implementation contracts remain in `docs/rapid-launch-20261022/`, not in this reference pack.
