import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { checkPartySelectPresentation } from './check-select-presentation.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)); const source = path.resolve(here, '..'); const temp = await mkdtemp(path.join(here, '.build-tmp-'));
try {
  await checkPartySelectPresentation();
  const result = await build({ entryPoints: [path.join(source, 'index.ts'), path.join(source, 'party-route.tsx'), path.join(source, 'party-candidate-selector.tsx')], outdir: temp, bundle: true, splitting: true, format: 'esm', platform: 'browser', external: ['react', 'react-dom', 'react-dom/*'], jsx: 'automatic', metafile: true, write: true, logLevel: 'warning' });
  const outputs = Object.entries(result.metafile.outputs); const entry = suffix => outputs.find(([, value]) => value.entryPoint?.endsWith(suffix));
  const index = entry('/index.ts'); const route = entry('/party-route.tsx'); const candidate = entry('/party-candidate-selector.tsx'); assert.ok(index && route && candidate);
  const absoluteOutput = name => path.resolve(name); const byAbsolute = new Map(outputs.map(([name, info]) => [absoluteOutput(name), [name, info]]));
  function staticInputs(start, seen = new Set()) {
    const [name, info] = start; if (seen.has(name)) return new Set(); seen.add(name); const inputs = new Set(Object.keys(info.inputs));
    for (const imported of info.imports) if (imported.kind !== 'dynamic-import' && !imported.external) {
      const next = byAbsolute.get(path.resolve(path.dirname(name), imported.path)) ?? byAbsolute.get(path.resolve(imported.path));
      if (next) for (const input of staticInputs(next, seen)) inputs.add(input);
    }
    return inputs;
  }
  const inertInputs = staticInputs(index); assert.equal([...inertInputs].some(file => /\.tsx$|\.css$/.test(file)), false);
  const routeInputs = staticInputs(route); assert.equal([...routeInputs].some(file => file.endsWith('/party-form.tsx')), false);
  assert.ok(outputs.some(([, value]) => value.entryPoint?.endsWith('/party-form.tsx')));
  assert.ok(route[1].imports.some(item => item.kind === 'dynamic-import'));
  const candidateInputs = staticInputs(candidate); assert.equal([...candidateInputs].some(file => file.endsWith('/party-candidate-options.tsx')), false);
  assert.ok(candidate[1].imports.some(item => item.kind === 'dynamic-import'));
  assert.ok(route[1].cssBundle); assert.ok(candidate[1].cssBundle);
  for (const [name, info] of outputs) if (info.entryPoint?.endsWith('/index.ts')) assert.doesNotMatch(await readFile(name, 'utf8'), /localStorage|sessionStorage/);
  console.log('PASS static build: inert client/controller entry has no React route/CSS; maintenance form and candidate popup are dynamic leaves; each visual entry has an explicit CSS bundle.');
  console.log('Build only, with external existing React and bundled installed Arco/CSS. No route host installation, listener, network, performance or frozen-Demo visual acceptance.');
} finally { await rm(temp, { recursive: true, force: true }); }
