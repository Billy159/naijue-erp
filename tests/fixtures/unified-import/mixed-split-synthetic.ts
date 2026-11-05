import { registryTargetId } from '../../../packages/application/src/unified-import-contract.ts';
import { createSyntheticPackage, repinSyntheticPackage } from './synthetic-package.ts';

// Explicit SYNTHETIC cleaning output, not a splitter or a rule for real data.
// The two documents' economics and settlement attribution are supplied facts.
export function splitFixture() {
  const p = createSyntheticPackage();
  const header = p.records.sales_header![0]!;
  const line = p.records.sales_line![0]!;
  Object.assign(header.fields, { gross_amount: '20.00', order_discount: '4.00', net_due: '16.00' });
  Object.assign(line.fields, { quantity: '20', line_amount: '20.00', allocated_discount: '4.00' });
  const append = (table: string, fields: Record<string, unknown>) => {
    const row = structuredClone(p.records[table]![0]!);
    row.source_key = `${table}:SYNTHETIC-explicit-return`;
    Object.assign(row.fields, fields, { id: registryTargetId(p.manifest.source_namespace, table.toUpperCase(), row.source_key) });
    p.records[table]!.push(row);
    p.registry.push({ entity_type: table.toUpperCase(), source_namespace: p.manifest.source_namespace,
      canonical_source_key: row.source_key, target_id: row.fields.id as string, aliases: [],
      identity_basis: 'STABLE_IMPORT_ID_V1', source_refs: structuredClone(row.source_refs) });
    return row;
  };
  const returned = append('sales_header', { number: 'SYNTHETIC-explicit-return', business_type: 'RETURN',
    gross_amount: '-4.00', order_discount: '0.00', net_due: '-4.00' });
  append('sales_line', { sales_id: returned.fields.id, quantity: '-4', line_amount: '-4.00', allocated_discount: '0.00' });
  append('sales_settlement', { sales_id: returned.fields.id, line_no: 1, direction: 'REFUND', amount: '4.00' });
  const reconciliation = p.reports['reconciliation.json'] as { tables: Record<string, { source_rows: number; retained_rows: number; rejected_rows: number }> };
  for (const table of ['sales_header', 'sales_line', 'sales_settlement']) {
    const n = p.records[table]!.length;
    reconciliation.tables[table] = { source_rows: n, retained_rows: n, rejected_rows: 0 };
  }
  return repinSyntheticPackage(p);
}

