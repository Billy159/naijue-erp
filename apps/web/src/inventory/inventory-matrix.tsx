import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useId, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { InventoryActions, InventoryCellTarget, InventoryColorFit, InventoryPage, InventoryProduct, InventoryRow, InventorySize, StockTotal } from './contracts.ts';
import { formatQuantity, totalLabel } from './model.ts';
import { knownDisplaySources, projectInventoryColors, type InventoryDisplayColor, type InventoryDisplayRow, type InventoryKnownDisplaySource } from './display-projection.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { InventoryWindowModel, type InventoryLogicalCell, type InventoryWindowLayout, type InventoryWindowRow, type InventoryWindowViewport } from './windowing/model.ts';
import { createInventoryRenderPlan, inventoryDOMScrollTop, inventoryModelViewport, type InventoryColumnPart } from './windowing/render-plan.ts';

export interface InventoryDisplaySettings {
  readonly category: boolean;
  readonly supplier: boolean;
  readonly fit: boolean;
  readonly sizeGroup: boolean;
  readonly season: boolean;
  readonly subtotal: boolean;
  readonly total: boolean;
  readonly sizeDescription: boolean;
}
/** Frozen workbench defaults; hidden FIT is a read-only display projection, never SKU merging. */
export const defaultDisplaySettings: InventoryDisplaySettings = { category: true, supplier: false, fit: false, sizeGroup: false, season: false, subtotal: false, total: true, sizeDescription: false };
interface WindowContinuity {readonly model:InventoryWindowModel;readonly viewport:InventoryWindowViewport;readonly gap:number;readonly height:number;readonly signal:AbortSignal;readonly focus:InventoryLogicalCell|null}

/** Deliberate developer opt-in. No unmeasured/fixed row-height defaults. */
export interface InventoryMatrixWindowing {
  readonly scope: Pick<ReadScope, 'signal'>;
  readonly layout: Omit<InventoryWindowLayout, 'subtotal' | 'total' | 'collapsedProducts' | 'collapsedColors'>;
  readonly viewport: InventoryWindowViewport;
  readonly sectionGap: number;
  readonly onScrollRequest: (position: { readonly scrollTop: number; readonly scrollLeft: number }) => void;
  readonly onInvalidGeometry?: (error: Error) => void;
  readonly fixedWidths?: readonly [number, number, number, number, number];
  readonly sectionWidths?: ReadonlyMap<string, readonly [number, number, number, number, number]>;
  readonly continuity?:RefObject<WindowContinuity|null>;
}
export interface InventoryMatrixMeasuredWindowing { readonly mode: 'measured'; readonly scope: Pick<ReadScope, 'signal'>; readonly element: RefObject<HTMLDivElement | null> }
type MatrixProps = {
  readonly data: InventoryPage;
  readonly settings: InventoryDisplaySettings;
  readonly collapsedProducts: ReadonlySet<string>;
  readonly collapsedColors: ReadonlySet<string>;
  readonly toggleProduct: (id: string) => void;
  readonly toggleColor: (id: string) => void;
  readonly actions: InventoryActions;
  readonly windowing?: InventoryMatrixWindowing | InventoryMatrixMeasuredWindowing;
  /** Internal source choose() callback; carries only existing native cell targets. */
  readonly chooseSources?:(targets:readonly InventoryCellTarget[],trigger:HTMLSpanElement)=>void;
  /** The owned source dialog temporarily keeps the stock keyboard position. */
  readonly sourceChoiceOpen?:boolean;
  readonly projectColors?:(product:InventoryProduct)=>readonly InventoryDisplayColor[];
};
/** Column-first geometry follows frozen inventory-matrix-experiment.js, not
 * standalone product-heading rows. Canonical FIT/SKU identities stay separate. */
export const InventoryMatrix = memo(function InventoryMatrix(props: MatrixProps) {
  const signal = props.windowing?.scope.signal;
  const aborted = useSyncExternalStore(callback => {
    signal?.addEventListener('abort', callback);
    return () => signal?.removeEventListener('abort', callback);
  }, () => signal?.aborted ?? false, () => signal?.aborted ?? false);
  const [choices,setChoices]=useState<readonly InventoryCellTarget[]|null>(null);
  const sourceTrigger=useRef<{element:HTMLSpanElement;data:InventoryPage;signal:AbortSignal|undefined}|null>(null);
  const chooseSources=useCallback((targets:readonly InventoryCellTarget[],trigger:HTMLSpanElement)=>{
    sourceTrigger.current={element:trigger,data:props.data,signal};
    trigger.focus({preventScroll:true});setChoices(targets);
  },[props.data,signal]);
  const projections=useMemo(()=>new WeakMap<InventoryProduct,readonly InventoryDisplayColor[]>(),[props.data]);
  const projectColors=useCallback((product:InventoryProduct)=>{let value=projections.get(product);if(!value){value=projectInventoryColors(product);projections.set(product,value);}return value;},[projections]);
  useEffect(()=>setChoices(null),[props.data]);
  useEffect(()=>{
    if(choices)return;
    const origin=sourceTrigger.current;sourceTrigger.current=null;
    // Cancel restores the exact trigger after unmount; selection clears it first.
    if(origin?.data===props.data&&origin.signal===signal&&!signal?.aborted&&origin.element.isConnected)origin.element.focus({preventScroll:true});
  },[choices,props.data,signal]);
  if (aborted) return null;
  const sourceProps={...props,chooseSources,sourceChoiceOpen:!!choices,projectColors};
  return <div className="inventory-source-matrix">{props.windowing?('mode' in props.windowing?<MeasuredInventoryMatrix {...sourceProps} windowing={props.windowing}/>:<WindowedInventoryMatrix {...sourceProps} windowing={props.windowing}/>):<EagerInventoryMatrix {...sourceProps}/>}
  {choices&&<InventorySourceChoice choices={choices} products={props.data.products} close={()=>setChoices(null)} select={target=>{sourceTrigger.current=null;props.actions.onOpenCell?.(target);}}/>}</div>;
});
/** Direct inventory-fit-projection.js choose(): original dialog/head/buttons.
 * Native source identities are already supplied by the retained formal projection. */
