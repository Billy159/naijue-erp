import { useEffect,useState } from 'react';
import { createRoot } from 'react-dom/client';
import Drawer from '@arco-design/web-react/es/Drawer';
import Tabs from '@arco-design/web-react/es/Tabs';
import { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { ProductReadOnlyReader,ProductBasics,ProductSpecifications } from '../../../../src/inventory/product-contracts.ts';
import type { Selection } from '../../../../src/inventory/contracts.ts';
import type { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { useProductRead,ReadNotice } from './read.tsx';
import { ProductPhotos } from './photos.tsx';

export interface InventoryProductDrawerOptions {
 readonly parent:ReadScope;readonly product:Selection;readonly reader:ProductReadOnlyReader;
 readonly onAccessFailure:(error:HttpQueryError)=>void;
 readonly anchor:HTMLElement|null;readonly viewport:HTMLElement|null;readonly onClosed?:()=>void;
}
/** Inventory view-product's original three-tab Drawer, not the product menu's
 * six-tab route. F1 loads the unchanged ordered product CSS before calling. */
export function openInventoryProductDrawer(options:InventoryProductDrawerOptions):()=>void {
 if(!options.parent.active)return()=>{};
 const position={top:options.viewport?.scrollTop??0,left:options.viewport?.scrollLeft??0};
 const host=document.createElement('div');host.dataset.inventoryProductDrawer='';document.body.append(host);
 const scope=new ReadScope(options.parent.identity,options.parent.routeInstanceId+':inventory-product:'+options.product.id,options.product.id,()=>{}),root=createRoot(host);
 let disposed=false,returnWanted=false;
 const release=()=>{
  if(disposed)return;disposed=true;options.parent.signal.removeEventListener('abort',dispose);scope.dispose();
  queueMicrotask(()=>{root.unmount();host.remove();if(returnWanted&&options.parent.active){if(options.anchor?.isConnected)options.anchor.focus({preventScroll:true});if(options.viewport?.isConnected){options.viewport.scrollTop=position.top;options.viewport.scrollLeft=position.left;}options.onClosed?.();}});
 };
 const dispose=()=>{returnWanted=false;release();};
 options.parent.signal.addEventListener('abort',dispose,{once:true});
 root.render(<InventoryProductDrawer {...options} scope={scope} closed={()=>{returnWanted=true;release();}}/>);
 return dispose;
}

function InventoryProductDrawer(p:InventoryProductDrawerOptions&{scope:ReadScope;closed:()=>void}){
 const [tab,setTab]=useState('base'),[visible,setVisible]=useState(true),[preview,setPreview]=useState(false),[heading,setHeading]=useState(p.product.label);
 const parameters={productId:p.product.id};
 const base=useProductRead(p.scope,p.reader.readProductBasics,parameters,visible&&tab==='base',p.onAccessFailure);
 const specs=useProductRead(p.scope,p.reader.readProductSpecifications,parameters,visible&&(tab==='specs'||tab==='images'),p.onAccessFailure);
 const images=useProductRead(p.scope,p.reader.readProductImages,parameters,visible&&tab==='images',p.onAccessFailure);
 useEffect(()=>{const data=base.snapshot.success?.data;if(data)setHeading(data.code+' · '+data.name);},[base.snapshot.success]);
 const close=()=>{setVisible(false);p.scope.dispose();};
 const notice=(read:typeof base|typeof specs|typeof images)=><ReadNotice phase={read.snapshot.phase} retry={()=>void read.query.run(parameters)} cancel={()=>read.query.cancel()}/>;
 return <Drawer visible={visible} title={<div className="pc-product-drawer-title"><span>{heading}</span><small>只读</small></div>} className="pc-product-drawer iw-arco-controls" width="min(660px,100vw)" footer={null} placement="right" focusLock autoFocus maskClosable escToExit={!preview} unmountOnExit onCancel={close} afterClose={p.closed}>
  <div className="pc-detail-workbench"><Tabs className="pc-product-drawer-tabs" type="line" size="small" activeTab={tab} onChange={setTab} destroyOnHide>
   <Tabs.TabPane key="base" title="基础资料">{tab==='base'&&<section className="pc-detail-body">{notice(base)}{base.snapshot.success?.data&&<DrawerBasics data={base.snapshot.success.data}/>} {base.snapshot.phase==='success'&&!base.snapshot.success?.data&&<div className="empty">商品资料未取得</div>}</section>}</Tabs.TabPane>
   <Tabs.TabPane key="specs" title="规格">{tab==='specs'&&<section className="pc-detail-body">{notice(specs)}{specs.snapshot.success?.data&&<DrawerSpecs data={specs.snapshot.success.data}/>} {specs.snapshot.phase==='success'&&!specs.snapshot.success?.data&&<div className="empty">商品规格资料未取得</div>}</section>}</Tabs.TabPane>
   <Tabs.TabPane key="images" title="图片">{tab==='images'&&<section className="pc-detail-body">{notice(images)}{notice(specs)}{images.snapshot.success?.data&&specs.snapshot.success?.data&&<ProductPhotos inDrawer onPreviewVisibleChange={setPreview} images={images.snapshot.success.data.images} colors={specs.snapshot.success.data.colors} scope={p.scope} denied={p.onAccessFailure} readOriginal={async(imageId,signal)=>(await p.reader.readProductImage({parameters:{productId:p.product.id,imageId},signal,identity:p.scope.identity,routeInstanceId:p.scope.routeInstanceId,entityId:p.product.id})).url}/>} {images.snapshot.phase==='success'&&!images.snapshot.success?.data&&<div className="empty">图片资料未取得</div>}</section>}</Tabs.TabPane>
  </Tabs></div>
 </Drawer>;
}
function DrawerBasics({data:d}:{data:ProductBasics}){
 const fields=[['款号',d.code,null],['商品名称',d.name,null],['商品分类',d.categoryLabel,'category'],['年份',d.yearLabel,'year'],['季节',d.seasonLabel,'season'],['供应商',d.supplierLabel,'supplier'],['厚薄（可选）',d.thickness,'thickness'],['领型 / 裤型（可选）',d.collarPantsType,'shape'],['系统货号',d.systemCode,null]] as const;
 return <div className="pc-form-grid pc-base-grid">{fields.map(([label,value,id])=><div className="field" key={label}><span className="pc-field-caption">{label}</span>{id?<div className="pc-arco-host"><span className="pc-read-value">{value??'—'}</span></div>:<span className="pc-read-value">{value??'—'}</span>}</div>)}</div>;
}
function DrawerSpecs({data:d}:{data:ProductSpecifications}){return <div className="pc-spec-stack"><section className="pc-spec-section"><div className="pc-section-line"><h3>颜色</h3></div><div className="pc-spec-values">{d.colors.map(x=><span key={x.id} className="pc-spec-value">{x.label}</span>)}{!d.colors.length&&<span className="hint">未设置</span>}</div></section><section className="pc-spec-section"><div className="pc-section-line"><h3>尺码组</h3></div><div className="pc-spec-group"><div className="pc-arco-host"><span className="pc-read-value" title={d.sizes.map(x=>x.label).join(' / ')}>{d.sizeGroup?.label??'—'}</span></div></div></section><section className="pc-spec-section"><div className="pc-section-line"><h3>版型</h3></div><div className="pc-spec-values">{d.fits.map(x=><span key={x.id} className="pc-spec-value">{x.label}</span>)}{!d.fits.length&&<span className="hint">未设置</span>}</div></section>{!d.sizeGroup&&d.skus.length>0&&<details className="pc-historical-skus"><summary>原规格资料 <span>尺码组资料未提供，原始身份保留</span></summary><div className="table-scroll"><table><thead><tr><th>原始 SKU</th><th>颜色</th><th>版型</th><th>尺码</th><th>完整历史条码</th><th>仓库 / 库存</th></tr></thead><tbody>{d.skus.map(sku=><tr key={sku.id}><td>{sku.id}</td><td>{d.colors.find(x=>x.id===sku.colorId)?.label??'未提供'}</td><td>{d.fits.find(x=>x.id===sku.fitId)?.label??'未提供'}</td><td>{d.sizes.find(x=>x.id===sku.sizeId)?.label??'未提供'}</td><td>未取得</td><td>未取得</td></tr>)}</tbody></table></div></details>}</div>;}
