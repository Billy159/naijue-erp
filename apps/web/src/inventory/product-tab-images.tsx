import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import type { ProductImage, ProductImageParameters, ProductImageSummary } from './product-contracts.ts';
import type { ProductDrawerContentProps } from './product-drawer.tsx';
import { assertProductImage, assertProductImages } from './product-model.ts';
import { ProductReadState, useProductRead } from './product-tab-state.tsx';
export function ProductTab({ scope, reader }: ProductDrawerContentProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.readProductImages(value), assertProductImages);
  const data = snapshot.success?.data;
  const [image, setImage] = useState<ProductImageSummary | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data && <>
    {data.images.length ? <><p className="pd-hint">点击图片查看大图</p><div className="pd-images">{data.images.map(item => <Thumbnail key={item.id} image={item} open={button => { trigger.current = button; setImage(item); }} />)}</div></> : <p className="iw-inline-state">暂无图片</p>}
    {image && <ImagePreview key={image.id} scope={scope} reader={reader} image={image} close={() => { setImage(null); trigger.current?.focus(); }} />}
  </>}</ProductReadState>;
}
function Thumbnail({ image, open }: { readonly image: ProductImageSummary; readonly open: (button: HTMLButtonElement) => void }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <figure><button type="button" className="pd-thumbnail" aria-label={`预览 ${image.label}`} onClick={event => open(event.currentTarget)}>{failed ? <span>缩略图暂不可用，仍可预览</span> : <img key={attempt} src={image.thumbnailUrl} alt={image.label} loading="lazy" decoding="async" onError={() => setFailed(true)} />}</button><figcaption>{image.label}</figcaption>{failed && <button type="button" className="iw-link" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重试缩略图</button>}</figure>;
}
function ImagePreview(props: ProductDrawerContentProps & { readonly image: ProductImageSummary; readonly close: () => void }) {
  const [scope] = useState(() => new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:image:${props.image.id}`, props.scope.entityId, () => {}));
  const [query] = useState(() => new LatestQuery<ProductImageParameters, ProductImage>({ scope, execute: async read => {
    const data = await props.reader.readProductImage(read); assertProductImage(data, read.parameters); return data;
  } }));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [decodeError, setDecodeError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const read = () => { setDecodeError(false); if (scope.entityId) void query.run({ productId: scope.entityId, imageId: props.image.id }); };
  useEffect(() => {
    const dispose = () => scope.dispose();
    props.scope.signal.addEventListener('abort', dispose, { once: true });
    if (!props.scope.active) dispose();
    if (typeof dialog.current?.showModal === 'function') dialog.current.showModal(); else dialog.current?.setAttribute('open', '');
    closeButton.current?.focus(); read();
    return () => { props.scope.signal.removeEventListener('abort', dispose); query.dispose(); scope.dispose(); };
  }, [props.scope, scope, query]);
  return <dialog ref={dialog} className="pd-image-preview" aria-modal="true" onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) props.close(); } }} aria-label={`图片预览 ${props.image.label}`} onCancel={event => { event.preventDefault(); event.stopPropagation(); props.close(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.close(); }
    if (event.key === 'Tab') { event.stopPropagation(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')); const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><header><strong>{props.image.label}</strong><button ref={closeButton} type="button" className="iw-text-button" aria-label="关闭图片预览" onClick={props.close}>×</button></header>
    {snapshot.phase === 'loading' ? <p role="status">正在读取大图…</p> : snapshot.phase === 'error' || decodeError ? <p role="alert">大图暂不可读取。<button type="button" className="iw-link" onClick={read}>重试大图</button></p> : snapshot.success && <img src={snapshot.success.data.url} alt={props.image.label} onError={() => setDecodeError(true)} />}
  </dialog>;
}