function InventorySourceChoice(p:{readonly choices:readonly InventoryCellTarget[];readonly products:readonly InventoryProduct[];readonly close:()=>void;readonly select:(target:InventoryCellTarget)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),title=useId();
 useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();return()=>{if(element?.open)element.close();};},[]);
 const close=()=>{dialog.current?.close();p.close();};
 return <dialog ref={dialog} className="inventory-source-choice" aria-labelledby={title} onCancel={event=>{event.preventDefault();close();}}><h3 id={title}>选择要查看的版型资料</h3>{p.choices.map(target=><button type="button" className="btn" key={target.skuId} onClick={()=>{close();p.select(target);}}>{target.fit.label} · {p.products.find(product=>product.id===target.productId)?.code??target.productId}</button>)}<button type="button" className="btn" onClick={close}>关闭</button></dialog>;
}

function EagerInventoryMatrix(props: MatrixProps) {
  const sections = new Map<string, InventoryProduct[]>();
  for (const product of props.data.products) {
    const key = JSON.stringify([product.sizeGroup.id, product.sizes.map(size => [size.id, size.label])]);
    const existing = sections.get(key);
    if (existing) existing.push(product); else sections.set(key, [product]);
  }
  return <>{[...sections].map(([key, products]) => {
    const first = products[0]!;
    const width = 300 + 116 + 152 + first.sizes.length * 76 + 76 + 70;
    return <section key={key} className="mx-section" data-size-system={first.sizeGroup.id} style={{ '--mx-table-width': `${width}px` } as CSSProperties} aria-label={`${first.sizeGroup.label}库存矩阵`}>
      <h3 hidden={!props.settings.sizeDescription}>{first.sizeGroup.label} <small>{first.sizes.map(size=>size.label).join(' / ')}</small></h3>
      <table className="mx-table"><caption className="sr-only">{first.sizeGroup.label}，商品、颜色、版型、仓库及尺码库存；— 表示不存在此规格，合法规格无库存显示 0。</caption>
        <colgroup><col style={{ width: 300 }} /><col style={{ width: 116 }} /><col style={{ width: 152 }} />{first.sizes.map(size => <col key={size.id} style={{ width: 76 }} />)}<col style={{ width: 76 }} /><col style={{ width: 70 }} /></colgroup>
        <thead><tr><th scope="col" className="mx-product">款号／商品名称</th><th scope="col" className="mx-color">颜色</th><th scope="col" className="mx-warehouse">仓库</th>{first.sizes.map(size => <th scope="col" key={size.id} className="mx-size" data-size-id={size.id}>{size.label}</th>)}<th scope="col" className="mx-total-cell">合计</th><th scope="col" className="ui-action-cell">操作</th></tr></thead>
        <tbody>{products.map(product => <MemoProductRows key={product.id} product={product} {...props} />)}</tbody>
      </table>
    </section>;
  })}</>;
}
const spacer = <span className="mx-fold-spacer" aria-hidden="true" />;
function Fold(props: { readonly expanded: boolean; readonly label: string; readonly toggle: () => void }) {
  return <button type="button" className="mx-fold" aria-expanded={props.expanded} aria-label={`${props.expanded ? '折叠' : '展开'}${props.label}`} onClick={props.toggle}>{props.expanded ? '▾' : '▸'}</button>;
}
function Indent(props: { readonly control: ReactNode; readonly children: ReactNode }) {
  return <div className="mx-indent">{props.control}{props.children}</div>;
}
/** Direct inventory-matrix-experiment.js productCell; native DTO slots only. */
function ProductIdentity(props:{readonly product:InventoryProduct;readonly settings:InventoryDisplaySettings;readonly showMeta:boolean;readonly fit?:string}){
 const {product,settings}=props;
 const fields=[['category','分类',product.categoryLabel],['supplier','供应商',product.supplierLabel],['fit','版型',props.fit],['sizeGroup','尺码组',product.sizeGroup.label],['season','季节',product.seasonLabel]]as const;
 const extras=fields.filter(([key])=>settings[key]&&(key!=='fit'||props.fit!==undefined));
 return <><div className="mx-product-identity"><strong>{product.code}</strong><span title={product.name}>{product.name}</span></div>{props.showMeta&&extras.length>0&&<div className="mx-meta">{extras.map(([key,label,value])=><span key={key}><em>{label}</em> {value??'未提供'}</span>)}</div>}</>;
}

