import { ProductReadOnlyMedia } from './product-editor-media.tsx';
import { ProductTab } from '../inventory/product-tab-images.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  if (!reader.images) return null;
  const images=reader.images;
  if(images.classified&&scope.entityId)return <ProductReadOnlyMedia scope={scope} productId={scope.entityId} media={images.classified.media} reader={{readProductSpecifications:read=>images.classified!.readSpecifications(read),readProductImages:read=>images.read(read),readProductImage:read=>images.readImage(read)}} onAccessFailure={()=>{if(scope.active)scope.dispose();}}/>;
  return <ProductTab fullPage scope={scope} reader={{ readProductImages: read => reader.images!.read(read), readProductImage: read => reader.images!.readImage(read), ...(reader.specs?{readProductSpecifications:reader.specs.read}:{}) }} />;
}
