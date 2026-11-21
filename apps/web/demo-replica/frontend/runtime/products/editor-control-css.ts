import { singleCss } from '../common/ui/control-css.ts';

// Keep the transfer's single-select styling; scope Cascader and async states to the editor shadow.
export const editorControlCss = singleCss + `
:host{display:block;min-width:0;width:100%;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}#portal>*{pointer-events:auto}
.arco-cascader,.arco-input-wrapper{width:100%;font-size:13px}
.arco-cascader-view,.arco-input-wrapper{box-sizing:border-box;min-height:32px;height:32px;border:1px solid transparent!important;border-radius:var(--ca-radius-control)!important;background:var(--ca-surface-muted)!important;box-shadow:none!important}
.arco-cascader:hover .arco-cascader-view,.arco-input-wrapper:hover{border-color:var(--ca-control-hover-border)!important}
.arco-cascader.arco-cascader-focused .arco-cascader-view,.arco-input-wrapper:focus-within{border-color:var(--ca-control-focus-border)!important;box-shadow:none!important}
.arco-cascader-view-input,.arco-input-inner{font-size:13px!important}
.arco-select-multiple .arco-select-view{overflow:hidden}
.arco-select-multiple .arco-input-tag,.arco-select-multiple .arco-input-tag:hover,.arco-select-multiple .arco-input-tag.arco-input-tag-focus{background:transparent}
.arco-select-multiple .arco-input-tag-inner{flex-wrap:nowrap;white-space:nowrap}
.arco-select-multiple .arco-input-tag-tag{height:23px;line-height:23px;background:var(--ca-surface);color:var(--ca-ink);border:0}
.arco-select-popup .arco-checkbox-checked .arco-checkbox-mask{background:var(--ca-primary);border-color:var(--ca-primary)}
.arco-trigger-popup{max-width:calc(100vw - 24px)}
.pc-category-options{box-sizing:border-box;width:min(480px,calc(100vw - 24px));padding:4px;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg)}
.pc-category-options .arco-cascader-popup-inner{display:flex;align-items:flex-start;min-width:0;overflow-x:auto}
.pc-category-options .arco-cascader-list,.pc-category-options .arco-cascader-list-search{max-height:min(288px,calc(100dvh - 120px));max-width:100%;min-width:0!important}
.pc-category-options .arco-cascader-list-search{flex:1}
.pc-category-options .arco-cascader-list-column{box-sizing:border-box;flex:1 0 min(150px,56vw);max-width:100%;min-width:0;scrollbar-gutter:stable}
.pc-category-options .arco-cascader-list-item,.pc-category-options .arco-cascader-list-search-item{box-sizing:border-box;height:30px;min-height:30px;line-height:30px;color:var(--ca-ink);border-radius:var(--ca-radius-control);font-size:13px;font-weight:400}
.pc-category-options .arco-cascader-list-item:hover,.pc-category-options .arco-cascader-list-item-active,.pc-category-options .arco-cascader-list-search-item:hover{background:var(--ca-popover-hover)}
.pc-category-options .arco-cascader-list-empty{max-width:100%;padding:0}
.pc-option-notice{box-sizing:border-box;display:flex;align-items:center;gap:8px;min-height:34px;padding:6px 8px;color:var(--ca-ink-2);font-size:13px;text-align:left}
.pc-option-footer{min-height:34px;display:flex;align-items:center;padding:3px 8px;border-top:1px solid var(--ca-line)}
.pc-option-footer .pc-option-notice{padding:0}
.pc-option-action{background:transparent;border:0;border-radius:var(--ca-radius-control);padding:4px 7px;color:var(--ca-primary-ink);font:inherit;cursor:pointer}
.pc-option-action:hover,.pc-option-action:focus-visible{background:var(--ca-popover-hover)}
.pc-option-action:focus-visible{outline:1px solid var(--ca-control-focus-border);outline-offset:1px}
.arco-tree{font-size:13px}.arco-tree-node{min-height:30px;color:var(--ca-ink)}.arco-tree-node:hover{background:var(--ca-surface-subtle)}.arco-tree-node-selected{background:var(--ca-primary-selected)!important;color:var(--ca-primary-ink)}.arco-tree-node-title{font-size:13px}.arco-tree-node-drag-icon{color:var(--ca-ink-3)}
.product-tree-search{margin:8px 0}.arco-input-wrapper.product-tree-search{width:100%}
`;
