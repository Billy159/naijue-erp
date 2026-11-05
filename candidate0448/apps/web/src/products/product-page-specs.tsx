import { ProductTab } from '../inventory/product-tab-specifications.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  if (!reader.specs) return null;
  return <ProductTab scope={scope} reader={{ readProductSpecifications: read => reader.specs!.read(read) }} fullPage />;
}
