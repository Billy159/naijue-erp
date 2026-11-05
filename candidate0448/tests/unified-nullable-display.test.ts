import assert from 'node:assert/strict';
import test from 'node:test';
import { salesDocumentOutput } from '../apps/web/src/components/document-output-contracts.ts';
import { detail, draft } from '../apps/web/src/sales/commands/fixtures.test-support.ts';
import { compileSalesForm, salesFormInput } from '../apps/web/src/sales/commands/form-model.ts';
import { draftFromSalesDetail, validateSalesCommand, validateSalesDraft } from '../apps/web/src/sales/commands/validation.ts';
import { salesDetailResponse } from '../apps/web/src/sales/response-validation.ts';
import { transferDetailResponse } from '../apps/web/src/transfers/response-validation.ts';
import { detail as transferDetail } from '../apps/web/src/transfers/tests/fixtures.ts';
import { summary } from '../apps/web/src/sales/tests/fixtures.ts';
import { normalSalesResponse } from '../apps/web/demo-replica/frontend/runtime/documents/normal-list-reader.ts';
import { parseSalesListQuery } from '../packages/application/src/sales-query-validation.ts';
import { PostgresTransferQueryReader } from '../adapters/postgres/src/transfer-query-reader.ts';
import { draftFromTransferDetail, draftFromTransferInput, inputFromTransferDraft, validateTransferCommand, validateTransferDraft } from '../apps/web/src/transfers/commands/validation.ts';
import { checkedExistingSalesPreparation, checkedExistingTransferPreparation } from '../apps/web/src/current-form/existing-document-preparation.ts';
import { salesInputMoney } from '../apps/web/src/sales/commands/form-model.ts';
import { SalesCommandWorkspace } from '../apps/web/src/sales/commands/controller.ts';
import { result as salesResult, receipt as salesReceipt } from '../apps/web/src/sales/commands/fixtures.test-support.ts';
import type { SalesCommandDto } from '../apps/web/src/sales/commands/contracts.ts';
import { TransferCommandWorkspace } from '../apps/web/src/transfers/commands/controller.ts';
import { ReadContext } from '../apps/web/src/loading/read-scope.ts';
import { result as transferResult, receipt as transferReceipt } from '../apps/web/src/transfers/commands/fixtures.test-support.ts';
import type { TransferCommandDto } from '../apps/web/src/transfers/commands/contracts.ts';
import { loadNativeTransferSnapshots } from '../adapters/postgres/src/native-transfer-snapshots.ts';

test('ordinary saved output preserves unknown snapshots, gift status, allocation and creator facts', () => {
  const source = detail();
  const data = { ...source, document: { ...source.document,
    header: { ...source.document.header, createdByAccountId: null, createdAt: null, updatedAt: null },
    lines: source.document.lines.map(line => ({ ...line, isGift: null, allocatedDiscount: null,
      snapshot: { productCode: null, productName: null, colorName: null, fitName: null, sizeName: null, barcode: null } })),
  } };
  const output = salesDocumentOutput(data);
  const row = output.sections[0]!.rows[0]!;
  assert.deepEqual(row.slice(2, 7), [null, null, null, null, null]);
  assert.equal(row[13], null);
  assert.equal(row[14], null);
  assert.equal(output.metadata.find(([label]) => label === '创建时间')?.[1], null);
  assert.equal(output.metadata.find(([label]) => label === '创建账号编号')?.[1], null);
  for (const [label, value] of output.totals) if (label.includes('不含赠品')) assert.equal(value, '未记录');
});