function ViewProduct(props: { readonly product: InventoryProduct; readonly actions: InventoryActions }) {
  return <button type="button" className="mx-view" disabled={!props.actions.onViewProduct} title={props.actions.onViewProduct ? '查看当前商品' : '商品只读抽屉尚未接入'} aria-label={`打开${props.product.code}商品资料`} onClick={event => { event.currentTarget.focus(); props.actions.onViewProduct?.({ id: props.product.id, label: `${props.product.code} ${props.product.name}` }); }}>查看</button>;
}
function ProductRows(props: MatrixProps & { readonly product: InventoryProduct }) {
  const { product } = props;
  const groups = useMemo(() => props.settings.fit ? product.colorFits : (props.projectColors??projectInventoryColors)(product), [product, props.settings.fit,props.projectColors]);
  const collapsed = props.collapsedProducts.has(product.id);
  const productFold = <Fold expanded={!collapsed} label={`商品${product.code}`} toggle={() => props.toggleProduct(product.id)} />;
  if (collapsed) return <TotalRow {...props} kind="product" folded first identity color={<Indent control={productFold}>所有颜色</Indent>} warehouse={<Indent control={spacer}>所有库存</Indent>} totals={product.sizeTotals} total={product.total} />;
  return <>{groups.map((group, index) => <ColorRows key={JSON.stringify([group.color.id, group.fit?.id ?? null])} {...props} group={group} firstGroup={index === 0} productFold={productFold} />)}
    {props.settings.total && <TotalRow {...props} kind="product" label="商品合计" totals={product.sizeTotals} total={product.total} />}
  </>;
}
const MemoProductRows=memo(ProductRows,(before,after)=>{
 const product=before.product;
 if(product!==after.product||before.data!==after.data||before.settings!==after.settings||before.actions!==after.actions||before.chooseSources!==after.chooseSources||before.projectColors!==after.projectColors||before.toggleProduct!==after.toggleProduct||before.toggleColor!==after.toggleColor||before.collapsedProducts.has(product.id)!==after.collapsedProducts.has(product.id))return false;
 return product.colorFits.every(group=>{const key=JSON.stringify([product.id,group.color.id,before.settings.fit?group.fit.id:null]);return before.collapsedColors.has(key)===after.collapsedColors.has(key);});
});
type MatrixColor = InventoryColorFit | InventoryDisplayColor;
type MatrixRow = InventoryRow | InventoryDisplayRow;
function ColorRows(props: MatrixProps & { readonly product: InventoryProduct; readonly group: MatrixColor; readonly firstGroup: boolean; readonly productFold: ReactNode }) {
  const { group, product } = props;
  const key = JSON.stringify([product.id, group.color.id, group.fit?.id ?? null]);
  const folded = props.collapsedColors.has(key);
  const colorFold = <Fold expanded={!folded} label={`${product.code}${group.color.label}${group.fit?.label ?? ''}`} toggle={() => props.toggleColor(key)} />;
  if (folded) return <><TotalRow {...props} kind="color" folded first={props.firstGroup} identity {...(group.fit ? { fit: group.fit.label } : {})} color={<Indent control={props.firstGroup ? props.productFold : spacer}>{group.color.label}</Indent>} warehouse={<Indent control={colorFold}>所有库存</Indent>} totals={group.sizeTotals} total={group.total} /></>;
  return <>
    {group.rows.map((row, index) => <WarehouseRow key={row.warehouse.id} {...props} row={row} first={props.firstGroup && index === 0} firstInGroup={index === 0} colorFold={colorFold} />)}
    {props.settings.subtotal && <TotalRow {...props} kind="color" label="颜色小计" totals={group.sizeTotals} total={group.total} />}
  </>;
}
type RowWindow = {
  readonly columns: readonly InventoryColumnPart[];
  readonly row: InventoryWindowRow;
  readonly sectionStart: number;
  readonly bindCell: (address: InventoryLogicalCell) => {
    readonly ref: (element: HTMLSpanElement | null) => void;
    readonly onFocus: () => void;
    readonly onKeyDown: (event: KeyboardEvent<HTMLSpanElement>) => void;
  };
  readonly projectedFocus?:(sources:readonly InventoryKnownDisplaySource[])=>InventoryLogicalCell|null;
};
function ColumnCells(props: { readonly product: InventoryProduct; readonly window?: RowWindow; readonly render: (size: InventorySize, index: number) => ReactNode }) {
  if (!props.window) return <>{props.product.sizes.map((size, index) => props.render(size, index))}</>;
  return <>{props.window.columns.map(part => part.kind === 'gap' ? <td key={`gap-${part.start}`} colSpan={part.count} aria-hidden="true" style={{ width: part.width, minWidth: 0, padding: 0, border: 0 }} /> : props.render(part.column.size, part.column.index))}</>;
}
function rowAttributes(window: RowWindow | undefined) {
  return window ? { 'aria-rowindex': window.row.index - window.sectionStart + 1, 'data-window-row-height': window.row.height, style: { height: window.row.height } } : {};
}
function WarehouseRow(props: MatrixProps & { readonly product: InventoryProduct; readonly group: MatrixColor; readonly row: MatrixRow; readonly first: boolean; readonly firstInGroup: boolean; readonly productFold: ReactNode; readonly colorFold: ReactNode; readonly window?: RowWindow }) {
  const { product, group, row, first } = props;
  const fitLabel = group.fit?.label ?? '';
  return <tr {...rowAttributes(props.window)} data-inventory-product={product.id} data-inventory-row={JSON.stringify([product.id, group.color.id, group.fit?.id ?? null, row.warehouse.id])} className={`mx-detail-row${first ? ' mx-product-row' : ''}`}>
    <td className="mx-product" aria-colindex={props.window ? 1 : undefined}><ProductIdentity product={product} settings={props.settings} showMeta={first || props.settings.fit && props.firstInGroup} fit={fitLabel} />{group.fit && <span className="sr-only">{fitLabel}</span>}</td>
    <td className="mx-color" aria-colindex={props.window ? 2 : undefined}><Indent control={first ? props.productFold : spacer}>{group.color.label}</Indent></td>
    <td className="mx-warehouse" aria-colindex={props.window ? 3 : undefined} title={[row.warehouse.label, fitLabel].filter(Boolean).join(' · ')}><Indent control={props.firstInGroup ? props.colorFold : spacer}>{row.warehouse.label}</Indent></td>
    <ColumnCells product={product} {...(props.window ? { window: props.window } : {})} render={(size, index) => {
      const cell = row.cells[size.id]!;
      if (cell.state === 'not-applicable') return <td key={size.id} className="mx-number" aria-colindex={props.window ? index + 4 : undefined}><span className="mx-absent" aria-label="不存在此规格">—</span></td>;
      const sources = 'sources' in cell ? knownDisplaySources(cell) : null;
      const source = sources?.length === 1 ? sources[0]! : null;
      const focusSource=sources?.[0];
      const address = props.window ? group.fit ? { productId: product.id, colorId: group.color.id, fitId: group.fit.id, warehouseId: row.warehouse.id, sizeId: size.id } : props.window.projectedFocus?.(sources??[])??(focusSource ? {productId:focusSource.productId,colorId:focusSource.color.id,fitId:focusSource.fit.id,warehouseId:focusSource.warehouse.id,sizeId:focusSource.size.id}:null) : null;
      const target: InventoryCellTarget | null = sources
        ? source ? { productId: source.productId, productLabel: `${product.code} ${product.name}`, color: source.color, fit: source.fit, size: source.size, warehouse: source.warehouse, skuId: source.cell.skuId, readReference: props.data.readReference } : null
        : group.fit && 'skuId' in cell ? { productId: product.id, productLabel: `${product.code} ${product.name}`, color: group.color, fit: group.fit, size, warehouse: row.warehouse, skuId: cell.skuId, readReference: props.data.readReference } : null;
      const multipleSources=!!sources&&sources.length>1;
      const available=!!props.actions.onOpenCell&&(!!target||multipleSources&&!!props.chooseSources);
      const explanation=multipleSources?'选择要查看的版型资料':available?`查看该仓库 / SKU 库存流水${target?` · ${target.fit.label}`:''}`:'库存流水尚未接入';
      const open=(trigger:HTMLSpanElement)=>{if(!available)return;if(multipleSources){props.chooseSources?.(sources!.map(source=>({productId:source.productId,productLabel:`${product.code} ${product.name}`,color:source.color,fit:source.fit,size:source.size,warehouse:source.warehouse,skuId:source.cell.skuId,readReference:props.data.readReference})),trigger);}else if(target)props.actions.onOpenCell?.(target);};
      const binding=address?props.window?.bindCell(address):undefined;
      return <td key={size.id} data-mx-stock="" data-product={product.id} data-color={group.color.id} data-size={size.id} data-warehouse={row.warehouse.id} className={`mx-number${cell.quantity.startsWith('-')?' minus':cell.quantity==='0'?' mx-zero':''}`} aria-colindex={props.window?index+4:undefined}>
       <span className={`iw-number mx-stock${cell.quantity.startsWith('-')?' mx-negative':''}`} role="button" tabIndex={available?0:-1} {...(binding?{ref:binding.ref,onFocus:binding.onFocus}:{})} data-stock-address={props.window?JSON.stringify(address):undefined} data-inventory-source-count={sources?.length??1} aria-disabled={!available} title={explanation} aria-label={`${product.code} ${group.color.label} ${fitLabel} ${row.warehouse.label} ${size.label} 库存${cell.quantity}${multipleSources?`，${explanation}`:''}`} onClick={event=>open(event.currentTarget)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){if(available){event.preventDefault();open(event.currentTarget);}}else binding?.onKeyDown(event);}}>{formatQuantity(cell.quantity)}</span>
      </td>;
    }} /><td className="mx-total-cell" aria-colindex={props.window ? product.sizes.length + 4 : undefined} title={totalLabel(row.total)}>{totalLabel(row.total)}</td><td className="ui-action-cell" aria-colindex={props.window ? product.sizes.length + 5 : undefined}><ViewProduct product={product} actions={props.actions} /></td>
  </tr>;
}
function TotalRow(props: MatrixProps & { readonly product: InventoryProduct; readonly label?: string; readonly fit?: string; readonly color?: ReactNode; readonly warehouse?: ReactNode; readonly totals: Readonly<Record<string, StockTotal>>; readonly total: StockTotal; readonly kind: 'product' | 'color'; readonly folded?: boolean; readonly first?: boolean; readonly identity?: boolean; readonly window?: RowWindow }) {
  return <tr {...rowAttributes(props.window)} data-inventory-product={props.product.id} className={`mx-${props.kind === 'product' ? 'total mx-product-total' : 'subtotal mx-color-total'}${props.folded ? ' mx-folded' : ''}${props.first ? ' mx-product-row' : ''}`}>
    <td className="mx-product">{props.identity ? <ProductIdentity product={props.product} settings={props.settings} showMeta={!!props.first || props.settings.fit} {...(props.fit ? { fit: props.fit } : {})} /> : props.label}{props.fit && <span className="sr-only">{props.fit}</span>}</td><td className="mx-color">{props.color}</td><td className="mx-warehouse">{props.warehouse}</td>
    <ColumnCells product={props.product} {...(props.window ? { window: props.window } : {})} render={(size, index) => <td key={size.id} className="mx-number" aria-colindex={props.window ? index + 4 : undefined} title={totalLabel(props.totals[size.id]!)}>{formatQuantity(props.totals[size.id]!.knownQuantity)}</td>} /><td className="mx-total-cell" title={totalLabel(props.total)}>{totalLabel(props.total)}</td><td className="mx-summary-operation ui-action-cell">{props.identity && <ViewProduct product={props.product} actions={props.actions} />}</td>
  </tr>;
}
/** Geometry only: equal metadata text at the same native column width can share
 * a height probe. Rendered products and canonical identities are never grouped. */
