import { BarcodeSchemesPage } from '../../barcode-schemes/barcode-schemes-page.tsx';
import { createDictionaryHttpReader } from '../../product-settings/size-groups/http-reader.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function prepareBarcodeSchemesRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated'|'forbidden') => void): PreparedApplicationRoute {
  if (!input.configuration.barcodeSchemes || typeof onAccessFailure !== 'function') throw new TypeError('Explicit barcode schemes read capability and access owner are required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Barcode schemes identity does not match its scope.');
  const reader = createDictionaryHttpReader(input.http);
  return { View: ({ scope }: ApplicationRouteProps) => <BarcodeSchemesPage scope={scope} reader={reader} onAccessFailure={onAccessFailure} /> };
}
