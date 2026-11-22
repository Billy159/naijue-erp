import type { InventoryFilter, InventoryParameters } from '../inventory/contracts.ts';
import type { ReadIdentity } from '../loading/read-scope.ts';

/** Product supplier metadata is separate from counterparties recorded on documents. */
export function canViewProductSupplier(identity: Pick<ReadIdentity, 'role'> | undefined): boolean {
  return identity?.role !== 'SALESPERSON';
}

export function inventoryFilterWithoutSupplier(filter: InventoryFilter, visible: boolean): InventoryFilter {
  return visible || filter.suppliers.length === 0 ? filter : { ...filter, suppliers: [] };
}

export function inventoryParametersWithoutSupplier(parameters: InventoryParameters, visible: boolean): InventoryParameters {
  const filter = inventoryFilterWithoutSupplier(parameters.filter, visible);
  return filter === parameters.filter ? parameters : { ...parameters, filter };
}
