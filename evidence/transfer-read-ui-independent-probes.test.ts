import assert from 'node:assert/strict';
import test from 'node:test';
import { detail, summary, uuid, warehouse } from '../apps/web/src/transfers/tests/fixtures.ts';
import { transferDetailResponse, transferListResponse, transferWarehousesResponse } from '../apps/web/src/transfers/response-validation.ts';
import { transferTarget, transferParameters } from '../apps/web/src/transfers/model.ts';
import { emptyTransferFilter } from '../apps/web/src/transfers/contracts.ts';
import { transferMatrix, transferMatrixDisplay } from '../apps/web/src/transfers/matrix.ts';

const target = transferTarget(uuid(1));
test('strict native detail rejects inconsistent product identity labels', () => {
  const d = structuredClone(detail());
  (d.catalog.skus[1] as { productName: string }).productName = 'CONTRADICTING SAME PRODUCT';
  assert.throws(() => transferDetailResponse(d, target));
});
test('strict native detail rejects inconsistent color identity labels', () => {
  const d = structuredClone(detail());
  (d.catalog.skus[1] as { colorName: string }).colorName = 'CONTRADICTING SAME COLOR';
  assert.throws(() => transferDetailResponse(d, target));
});
test('strict native detail rejects inconsistent FIT identity labels', () => {
  const d = structuredClone(detail());
  (d.catalog.skus[1] as { fitName: string }).fitName = 'CONTRADICTING SAME FIT';
  assert.throws(() => transferDetailResponse(d, target));
});
test('strict native detail rejects one product mapped to multiple size groups', () => {
  const d = structuredClone(detail());
  const extraGroup = { ...d.catalog.sizeGroups[0]!, sizeGroupId: uuid(500) as never };
  (d.catalog.sizeGroups as unknown[]).push(extraGroup);
  (d.catalog.skus[1] as { sizeGroupId: string }).sizeGroupId = extraGroup.sizeGroupId;
  assert.throws(() => transferDetailResponse(d, target));
});
test('list, detail and selected-reference shape reject wrong identity and legacy scalar extras', () => {
  const p = transferParameters(emptyTransferFilter(), 20);
  const list = { page: 1, pageSize: 20, exactTotal: '1', items: [summary()] };
  assert.equal(transferListResponse(list, p), list);
  assert.throws(() => transferListResponse({ ...list, status: 'DRAFT' }, p));
  assert.throws(() => transferDetailResponse(detail(), transferTarget(uuid(2))));
  const refs = { page: 1, pageSize: 20, exactTotal: '1', items: [warehouse()] };
  assert.throws(() => transferWarehousesResponse(refs, { search: '', selectedIds: [warehouse(21).id], page: 1, pageSize: 20 }));
});
test('matrix boundaries and exact canonical quantity semantics are preserved', () => {
  const sections = transferMatrix(detail());
  assert.equal(sections[0]!.rows[0]!.total, 9007199254740995n);
  assert.equal(transferMatrixDisplay(sections).mode, 'matrix');
  const base = sections[0]!;
  const make = (rows: number, columns: number) => [{ ...base, rows: Array(rows).fill(base.rows[0]), group: { ...base.group, members: Array(columns).fill(base.group.members[0]) } }];
  assert.equal(transferMatrixDisplay(make(60, 40)).mode, 'matrix');
  assert.equal(transferMatrixDisplay(make(61, 40)).mode, 'paged-lines');
  assert.equal(transferMatrixDisplay(make(60, 41)).mode, 'paged-lines');
});
test('shared size and hall identities cannot carry contradictory current facts', () => {
  const d = structuredClone(detail());
  const group = { ...d.catalog.sizeGroups[0]!, sizeGroupId: uuid(500) as never, members: structuredClone(d.catalog.sizeGroups[0]!.members) };
  (group.members[0] as { name: string }).name = 'CONTRADICTING SAME SIZE';
  (d.catalog.sizeGroups as unknown[]).push(group);
  const sku = { ...d.catalog.skus[0]!, skuId: uuid(501) as never, productId: uuid(502) as never, sizeGroupId: group.sizeGroupId };
  (d.catalog.skus as unknown[]).push(sku);
  (d.document.lines as unknown[]).push({ ...d.document.lines[0]!, id: uuid(503) as never, skuId: sku.skuId, lineNo: 3 });
  assert.throws(() => transferDetailResponse(d, target));
  const second = { ...warehouse(21), hallName: 'CONTRADICTING SAME HALL' };
  assert.throws(() => transferWarehousesResponse({ page: 1, pageSize: 20, exactTotal: '2', items: [warehouse(), second] }, { search: '', selectedIds: [], page: 1, pageSize: 20 }));
});
