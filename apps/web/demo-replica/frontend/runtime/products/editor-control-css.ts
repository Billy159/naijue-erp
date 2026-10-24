// Exact local product-arco.jsx control CSS; frozen source remains untouched.
export const editorControlCss = `
:host{display:block;min-width:0;width:100%;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}#portal>*{pointer-events:auto}
.arco-select,.arco-cascader,.arco-input-wrapper{width:100%;font-size:13px}
.arco-select-view,.arco-cascader-view,.arco-input-wrapper{box-sizing:border-box;min-height:32px;height:32px;border:1px solid transparent!important;border-radius:var(--ca-radius-control)!important;background:var(--ca-surface-muted)!important;box-shadow:none!important}
.arco-select:hover .arco-select-view,.arco-cascader:hover .arco-cascader-view,.arco-input-wrapper:hover{border-color:var(--ca-control-border-hover)!important}
.arco-select.arco-select-focused .arco-select-view,.arco-cascader.arco-cascader-focused .arco-cascader-view,.arco-input-wrapper:focus-within{border-color:var(--ca-control-focus-border)!important;box-shadow:none!important}
.arco-select-view-input,.arco-cascader-view-input,.arco-input-inner{font-size:13px!important}
.arco-select-view-tag,.arco-input-tag-tag{height:23px;line-height:23px;background:var(--ca-surface)!important;color:var(--ca-ink)!important;border:0!important}
.arco-trigger-popup{z-index:1600;max-width:calc(100vw - 24px)}
.arco-select-popup,.arco-cascader-popup{border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg)}
.arco-select-option,.arco-cascader-option{min-height:30px;font-size:13px}
.arco-select-option:hover,.arco-cascader-option:hover{background:var(--ca-popover-hover)}
.arco-tree{font-size:13px}.arco-tree-node{min-height:30px;color:var(--ca-ink)}.arco-tree-node:hover{background:var(--ca-surface-subtle)}.arco-tree-node-selected{background:var(--ca-primary-selected)!important;color:var(--ca-primary-ink)}.arco-tree-node-title{font-size:13px}.arco-tree-node-drag-icon{color:var(--ca-ink-3)}
.product-tree-search{margin:8px 0}.arco-input-wrapper.product-tree-search{width:100%}
`;
