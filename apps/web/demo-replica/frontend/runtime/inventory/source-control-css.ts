// Unchanged control CSS from accepted frozen Demo JSX. Global final layers remain C-owned.
export const productCss = `
:host{display:block;width:100%;min-width:0;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}
#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}
#portal>*{pointer-events:auto}
.arco-select{display:block;width:100%;font-size:13px}
.arco-select .arco-select-view{height:32px;min-height:32px;max-height:32px;overflow:hidden;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
.arco-select:hover .arco-select-view{border-color:transparent;background:var(--ca-surface-muted)}
.arco-select.arco-select-focused .arco-select-view{border-color:var(--ca-control-focus-border);background:var(--ca-surface-muted);box-shadow:none}
.arco-select.arco-select-focused:not(.inv-has-tags) .arco-select-view{background:var(--ca-surface)}
.arco-select .arco-input-tag,.arco-select .arco-input-tag:hover,.arco-select .arco-input-tag.arco-input-tag-focus{background:transparent!important}
.arco-select .arco-input-tag-view,.arco-select .arco-input-tag-inner{min-width:0}
.arco-select .arco-input-tag-inner{flex-wrap:nowrap;white-space:nowrap}
.arco-select .arco-input-tag .arco-input-tag-tag,
.arco-select.arco-select-focused .arco-input-tag .arco-input-tag-tag{height:23px;line-height:23px;max-width:none;flex:none;white-space:nowrap;background:var(--ca-surface);color:var(--ca-ink);border:0;border-radius:3px;box-shadow:none}
.arco-select .arco-tag-content{overflow:visible;text-overflow:clip;white-space:nowrap}
.arco-select .inv-tag{display:inline-flex;align-items:center;gap:2px;height:23px;max-width:none;padding:0 4px 0 7px;border:0;border-radius:3px;background:var(--ca-surface);color:var(--ca-ink);white-space:nowrap}
.inv-tag-copy{border:0;padding:0;background:transparent;color:inherit;font:inherit;line-height:21px;cursor:copy;white-space:nowrap}
.inv-tag-copy:focus-visible{outline:1px solid var(--ca-control-focus-border);outline-offset:1px}
.arco-select .inv-tag .arco-tag-close-icon{margin-left:0}
.arco-select .arco-tag-close-icon,.arco-select .arco-icon-hover{color:var(--ca-ink-2)}
.arco-select .arco-input-tag .arco-input-tag-tag:has(.inv-count),
.arco-select.arco-select-focused .arco-input-tag .arco-input-tag-tag:has(.inv-count){padding-inline:3px;border:0;background:transparent}
.inv-count{white-space:nowrap;color:var(--ca-ink-2);font-size:12px}
.arco-select-view input{font-size:13px;min-width:42px;background:transparent}
.arco-select-view .arco-select-view-suffix{flex:none}
.arco-trigger-popup{max-width:calc(100vw - 24px)}
.arco-select-popup{padding:0;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg)}
.arco-select-popup:has(.inv-menu-grid){border:0;box-shadow:none;background:transparent}
.arco-select-popup-inner{max-height:320px;overflow:auto;padding:4px!important}
.arco-select-option{display:flex;align-items:center;min-height:36px;padding:4px 8px!important;color:var(--ca-ink)!important;background:var(--ca-popover-bg);font-size:13px}
.arco-select-option-selected{background:var(--ca-surface-subtle)!important;color:var(--ca-ink)!important}
.arco-select-option-hover{background:var(--ca-popover-hover)!important;color:var(--ca-ink)!important}
.arco-select-option-disabled{background:var(--ca-popover-bg)!important;color:var(--ca-disabled-ink)!important}
.arco-select-option-content{width:100%;min-width:0}
.inv-menu-grid{display:grid;grid-template-columns:var(--inv-list-width) minmax(0,1fr);gap:8px;align-items:start;min-height:0}
.inv-menu-grid-empty{display:block;min-height:0}
.inv-menu-list{min-width:0;min-height:0;overflow:hidden;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg)}
.inv-result-heading{display:grid;grid-template-columns:170px minmax(0,1fr);gap:10px;align-items:center;min-height:28px;padding:4px 12px;border-bottom:1px solid var(--ca-line);color:var(--ca-ink-2);font-size:12px;font-weight:400}
.inv-menu-list .arco-select-popup-inner{box-sizing:border-box;max-height:306px;overflow-y:auto;padding:2px 4px!important;scrollbar-gutter:stable}
.inv-menu-list .arco-select-option-wrapper{display:flex;align-items:center;min-height:30px;max-height:30px;margin:0;padding:0}
.inv-menu-list .arco-select-checkbox{display:none}
.inv-menu-list .arco-select-option{box-sizing:border-box;flex:1;height:30px;min-height:30px;padding:4px 8px!important}
.inv-option-row{display:flex;gap:10px;align-items:center;width:100%;min-width:0;color:var(--ca-ink)}
.inv-option-code{flex:none;width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;color:var(--ca-ink);font-variant-numeric:tabular-nums}
.inv-option-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;color:var(--ca-ink-2)}
.inv-preview{box-sizing:border-box;min-width:0;padding:8px 10px;background:var(--ca-surface-subtle);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);color:var(--ca-ink)}
.inv-preview-title{margin-bottom:6px;font-size:13px;line-height:18px;font-weight:600;color:var(--ca-ink-2)}
.inv-photo-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px 4px;align-items:start;margin-bottom:10px}
.inv-photo-item{display:block;min-width:0;cursor:zoom-in;outline:none}
.inv-photo-tile{box-sizing:border-box;display:block;width:100%;aspect-ratio:1;padding:2px;border-radius:3px;background:var(--ca-surface);overflow:hidden}
.inv-photo-item:hover .inv-photo-tile,.inv-photo-item:focus-visible .inv-photo-tile{box-shadow:inset 0 0 0 1px var(--ca-control-focus-border)}
.inv-photo-tile .arco-image{display:block!important;width:100%!important;height:100%!important;background:var(--ca-surface)}
.inv-photo-tile .arco-image-img{width:100%!important;height:100%!important;object-fit:cover;object-position:center 35%}
.inv-photo-label{display:block;overflow:hidden;margin-top:3px;text-align:center;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;color:var(--ca-ink-2)}
.inv-photo-zoom .arco-popover-inner{padding:8px}
.inv-photo-zoom-content .arco-image{display:block;background:var(--ca-surface-muted)}
.inv-photo-zoom-content .arco-image-img{width:100%!important;height:100%!important;object-fit:contain}
.inv-photo-zoom-label{display:block;margin-top:5px;text-align:center;color:var(--ca-ink);font-size:12px}
.inv-preview-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 10px;font-size:14px;line-height:20px}
.inv-preview-field{min-width:0;overflow-wrap:anywhere}
.inv-preview-field small{font-size:13px;color:var(--ca-ink-2)}
.inv-preview-no-photo{margin:2px 0 6px;color:var(--ca-ink-2);font-size:12px}
.inv-menu-heading{display:flex;align-items:center;justify-content:space-between;min-height:30px;padding:4px 12px;font-size:13px;font-weight:400;color:var(--ca-ink-2);border-bottom:1px solid var(--ca-line)}
.inv-menu-heading button{padding:0;border:0;background:transparent;color:var(--ca-ink-2);cursor:pointer;font:inherit}
.inv-menu-heading button:hover,.inv-menu-heading button:focus-visible{color:var(--ca-primary-ink);text-decoration:underline}
.inv-history-menu .arco-select-checkbox{display:none}
.inv-history-menu .arco-select-popup-inner{max-height:248px;padding:2px 4px!important}
.inv-history-menu .arco-select-option-wrapper{padding:0}
.inv-history-menu .arco-select-option{min-height:30px;padding:4px 8px!important;font-size:13px;font-weight:400}
.inv-recent{display:flex;align-items:center;gap:8px;width:100%;min-width:0;color:var(--ca-ink)}
.inv-recent span{flex:1;min-width:0;overflow-wrap:anywhere;line-height:18px}
.inv-recent button{border:0;background:transparent;color:var(--ca-ink-2);cursor:pointer;font:inherit}
.inv-recent button{width:18px;height:22px;padding:0;font-size:17px;line-height:22px;opacity:0}
.arco-select-option-wrapper:hover .inv-recent button,.arco-select-option-hover .inv-recent button,.inv-recent button:focus-visible{opacity:1}
.inv-recent button:hover{color:var(--ca-primary-ink)}
.inv-no-result{padding:12px;color:var(--ca-ink-2);font-size:13px}
@media(max-width:740px){.inv-menu-grid{grid-template-columns:1fr;gap:4px}}
`;
export const categoryCss = `
:host{display:block;width:100%;min-width:0;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}
#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}
#portal>*{pointer-events:auto}
.arco-tree-select{display:block;width:100%;font-size:13px}
.arco-tree-select .arco-tree-select-view{height:32px;min-height:32px;max-height:32px;overflow:hidden;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
.arco-tree-select:hover .arco-tree-select-view{border-color:transparent;background:var(--ca-surface-muted)}
.arco-tree-select.arco-tree-select-focused .arco-tree-select-view{border-color:var(--ca-control-focus-border);background:var(--ca-surface-muted);box-shadow:none}
.arco-tree-select .arco-input-tag,.arco-tree-select .arco-input-tag:hover,.arco-tree-select .arco-input-tag.arco-input-tag-focus{background:transparent!important}
.arco-tree-select .arco-input-tag-view,.arco-tree-select .arco-input-tag-inner{min-width:0}
.arco-tree-select .arco-input-tag-inner{flex-wrap:nowrap;white-space:nowrap}
.arco-tree-select .arco-input-tag .arco-input-tag-tag{height:23px;line-height:23px;max-width:calc(100% - 42px);flex:none;white-space:nowrap;background:var(--ca-surface);color:var(--ca-ink);border:0;border-radius:3px;box-shadow:none}
.arco-tree-select .arco-tag-content{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arco-tree-select .arco-input-tag .arco-input-tag-tag:has(.inv-cat-count){padding-inline:3px;border:0;background:transparent;box-shadow:none}
.inv-cat-count{white-space:nowrap;color:var(--ca-ink-2);font-size:12px}
.arco-tree-select .arco-tag-close-icon,.arco-tree-select .arco-icon-hover{color:var(--ca-ink-2)}
.arco-tree-select-view input{font-size:13px;min-width:32px;background:transparent}
.arco-tree-select-view .arco-tree-select-view-suffix{flex:none}
.arco-trigger-popup{max-width:calc(100vw - 24px)}
.arco-tree-select-popup{box-sizing:border-box;padding:4px;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg);color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree{max-height:320px;overflow-y:auto;scrollbar-gutter:stable}
.arco-tree-select-popup .arco-tree-node{min-height:30px;color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree-node-title{font-size:13px;color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree-node-selected .arco-tree-node-title,.arco-tree-select-popup .arco-tree-node:hover .arco-tree-node-title{background:var(--ca-popover-hover);color:var(--ca-ink)}
.arco-tree-select-popup .arco-checkbox-checked .arco-checkbox-mask,.arco-tree-select-popup .arco-checkbox-indeterminate .arco-checkbox-mask{background:var(--ca-primary);border-color:var(--ca-primary)}
`;
export const filterCss = `
:host{display:block;width:100%;min-width:0;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}#portal>*{pointer-events:auto}
.arco-tree-select{display:block;width:100%;font-size:13px}
.arco-tree-select .arco-tree-select-view{height:32px;min-height:32px;max-height:32px;overflow:hidden;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
.arco-tree-select:hover .arco-tree-select-view{border-color:transparent;background:var(--ca-surface-muted)}
.arco-tree-select.arco-tree-select-focused .arco-tree-select-view{border-color:var(--ca-control-focus-border);background:var(--ca-surface-muted);box-shadow:none}
.arco-tree-select .arco-input-tag,.arco-tree-select .arco-input-tag:hover,.arco-tree-select .arco-input-tag.arco-input-tag-focus{background:transparent!important}
.arco-tree-select .arco-input-tag-view,.arco-tree-select .arco-input-tag-inner{min-width:0}
.arco-tree-select .arco-input-tag-inner{flex-wrap:nowrap;white-space:nowrap}
.arco-tree-select .arco-input-tag .arco-input-tag-tag{height:23px;line-height:23px;max-width:calc(100% - 42px);flex:none;white-space:nowrap;background:var(--ca-surface);color:var(--ca-ink);border:0;border-radius:3px;box-shadow:none}
.arco-tree-select .arco-tag-content{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arco-tree-select .arco-tag-close-icon,.arco-tree-select .arco-icon-hover{color:var(--ca-ink-2)}
.arco-tree-select .arco-input-tag .arco-input-tag-tag:has(.inv-filter-count){padding-inline:3px;border:0;background:transparent}
.arco-tree-select.inv-all-selected .arco-input-tag-inner>.arco-input-tag-tag:not(:first-child){display:none}
.inv-filter-count{white-space:nowrap;color:var(--ca-ink-2);font-size:12px}
.arco-tree-select-view input{font-size:13px;min-width:32px;background:transparent}
.arco-tree-select-view .arco-tree-select-view-suffix{flex:none}
.arco-trigger-popup{max-width:calc(100vw - 24px)}
.arco-tree-select-popup{box-sizing:border-box;padding:4px;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg);color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree{max-height:288px;overflow-y:auto;scrollbar-gutter:stable}
.arco-tree-select-popup .arco-tree-node{box-sizing:border-box;min-height:30px;padding-left:8px;color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree-node-switcher{display:none}
.arco-tree-select-popup .arco-tree-node-title{font-size:13px;color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree-node-selected,.arco-tree-select-popup .arco-tree-node:hover{background:var(--ca-popover-hover)}
.arco-tree-select-popup .arco-tree-node-selected .arco-tree-node-title,.arco-tree-select-popup .arco-tree-node:hover .arco-tree-node-title{background:transparent;color:var(--ca-ink)}
.arco-tree-select-popup .arco-checkbox-checked .arco-checkbox-mask,.arco-tree-select-popup .arco-checkbox-indeterminate .arco-checkbox-mask{background:var(--ca-primary);border-color:var(--ca-primary)}
.inv-filter-tools{display:flex;align-items:center;gap:8px;padding:5px 8px 7px;border-bottom:1px solid var(--ca-line);color:var(--ca-ink-2);font-size:12px}
.inv-filter-empty{padding:10px;color:var(--ca-ink-2);font-size:13px}
`;

