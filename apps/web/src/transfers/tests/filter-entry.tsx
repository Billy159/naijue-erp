import { useState } from 'react';
import { TransferStatusSelect, TransferWarehouseSelect } from '../filter-controls.tsx';
import type { TransferFilterDraft, TransferWarehouse, TransferWarehouseReader } from '../contracts.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
export { act, createElement, StrictMode } from 'react';
export { createRoot } from 'react-dom/client';
export { ReadContext } from '../../loading/read-scope.ts';
export { warehouse } from './fixtures.ts';

export function WarehouseHarness(props: { scope: ReadScope; reader: TransferWarehouseReader; onChange: (value: readonly TransferWarehouse[]) => void }) {
  const [value, setValue] = useState<readonly TransferWarehouse[]>([]);
  return <TransferWarehouseSelect scope={props.scope} reader={props.reader} label="调出仓库" value={value} onChange={next => { setValue(next); props.onChange(next); }} />;
}
export function StatusHarness() {
  const [value, setValue] = useState<TransferFilterDraft['statuses']>([]);
  return <TransferStatusSelect value={value} onChange={setValue} />;
}