function metadataMeasureKey(section:string,product:InventoryProduct,settings:InventoryDisplaySettings,fit?:string){return JSON.stringify([section,settings.category?product.categoryLabel??'未提供':null,settings.supplier?product.supplierLabel??'未提供':null,settings.fit?fit??null:null,settings.sizeGroup?product.sizeGroup.label:null,settings.season?product.seasonLabel??'未提供':null]);}
function MatrixMeasureRow(p:{readonly name:string;readonly product:InventoryProduct;readonly settings:InventoryDisplaySettings;readonly actions:InventoryActions;readonly meta?:boolean;readonly fit?:string;readonly fold?:boolean;readonly total?:'color'|'product'}){
 const group=p.product.colorFits[0];
 return <tr data-measure-row={p.name} className={p.total?`mx-${p.total==='color'?'subtotal':'total'}`:'mx-detail-row'}>
  <td className="mx-product">{p.total?(p.total==='color'?'颜色小计':'商品合计'):<ProductIdentity product={p.product} settings={p.settings} showMeta={p.meta??false} {...(p.fit?{fit:p.fit}:{})}/>}</td>
  <td className="mx-color">{!p.total&&<Indent control={spacer}>{group?.color.label??''}</Indent>}</td>
  <td className="mx-warehouse">{!p.total&&<Indent control={p.fold?<Fold expanded label="" toggle={()=>{}}/>:spacer}>{group?.rows[0]?.warehouse.label??''}</Indent>}</td>
  <td colSpan={p.product.sizes.length}/><td className="mx-total-cell"/><td className="ui-action-cell">{!p.total&&<ViewProduct product={p.product} actions={p.actions}/>}</td>
 </tr>;
}

/** Measure native identity/header carriers, without mounting stock cells for the
 * whole page. Exact DTOs stay intact; only row/column geometry is retained here. */
