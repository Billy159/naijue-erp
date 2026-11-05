import { createElement } from 'react';
import type { ReadScope } from '../../apps/web/src/loading/read-scope.ts';
import type { SalesReferenceReader } from '../../apps/web/src/sales/contracts.ts';
import { SalesReferenceSelector } from '../../apps/web/src/sales/reference-selector.tsx';
import { useSalesReferencePopupHost } from '../../apps/web/src/sales/reference-popup-host.ts';

export { act, createElement, StrictMode } from 'react';
export { createRoot } from 'react-dom/client';
export { ReadContext } from '../../apps/web/src/loading/read-scope.ts';

export function SalesPopupProbe(props: { readonly scope: ReadScope; readonly reader: SalesReferenceReader }) {
  const popupHost = useSalesReferencePopupHost(props.scope);
  return createElement('div', null,
    createElement(SalesReferenceSelector, { popupHost, parentScope: props.scope, reader: props.reader, kind: 'hall', label: '营业厅', value: null, onChange() {} }),
    createElement(SalesReferenceSelector, { popupHost, parentScope: props.scope, reader: props.reader, kind: 'salesperson', label: '营业员', value: null, onChange() {} }));
}