export const dateCss = `
:host{display:block;width:100%;font:13px Arial,"PingFang SC",sans-serif;color:var(--ca-ink);--primary-6:var(--ca-primary-rgb);--arcoblue-6:var(--ca-primary-rgb)}
#root,.arco-picker{width:100%}
.arco-picker{box-sizing:border-box;height:32px;min-height:32px;border:1px solid transparent;border-radius:4px;background:var(--ca-surface-muted);box-shadow:none}
.arco-picker:hover{border-color:var(--ca-control-hover-border);background:var(--ca-surface-muted)}
.arco-picker-focused,.arco-picker-focused:hover{border-color:var(--ca-primary);background:var(--ca-surface-muted);box-shadow:none}
.arco-picker input{font:13px Arial,"PingFang SC",sans-serif;color:var(--ca-ink)}
.arco-picker input::placeholder{color:var(--ca-ink-3)}
#portal .arco-trigger{z-index:2000!important}.arco-picker-container{border-radius:5px;background:#fff;box-shadow:var(--ca-shadow-float)}
:host([data-ledger-source]) .arco-input-wrapper{box-sizing:border-box;width:100%;height:32px;min-height:32px;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
:host([data-ledger-source]) .arco-input-wrapper:hover{border-color:var(--ca-control-hover-border)}
:host([data-ledger-source]) .arco-input-wrapper:focus-within{border-color:var(--ca-control-focus-border)}
:host([data-ledger-source]) input{font:13px Arial,"PingFang SC",sans-serif;color:var(--ca-ink)}
`;