function MeasuredInventoryMatrix(props:MatrixProps&{readonly windowing:InventoryMatrixMeasuredWindowing}){
 const probe=useRef<HTMLDivElement>(null),frame=useRef<number|null>(null),lastWidth=useRef(0),continuity=useRef<WindowContinuity|null>(null);
 const [revision,setRevision]=useState(0),[measured,setMeasured]=useState<{data:InventoryPage;settings:InventoryDisplaySettings;layout:InventoryMatrixWindowing['layout'];fixed:readonly[number,number,number,number,number];sections:ReadonlyMap<string,readonly[number,number,number,number,number]>;gap:number}|null>(null);
 const [viewport,setViewport]=useState<InventoryWindowViewport|null>(null);
 const sections=useMemo(()=>{const groups=new Map<string,InventoryProduct[]>();for(const product of props.data.products){const key=JSON.stringify([product.sizeGroup.id,product.sizes.map(s=>[s.id,s.label])]);const group=groups.get(key);if(group)group.push(product);else groups.set(key,[product]);}return [...groups];},[props.data]);
 const current=measured?.data===props.data&&measured.settings===props.settings?measured:null;
 const updateViewport=useCallback(()=>{const element=props.windowing.element.current;if(!element||props.windowing.scope.signal.aborted)return;const next={scrollTop:element.scrollTop,scrollLeft:element.scrollLeft,width:element.clientWidth,height:Math.max(1,element.clientHeight)};if(next.width<=0)return;if(lastWidth.current&&lastWidth.current!==next.width){setMeasured(null);setRevision(value=>value+1);}lastWidth.current=next.width;setViewport(previous=>{const value={...next,fixedLeadingWidth:0,fixedTrailingWidth:0,stickyHeaderOffset:0,overscanRows:3,overscanColumns:1};return previous&&Object.keys(value).every(k=>previous[k as keyof InventoryWindowViewport]===value[k as keyof InventoryWindowViewport])?previous:value;});},[props.windowing.element,props.windowing.scope.signal]);
 const schedule=useCallback(()=>{if(frame.current!==null)return;frame.current=requestAnimationFrame(()=>{frame.current=null;updateViewport();});},[updateViewport]);
 useEffect(()=>{
  const element=props.windowing.element.current;if(!element)return;
  element.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;observer?.observe(element);updateViewport();
  return()=>{element.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);observer?.disconnect();if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}};
 },[props.windowing.element,schedule,updateViewport]);
 useLayoutEffect(()=>{updateViewport();},[current,updateViewport]);
 useLayoutEffect(()=>{
  if(!probe.current||!props.windowing.element.current?.clientWidth||props.windowing.scope.signal.aborted)return;
  const heights=new Map<string,number>(),columns=new Map<string,readonly[number,number,number,number,number]>(),sizes=new Map<string,readonly number[]>(),productSections=new Map(sections.flatMap(([key,products])=>products.map(product=>[product,key] as const)));let gap=0;
  for(const section of Array.from(probe.current.querySelectorAll<HTMLElement>('[data-measure-section]'))){
   const key=section.dataset.measureSection!,header=section.querySelector<HTMLTableRowElement>('thead tr')!;
   const cells=Array.from(header.children) as HTMLElement[],widths=cells.map(cell=>cell.getBoundingClientRect().width);
   if(widths.some(width=>!Number.isFinite(width)||width<=0))return;
   columns.set(key,[widths[0]!,widths[1]!,widths[2]!,widths.at(-2)!,widths.at(-1)!]);sizes.set(key,widths.slice(3,-2));heights.set(JSON.stringify(['section',key]),header.getBoundingClientRect().height);
   const description=section.querySelector<HTMLElement>('h3');if(description)heights.set(JSON.stringify(['section-description',key]),description.getBoundingClientRect().height);
   gap=Math.max(gap,parseFloat(getComputedStyle(section).marginBottom)||0);
  }
  for(const row of Array.from(probe.current.querySelectorAll<HTMLElement>('[data-measure-row]'))){const height=row.getBoundingClientRect().height;if(!Number.isFinite(height)||height<=0)return;heights.set(row.dataset.measureRow!,height);}
  const first=sections[0];if(!first||!columns.size)return;
  const all=[...columns.values()],fixed=all[0]!.map((_,i)=>Math.min(...all.map(value=>value[i]!))) as [number,number,number,number,number];
  const layout:InventoryMatrixWindowing['layout']={heights:{'section-description':props.settings.sizeDescription?heights.get(JSON.stringify(['section-description',first[0]]))!:0,'section-header':heights.get(JSON.stringify(['section',first[0]]))!,warehouse:heights.get('warehouse')!,'color-total':heights.get('color-total')!,'product-total':heights.get('product-total')!},sizeWidth:(_size,index,key)=>sizes.get(key)![index]!,measuredRowHeight:row=>{
   if(!('product'in row))return heights.get(row.key);
   const meta=row.kind==='warehouse'?(row.firstInProduct||props.settings.fit&&row.firstInColorFit):row.kind==='product-total'?row.reason==='collapsed':row.reason==='collapsed'&&(row.firstInProduct||props.settings.fit);
   if(!meta)return heights.get(row.kind==='warehouse'?(row.firstInColorFit?'warehouse-fold':'warehouse'):row.kind==='color-total'&&row.reason==='collapsed'?'warehouse-fold':row.kind);
   const fit=row.kind!=='product-total'&&props.settings.fit?row.group.fit.label:undefined;
   return heights.get(metadataMeasureKey(productSections.get(row.product)!,row.product,props.settings,fit));
  }};
  setMeasured({data:props.data,settings:props.settings,layout,fixed,sections:columns,gap});
 },[props.data,props.settings,revision,sections,viewport?.width,props.windowing.element,props.windowing.scope.signal]);
 const scroll=useCallback((position:{scrollTop:number;scrollLeft:number})=>{const element=props.windowing.element.current;if(element&&!props.windowing.scope.signal.aborted){element.scrollTop=position.scrollTop;element.scrollLeft=position.scrollLeft;updateViewport();}},[props.windowing.element,props.windowing.scope.signal,updateViewport]);
 const invalid=useCallback(()=>{setMeasured(null);setRevision(value=>value+1);},[]);
 if(current&&viewport)return <WindowedInventoryMatrix {...props} windowing={{scope:props.windowing.scope,layout:current.layout,fixedWidths:current.fixed,sectionWidths:current.sections,continuity,sectionGap:current.gap,viewport:{...viewport,fixedLeadingWidth:current.fixed[0]+current.fixed[1]+current.fixed[2],fixedTrailingWidth:current.fixed[3]+current.fixed[4]},onScrollRequest:scroll,onInvalidGeometry:invalid}}/>;
 return <><div ref={probe} aria-hidden="true" inert data-inventory-measuring="" style={{position:'absolute',left:0,top:0,width:'100%',visibility:'hidden',pointerEvents:'none'}}>{sections.map(([key,products],sectionIndex)=>{const first=products[0]!;const probes=new Map<string,{product:InventoryProduct;fit?:InventoryColorFit['fit']}>();for(const product of products){const fits=props.settings.fit?[...new Map(product.colorFits.map(g=>[g.fit.id,g.fit])).values()]:[];for(const fit of [null,...fits]){const name=metadataMeasureKey(key,product,props.settings,fit?.label);if(!probes.has(name))probes.set(name,{product,...(fit?{fit}:{})});}}const metadata=[...probes].map(([name,{product,fit}])=><MatrixMeasureRow key={name} name={name} product={product} settings={props.settings} actions={props.actions} meta fold {...(fit?{fit:fit.label}:{})}/>);return <section key={key} className="mx-section" data-measure-section={key} style={{'--mx-table-width':`${714+first.sizes.length*76}px`} as CSSProperties}>{props.settings.sizeDescription&&<h3>{first.sizeGroup.label}<small>{first.sizes.map(size=>size.label).join(' / ')}</small></h3>}<table className="mx-table"><colgroup><col style={{width:300}}/><col style={{width:116}}/><col style={{width:152}}/>{first.sizes.map(size=><col key={size.id} style={{width:76}}/>)}<col style={{width:76}}/><col style={{width:70}}/></colgroup><thead><tr><th className="mx-product">款号／商品名称</th><th className="mx-color">颜色</th><th className="mx-warehouse">仓库</th>{first.sizes.map(size=><th className="mx-size" key={size.id}>{size.label}</th>)}<th className="mx-total-cell">合计</th><th className="ui-action-cell">操作</th></tr></thead><tbody>{sectionIndex===0&&<><MatrixMeasureRow name="warehouse" product={first} settings={props.settings} actions={props.actions}/><MatrixMeasureRow name="warehouse-fold" product={first} settings={props.settings} actions={props.actions} fold/><MatrixMeasureRow name="color-total" product={first} settings={props.settings} actions={props.actions} total="color"/><MatrixMeasureRow name="product-total" product={first} settings={props.settings} actions={props.actions} total="product"/></>}{metadata}</tbody></table></section>;})}</div><div className="iw-state" role="status" style={{height:continuity.current?.height??viewport?.height??1}}>正在整理库存…</div></>;
}