test('active form reports unknown gift intent explicitly rather than treating it as ordinary goods', () => {
  const base = draft(), input = salesFormInput(base);
  const result = compileSalesForm(base, { ...input, lines: input.lines.map(line => ({ ...line, isGift: null })) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors[`line:${base.lines[0]!.id}:isGift`] ?? '', /明确/);
});

test('existing metadata SAVE keeps unknown economics exact, but new drafts and changed unknown economics are rejected', () => {
  const source = detail();
  const saved = { ...source, document: { ...source.document,
    lines: source.document.lines.map(line => ({ ...line, pricingRule: null, zeroConfirmed: null, isGift: null, allocatedDiscount: null })),
    settlements: source.document.settlements.map(row => ({ ...row, paymentMethodId: null })),
  } };
  const base = draftFromSalesDetail(saved), raw = salesFormInput(base);
  const result = compileSalesForm(base, { ...raw, note: 'Known new note; unknown originals unchanged' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.draft.lines, saved.document.lines);
    assert.deepEqual(result.draft.settlements, saved.document.settlements);
    assert.equal(result.draft.header.grossAmount, base.header.grossAmount);
    assert.equal(result.draft.header.netDue, base.header.netDue);
    assert.doesNotThrow(() => validateSalesDraft(result.draft, { previous: base }));
    assert.throws(() => validateSalesDraft(result.draft));
    assert.throws(() => validateSalesCommand({ action: 'SAVE', requestKey: 'new-unknown', expectedVersion: null, draft: result.draft }));
    assert.doesNotThrow(() => validateSalesCommand({ action: 'SAVE', requestKey: 'retained-unknown', expectedVersion: saved.document.header.version, draft: result.draft }));
    assert.throws(() => draftFromSalesDetail(saved, true));
  }
  assert.equal(compileSalesForm(base, { ...raw, lines: raw.lines.map(line => ({ ...line, quantity: '-2' })) }).ok, false);
  assert.throws(() => validateSalesDraft({ ...base, lines: base.lines.map(line => ({ ...line, quantity: '-2' })) }, { previous: base }));
  assert.equal(compileSalesForm(base, { ...raw, settlements: raw.settlements.map(row => ({ ...row, amount: '1.00' })) }).ok, false);
});

test('ordinary sales and transfer read contracts distinguish explicit unknown facts from omitted or malformed facts', () => {
  const original = detail();
  const sales = { ...original, referenceNames: { ...original.referenceNames, createdByName: null },
    settlementNames: original.settlementNames.map(row => ({ ...row, methodNameSnapshot: null, accountNameSnapshot: null })),
    document: { ...original.document, header: { ...original.document.header, createdByAccountId: null, createdAt: null, updatedAt: null },
      lines: original.document.lines.map(line => ({ ...line, isGift: null, allocatedDiscount: null,
        snapshot: { productCode: null, productName: null, colorName: null, fitName: null, sizeName: null, barcode: null } })),
    } };
  assert.strictEqual(salesDetailResponse(sales, { salesId: sales.document.header.id }), sales);
  const omitted = structuredClone(sales) as unknown as { document: { header: Record<string, unknown> } };
  delete omitted.document.header.createdAt;
  assert.throws(() => salesDetailResponse(omitted, { salesId: sales.document.header.id }));
  assert.throws(() => salesDetailResponse({ ...sales, document: { ...sales.document, header: { ...sales.document.header, createdAt: false } } }, { salesId: sales.document.header.id }));
  const originalTransfer = transferDetail();
  const transfer = { ...originalTransfer, references: { ...originalTransfer.references, createdByName: null },
    document: { ...originalTransfer.document, header: { ...originalTransfer.document.header, createdByAccountId: null, createdRole: null, createdAt: null, updatedAt: null },
      lines: originalTransfer.document.lines.map(line => ({ ...line, snapshot: { ...line.snapshot, productCode: null, productName: null } })),
    } };
  assert.strictEqual(transferDetailResponse(transfer, { transferId: transfer.document.header.id }), transfer);
  assert.throws(() => transferDetailResponse({ ...transfer, document: { ...transfer.document, header: { ...transfer.document.header, version: null } } }, { transferId: transfer.document.header.id }));
  const staffApproved = { ...transfer, references: { ...transfer.references, approvedByName: 'SYNTHETIC KNOWN ORIGINAL APPROVER' },
    document: { ...transfer.document, header: { ...transfer.document.header, approvedByStaffId: '00000000-0000-0000-0000-000000000906' } } };
  assert.doesNotThrow(() => transferDetailResponse(staffApproved, { transferId: transfer.document.header.id }));
  assert.throws(() => transferDetailResponse({ ...staffApproved, document: { ...staffApproved.document, header: { ...staffApproved.document.header, approvedByStaffId: null } } }, { transferId: transfer.document.header.id }));
  const withStaff = { ...sales, document: { ...sales.document, header: { ...sales.document.header, createdByStaffId: null, approvedByStaffId: sales.document.header.salespersonId } } };
  assert.doesNotThrow(() => salesDetailResponse(withStaff, { salesId: sales.document.header.id }));
  assert.throws(() => salesDetailResponse({ ...withStaff, document: { ...withStaff.document, header: { ...withStaff.document.header, createdByStaffId: undefined } } }, { salesId: sales.document.header.id }));
  assert.throws(() => salesDetailResponse({ ...withStaff, document: { ...withStaff.document, header: { ...withStaff.document.header, approvedByStaffId: 'current-user' } } }, { salesId: sales.document.header.id }));
});

test('ordinary list category unknown is tied to complete explicit null non-gift quantities, not its source', () => {
  const original = summary(), query = parseSalesListQuery({ filter: { startDate: null, endDate: null, statuses: [], businessTypes: [], hallIds: [], salespersonIds: [], customerIds: [], warehouseIds: [], number: null }, page: 1, pageSize: 20 });
  const row = { ...original, dataset: 'LIVE', batchId: null, documentId: original.id, effectiveVersion: original.version,
    createdByName: null, updatedAt: null, quantity: null, incomingQuantity: null, outgoingQuantity: null,
    productSummary: { productCount: '1', items: [{ productId: original.id, productCodeSnapshot: null, productNameSnapshot: null }], hasMore: false },
    categorySummary: { basis: 'UNKNOWN', metric: 'QUANTITY', categoryCount: null, items: [], hasMore: false },
  };
  const page = { page: 1, pageSize: 20, exactTotal: '1', items: [row], historyCoverage: 'NOT_PUBLISHED',
    totals: { quantity: null, incomingQuantity: null, outgoingQuantity: null, grossAmount: original.grossAmount, orderDiscount: original.orderDiscount, netDue: original.netDue } };
  assert.strictEqual(normalSalesResponse(page, query), page);
  assert.throws(() => normalSalesResponse({ ...page, items: [{ ...row, quantity: '0' }] }, query));
  assert.throws(() => normalSalesResponse({ ...page, items: [{ ...row, quantity: '0', incomingQuantity: '0', outgoingQuantity: '0' }] }, query));
  const known = { ...row, quantity: '-1', incomingQuantity: '1', outgoingQuantity: '0',
    categorySummary: { basis: 'CURRENT', metric: 'QUANTITY', categoryCount: '1', items: [{ categoryId: null, categoryName: null, value: '-1' }], hasMore: false } };
  assert.doesNotThrow(() => normalSalesResponse({ ...page, items: [known], totals: { ...page.totals, quantity: '-1', incomingQuantity: '1', outgoingQuantity: '0' } }, query));
});

test('scripted ordinary transfer read projects a known stored creator without inventing an account', async () => {
  const original = transferDetail(), h = original.document.header;
  assert.ok(h.createdByAccountId);
  for (const staffId of ['00000000-0000-0000-0000-000000000905', null]) {
    const calls: string[] = [], creatorName = staffId === null ? null : 'SYNTHETIC KNOWN ORIGINAL STAFF';
    const reader = new PostgresTransferQueryReader({ async connect() { return { async query(sql: string) {
      calls.push(sql);
      if (sql.includes('FROM naijue_erp.transfer_header')) {
        assert.match(sql, /creator.id = CASE WHEN to_jsonb\(h\) \? 'created_by_staff_id' THEN \(to_jsonb\(h\)->>'created_by_staff_id'\)::uuid ELSE ca.staff_id END/);
        assert.match(sql, /approver.id = CASE WHEN to_jsonb\(h\) \? 'approved_by_staff_id' THEN \(to_jsonb\(h\)->>'approved_by_staff_id'\)::uuid ELSE aa.staff_id END/);
        return { rows: [{ id: h.id, number: h.number, business_date: h.businessDate, from_warehouse_id: h.fromWarehouseId, to_warehouse_id: h.toWarehouseId,
          status: h.status, version: h.version, responsible_staff_id: null, note: null, created_by_account_id: null, created_hall_id: null, created_role: null,
          created_at: null, updated_at: null, approved_by_account_id: null, approved_at: null, stock_basis: 'RUNTIME_LEDGER',
          unified_staff_columns: true, created_by_staff_id: staffId, approved_by_staff_id: null,
          from_warehouse_name: original.references.fromWarehouseName, to_warehouse_name: original.references.toWarehouseName,
          from_hall_name: original.references.fromHallName, to_hall_name: original.references.toHallName,
          created_by_name: creatorName, approved_by_name: null, responsible_name: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }, release() {} }; } });
    const result = await reader.readDetail({ actor: { accountId: h.createdByAccountId, hallId: h.createdHallId, role: 'ADMIN' }, scope: { kind: 'all' }, parameters: { transferId: h.id }, signal: new AbortController().signal });
    assert.equal(result.document.header.createdByAccountId, null); assert.equal(result.document.header.createdByStaffId, staffId);
    assert.equal(result.references.createdByName, creatorName); assert.equal(calls.at(-1), 'COMMIT');
  }
});

test('ordinary transfer null saved labels survive preparation and original-CAS memo SAVE, while new or changed null labels cannot', async () => {
  const original = transferDetail(), h = original.document.header;
  assert.ok(h.createdByAccountId);
  const saved = { ...original, document: { ...original.document, lines: original.document.lines.map(line => ({ ...line,
    snapshot: { ...line.snapshot, productCode: null, productName: null, colorName: null, fitName: null, sizeName: null } })) } };
  const base = draftFromTransferDetail(saved), input = inputFromTransferDraft(base);
  const changed = draftFromTransferInput(base, { ...input, note: 'SYNTHETIC memo only' });
  assert.deepEqual(changed.lines, base.lines);
  assert.throws(() => validateTransferDraft(changed));
  assert.throws(() => validateTransferCommand({ action: 'SAVE', requestKey: 'new-unknown-transfer', expectedVersion: null, draft: changed }));
  assert.doesNotThrow(() => validateTransferCommand({ action: 'SAVE', requestKey: 'retained-transfer', expectedVersion: h.version, draft: changed }));
  const intent = { transferId: h.id, expectedVersion: h.version, businessDate: h.businessDate, fromWarehouseId: h.fromWarehouseId, toWarehouseId: h.toWarehouseId,
    note: changed.header.note, lines: changed.lines.map(line => ({ existingLineId: line.id, skuId: line.skuId, quantity: line.quantity })) };
  const prepared = checkedExistingTransferPreparation({ expectedVersion: h.version, draft: changed }, intent);
  assert.deepEqual(prepared.draft.lines, saved.document.lines);
  assert.throws(() => checkedExistingTransferPreparation({ expectedVersion: h.version, draft: changed }, { ...intent, lines: intent.lines.map(line => ({ ...line, existingLineId: null })) }));
  const known = draftFromTransferDetail(original);
  assert.throws(() => validateTransferDraft(changed, { previous: known }));
  assert.throws(() => validateTransferDraft({ ...base, lines: base.lines.map(line => ({ ...line, snapshot: { ...line.snapshot, productName: 'Invented original label' } })) }, { previous: base }));
  const context = new ReadContext({ accountId: h.createdByAccountId, sessionRevision: '1', permissionRevision: '1' }), commands: TransferCommandDto[] = [];
  const workspace = new TransferCommandWorkspace({ scope: context.createScope('SYNTHETIC nullable transfer'), reader: { readDetail: async () => saved },
    client: { execute: async command => { commands.push(command); return transferResult(command); }, receipt: async command => transferReceipt(command) },
    newRequestKey: () => 'retained-transfer-memo', onAccessFailure: () => {} });
  assert.equal(await workspace.openExisting(h.id), true); assert.ok(workspace.getSnapshot().editor?.draft);
  assert.equal(workspace.replaceDraft(prepared.draft), true); assert.equal(await workspace.submit('SAVE'), true);
  const command = commands[0]!; assert.ok(command.action === 'SAVE' && 'draft' in command);
  assert.equal(command.expectedVersion, h.version); assert.deepEqual(command.draft.lines, base.lines);
  workspace.dispose();
});

test('complete sales pricing with unknown retained display labels survives preparation and memo SAVE without relaxing new snapshots', async () => {
  const original = detail(), h = original.document.header;
  assert.ok(h.createdByAccountId);
  const saved = { ...original, document: { ...original.document, lines: original.document.lines.map(line => ({ ...line,
    snapshot: { ...line.snapshot, productCode: null, productName: null, colorName: null, fitName: null, sizeName: null } })) } };
  const base = draftFromSalesDetail(saved), raw = salesFormInput(base), compiled = compileSalesForm(base, { ...raw, note: 'SYNTHETIC retained label memo' });
  assert.ok(compiled.ok);
  const intent = { salesId: h.id, expectedVersion: h.version, businessType: 'RETURN' as const, businessDate: h.businessDate,
    hallId: h.hallId, customerId: h.customerId, salespersonId: h.salespersonId, warehouseId: h.warehouseId, orderDiscount: salesInputMoney(h.orderDiscount), note: compiled.draft.header.note,
    lines: compiled.draft.lines.map(line => ({ existingLineId: line.id, skuId: line.skuId, quantity: line.quantity, dealPrice: salesInputMoney(line.dealPrice),
      pricingRule: 'UNIT_PRICE' as const, discountTenths: null, isGift: false, zeroConfirmed: false })),
    settlements: compiled.draft.settlements.map(row => { assert.ok(row.paymentMethodId); return { existingSettlementId: row.id, paymentAccountId: row.paymentAccountId,
      paymentMethodId: row.paymentMethodId, direction: 'REFUND' as const, amount: salesInputMoney(row.amount) }; }),
  };
  const prepared = checkedExistingSalesPreparation({ expectedVersion: h.version, draft: compiled.draft }, intent);
  assert.deepEqual(prepared.draft.lines, base.lines);
  assert.throws(() => checkedExistingSalesPreparation({ expectedVersion: h.version, draft: compiled.draft }, { ...intent, lines: intent.lines.map(line => ({ ...line, existingLineId: null })) }));
  const context = new ReadContext({ accountId: h.createdByAccountId, sessionRevision: '1', permissionRevision: '1' }), commands: SalesCommandDto[] = [];
  const workspace = new SalesCommandWorkspace({ scope: context.createScope('SYNTHETIC nullable sales labels'), reader: { readDetail: async () => saved },
    client: { execute: async command => { commands.push(command); return salesResult(command); }, receipt: async command => salesReceipt(command) },
    newRequestKey: () => 'retained-sales-label-memo', onAccessFailure: () => {} });
  assert.equal(await workspace.openExisting(h.id), true); assert.equal(workspace.replaceDraft(prepared.draft), true); assert.equal(await workspace.submit('SAVE'), true);
  const command = commands[0]!; assert.ok(command.action === 'SAVE' && 'draft' in command);
  assert.equal(command.expectedVersion, h.version); assert.deepEqual(command.draft.lines, base.lines); workspace.dispose();
});

test('proven native MAIN absence round-trips fresh prepared rows as explicit null, never as a guessed barcode', async () => {
  const original = transferDetail(), base = draftFromTransferDetail(original), oldLine = original.document.lines[0]!;
  const calls: string[] = [];
  const snapshots = await loadNativeTransferSnapshots(async sql => {
    calls.push(sql);
    if (sql.includes(':schema')) return { rows: [{ installed: true }], rowCount: 1 };
    if (sql.includes(':targets')) {
      assert.match(sql, /FOR SHARE OF s, p, c, f, sz, m/);
      return { rows: [{ id: oldLine.skuId, product_code: 'SYNTHETIC proven code', product_name: 'SYNTHETIC proven product',
        color_name: 'SYNTHETIC proven color', fit_name: 'SYNTHETIC proven fit', size_name: 'SYNTHETIC proven size' }], rowCount: 1 };
    }
    assert.match(sql, /enabled AND barcode_kind='MAIN'/); return { rows: [], rowCount: 0 };
  }, [oldLine.skuId]);
  const snapshot = snapshots.get(oldLine.skuId); assert.ok(snapshot); assert.equal(snapshot.barcode, null); assert.equal(calls.length, 3);
  const transfer = { ...base, lines: [{ ...base.lines[0]!, id: '00000000-0000-0000-0000-000000000907', lineNo: 1, quantity: '1', snapshot }] };
  const transferIntent = { transferId: base.header.id, expectedVersion: original.document.header.version, businessDate: base.header.businessDate,
    fromWarehouseId: base.header.fromWarehouseId, toWarehouseId: base.header.toWarehouseId, note: base.header.note,
    lines: [{ existingLineId: null, skuId: oldLine.skuId, quantity: '1' }] };
  assert.equal(checkedExistingTransferPreparation({ expectedVersion: transferIntent.expectedVersion, draft: transfer }, transferIntent).draft.lines[0]?.snapshot.barcode, null);
  const sales = { ...draft(), lines: draft().lines.map(line => ({ ...line, id: '00000000-0000-0000-0000-000000000908', skuId: oldLine.skuId, snapshot })) }, h = sales.header;
  const salesIntent = { salesId: h.id, expectedVersion: 2, businessType: 'RETURN' as const, businessDate: h.businessDate, hallId: h.hallId, customerId: h.customerId,
    salespersonId: h.salespersonId, warehouseId: h.warehouseId, note: h.note, orderDiscount: salesInputMoney(h.orderDiscount),
    lines: sales.lines.map(line => ({ existingLineId: null, skuId: line.skuId, quantity: line.quantity, dealPrice: salesInputMoney(line.dealPrice), pricingRule: 'UNIT_PRICE' as const,
      discountTenths: null, isGift: false, zeroConfirmed: false })),
    settlements: sales.settlements.map(row => { assert.ok(row.paymentMethodId); return { existingSettlementId: row.id, paymentAccountId: row.paymentAccountId, paymentMethodId: row.paymentMethodId,
      direction: 'REFUND' as const, amount: salesInputMoney(row.amount) }; }),
  };
  assert.equal(checkedExistingSalesPreparation({ expectedVersion: 2, draft: sales }, salesIntent).draft.lines[0]?.snapshot.barcode, null);
  const transferCommand = validateTransferCommand({ action: 'SAVE', requestKey: 'known-main-absence-transfer', expectedVersion: transferIntent.expectedVersion, draft: transfer });
  assert.ok(transferCommand.action === 'SAVE' && 'draft' in transferCommand); assert.equal(transferCommand.draft.lines[0]?.snapshot.barcode, null);
  const salesCommand = validateSalesCommand({ action: 'SAVE', requestKey: 'known-main-absence-sales', expectedVersion: 2, draft: sales });
  assert.ok(salesCommand.action === 'SAVE' && 'draft' in salesCommand); assert.equal(salesCommand.draft.lines[0]?.snapshot.barcode, null);
  for (const barcode of [undefined, '', ' ', 123, false]) {
    const invalidTransfer = { ...transfer, lines: transfer.lines.map(line => ({ ...line, snapshot: { ...line.snapshot, barcode } })) };
    assert.throws(() => checkedExistingTransferPreparation({ expectedVersion: transferIntent.expectedVersion, draft: invalidTransfer }, transferIntent));
    const invalidSales = { ...sales, lines: sales.lines.map(line => ({ ...line, snapshot: { ...line.snapshot, barcode } })) };
    assert.throws(() => checkedExistingSalesPreparation({ expectedVersion: 2, draft: invalidSales }, salesIntent));
  }
  for (const key of ['productCode', 'productName', 'colorName', 'fitName', 'sizeName'] as const) {
    assert.throws(() => checkedExistingTransferPreparation({ expectedVersion: transferIntent.expectedVersion,
      draft: { ...transfer, lines: transfer.lines.map(line => ({ ...line, snapshot: { ...line.snapshot, [key]: null } })) } }, transferIntent));
    assert.throws(() => checkedExistingSalesPreparation({ expectedVersion: 2,
      draft: { ...sales, lines: sales.lines.map(line => ({ ...line, snapshot: { ...line.snapshot, [key]: null } })) } }, salesIntent));
  }
});
