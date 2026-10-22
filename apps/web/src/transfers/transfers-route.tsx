import type { TransferProposalPresentation } from '../current-form/transfer-proposal-form.tsx';
import { useEffect, useState } from 'react';
import '@arco-design/web-react/dist/css/arco.css';
import '../demo-presentation/controls.css';
import './transfers.css';
import type { ReadScope } from '../loading/read-scope.ts';
import type { TransferProductCapability, TransferReader, TransferWarehouseReader } from './contracts.ts';
import { createTransferPageController, type TransferPageController } from './controller.ts';
import type { TransferCommandCapability } from './commands/contracts.ts';
import { TransferPageView } from './transfers-page.tsx';

/** Host must import this leaf only on transfer navigation, load its route CSS
 * before mounting, and supply a real action-only detail stylesheet loader. */
export function TransferPageHost(props: { readonly scope: ReadScope; readonly reader: TransferReader; readonly references: TransferWarehouseReader;
  readonly presentation?: TransferProposalPresentation; readonly loadDetailStyles: () => Promise<unknown>; readonly commands?: TransferCommandCapability; readonly product?: TransferProductCapability; readonly initialTransferId?: string }) {
  const [controller, setController] = useState<TransferPageController | null>(null);
  if (typeof props.references?.readWarehouses !== 'function' || typeof props.loadDetailStyles !== 'function') throw new TypeError('Bounded native warehouse reader and action-only detail styles are required.');
  if (props.commands && props.scope.active && (typeof props.commands.workspace?.matchesIdentity !== 'function' || !props.commands.workspace.matchesIdentity(props.scope) || props.commands.preparation !== undefined && typeof props.commands.preparation.prepareCreate !== 'function' || props.commands.manualCreate !== undefined && (typeof props.commands.manualCreate.open !== 'function' || typeof props.commands.manualCreate.canLeave !== 'function'))) throw new TypeError('A same-identity session command capability and complete optional preparation are required.');
  if (props.product && (typeof props.product.loadStyles !== 'function' || typeof props.product.reader?.readProductBasics !== 'function' || typeof props.product.reader.readProductSpecifications !== 'function' || typeof props.product.reader.readProductImages !== 'function' || typeof props.product.reader.readProductImage !== 'function')) throw new TypeError('A complete native product reader and action-only stylesheet loader are required.');
  useEffect(() => {
    if (!props.scope.active) { setController(null); return; }
    const current = createTransferPageController(props.scope, props.reader); setController(current);
    return () => current.dispose();
  }, [props.scope, props.reader]);
  return controller && controller.parentScope === props.scope && controller.reader === props.reader
    ? <TransferPageView key={controller.instanceId} {...(props.presentation ? { presentation: props.presentation } : {})} controller={controller} references={props.references} loadDetailStyles={props.loadDetailStyles} {...(props.commands ? { commands: props.commands } : {})} {...(props.product ? { product: props.product } : {})} {...(props.initialTransferId ? { initialTransferId: props.initialTransferId } : {})} /> : null;
}
