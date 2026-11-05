import { useEffect, useMemo } from 'react';
import { TransferPageHost } from '../../src/transfers/transfers-route.tsx';
import { createAcceptanceTransfers } from '../fixtures.ts';
import { acceptanceStylesheet } from '../styles.ts';
import type { ProductReadOnlyReader } from '../../src/inventory/product-contracts.ts';
import type { AcceptanceRouteProps } from '../contracts.ts';
export function View({ scope, report }: AcceptanceRouteProps) {
  const fixture = useMemo(() => createAcceptanceTransfers(report), [report]);
  const details = useMemo(() => acceptanceStylesheet(document, 'transfer-detail.css'), [scope]);
  const productStyles = useMemo(() => acceptanceStylesheet(document, 'transfer-product.css'), [scope]);
  const product = useMemo(() => {
    let pending: Promise<ProductReadOnlyReader> | null = null;
    const reader = () => pending ??= import('../fixtures.ts').then(module => module.createAcceptanceProducts(report));
    return { loadStyles: productStyles.load, reader: {
      readProductBasics: async read => (await reader()).readProductBasics(read),
      readProductSpecifications: async read => (await reader()).readProductSpecifications(read),
      readProductImages: async read => (await reader()).readProductImages(read),
      readProductImage: async read => (await reader()).readProductImage(read),
    } satisfies ProductReadOnlyReader };
  }, [report, productStyles]);
  useEffect(() => () => { details.dispose(); productStyles.dispose(); }, [details, productStyles]);
  return <TransferPageHost scope={scope} reader={fixture.reader} references={fixture.references} loadDetailStyles={details.load} product={product} />;
}
