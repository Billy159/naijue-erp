import type { CurrentFormBarcodeContext, CurrentFormBarcodeQuery, CurrentFormBarcodeResult, CurrentFormSku } from '../../../../packages/application/src/current-form-ports.ts';
import type { ReadScope } from '../loading/read-scope.ts';

export interface DocumentScanTarget { readonly key: string; readonly context: CurrentFormBarcodeContext }
export interface DocumentScanRow { readonly key: string; readonly sku: CurrentFormSku; readonly quantity: string }
export interface DocumentScanOptions {
  readonly scope: ReadScope;
  readonly target: () => DocumentScanTarget | null;
  readonly resolve: (query: CurrentFormBarcodeQuery, signal: AbortSignal) => Promise<CurrentFormBarcodeResult>;
  readonly apply: (result: Extract<CurrentFormBarcodeResult, { state: 'FOUND' }>) => { readonly ok: boolean; readonly message: string };
  readonly onAccessFailure?: (error: import('../transport/http-query.ts').HttpQueryError) => void;
}
export interface DocumentScanSnapshot {
  readonly phase: 'idle' | 'loading' | 'accepted' | 'not-found' | 'unavailable' | 'error' | 'blocked' | 'disposed';
  readonly barcode: string; readonly message: string;
}
