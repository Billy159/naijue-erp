import type {Actor, DocumentScope} from './repository.js';
import {SecurityRepository} from './repository.js';
import {SecurityError, invalid} from './errors.js';

export type Policy = 'authenticated' | 'admin_accounts' | 'self' | 'inventory_read' | 'business_reference_read' | 'master_write' | 'transfer' | 'sales_scope' | 'sales_approve' | 'sales_unapprove' | 'correction' | 'transaction_spec' | 'authorized_output' | 'document_work' | 'migration_maintenance';
const definition = (mode: 'query' | 'command', policy: Policy) => Object.freeze({mode, policy});
const q = (policy: Policy) => definition('query', policy), c = (policy: Policy) => definition('command', policy);
export const operations = Object.freeze({
  'employees.list': q('admin_accounts'), 'employees.save': c('admin_accounts'),
  'masters.list': q('master_write'), 'masters.candidates': q('business_reference_read'), 'masters.save': c('master_write'), 'masters.setEnabled': c('master_write'), 'masters.history': q('master_write'),
  'products.list': q('inventory_read'), 'products.detail': q('inventory_read'), 'products.save': c('master_write'), 'products.checkDelete': q('master_write'), 'products.delete': c('master_write'),
  'productMasters.list': q('business_reference_read'), 'productMasters.save': c('master_write'), 'productMasters.checkDelete': q('master_write'), 'productMasters.delete': c('master_write'),
  'barcodes.resolve': q('business_reference_read'), 'barcodes.scheme': q('business_reference_read'), 'specs.ensureForTransaction': c('transaction_spec'),
  'media.stageUpload': c('master_write'), 'media.read': q('inventory_read'),
  'inventory.query': q('inventory_read'), 'inventory.balance': q('inventory_read'), 'inventory.ledger': q('inventory_read'), 'inventory.sourceTrace': q('inventory_read'),
  'correction.preview': q('correction'), 'correction.confirm': c('correction'), 'correction.list': q('inventory_read'), 'correction.detail': q('inventory_read'),
  'transfers.list': q('transfer'), 'transfers.detail': q('transfer'), 'transfers.create': c('transfer'), 'transfers.save': c('transfer'), 'transfers.approve': c('transfer'), 'transfers.unapprove': c('transfer'), 'transfers.void': c('transfer'), 'transfers.history': q('transfer'),
  'sales.list': q('sales_scope'), 'sales.detail': q('sales_scope'), 'sales.create': c('sales_scope'), 'sales.save': c('sales_scope'), 'sales.approve': c('sales_approve'), 'sales.unapprove': c('sales_unapprove'), 'sales.void': c('sales_scope'), 'sales.history': q('sales_scope'),
  'imports.referencePreflight': q('master_write'), 'imports.referenceCommit': c('master_write'),
  'outputs.export': q('authorized_output'), 'outputs.print': q('authorized_output'), 'outputs.barcodeLabels': q('authorized_output'),
  'preferences.get': q('self'), 'preferences.save': c('self'), 'requests.result': q('self'), 'work.command': c('document_work'), 'previews.get': q('authenticated'),
});
export type OperationId = keyof typeof operations;
export function operation(value: unknown): OperationId {
  if (typeof value !== 'string' || !Object.hasOwn(operations, value)) return invalid();
  return value as OperationId;
}
export function authorizeAction(actor: Actor, id: OperationId): void {
  const policy = operations[id].policy;
  if (policy === 'admin_accounts' && actor.role !== 'ADMIN' || ['master_write','correction','sales_unapprove'].includes(policy) && actor.role === 'SALESPERSON') throw new SecurityError('FORBIDDEN');
}
async function transferVisibleToSalesperson(actor: Actor, document: DocumentScope, repo: SecurityRepository, listRead: boolean): Promise<boolean> {
  if (actor.role !== 'SALESPERSON') return true;
  if (!actor.storeId) return false;
  if (document.creatorHallId === actor.storeId && document.creatorRole === 'SALESPERSON' && document.creatorAccountId && document.creatorAccountId === document.creatorId) return true;
  const from = document.header['source_from_warehouse_id'], to = document.header['source_to_warehouse_id'];
  for (const warehouseId of [from,to]) {
    if (typeof warehouseId === 'string' && await (listRead
      ? repo.listWarehouseLinkedToHall(actor,warehouseId,actor.storeId)
      : repo.warehouseLinkedToHall(warehouseId,actor.storeId))) return true;
  }
  return false;
}
export async function authorizeDocument(actor: Actor, document: DocumentScope, id: OperationId, repo: SecurityRepository, proposed = false, prior?: DocumentScope): Promise<void> {
  authorizeAction(actor, id);
  const listRead = id === 'sales.list' || id === 'transfers.list';
  if (id.startsWith('sales.') && document.type !== 'SALE' || id.startsWith('transfers.') && document.type !== 'TRANSFER') throw new SecurityError('SCOPE');
  if (document.type === 'CORRECTION' && id !== 'correction.detail' && id !== 'inventory.sourceTrace' && !id.startsWith('outputs.')) throw new SecurityError('SCOPE');
  if (id === 'correction.detail' && document.type !== 'CORRECTION') throw new SecurityError('SCOPE');
  if (document.type === 'SALE' && actor.role === 'SALESPERSON' && (!document.storeId || document.storeId !== actor.storeId)) throw new SecurityError('SCOPE', 403, '只能访问本营业厅销货单');
  if (document.type === 'TRANSFER' && !await transferVisibleToSalesperson(actor,document,repo,listRead)) throw new SecurityError('SCOPE',403,'只能访问本营业厅相关调拨单');
  if (id === 'sales.approve' && actor.role === 'SALESPERSON' && document.creatorId !== actor.id) throw new SecurityError('FORBIDDEN', 403, '只能审核本人录入的销货单');
  if (proposed && document.type === 'SALE' && (!document.storeId || !await repo.hallExists(document.storeId))) throw new SecurityError('SCOPE', 403, '营业厅来源未知或已停用');
  const read = operations[id].mode === 'query', reversal = id.endsWith('.unapprove') || id.endsWith('.void');
  for (const [index, warehouseId] of document.warehouseIds.entries()) {
    const warehouse = listRead ? await repo.listWarehouse(actor,warehouseId)
      : await repo.warehouse(warehouseId, {includeNonzeroInventory: false});
    // A linked approved sale can save a strictly memo-only revision in the command layer.
    // Reusing its warehouse for that note is not new stock use; every economic change still rejects.
    const approvedSaleMemo=id==='sales.save'&&document.type==='SALE'&&(proposed?prior?.status==='APPROVED'&&prior.warehouseIds.includes(warehouseId):document.status==='APPROVED');
    if (!read && !reversal && !warehouse.enabled && !approvedSaleMemo) {
      // Only a stopped transfer's outbound warehouse needs its exact per-cell occupancy.
      // The default lookup preserves the existing inventory basis validation on this path.
      if (!(document.type === 'TRANSFER' && index === 0 && (await repo.warehouse(warehouseId)).nonzero)) {
        throw new SecurityError('SCOPE', 403, '停用仓库不可新增调入或出库使用');
      }
    }
    if (proposed && !read && !reversal && !prior?.warehouseIds.includes(warehouseId)) {
      if (warehouse.source_ownership_unknown || !warehouse.hall_relations.length) throw new SecurityError('SCOPE',403,'仓库归属尚未核实，不能用于新业务');
      if (document.storeId && !warehouse.hall_relations.includes(document.storeId)) throw new SecurityError('SCOPE',403,'仓库未关联此营业厅');
    }
  }
}
