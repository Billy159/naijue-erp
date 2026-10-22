import type { SalesProductCapability } from './document-presentation.tsx';
import { useEffect, useState } from 'react';
import '../demo-presentation/controls.css';
import './sales.css';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesReader, SalesReferenceReader } from './contracts.ts';
import { createSalesPageController, type SalesPageController } from './controller.ts';
import { SalesPageView, type SalesPageWriteActions } from './sales-page.tsx';

/** Required production host integration boundary. The app must mount this only on
 * active sales navigation and unmount it when leaving/replacing its ReadScope. */
export function SalesPageHost(props: { readonly scope: ReadScope; readonly reader: SalesReader; readonly references: SalesReferenceReader; readonly loadDetailStyles?: () => Promise<unknown>; readonly write?: SalesPageWriteActions; readonly product?: SalesProductCapability }) {
  const [controller, setController] = useState<SalesPageController | null>(null);
  useEffect(() => {
    const current = createSalesPageController(props.scope, props.reader); setController(current);
    return () => current.dispose();
  }, [props.scope, props.reader]);
  if (typeof props.references?.readReferences !== 'function') throw new TypeError('A bounded sales reference reader must be supplied by the host.');
  return controller && controller.scope === props.scope && controller.reader === props.reader
    ? <SalesPageView key={controller.instanceId} controller={controller} references={props.references} {...(props.product ? { product: props.product } : {})} {...(props.loadDetailStyles ? { loadDetailStyles: props.loadDetailStyles } : {})} {...(props.write ? { write: props.write } : {})} /> : null;
}
