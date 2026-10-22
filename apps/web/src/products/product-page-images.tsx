import { ProductTab } from '../inventory/product-tab-images.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  if (!reader.images) return null;
  return <ProductTab scope={scope} reader={{ readProductImages: read => reader.images!.read(read), readProductImage: read => reader.images!.readImage(read) }} />;
}
