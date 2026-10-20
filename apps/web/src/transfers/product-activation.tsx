import { useEffect, useMemo, useState } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { ProductDrawerHost } from '../inventory/product-drawer-host.tsx';
import type { TransferProductCapability } from './contracts.ts';
import { useTransferOwnedScope } from './owned-scope.ts';
import { guardedTransferRead } from './model.ts';

/** Style-only activation gate. All product data/tab/image lifecycle remains in
 * the shared drawer. No drawer frame or business read mounts before usable CSS. */
export function TransferProductActivation(props: { readonly parent: ReadScope; readonly accessScope: ReadScope; readonly product: { readonly id: string; readonly label: string };
  readonly capability: TransferProductCapability; readonly close: () => void }) {
  const scope = useTransferOwnedScope(props.parent, 'transfer-product-style', props.product.id);
  const [state, setState] = useState<{ scope: ReadScope; capability: TransferProductCapability; phase: 'ready' | 'error' } | null>(null); const [attempt, setAttempt] = useState(0);
  const reader = useMemo(() => ({
    readProductBasics: ((read) => guardedTransferRead(props.accessScope, () => props.capability.reader.readProductBasics(read))) as TransferProductCapability['reader']['readProductBasics'],
    readProductSpecifications: ((read) => guardedTransferRead(props.accessScope, () => props.capability.reader.readProductSpecifications(read))) as TransferProductCapability['reader']['readProductSpecifications'],
    readProductImages: ((read) => guardedTransferRead(props.accessScope, () => props.capability.reader.readProductImages(read))) as TransferProductCapability['reader']['readProductImages'],
    readProductImage: ((read) => guardedTransferRead(props.accessScope, () => props.capability.reader.readProductImage(read))) as TransferProductCapability['reader']['readProductImage'],
  }), [props.accessScope, props.capability]);
  useEffect(() => {
    if (!scope) return; let attached = true;
    void Promise.resolve().then(async () => { if (attached && scope.active) await props.capability.loadStyles(); }).then(() => { if (attached && scope.active) setState({ scope, capability: props.capability, phase: 'ready' }); }, () => { if (attached && scope.active) setState({ scope, capability: props.capability, phase: 'error' }); });
    return () => { attached = false; };
  }, [scope, props.capability, attempt]);
  const close = () => { scope?.dispose(); props.close(); };
  if (!props.parent.active) return null;
  if (scope && state?.scope === scope && state.capability === props.capability && state.phase === 'ready') return <ProductDrawerHost parentScope={scope} product={props.product} reader={reader} loadStyles={props.capability.loadStyles} close={close} />;
  const failed = state?.scope === scope && state.capability === props.capability && state.phase === 'error';
  return <section className="transfer-product-preparing" aria-label="商品查看准备"><p role={failed ? 'alert' : 'status'}>{failed ? <>商品查看样式加载失败。<button type="button" className="iw-link" onClick={() => { setState(null); setAttempt(value => value + 1); }}>重试商品样式</button></> : '正在准备商品资料…'}</p><button type="button" className="iw-text-button" onClick={close}>取消商品查看</button></section>;
}
