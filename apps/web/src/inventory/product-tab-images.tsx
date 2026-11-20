import { Dropdown, Image, Menu, Upload } from '@arco-design/web-react';
import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LatestQuery, type QuerySnapshot } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { ProductImage, ProductImageParameters, ProductImageSummary, ProductImages } from './product-contracts.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
interface ImageTabProps { readonly fullPage?:boolean;readonly scope: ReadScope; readonly reader: Pick<ProductReadOnlyReader, 'readProductImages' | 'readProductImage'> & Partial<Pick<ProductReadOnlyReader,'readProductSpecifications'>> }
import { assertProductImage, assertProductImages, assertProductSpecifications } from './product-model.ts';
import { useProductPanelActive, ProductReadState, useProductRead } from './product-tab-state.tsx';
export function ProductTab({scope,reader,fullPage=false}:ImageTabProps){
 const {snapshot,read,cancel,cancelled}=useProductRead(scope,value=>reader.readProductImages(value),assertProductImages),data=snapshot.success?.data;
 return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data&&(reader.readProductSpecifications?<ReadonlyPhotosWithColors scope={scope} reader={reader} data={data} fullPage={fullPage} readSpecifications={reader.readProductSpecifications}/>:<ReadonlyPhotos scope={scope} reader={reader} data={data} fullPage={fullPage} colors={[]} colorsKnown={false}/>)}</ProductReadState>;
}
function ReadonlyPhotosWithColors(p:ImageTabProps&{readonly data:NonNullable<ProductImages>;readonly readSpecifications:ProductReadOnlyReader['readProductSpecifications']}){
 const specs=useProductRead(p.scope,read=>p.readSpecifications(read),assertProductSpecifications),data=specs.snapshot.phase==='success'?specs.snapshot.success?.data:null;
 return <ReadonlyPhotos {...p} colors={(data?.colors??[]).map(color=>({id:color.id,name:color.label}))} colorsKnown={!!data} beforeColors={specs.snapshot.phase!=='success'?<ProductReadState phase={specs.snapshot.phase} retry={specs.read} cancel={specs.cancel} cancelled={specs.cancelled} empty={!data}>{null}</ProductReadState>:null}/>;
}
const photoRoles={MAIN:'主图',WHITE_BACKGROUND:'白底图',HANG_TAG:'吊牌图',DETAIL:'详情图',COLOR:'颜色配图'} as const;
function ReadonlyPhotos(p:ImageTabProps&{readonly data:ProductImages;readonly colors:readonly {readonly id:string;readonly name:string}[];readonly colorsKnown:boolean;readonly beforeColors?:ReactNode}){
 return <ProductPhotosSource items={p.data.images.map(image=>({key:image.id,name:image.label,role:image.role?photoRoles[image.role]:null,colorId:image.colorId??null,thumbnailUrl:image.thumbnailUrl,draft:false}))} colors={p.colors} colorsKnown={p.colorsKnown} beforeColors={p.beforeColors} readOnly inDrawer={!p.fullPage} disabled preview={(item,close)=>{const image=p.data.images.find(row=>row.id===item.key);return image?<ImagePreview key={image.id} scope={p.scope} reader={p.reader} image={image} close={close}/>:null;}}/>;
}

