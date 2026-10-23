import { UIInput } from '../components/standard-controls.tsx';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import type { ProductWriteValues } from './product-editor-contracts.ts';
export interface ProductEditorPriceProps { readonly values:ProductWriteValues; readonly disabled:boolean; readonly change:(patch:Partial<ProductWriteValues>)=>void; readonly setError:(message:string)=>void }
const priceLabels=['采购价','零售价','五级批发价（工厂店供货价）','六级批发价（贴牌价）','七级批发价（批发价）','八级批发价（代理商供货价）','九级批发价（工厂店零售价）','十级批发价（葛玉珠）','最低售价'];
export function ProductEditorPrices(p:ProductEditorPriceProps) { const disabled=p.disabled; return <div className="product-price-wrap"><div className="product-price-paste"><strong>价格</strong><span>可从 Excel 整列复制价格，按下表顺序粘贴</span></div><table className="product-price-table"><thead><tr><th>价格类型</th><th>金额</th></tr></thead><tbody>{CATALOGUE_PRICE_KEYS.map((key,index)=><tr key={key}><th scope="row">{priceLabels[index]}</th><td><UIInput aria-label={priceLabels[index]} inputMode="decimal" placeholder="未设置" value={p.values.prices[key]??''} disabled={disabled} onChange={text=>p.change({prices:{...p.values.prices,[key]:text===''?null:text}})} onPaste={event=>{
    const raw=event.clipboardData.getData('text/plain');if(disabled||!/[\t\r\n]/.test(raw))return;event.preventDefault();const cells=raw.replace(/\r\n?/g,'\n').replace(/\n$/,'').split(/[\t\n]/).map(text=>text.trim());const keys=CATALOGUE_PRICE_KEYS.slice(index);
    if(cells.length>keys.length||cells.some(text=>text!==''&&!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(text))){p.setError('价格必须是非负金额，最多两位小数；空白表示未设置。');return;}
    const prices={...p.values.prices};cells.forEach((text,i)=>{prices[keys[i]!]=text===''?null:text;});p.change({prices});p.setError('');
   }}/></td></tr>)}</tbody></table><p className="product-field-hint">空白表示未设置；0 表示价格为零。</p></div>;
}
