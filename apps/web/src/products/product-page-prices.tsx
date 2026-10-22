import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import { ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { productPricesResponse } from './product-page-validation.ts';
import type { ProductPageTabProps } from './product-page-view.tsx';

const labels = ['采购价', '零售价', '五级批发价（工厂店供货价）', '六级批发价（贴牌价）', '七级批发价（批发价）', '八级批发价（代理商供货价）', '九级批发价（工厂店零售价）', '十级批发价（葛玉珠）', '最低售价'];
export function View({ scope, reader }: ProductPageTabProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.prices!.read(value), productPricesResponse);
  const data = snapshot.success?.data;
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>
    {data && <div className="product-price-wrap"><table className="product-price-table"><caption className="sr-only">商品整款价格</caption><thead><tr><th>价格类型</th><th>金额</th></tr></thead><tbody>{CATALOGUE_PRICE_KEYS.map((key, index) => <tr key={key}><th scope="row">{labels[index]}</th><td data-price-key={key}>{data.prices[key] === null ? '未设置' : data.prices[key]}</td></tr>)}</tbody></table><p className="product-field-hint">未设置与价格为零分别显示。</p></div>}
  </ProductReadState>;
}