const idleImageSnapshot: QuerySnapshot<ProductImageParameters, ProductImage> = Object.freeze({ phase: 'idle', request: null, success: null, error: null });
const emptyImageSnapshot = () => idleImageSnapshot;
const noImageSubscription = () => () => {};
function ImagePreview(props: ImageTabProps & { readonly image: ProductImageSummary; readonly close: () => void }) {
  const attachmentId = useRef(0);
  type Attachment = { readonly parentScope: ReadScope; readonly imageId: string; readonly scope: ReadScope; readonly query: LatestQuery<ProductImageParameters, ProductImage>; pending: boolean };
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const activeAttachment = useRef<Attachment | null>(null);
  const current = attachment?.parentScope === props.scope && attachment.imageId === props.image.id && attachment.scope.active ? attachment : null;
  const query = current?.query;
  const snapshot = useSyncExternalStore(query?.subscribe ?? noImageSubscription, query?.getSnapshot ?? emptyImageSnapshot, query?.getSnapshot ?? emptyImageSnapshot);
  const [decodeError, setDecodeError] = useState(false);
  const read = () => { setDecodeError(false); const value = activeAttachment.current; if (value?.parentScope === props.scope && value.imageId === props.image.id && value.scope.active && value.scope.entityId) { value.pending = false; void value.query.run({ productId: value.scope.entityId, imageId: value.imageId }); } };
  useEffect(() => {
    const scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:image:${props.image.id}:${++attachmentId.current}`, props.scope.entityId, () => {});
    const query = new LatestQuery<ProductImageParameters, ProductImage>({ scope, execute: async read => {
      const data = await props.reader.readProductImage(read); assertProductImage(data, read.parameters); return data;
    } });
    const next = { parentScope: props.scope, imageId: props.image.id, scope, query, pending: true };
    const parameters = scope.entityId ? Object.freeze({ productId: scope.entityId, imageId: props.image.id }) : null;
    const dispose = () => { next.pending = false; if (activeAttachment.current === next) activeAttachment.current = null; query.dispose(); scope.dispose(); setAttachment(value => value === next ? null : value); };
    props.scope.signal.addEventListener('abort', dispose, { once: true });
    if (props.scope.active) {
      activeAttachment.current = next; setAttachment(next); setDecodeError(false);
      queueMicrotask(() => {
        if (activeAttachment.current === next && next.pending && scope.active && parameters) { next.pending = false; void query.run(parameters); }
      });
    } else dispose();
    return () => { props.scope.signal.removeEventListener('abort', dispose); next.pending = false; if (activeAttachment.current === next) activeAttachment.current = null; query.dispose(); scope.dispose(); };
  }, [props.scope, props.image.id]);
  return <ProductPhotoSourcePreview src={snapshot.phase==='success'?snapshot.success?.data.url??'':''} label={props.image.label} close={props.close} extra={snapshot.phase==='loading'?<p role="status">正在读取大图…</p>:snapshot.phase==='error'||decodeError?<p role="alert">大图暂不可读取。<UIButton onClick={read}>重试大图</UIButton></p>:null} onError={()=>setDecodeError(true)}/>;
}

export interface ProductPhotoSourceItem {readonly key:string;readonly name:string;readonly role:string|null;readonly colorId:string|null;readonly thumbnailUrl:string|null;readonly draft:boolean}
interface ProductPhotosSourceProps {
 readonly items:readonly ProductPhotoSourceItem[];readonly colors:readonly {readonly id:string;readonly name:string}[];readonly colorsKnown?:boolean;
 readonly readOnly:boolean;readonly inDrawer?:boolean;readonly disabled:boolean;
 readonly upload?:((files:File[],role:string,colorId:string|null,replace:ProductPhotoSourceItem|null)=>void)|undefined;
 readonly remove?:((item:ProductPhotoSourceItem)=>void)|undefined;
 readonly status?:((item:ProductPhotoSourceItem)=>ReactNode)|undefined;
 readonly beforeColors?:ReactNode;
 readonly preview:(item:ProductPhotoSourceItem,close:()=>void)=>ReactNode;
}
/** Full frozen product-arco.jsx ProductPhotos UI, reused by all three actual
 * image consumers. Only scoped ports/native facts and draft-only status differ. */
export function ProductPhotosSource(p:ProductPhotosSourceProps){
 const active=useProductPanelActive(),[preview,setPreview]=useState<ProductPhotoSourceItem|null>(null),opener=useRef<HTMLElement|null>(null);
 const close=()=>{setPreview(null);const target=opener.current;requestAnimationFrame(()=>{const focus=document.activeElement;if(target?.isConnected&&!target.closest('[hidden],[inert]')&&(!focus||focus===document.body||!focus.isConnected))target.focus({preventScroll:true});});};
 useEffect(()=>{if(!active)setPreview(null);},[active]);
 useEffect(()=>{if(preview&&!p.items.some(item=>item.key===preview.key))setPreview(null);},[p.items,preview]);
 const upload=(role:string,colorId:string|null=null,replace:ProductPhotoSourceItem|null=null,caption='+ 添加')=><Upload className="pc-arco-upload" listType={replace?'text':'picture-card'} showUploadList={false} accept="image/png,image/jpeg,image/webp" multiple={!replace&&role!=='颜色配图'} disabled={p.disabled||!p.upload} beforeUpload={(file,files)=>{if(!files?.length||files[0]===file)p.upload?.(files?.length?files:[file],role,colorId,replace);return false;}}><span>{caption}</span></Upload>;
 const tile=(item:ProductPhotoSourceItem)=>{const content=<SourcePhotoTile key={item.key} item={item} readOnly={p.readOnly} disabled={p.disabled} upload={caption=>upload(item.role??'未分类',item.colorId,item,caption)} remove={p.remove?()=>p.remove!(item):undefined} open={button=>{opener.current=button;setPreview(item);}}/>;return item.draft?<div key={item.key} className="product-draft-photo">{content}{p.status?.(item)}</div>:content;};
 const remainingColorImages=p.items.filter(item=>item.role==='颜色配图'&&!p.colors.some(color=>p.items.find(row=>row.role==='颜色配图'&&row.colorId===color.id)?.key===item.key));
 const regular=(role:string)=><section className="pc-photo-section product-photo-section" key={role} aria-label={role}><h3>{role}</h3><div className="pc-arco-photo-row">{p.items.filter(item=>item.role===role).map(tile)}{!p.readOnly&&upload(role)}{p.inDrawer&&!p.items.some(item=>item.role===role)&&<span className="hint">暂无图片</span>}</div></section>;
 return <div className="pc-arco-photos product-source-photos" onKeyDownCapture={event=>{if(preview&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}}><p className="hint">{p.inDrawer?'点击图片查看大图':'支持 PNG、JPEG、WebP，单张不超过 8 MB；图片随商品保存。'}</p>{['主图','白底图','吊牌图','详情图'].map(regular)}{p.beforeColors}<section className="pc-photo-section pc-color-matrix" aria-label="颜色图"><h3>颜色图</h3><div className="pc-color-photo-grid pc-arco-photo-row">{p.colors.map(color=>{const image=p.items.find(item=>item.role==='颜色配图'&&item.colorId===color.id);return <div key={color.id}><div className="pc-color-photo-cell"><div className="pc-color-photo-name" title={color.name}>{color.name}</div>{image?tile(image):!p.readOnly?upload('颜色配图',color.id):<div className="pc-color-photo-empty">{p.inDrawer?'暂无图片':''}</div>}</div></div>;})}</div>{!p.colors.length&&<p className="hint">{p.colorsKnown===false?'当前颜色资料未提供':p.inDrawer?'暂无当前颜色':'先在规格页选择当前颜色。'}</p>}</section>{remainingColorImages.length>0&&<section className="pc-photo-section" aria-label="其他颜色配图"><h3>其他颜色配图</h3><div className="pc-arco-photo-row">{remainingColorImages.map(tile)}</div></section>}{p.items.some(item=>item.role===null)&&<section className="pc-photo-section" aria-label="图片分类未提供"><h3>图片分类未提供</h3><div className="pc-arco-photo-row">{p.items.filter(item=>item.role===null).map(tile)}</div></section>}{active&&preview&&p.preview(preview,close)}</div>;
}
function SourcePhotoTile(p:{readonly item:ProductPhotoSourceItem;readonly readOnly:boolean;readonly disabled:boolean;readonly upload:(caption:string)=>ReactNode;readonly remove:(()=>void)|undefined;readonly open:(button:HTMLButtonElement)=>void}){
 const active=useProductPanelActive(),host=useRef<HTMLDivElement>(null),[more,setMore]=useState(false);useEffect(()=>{if(!active)setMore(false);},[active]);
 return <div ref={host} className="pc-arco-photo"><button type="button" className="pc-arco-photo-preview" onClick={event=>p.open(event.currentTarget)} aria-label={`预览 ${p.item.name}`}>{p.item.thumbnailUrl?<Image src={p.item.thumbnailUrl} alt={p.item.name} preview={false} width="100%" height="100%" lazyload loading="lazy" decoding="async"/>:<span>缩略图不可用</span>}</button>{!p.readOnly&&<Dropdown trigger="click" position="br" unmountOnExit={false} popupVisible={active&&more} onVisibleChange={setMore} getPopupContainer={()=>host.current??document.body} droplist={<Menu className="pc-photo-menu"><Menu.Item key="replace">{p.upload('替换')}</Menu.Item><Menu.Item key="delete" disabled={p.disabled||!p.remove} {...(p.remove?{onClick:p.remove}:{})}>删除</Menu.Item></Menu>}><button type="button" className="pc-photo-more" aria-label={`图片操作 ${p.item.name}`}>···</button></Dropdown>}</div>;
}
/** Original native Image.Preview. Parent source renderer owns Escape/focus, and
 * this route-owned portal also keeps Drawer focus containment correct. */
export function ProductPhotoSourcePreview(p:{readonly src:string;readonly label:string;readonly close:()=>void;readonly extra?:ReactNode;readonly onError?:()=>void}){
 const host=useRef<HTMLDivElement>(null);return <div ref={host}><Image.Preview src={p.src} visible onVisibleChange={visible=>{if(!visible)p.close();}} getPopupContainer={()=>host.current??document.body} imgAttributes={{alt:p.label,...(p.onError?{onError:p.onError}:{})}} {...(p.extra?{extra:p.extra}:{})}/></div>;
}
