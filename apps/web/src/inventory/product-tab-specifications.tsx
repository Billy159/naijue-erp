import type { ReactNode } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
import { assertProductSpecifications } from './product-model.ts';
import { ProductReadState, useProductRead } from './product-tab-state.tsx';

/** Frozen specsBody + readonlyDrawerBody: three vertical sections. The reader's
 * complete sizes/SKU facts are still validated, not expanded into a new table or
 * historical-compatibility UI that the current contract does not supply. */
export function ProductTab({ scope, reader, fullPage = false }: { readonly scope: ReadScope; readonly reader: Pick<ProductReadOnlyReader, 'readProductSpecifications'>; readonly fullPage?: boolean }) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.readProductSpecifications(value), assertProductSpecifications);
  const data = snapshot.success?.data;
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data&&<ProductSpecificationsSourceBody className="pd-spec-stack" colors={data.colors.map(value=>({id:value.id,label:value.label}))} fits={data.fits.map(value=>({id:value.id,label:value.label}))} group={<span className="pc-read-value">{data.sizeGroup?.label??'—'}</span>} showGroupCaption={fullPage}/>}</ProductReadState>;
}

interface ProductSpecificationsSourceProps {
 readonly className:string;readonly colors:readonly {readonly id:string;readonly label:string}[];readonly fits:readonly {readonly id:string;readonly label:string}[];
 readonly group:ReactNode;readonly showGroupCaption:boolean;
 readonly edit?:{readonly disabled:boolean;readonly colors:()=>void;readonly fits:()=>void};
 readonly historical?:ReactNode;
}
/** Direct frozen specSection/specsBody. Readonly removal follows readonlyEditor
 * or readonlyDrawerBody, not a separate reconstructed dl/table layout. */
export function ProductSpecificationsSourceBody(p:ProductSpecificationsSourceProps){
 const section=(title:'颜色'|'版型',values:ProductSpecificationsSourceProps['colors'],action:(()=>void)|undefined)=><section className="pc-spec-section" aria-label={title}><div className="pc-section-line"><h3>{title}</h3>{action&&<button type="button" className="btn ghost" disabled={p.edit?.disabled} onClick={action}>编辑{title}</button>}</div><div className="pc-spec-values">{values.length?values.map(value=><span className="pc-spec-value" key={value.id}>{value.label}</span>):<span className="hint">未设置</span>}</div></section>;
 return <div className={`product-source-ui pc-spec-stack ${p.className}`}>{section('颜色',p.colors,p.edit?.colors)}<section className="pc-spec-section" aria-label="尺码组"><div className="pc-section-line"><h3>尺码组</h3></div><div className="pc-spec-group">{p.showGroupCaption&&<span>选择尺码组</span>}<div className="pc-arco-host">{p.group}</div></div></section>{section('版型',p.fits,p.edit?.fits)}{p.historical}</div>;
}
