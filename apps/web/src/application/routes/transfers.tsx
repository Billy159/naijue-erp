import { TransferPageHost } from '../../transfers/transfers-route.tsx';
import { createTransferHttpReader, createTransferWarehouseHttpReader } from '../../transfers/http-reader.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import type { ProductReadOnlyReader } from '../../inventory/product-contracts.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

/** Real fixed native endpoints only. Construction remains inert; the route owns
 * its one bounded first-page read after explicit authenticated navigation. */
export function prepareTransferRoute(input: RoutePreparation): PreparedApplicationRoute {
  const configuration = input.configuration.transfers;
  if (!configuration) throw new TypeError('Transfer capability was not configured.');
  const reader = createTransferHttpReader(input.http), references = createTransferWarehouseHttpReader(input.http);
  const loadDetailStyles = () => configuration.detailStylesheet.load();
  let productClient: Promise<ProductReadOnlyReader> | null = null;
  const productReader = async (signal: AbortSignal): Promise<ProductReadOnlyReader> => {
    if (signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    productClient ??= import('../../transport/product-http-reader.ts').then(module => module.createProductHttpReader(input.http)).catch(error => { productClient = null; throw error; });
    const current = await productClient;
    if (signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    return current;
  };
  const product = configuration.product ? {
    reader: {
      readProductBasics: async read => (await productReader(read.signal)).readProductBasics(read),
      readProductSpecifications: async read => (await productReader(read.signal)).readProductSpecifications(read),
      readProductImages: async read => (await productReader(read.signal)).readProductImages(read),
      readProductImage: async read => (await productReader(read.signal)).readProductImage(read),
    } satisfies ProductReadOnlyReader,
    loadStyles: async (): Promise<void> => { await configuration.product!.stylesheet.load(); },
  } : undefined;
  return { View: ({ scope }: ApplicationRouteProps) => <TransferPageHost scope={scope} reader={reader} references={references} loadDetailStyles={loadDetailStyles} {...(product ? { product } : {})} /> };
}
