import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFixture } from './fixtures/unified-import/mixed-split-synthetic.ts';
import { repinSyntheticPackage } from './fixtures/unified-import/synthetic-package.ts';
import { registryTargetId, sha256 } from '../packages/application/src/unified-import-contract.ts';
import { MIXED_SPLIT_EVIDENCE_VERSION, mixedSplitFactKeys, validateMixedSplitEvidenceV1 } from '../tools/unified-import/mixed-split-evidence.mjs';

function fixture() {
  const tables = ['sales_header', 'sales_line', 'sales_settlement'], p = splitFixture();
  for (const t of ['sales_line', 'sales_settlement']) for (const [i, r] of p.records[t].entries()) {
    r.source_refs = [{ ...r.source_refs[0], row: i + 2 }];
    p.registry.find(e => e.target_id === r.fields.id).source_refs = structuredClone(r.source_refs);
  }
  const ids = new Map();
  for (const t of tables) for (const r of [...p.records[t]]) {
    const row = structuredClone(r), old = row.fields.id;
    row.source_key += ':SYNTHETIC-group2';
    row.fields.id = registryTargetId(p.manifest.source_namespace, t.toUpperCase(), row.source_key);
    ids.set(old, row.fields.id);
    if (t === 'sales_header') row.fields.number += '-2';
    else row.fields.sales_id = ids.get(row.fields.sales_id);
    row.source_refs.forEach(ref => { ref.row += 100; }); p.records[t].push(row);
    const entry = structuredClone(p.registry.find(e => e.target_id === old));
    Object.assign(entry, { canonical_source_key: row.source_key, target_id: row.fields.id, source_refs: structuredClone(row.source_refs) });
    p.registry.push(entry);
  }
  for (const t of tables) {
    const n = p.records[t].length;
    p.reports['reconciliation.json'].tables[t] = { source_rows: n, retained_rows: n, rejected_rows: 0 };
  }
  repinSyntheticPackage(p);
  const facts = (t, r) => Object.fromEntries(mixedSplitFactKeys[t].map(k => [k, r.fields[k]]));
  const groups = Array.from({ length: 2 }, (_, g) => {
    const headers = p.records.sales_header.slice(g * 2, g * 2 + 2), headerIDs = new Set(headers.map(r => r.fields.id));
    const mapped = t => p.records[t].filter(r => headerIDs.has(r.fields.sales_id)).map((r, i) => ({
      source_key: r.source_key, source_refs: structuredClone(r.source_refs), original_line_no: i + 1,
      output_id: r.fields.id, fields: facts(t, r),
    }));
    return { group_key: `SYNTHETIC-group${g}`, original_header: {
      source_key: `SYNTHETIC-original${g}`, source_refs: structuredClone(headers[0].source_refs),
      fields: { ...facts('sales_header', headers[0]), number: `SYNTHETIC-original${g}`, gross_amount: '16.00', order_discount: '4.00', net_due: '12.00' },
    }, output_header_ids: [...headerIDs], lines: mapped('sales_line'), settlements: mapped('sales_settlement') };
  });
  return { p, e: { format_version: MIXED_SPLIT_EVIDENCE_VERSION, output_manifest_sha256: sha256(JSON.stringify(p.manifest)),
    original_counts: { sales_header: 2, sales_line: 4, sales_settlement: 34 },
    output_counts: { sales_header: 4, sales_line: 4, sales_settlement: 34 }, groups } };
}
const run = ({ p, e }) => validateMixedSplitEvidenceV1(p, JSON.stringify(e), { allowSynthetic: true });
test('two independent source groups preserve separate counts and all facts', () => {
  const f = fixture(), before = JSON.stringify(f), r = run(f);
  assert.equal(r.valid, true, JSON.stringify(r)); assert.equal(r.groups_verified, 2); assert.equal(JSON.stringify(f), before);
});
for (const [name, change, code] of [
  ['omitted declared group with honest counts', e => e.groups.pop(), 'ORIGINAL_OUTPUT_COUNT_MISMATCH'],
  ['cross-group line output', e => { e.groups[0].lines[0].output_id = e.groups[1].lines[0].output_id; }, 'CROSS_GROUP_OUTPUT'],
  ['reused original payment locator', e => { e.groups[1].settlements[0].source_refs = structuredClone(e.groups[0].settlements[0].source_refs); }, 'SOURCE_LOCATOR_REUSED'],
  ['cross-group original payment key', e => { e.groups[1].settlements[0].source_key = e.groups[0].settlements[0].source_key; }, 'SOURCE_ID_REUSED'],
  ['reused output header pair', e => { e.groups[1].output_header_ids = [...e.groups[0].output_header_ids]; }, 'OUTPUT_ID_MISSING_OR_REUSED'],
]) test(name + ' rejects', () => { const f = fixture(); change(f.e); assert.equal(run(f).code, code); });
