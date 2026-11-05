/** Callback replacements preserve literal bundled $&, $`, $' and $$ bytes. */
export function inlineManagementAssets(template, script, css) {
  const style = '<!-- MANAGEMENT_INLINE_STYLE -->', module = '<!-- MANAGEMENT_INLINE_SCRIPT -->';
  if(template.split(style).length!==2||template.split(module).length!==2)throw new TypeError('Expected one management style/script placeholder');
  const safeCss=css.replace(/<\/style/gi,()=>'<\\/style'),safeScript=script.replace(/<\/script/gi,()=>'<\\/script');
  return template.replace(style,()=>`<style data-management-harness-style data-harness-style data-inventory-inline data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline>${safeCss}</style>`).replace(module,()=>`<script type="module">${safeScript}</script>`);
}
