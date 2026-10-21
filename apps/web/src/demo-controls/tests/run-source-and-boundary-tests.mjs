import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repo = path.resolve(root, '../../../..');
const frozen = process.argv[2] ?? '/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/frontend/unified-single-select.jsx';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const provenance = JSON.parse(await readFile(path.join(root, 'source-provenance.json'), 'utf8'));
const original = await readFile(frozen, 'utf8');
assert.equal(sha256(original), provenance.frozenSha256, 'Frozen file bytes must match, not an approximate recreation');
const lines = original.split('\n');
for (const range of provenance.sourceRanges) assert.equal(sha256(lines.slice(range.lines[0] - 1, range.lines[1]).join('\n') + '\n'), range.sha256);
const css = await readFile(path.join(root, 'single-select.css'), 'utf8');
let declarations = 0;
for (const line of provenance.copiedCssSourceLines) {
  for (const [, selectors, body] of lines[line - 1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const scoped = selectors.split(',').map(selector => selector.trim() === ':host' ? '.demo-single-select' : `.demo-single-select ${selector.trim()}`).join(',');
    assert.ok(css.includes(`${scoped}{${body}}`), `Source line ${line}: unchanged declarations must remain in scoped rule`);
    declarations++;
  }
}
for (const item of provenance.installedArco.css) assert.equal(sha256(await readFile(path.join(repo, 'node_modules/@arco-design/web-react', item.file))), item.sha256);
assert.equal((css.match(/@import /g) ?? []).length, 2);
assert.doesNotMatch(css, /dist\/css|@import ['"]@arco-design\/web-react\/es\/style\/index\.css/);
assert.match(css, /@import '@arco-design\/web-react\/es\/Select\/style\/index\.css'/);
assert.match(css, /@import '@arco-design\/web-react\/es\/Trigger\/style\/index\.css'/);

const action = await readFile(path.join(root, 'single-select-action.tsx'), 'utf8');
const controller = await readFile(path.join(root, 'popup-ownership.ts'), 'utf8');
const contract = await readFile(path.join(root, 'single-select-contract.ts'), 'utf8');
assert.match(action, /from '@arco-design\/web-react\/es\/Select\/index\.js'/);
for (const source of [action, controller, contract]) {
  assert.doesNotMatch(source, /from ['"]@arco-design\/web-react['"]|dist\/css|ERP_DEMO|TRANSFER_UI|localStorage|sessionStorage|fetch\(|MutationObserver/);
}
assert.doesNotMatch(action, /document\.|window\.|addEventListener|\.css['"]/);
assert.doesNotMatch(controller, /\b(?:document|window|globalThis)\s*\./);
assert.match(contract, /return import\('\.\/single-select-action\.tsx'\)/);

const bundle = await build({ absWorkingDir: repo, entryPoints: [path.join(root, 'single-select-contract.ts')], write: false, bundle: true, splitting: true, format: 'esm', platform: 'browser', outdir: '.demo-control-boundary', metafile: true, jsx: 'automatic', logLevel: 'warning' });
const outputs = bundle.metafile.outputs;
const entry = Object.values(outputs).find(output => output.entryPoint?.endsWith('/single-select-contract.ts'));
assert.ok(entry);
assert.ok(Object.keys(entry.inputs).every(input => !input.includes('node_modules') && !input.endsWith('single-select-action.tsx')), 'Light contract entry cannot eagerly include Arco/React/action');
assert.equal(entry.imports.filter(item => item.kind === 'dynamic-import').length, 1);
const inputFiles = Object.keys(bundle.metafile.inputs);
assert.ok(inputFiles.some(input => input.endsWith('/es/Select/index.js')));
assert.ok(!inputFiles.some(input => /@arco-design\/web-react\/(?:es|lib)\/index\.js$/.test(input)));
assert.ok(!inputFiles.some(input => input.endsWith('.css')));
const styleBundle = await build({ absWorkingDir: repo, entryPoints: [path.join(root, 'single-select.css')], write: false, bundle: true, outdir: '.demo-control-css', metafile: true, logLevel: 'warning' });
assert.equal(Object.keys(styleBundle.metafile.inputs).filter(input => input.includes('node_modules')).length, 2, 'Only two component CSS leaves, no full reset/palette/library stylesheet');
assert.doesNotMatch(styleBundle.outputFiles[0].text, /(?:^|\n|\})\s*(?:body|html|:root)\s*\{/);
console.log(`PASS source provenance: exact frozen SHA256, ${provenance.sourceRanges.length} line ranges, ${declarations} copied scoped rules and installed Arco hashes.`);
console.log('PASS lazy boundary: lightweight dynamic-import contract, real Select leaf, no root barrel/full CSS/data/global bridge; action CSS stays a separate lazy entry.');
