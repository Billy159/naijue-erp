/** Inline bytes literally: replacement callbacks avoid String.replace expanding
 * bundled $&, $`, $' or $$ tokens into parts of the HTML template. */
export function inlineHarnessAssets(template, script, css) {
  const link = '<link rel="stylesheet" href="./main.css">';
  const module = '<script type="module" src="./main.js"></script>';
  if (template.split(link).length !== 2 || template.split(module).length !== 2) throw new TypeError('Expected exactly one harness stylesheet and script placeholder.');
  const safeCss = css.replace(/<\/style/gi, () => '<\\/style');
  const safeScript = script.replace(/<\/script/gi, () => '<\\/script');
  return template.replace(link, () => `<style data-harness-style data-demo-single-select-inline data-demo-multi-select-inline data-inventory-product-select-inline>${safeCss}</style>`)
    .replace(module, () => `<script type="module">${safeScript}</script>`);
}