function WindowedInventoryMatrix(props: MatrixProps & { readonly windowing: InventoryMatrixWindowing }) {
  const { windowing } = props;
  const aborted = useSyncExternalStore(callback => {
    windowing.scope.signal.addEventListener('abort', callback);
    return () => windowing.scope.signal.removeEventListener('abort', callback);
  }, () => windowing.scope.signal.aborted, () => windowing.scope.signal.aborted);
  const prepared = useMemo(() => {
    try {
      // Identity/total widths are the existing frozen matrix CSS, not a new look.
      const fixed=windowing.fixedWidths??[300,116,152,76,70];
      if (Math.abs(windowing.viewport.fixedLeadingWidth-(fixed[0]+fixed[1]+fixed[2]))>1 || Math.abs(windowing.viewport.fixedTrailingWidth-(fixed[3]+fixed[4]))>1) throw new RangeError('Measured sticky widths do not match the existing matrix.');
      if (props.settings.sizeDescription !== (windowing.layout.heights['section-description'] > 0)) throw new RangeError('The optional section description needs its own current measurement.');
      const model = new InventoryWindowModel(props.data, { ...windowing.layout, hideFit:!props.settings.fit, subtotal: props.settings.subtotal, total: props.settings.total, collapsedProducts: props.collapsedProducts, collapsedColors: props.collapsedColors });
      if(!windowing.fixedWidths)for(const section of model.sections)for(let index=0;index<section.sizes.length;index++)if(model.column(section.index,index)!.width!==76)throw new RangeError('Measured size widths do not match the existing matrix.');
      return { model, error: null };
    } catch (error) { return { model: null, error: error instanceof Error ? error : new Error('Invalid matrix geometry.') }; }
  }, [props.data, props.settings.subtotal, props.settings.total, props.settings.sizeDescription, props.settings.category, props.settings.supplier, props.settings.fit, props.settings.sizeGroup, props.settings.season, props.collapsedProducts, props.collapsedColors, windowing.layout, windowing.viewport.fixedLeadingWidth, windowing.viewport.fixedTrailingWidth, windowing.fixedWidths,windowing.scope.signal]);
  const model = prepared.model;
  const localContinuity=useRef<WindowContinuity|null>(null),continuity=windowing.continuity??localContinuity;
  const [focus, setFocus] = useState<{ readonly data: InventoryPage; readonly signal: AbortSignal; readonly address: InventoryLogicalCell } | null>(()=>{const previous=continuity.current,active=document.activeElement;const owned=active===document.body||active instanceof HTMLElement&&active.dataset.stockAddress===JSON.stringify(previous?.focus);return owned&&previous?.model.data===props.data&&previous.signal===windowing.scope.signal&&previous.focus?{data:props.data,signal:previous.signal,address:previous.focus}:null;});
  const [failure, setFailure] = useState<{ readonly model: InventoryWindowModel; readonly error: Error } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLSpanElement>());
  const pending = useRef<{ readonly model: InventoryWindowModel; readonly address: InventoryLogicalCell; readonly scrollTop: number; readonly scrollLeft: number } | null>(null);
  const planResult = useMemo(() => {
    if (!model) return { plan: null, error: null };
    try { return { plan: createInventoryRenderPlan(model, windowing.viewport, windowing.sectionGap, focus?.data === props.data && focus.signal === windowing.scope.signal ? focus.address : null), error: null }; }
    catch (error) { return { plan: null, error: error instanceof Error ? error : new Error('Invalid matrix viewport.') }; }
  }, [model, windowing.viewport, windowing.sectionGap, focus, props.data, windowing.scope.signal]);
  const error = prepared.error ?? planResult.error ?? (failure?.model === model ? failure.error : null);
  useEffect(() => { if (error) windowing.onInvalidGeometry?.(error); }, [error, windowing.onInvalidGeometry]);
  useLayoutEffect(()=>{
    if(!model||error||aborted||!planResult.plan)return;
    const previous=continuity.current;
    continuity.current={model,viewport:windowing.viewport,gap:windowing.sectionGap,height:planResult.plan.height,signal:windowing.scope.signal,focus:focus?.data===props.data&&focus.signal===windowing.scope.signal?focus.address:null};
    if(previous&&previous.model!==model&&previous.model.data===props.data&&previous.signal===windowing.scope.signal){
      const anchor=previous.model.captureScrollAnchor(inventoryModelViewport(previous.model,previous.viewport,previous.gap));
      const restored=anchor?model.restoreScrollAnchor(anchor,inventoryModelViewport(model,windowing.viewport,windowing.sectionGap)):null;
      if(restored!==null){const scrollTop=inventoryDOMScrollTop(model,restored,windowing.sectionGap);if(Math.abs(scrollTop-windowing.viewport.scrollTop)>.5)windowing.onScrollRequest({scrollTop,scrollLeft:windowing.viewport.scrollLeft});}
    }
    if(focus&&document.activeElement===document.body)elements.current.get(JSON.stringify(focus.address))?.focus({preventScroll:true});
  },[model,planResult,error,aborted,focus,continuity,props.data,windowing.viewport,windowing.sectionGap,windowing.scope.signal,windowing.onScrollRequest]);
  useLayoutEffect(() => {
    const request = pending.current;
    if (!request || request.model !== model || aborted || error) { pending.current = null; return; }
    if (Math.abs(windowing.viewport.scrollTop - request.scrollTop) > 0.5 || Math.abs(windowing.viewport.scrollLeft - request.scrollLeft) > 0.5) return;
    elements.current.get(JSON.stringify(request.address))?.focus({ preventScroll: true });
    pending.current = null;
  }, [model, planResult, windowing.viewport, aborted, error]);
  useLayoutEffect(() => {
    if (!model || error || aborted || !host.current) return;
    const nodes = Array.from(host.current.querySelectorAll<HTMLElement>('[data-window-row-height],[data-window-column-width]'));
    const check = () => {
      for (const node of nodes) {
        const rectangle = node.getBoundingClientRect();
        const actual = node.dataset.windowColumnWidth ? rectangle.width : rectangle.height;
        const expected = Number(node.dataset.windowColumnWidth ?? node.dataset.windowRowHeight);
        // jsdom has no layout. Zero is not proof of a browser measurement.
        if (actual > 0 && Math.abs(actual - expected) > 1) {
          setFailure({ model, error: new Error('Mounted matrix content no longer matches supplied row measurements; retained eager rendering.') });
          return;
        }
      }
    };
    check();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
    nodes.forEach(node => observer?.observe(node));
    return () => observer?.disconnect();
  }, [model, planResult, error, aborted]);
  if (aborted || windowing.scope.signal.aborted) return null;
  if (!model || !planResult.plan || error) return windowing.fixedWidths?<div className="iw-state" role="status" style={{height:continuity.current?.height??windowing.viewport.height}}>正在整理库存…</div>:<EagerInventoryMatrix {...props} />;
  const plan = planResult.plan;
  const bindCell = (address: InventoryLogicalCell) => ({
    ref: (element: HTMLSpanElement | null) => { const key = JSON.stringify(address); if (element) elements.current.set(key, element); else elements.current.delete(key); },
    onFocus: () => {
      pending.current = null;
      setFocus(current => current?.data === props.data && current.signal === windowing.scope.signal && JSON.stringify(current.address) === JSON.stringify(address) ? current : { data: props.data, signal: windowing.scope.signal, address });
    },
    onKeyDown: (event: KeyboardEvent<HTMLSpanElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'row-start', End: 'row-end' } as const;
      const direction = directions[event.key as keyof typeof directions];
      if (!direction) return;
      const next = model.moveFocus(address, direction);
      if (!next) return;
      const location=model.resolveCell(next),section=location?model.sections[location.sectionIndex]:null,fixed=section?windowing.sectionWidths?.get(section.key):undefined;
      const targetViewport=fixed?{...windowing.viewport,fixedLeadingWidth:fixed[0]+fixed[1]+fixed[2],fixedTrailingWidth:fixed[3]+fixed[4]}:windowing.viewport;
      const scroll = model.scrollToCell(next, inventoryModelViewport(model, targetViewport, windowing.sectionGap));
      if (!scroll || scroll.kind !== 'visible') return;
      event.preventDefault();
      const position = { scrollTop: inventoryDOMScrollTop(model, scroll.scrollTop, windowing.sectionGap), scrollLeft: scroll.scrollLeft };
      pending.current = { model, address: next, ...position };
      setFocus({ data: props.data, signal: windowing.scope.signal, address: next });
      windowing.onScrollRequest(position);
    },
  });
  const projectedFocus=(sources:readonly InventoryKnownDisplaySource[]):InventoryLogicalCell|null=>{
    const address=focus?.data===props.data&&focus.signal===windowing.scope.signal?focus.address:null;
    const source=address?sources.find(source=>source.productId===address.productId&&source.color.id===address.colorId&&source.fit.id===address.fitId&&source.warehouse.id===address.warehouseId&&source.size.id===address.sizeId)??sources[0]:sources[0];
    return source?{productId:source.productId,colorId:source.color.id,fitId:source.fit.id,warehouseId:source.warehouse.id,sizeId:source.size.id}:null;
  };
  return <div ref={host} data-inventory-windowed={windowing.fixedWidths?'measured-default':'opt-in'} style={{ height: plan.height, position: 'relative', minWidth: '100%', width: '100%' }} onFocusCapture={event => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest('[data-stock-address]')) { pending.current = null; setFocus(null); }
  }} onBlurCapture={event => {
    if (!props.sourceChoiceOpen&&(!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))) { pending.current = null; setFocus(null); }
  }}>
    <p className="sr-only">当前矩阵按可见范围呈现。库存单元格可用方向键及 Home、End 导航；商品与颜色折叠按钮仍可使用 Tab 访问。</p>
    {plan.sections.map(entry => {
      const first = entry.section.products[0]!;
      const fixed=windowing.sectionWidths?.get(entry.section.key)??windowing.fixedWidths??[300,116,152,76,70];
      const tableWidth = fixed.reduce((sum,width)=>sum+width,0) + entry.section.sizeExtent;
      const rowWindow = (row: InventoryWindowRow): RowWindow => ({ columns: entry.columns, row, sectionStart: entry.section.headerRow, bindCell,projectedFocus });
      return <section key={entry.section.key} className="mx-section" data-size-system={first.sizeGroup.id} style={{ '--mx-table-width': `${tableWidth}px`, position: 'absolute', top: entry.top, margin: 0 } as CSSProperties} aria-label={`${first.sizeGroup.label}库存矩阵`}>
        {props.settings.sizeDescription && <h3 data-window-row-height={entry.section.headerTop - entry.section.top}>{first.sizeGroup.label}<small>{first.sizes.map(size => size.label).join(' / ')}</small></h3>}
        <table className="mx-table" aria-rowcount={entry.section.endRow - entry.section.headerRow} aria-colcount={first.sizes.length + 5}><caption className="sr-only">{first.sizeGroup.label}，商品、颜色、版型、仓库及尺码库存；— 表示不存在此规格，合法规格无库存显示 0。</caption>
          <colgroup><col style={{ width: fixed[0] }} /><col style={{ width: fixed[1] }} /><col style={{ width: fixed[2] }} />{entry.columns.map(part => part.kind === 'gap' ? <col key={`gap-${part.start}`} span={part.count} style={{ width: part.width / part.count }} /> : <col key={part.column.size.id} style={{ width: part.column.width }} />)}<col style={{ width: fixed[3] }} /><col style={{ width: fixed[4] }} /></colgroup>
          <thead><tr aria-rowindex={1} data-window-row-height={entry.section.headerHeight}><th scope="col" aria-colindex={1} className="mx-product" data-window-column-width={fixed[0]} style={{ top: windowing.viewport.stickyHeaderOffset }}>款号／商品名称</th><th scope="col" aria-colindex={2} className="mx-color" data-window-column-width={fixed[1]} style={{ top: windowing.viewport.stickyHeaderOffset }}>颜色</th><th scope="col" aria-colindex={3} className="mx-warehouse" data-window-column-width={fixed[2]} style={{ top: windowing.viewport.stickyHeaderOffset }}>仓库</th>{entry.columns.map(part => part.kind === 'gap' ? <th key={`gap-${part.start}`} colSpan={part.count} aria-hidden="true" style={{ width: part.width, minWidth: 0, padding: 0, border: 0, top: windowing.viewport.stickyHeaderOffset }} /> : <th scope="col" key={part.column.size.id} aria-colindex={part.column.index + 4} className="mx-size" data-size-id={part.column.size.id} data-window-column-width={part.column.width} style={{ top: windowing.viewport.stickyHeaderOffset }}>{part.column.size.label}</th>)}<th scope="col" aria-colindex={first.sizes.length + 4} className="mx-total-cell" data-window-column-width={fixed[3]} style={{ top: windowing.viewport.stickyHeaderOffset }}>合计</th><th scope="col" className="ui-action-cell" aria-colindex={first.sizes.length + 5} data-window-column-width={fixed[4]} style={{ top: windowing.viewport.stickyHeaderOffset }}>操作</th></tr></thead>
          <tbody>{entry.body.map(part => {
            if (part.kind === 'gap') return <tr key={`gap-${part.start}`} aria-hidden="true"><td colSpan={first.sizes.length + 5} style={{ height: part.height, minWidth: 0, padding: 0, border: 0 }} /></tr>;
            return <WindowRow key={part.row.key} {...props} row={part.row} window={rowWindow(part.row)} />;
          })}</tbody>
        </table>
      </section>;
    })}
  </div>;
}
function WindowRow(props: MatrixProps & { readonly row: InventoryWindowRow; readonly window: RowWindow }) {
  const { row } = props;
  if (!('product' in row)) return null;
  const productFold = <Fold expanded={!props.collapsedProducts.has(row.product.id)} label={`商品${row.product.code}`} toggle={() => props.toggleProduct(row.product.id)} />;
  const group='group'in row?(props.settings.fit?row.group:(props.projectColors??projectInventoryColors)(row.product).find(part=>part.color.id===row.group.color.id)!):null;
  if (row.kind === 'warehouse') {
    const colorFold = <Fold expanded label={`${row.product.code}${group!.color.label}${group!.fit?.label??''}`} toggle={() => props.toggleColor(row.groupKey)} />;
    return <WarehouseRow {...props} product={row.product} group={group!} row={group!.rows.find(part=>part.warehouse.id===row.source.warehouse.id)!} first={row.firstInProduct} firstInGroup={row.firstInColorFit} productFold={productFold} colorFold={colorFold} />;
  }
  if (row.kind === 'product-total') return row.reason === 'collapsed'
    ? <TotalRow {...props} product={row.product} kind="product" folded first identity color={<Indent control={productFold}>所有颜色</Indent>} warehouse={<Indent control={spacer}>所有库存</Indent>} totals={row.product.sizeTotals} total={row.product.total} />
    : <TotalRow {...props} product={row.product} kind="product" label="商品合计" totals={row.product.sizeTotals} total={row.product.total} />;
  const colorFold = <Fold expanded={false} label={`${row.product.code}${group!.color.label}${group!.fit?.label??''}`} toggle={() => props.toggleColor(row.groupKey)} />;
  return row.reason === 'collapsed'
    ? <TotalRow {...props} product={row.product} kind="color" folded first={row.firstInProduct} identity {...(group!.fit?{fit:group!.fit.label}:{})} color={<Indent control={row.firstInProduct ? productFold : spacer}>{group!.color.label}</Indent>} warehouse={<Indent control={colorFold}>所有库存</Indent>} totals={group!.sizeTotals} total={group!.total} />
    : <TotalRow {...props} product={row.product} kind="color" label="颜色小计" totals={group!.sizeTotals} total={group!.total} />;
}
