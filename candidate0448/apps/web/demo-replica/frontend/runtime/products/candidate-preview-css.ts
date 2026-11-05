/** Narrow component selectors: no document proposal/modal styling changes. */
export const candidatePreviewCss=`
.inv-preview[data-product-candidate-preview]{box-sizing:border-box;min-width:0;padding:8px 10px;background:var(--ca-surface-subtle);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);color:var(--ca-ink)}
.pf-preview>.inv-preview[data-product-candidate-preview]{padding:0;background:transparent;box-shadow:none}
.inv-preview[data-product-candidate-preview] .inv-preview-title{margin-bottom:6px;font-size:13px;line-height:18px;font-weight:600;color:var(--ca-ink-2)}
.inv-preview[data-product-candidate-preview] .inv-preview-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 10px;font-size:14px;line-height:20px}
.inv-preview[data-product-candidate-preview] .inv-preview-field{min-width:0;overflow-wrap:anywhere}
.inv-preview[data-product-candidate-preview] .inv-preview-field small{font-size:13px;color:var(--ca-ink-2)}
.inv-preview[data-product-candidate-preview] .inv-preview-no-photo{margin:2px 0 6px;color:var(--ca-ink-2);font-size:12px}
.inv-preview[data-product-candidate-preview] .inv-photo-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px 4px;align-items:start;margin-bottom:10px}
.inv-preview[data-product-candidate-preview] .inv-photo-item{display:block;min-width:0;cursor:zoom-in;outline:none}
.inv-preview[data-product-candidate-preview] .inv-photo-tile{box-sizing:border-box;display:block;width:100%;aspect-ratio:1;padding:2px;border-radius:3px;background:var(--ca-surface);overflow:hidden}
.inv-preview[data-product-candidate-preview] .inv-photo-tile .arco-image{display:block!important;width:100%!important;height:100%!important}
.inv-preview[data-product-candidate-preview] .inv-photo-tile .arco-image-img{width:100%!important;height:100%!important;object-fit:cover;object-position:center 35%}
.inv-preview[data-product-candidate-preview] .inv-photo-label{display:block;overflow:hidden;margin-top:3px;text-align:center;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;color:var(--ca-ink-2)}
`;
