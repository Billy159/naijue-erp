import type { ReactNode } from 'react';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import type { ProductWriteValues } from './product-editor-contracts.ts';
export interface ProductEditorPriceProps { readonly values:Pick<ProductWriteValues,'prices'>; readonly disabled:boolean; readonly change:(patch:Partial<Pick<ProductWriteValues,'prices'>>)=>void; readonly setError:(message:string)=>void }
/** Direct JSX transport of frozen product-current.js priceBody, with the exact
 * product-master.js priceFields labels/order mapped to the formal price keys.
 * State, command validation and paste ownership stay in the existing adapter. */
export const productPriceSourceLabels=['采购价','零售价','五级批发价（工厂店供货价）','六级批发价（贴牌价）','七级批发价（批发价）','八级批发价（代理商供货价）','九级批发价（工厂店零售价）','十级批发价（葛玉珠）','最低售价'] as const;
export function ProductPriceSourceBody(props:{readonly value:(key:typeof CATALOGUE_PRICE_KEYS[number],label:string,index:number)=>ReactNode}){
 return <div className="pc-price-wrap product-price-wrap"><div className="pc-price-paste"><span>价格</span><small>可从 Excel 整列复制价格，按下表顺序粘贴</small></div><table className="pc-price-table product-price-table" aria-label="商品整款价格"><thead><tr><th>价格类型</th><th>金额</th></tr></thead><tbody>{CATALOGUE_PRICE_KEYS.map((key,index)=><tr key={key}><th scope="row">{productPriceSourceLabels[index]}</th><td data-price-key={key}>{props.value(key,productPriceSourceLabels[index]!,index)}</td></tr>)}</tbody></table><small className="hint">空白表示未设置；0 表示价格为零。</small></div>;
}
export function ProductEditorPrices(p:ProductEditorPriceProps) {const disabled=p.disabled;return <ProductPriceSourceBody value={(key,label,index)=><input data-price-field type="text" inputMode="decimal" placeholder="未设置" aria-label={label} value={p.values.prices[key]??''} disabled={disabled} onChange={event=>{const text=event.currentTarget.value;p.change({prices:{...p.values.prices,[key]:text===''?null:text}});}} onPaste={event=>{
    const raw=event.clipboardData.getData('text/plain');if(disabled||!/[\t\r\n]/.test(raw))return;event.preventDefault();const cells=raw.replace(/\r\n?/g,'\n').replace(/\n$/,'').split(/[\t\n]/).map(text=>text.trim());const keys=CATALOGUE_PRICE_KEYS.slice(index);
    if(cells.length>keys.length){p.setError('价格最多可粘贴 '+keys.length+' 项');return;}
    if(cells.some(text=>text!==''&&!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(text))){p.setError('价格必须是非负金额，最多两位小数；空白表示未设置。');return;}
    const prices={...p.values.prices};cells.forEach((text,i)=>{prices[keys[i]!]=text===''?null:text;});p.change({prices});p.setError('');
 }}/>} />;
}
