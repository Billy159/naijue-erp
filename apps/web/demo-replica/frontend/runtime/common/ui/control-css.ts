// Shared visual rules moved verbatim; feature-specific selectors remain in inventory.
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
