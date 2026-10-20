# Frozen transfer adaptation

Primary source: frozen `8877-ui-evidence-b8bcfe3` package, original frontend bytes and its `LOAD_ORDER.md` / `LAYOUT_MAP.md`. No frozen runtime or data modules were executed, copied into production, fetched or reconstructed.

## Applied final layout evidence

- `transfer-current.js:72` initial list and `transfer-golden.js:15–27` **final overlay** establish the final ten columns: 日期 / 调拨单号 / 状态 / 调出仓库 / 调入仓库 / 商品信息 / 数量 / 创建者 / 最后更新 / 操作. The earlier eleven-column table is not used.
- `transfer-golden.js:17–23` establishes the primary start/end date, multi-status, multi-from, multi-to row and advanced single-number field. `inventory-filters.jsx` supplies pinned Arco TreeSelect presentation; `transfer-date.jsx` supplies pinned Arco DatePicker presentation. Existing installed Arco 2.66.16 controls are used, not imitation native selects/date inputs.
- `transfer-golden.js:26` and later `unified-single-select.jsx` supply source page choices 20/50/100/200, with an installed Arco Select for page size and compact stable numeric pager.
- `transfer-current.js:76` and `transfer-golden.js:30–35` supply the full-page document header order, remarks, status/actions and entry toolbar. This is not the unrelated sales modal.
- `transfer-matrix-experiment.js:24–26,50–67` supplies the product/name, color, FIT, size columns, subtotal and 查看 action matrix. `matrix-experiments.css`, `golden-consistency.css:133–155` and `final-ui.css:4` supply fixed 280/76/88/56/52/96 widths, sticky identity/subtotal/action columns, baseline product identity layout and compact cells. Final header/footer overrides, not early bordered-header/action-group rules, are respected.
- `golden-consistency.css:98–114,123–155` supplies two-row filter geometry, flat detail header, section-head height30 with the earlier min-height32 retained by the cascade, 42px left-start/gap8/12px summary footer and canonical matrix geometry. Route CSS is scoped and detail CSS is a separate action leaf.
- `transfer-golden.js:8–9` supplies Asia/Shanghai minute timestamp display. Native full timestamps remain in titles; exact quantities/counts use BigInt/string formatting.

## Intentional supported differences

1. This slice is genuinely read-only. Existing write-looking actions are disabled and labelled unavailable, not wired to mock commands, leases, local storage or fake confirmation. Product 查看 uses the genuine existing target-only reader when its complete stylesheet capability is supplied.
2. Canonical native product/color/FIT/size IDs replace the legacy multi-historical-ID display projection, per the approved clean-system direction. Full current native size-group order and names are shown; saved historical labels remain separately disclosed, never rewritten by current names.
3. Category tag facts, units, number suggestions, live source/destination warehouse inventory and operation history are not in this read contract. None is guessed or populated from global catalogs. Historical category absence is stated in the preserved list column.
4. Filter/reference reads are bounded, independently paged and scoped. They do not preload every warehouse/product, infer write eligibility or perform N+1 reads. Native warehouse matching does not reproduce local pinyin matching. Native case-insensitive number matching and deterministic server tie-breaking document their locale differences in the backend contract.
5. Editable controls become read values in this read-only document header. The date field is not a faux editable date picker; only the actual list date filters use the source Arco date control. Read-only data provenance and bounded saved-line disclosure are explicit additions.
6. Grids beyond the documented render budget explicitly switch to paginated actual lines and full-size-label pages. This is not claimed to match source pixels; it prevents valid but huge sparse Cartesian DOM creation without silent truncation.
7. Host-owned route/history/identity integration and real browser acceptance remain separate gates. Return-to-list preserves the mounted executed list and scroll/focus; deep-link target activation is supported, without inventing the application's URL/history policy.

Static source and JSDOM checks verify these mappings and lifecycle facts, not computed browser styles, network waterfalls or Demo screenshots.
