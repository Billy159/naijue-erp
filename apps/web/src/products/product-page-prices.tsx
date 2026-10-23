import { ProductPriceSourceBody } from './product-editor-prices.tsx';
import { ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { productPricesResponse } from './product-page-validation.ts';
import type { ProductPageTabProps } from './product-page-view.tsx';

export function View({ scope, reader }: ProductPageTabProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.prices!.read(value), productPricesResponse);
  const data = snapshot.success?.data;
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>
    {data && <ProductPriceSourceBody value={key=><span className="pc-read-value product-readonly-price-value">{data.prices[key]??'—'}</span>}/>}
  </ProductReadState>;
}
