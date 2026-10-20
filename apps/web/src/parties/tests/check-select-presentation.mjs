import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Inspect the real Select's declared props, not a fake browser geometry result. */
export async function checkPartySelectPresentation() {
  const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../party-single-select.tsx');
  const source = await readFile(filename, 'utf8');
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const candidates = [];
  function visit(node) { if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'triggerProps') candidates.push(node); ts.forEachChild(node, visit); }
  visit(tree); assert.equal(candidates.length, 1, 'One actual Select triggerProps declaration is required.');
  const attribute = candidates[0]; assert.ok(attribute.initializer && ts.isJsxExpression(attribute.initializer));
  const props = attribute.initializer.expression; assert.ok(props && ts.isObjectLiteralExpression(props));
  function property(object, name) { const item = object.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(tree) === name); assert.ok(item && ts.isPropertyAssignment(item), name); return item.initializer; }
  const placement = property(props, 'position'); assert.ok(ts.isConditionalExpression(placement));
  assert.equal(placement.condition.getText(tree), 'props.pagination'); assert.equal(placement.whenTrue.text, 'tl'); assert.equal(placement.whenFalse.text, 'bl');
  assert.equal(property(props, 'autoAlignPopupWidth').kind, ts.SyntaxKind.FalseKeyword);
  const style = property(props, 'popupStyle'); assert.ok(ts.isObjectLiteralExpression(style));
  const width = property(style, 'width'); assert.ok(ts.isConditionalExpression(width)); assert.equal(width.condition.getText(tree), 'props.pagination');
  assert.ok(ts.isNumericLiteral(width.whenTrue)); assert.equal(width.whenTrue.text, '150');
  const oldRegularWidth = 'Math.min(Math.max(host.current?.getBoundingClientRect().width ?? 180, 300), Math.max(180, window.innerWidth - (host.current?.getBoundingClientRect().left ?? 0) - 12))';
  assert.equal(width.whenFalse.getText(tree).replace(/\s/g, ''), oldRegularWidth.replace(/\s/g, ''), 'Non-pagination measurement policy must remain unchanged.');
  const css = await readFile(path.resolve(path.dirname(filename), 'source-settings.css'), 'utf8');
  const declarations = selector => { const start = css.indexOf(`${selector}{`); assert.ok(start >= 0, selector); const block = css.slice(start + selector.length + 1).split('}', 1)[0]; return Object.fromEntries(block.split(';').filter(Boolean).map(item => { const index = item.indexOf(':'); return [item.slice(0, index).trim(), item.slice(index + 1).trim()]; })); };
  const route = declarations('.party-workbench'); assert.equal(route['font-family'], 'var(--ca-font-sans)'); assert.equal(route['font-size'], '12px'); assert.equal(route.font, undefined, 'Do not reset inherited source line-height with a font shorthand.');
  const heading = declarations('.party-workbench .iw-head h1'); assert.equal(heading['font-size'], '20px'); assert.equal(heading['line-height'], '30px'); assert.equal(heading['font-weight'], '600');
  const lifecycleCSS = await readFile(path.resolve(path.dirname(filename), 'parties.css'), 'utf8');
  const pagerActions = lifecycleCSS.match(/\.party-pagination>\.actions\{([^}]+)\}/)?.[1]; assert.ok(pagerActions); assert.match(pagerActions, /gap:4px/); assert.match(pagerActions, /flex-wrap:nowrap/);
  console.log('PASS static source pager actions: gap4px/nowrap; direct numeric-child structure is covered by the actual DOM probe.');
  console.log('PASS static frozen title cascade: route font properties preserve inherited line-height; local title20px/30px/600. No computed geometry is mocked.');
  console.log('PASS static actual-Select props: pagination tl/150px; regular bl/original measured width; autoAlignPopupWidth=false. No rendered geometry is mocked or claimed.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkPartySelectPresentation();
