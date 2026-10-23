import type { ReactNode } from 'react';
import type { ProductBasics } from '../inventory/product-contracts.ts';
import { assertProductBasics } from '../inventory/product-model.ts';
import { ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.base!.read(value), assertProductBasics);
  const data = snapshot.success?.data;
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data&&<ProductReadOnlyBaseSource data={data}/>}</ProductReadState>;
}
/** readonlyEditor keeps source captions; readonlyDrawerBody removes required marks. */
export function ProductReadOnlyBaseSource({data,inDrawer=false}:{readonly data:ProductBasics;readonly inDrawer?:boolean}){
 const fields=[
  {label:'款号',value:data.code,required:true},{label:'商品名称',value:data.name,required:true},
  {label:'商品分类',value:data.categoryLabel,required:false,control:'category'},{label:'年份',value:data.yearLabel,required:true,control:'year'},
  {label:'季节',value:data.seasonLabel,required:false,control:'season'},{label:'供应商',value:data.supplierLabel,required:true,control:'supplier'},
  {label:'厚薄（可选）',value:data.thickness??null,required:false,control:'thickness'},{label:'领型 / 裤型（可选）',value:data.collarPantsType??null,required:false,control:'shape'},
  {label:'系统货号',value:data.systemCode,required:true},
 ];
 return <ProductBaseSourceGrid className={inDrawer?'pd-source-base':'product-base-grid product-readonly-base-grid'} fields={fields.map(field=>({...field,required:!inDrawer&&field.required,content:['款号','商品名称','系统货号'].includes(field.label)?<span className="pc-read-value">{field.value??'未提供'}</span>:<div id={`pc-detail-${field.control}`} className="pc-arco-host" data-control={field.control}><span className="pc-read-value">{field.value??'未提供'}</span></div>}))}/>;
}

export interface ProductBaseSourceField {readonly label:string;readonly required:boolean;readonly content:ReactNode}
/** Frozen basicFields + field helper transported as JSX; only native DTO slots
 * and approved optional multi-season/category provenance are adapter-owned. */
export function ProductBaseSourceGrid(props:{readonly fields:readonly ProductBaseSourceField[];readonly className:string}){
 return <div className={`pc-form-grid pc-base-grid product-source-base ${props.className}`} role="group" aria-label="商品基础资料">{props.fields.map(field=><div className="field" key={field.label}><span className="pc-field-caption">{field.label}{field.required&&<span className="ui-required product-required-mark" aria-hidden> *</span>}</span>{field.content}</div>)}</div>;
}
