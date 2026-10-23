import type { InventoryPageSize } from '../inventory/contracts.ts';
import { DemoPageSizeSelect, type DemoPageSizeAction } from '../demo-controls/page-size-select.tsx';
import type { ReadScope } from '../loading/read-scope.ts';

/** Inventory's options/type boundary only; rendering/loading has one shared owner. */
const options = [100, 200, 500].map(size => ({ value: String(size), label: `${size}款/页` }));
export type InventoryPageSizeAction = DemoPageSizeAction;
export function InventoryPageSizeSelect(props: {
  readonly ariaLabel?: string;
  readonly scope: ReadScope;
  readonly value: InventoryPageSize;
  readonly disabled: boolean;
  readonly onChange: (size: InventoryPageSize) => void;
  readonly loadAction?: () => Promise<InventoryPageSizeAction>;
}) {
  return <DemoPageSizeSelect {...props} label={props.ariaLabel ?? "每页商品款数"} value={String(props.value)} options={options} onChange={value => {
    if (value === '100' || value === '200' || value === '500') props.onChange(Number(value) as InventoryPageSize);
  }} />;
}
