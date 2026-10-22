import { ProductTab } from '../inventory/product-tab-images.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  if (!reader.images) return null;
  return <><ProductTab scope={scope} reader={{ readProductImages: read => reader.images!.read(read), readProductImage: read => reader.images!.readImage(read) }} /><p className="product-page-missing">图片角色、颜色归属和显示顺序字段未接入；不从标签或列表位置推断。原图仅在明确预览动作后读取。</p></>;
}
