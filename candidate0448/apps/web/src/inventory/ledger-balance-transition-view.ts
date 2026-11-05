import type { InventoryLedgerBalanceTransition } from '../../../../packages/application/src/inventory-ledger-balance-transition.ts';
import { formatQuantity } from './model.ts';

/** Pure view of an already validated recorded/unknown pair. No current quantity,
 * event reconstruction, source authorization or floating-point conversion. */
export function ledgerBalanceTransitionView(transition: InventoryLedgerBalanceTransition): { readonly text: string; readonly title: string } {
  if (transition.state === 'KNOWN') return Object.freeze({
    text: `${formatQuantity(transition.before)} → ${formatQuantity(transition.after)}`,
    title: '本条流水已保存的变化前后库存',
  });
  if (transition.state === 'UNKNOWN') return Object.freeze({ text: '未知 → 未知', title: '未保存本条流水的变化前后库存' });
  throw new TypeError('Invalid inventory ledger balance transition view');
}
