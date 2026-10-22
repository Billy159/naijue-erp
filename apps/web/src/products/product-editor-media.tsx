import type { ReadScope } from '../loading/read-scope.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import { ProductTab } from '../inventory/product-tab-images.tsx';
export function ProductEditorMedia(props:{readonly scope:ReadScope;readonly productId:string|null;readonly reader:ProductReadOnlyReader}){
 return props.productId?<ProductTab scope={props.scope} reader={props.reader}/>:<p className="product-field-hint">保存商品后可查看图片。</p>;
}