export const singleCss = `
:host{display:block;width:100%;min-width:0;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2)}
#root{width:100%;min-width:0}#portal{position:fixed;inset:0;z-index:2000;pointer-events:none}#portal>*{pointer-events:auto}
.arco-select{display:block;width:100%;font-size:13px}.arco-select .arco-select-view{box-sizing:border-box;height:32px;min-height:32px;max-height:32px;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
.arco-select-size-default.arco-select-single .arco-select-view{padding-inline:3px}
.arco-select:hover .arco-select-view{border-color:var(--ca-control-hover-border);background:var(--ca-surface-muted)}
.arco-select.arco-select-focused .arco-select-view{border-color:var(--ca-control-focus-border);background:var(--ca-surface-muted);box-shadow:none}
.arco-select-view .arco-select-view-value{display:flex;align-items:center;min-width:0;overflow:hidden}.ui-single-tag{box-sizing:border-box;display:inline-flex;align-items:center;max-width:100%;height:23px;padding:1px 7px;overflow:hidden;border-radius:3px;background:#fff;color:var(--ca-ink);text-overflow:ellipsis;white-space:nowrap;font:400 13px Arial,"PingFang SC",sans-serif}
.ui-page-size-select .ui-single-tag,.ui-flat-select .ui-single-tag{padding-left:7px;background:transparent}
:host([data-ui-transfer-creator]) .arco-select .arco-select-view{border-color:var(--ca-control-border)!important;background:#fff!important}
:host([data-ui-transfer-creator]) .arco-select:hover .arco-select-view,:host([data-ui-transfer-creator]) .arco-select.arco-select-focused .arco-select-view,:host([data-ui-transfer-creator]) .arco-select:focus-within .arco-select-view{border-color:var(--ca-control-hover-border)!important;background:#fff!important;box-shadow:none!important;outline:0!important}
:host([data-ui-transfer-creator]) .arco-select-view input{outline:0!important;box-shadow:none!important}
:host([data-ui-transfer-creator]) .ui-single-tag{background:transparent!important}
:host([data-ui-transfer-fit]) .arco-select .arco-select-view{background:var(--ca-surface-muted)!important}
:host([data-ui-transfer-fit]) .ui-single-tag{background:transparent!important}
.arco-select-view input{min-width:28px;font-size:13px;background:transparent}.arco-select-view input::placeholder{color:var(--ca-ink-3)}.arco-select .arco-icon-hover{color:var(--ca-ink-2)}
.arco-select-popup{box-sizing:border-box;padding:4px;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);background:#fff;box-shadow:var(--ca-shadow-float)}.arco-select-popup-inner{max-height:288px;overflow:auto}.arco-select-option-wrapper{height:30px!important;min-height:30px!important;max-height:30px!important;padding:0 4px!important}.arco-select-option{box-sizing:border-box;height:30px!important;min-height:30px!important;max-height:30px!important;padding:0 8px!important;line-height:30px!important;color:var(--ca-ink)!important;background:#fff;font-size:13px!important;font-weight:400!important}.arco-select-option-selected{background:var(--ca-surface-subtle)!important;font-weight:400!important}.arco-select-option-hover,.arco-select-option:hover{background:var(--ca-popover-hover)!important}.arco-select-option-disabled{color:var(--ca-disabled-ink)!important}
.arco-select-option-content{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.arco-select-popup .arco-empty{font-size:13px}
.arco-select-optgroup-label,.arco-select-popup .arco-select-group-title{padding:5px 12px;color:var(--ca-ink-3);font-size:11px;background:var(--ca-surface-subtle)}
.ui-select-recommendation{padding:8px 10px;border-bottom:1px solid var(--ca-line);background:var(--ca-surface-subtle);color:var(--ca-ink);font-size:12px}.ui-select-recommendation small{display:block;margin-bottom:3px;color:var(--ca-ink-3)}.ui-select-recommendation-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.ui-select-recommendation-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ui-select-recommendation-row button{flex:none;padding:2px 4px;border:0;background:transparent;color:var(--ca-primary);font:inherit;cursor:pointer}
`;

export const emptyCss = `
      :host{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink)}
      .arco-empty{padding:0}
      .arco-empty .arco-empty-wrapper{color:var(--ca-ink-3)}
      .arco-empty .arco-empty-image{font-size:56px;line-height:1;margin-bottom:12px}
      .arco-empty .arco-icon{width:1em;height:1em}
      .arco-empty .arco-empty-description{font-size:13px;color:var(--ca-ink-2)}
      .inv-empty-copy{display:flex;flex-direction:column;align-items:center;gap:6px}
      .inv-empty-copy strong{font-size:15px;line-height:22px;font-weight:600;color:var(--ca-ink)}
      .inv-empty-copy span{line-height:20px;color:var(--ca-ink-2)}
    `;
