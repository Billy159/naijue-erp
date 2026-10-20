import { useEffect, useRef, useState } from 'react';
import '../demo-presentation/controls.css';
import './parties.css';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { partyLabels, type PartyCandidate, type PartyClient, type PartyClientError, type PartyKind } from './contracts.ts';
import { validateKind } from './response-validation.ts';

export interface PartyCandidateSelectorProps {
  readonly kind: PartyKind; readonly scope: ReadScope; readonly client: PartyClient;
  readonly value: PartyCandidate | null; readonly onChange: (value: PartyCandidate | null) => void;
  readonly onAccessFailure: (error: PartyClientError) => void;
}
const options = new AsyncLeafRegistry({ popup: { load: () => import('./party-candidate-options.tsx') } }, { maxRetainedEntries: 1 });
/** Explicit CUSTOMER or SUPPLIER only. Opening loads code/one enabled-only page;
 * no global catalog, guessed candidate URL, or maintenance privilege is required. */
export function PartyCandidateSelector(props: PartyCandidateSelectorProps) {
  validateKind(props.kind);
  const [open, setOpen] = useState(false); const [active, setActive] = useState(props.scope.active);
  const trigger = useRef<HTMLButtonElement>(null); const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = () => { setOpen(false); setActive(false); };
    props.scope.signal.addEventListener('abort', abort, { once: true }); setActive(props.scope.active); if (!props.scope.active) abort();
    return () => props.scope.signal.removeEventListener('abort', abort);
  }, [props.scope]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const label = partyLabels[props.kind]; const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="iw-field party-candidate" ref={wrapper}><label>{label}</label><button type="button" className="iw-control" ref={trigger} aria-label={`选择${label}`} aria-haspopup="dialog" aria-expanded={open} disabled={!active || !props.scope.active} onClick={() => setOpen(value => !value)}><span>{active && props.scope.active ? props.value?.name ?? `请选择${label}` : '身份已失效'}</span><span aria-hidden="true">⌄</span></button>
    {open && active && props.scope.active && <CandidateLeaf {...props} close={close} />}</div>;
}
function CandidateLeaf(props: PartyCandidateSelectorProps & { readonly close: () => void }) {
  const [module, setModule] = useState<Awaited<ReturnType<typeof options.load<'popup'>>> | null>(null); const [failed, setFailed] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let attached = true; setFailed(false);
    void options.load('popup', props.scope).then(value => { if (attached && props.scope.active) setModule(value); }, () => { if (attached && props.scope.active) setFailed(true); });
    return () => { attached = false; };
  }, [props.scope, retry]);
  if (!props.scope.active) return null;
  return module ? <module.PartyCandidateOptions {...props} /> : <div className="iw-popover" role="dialog" aria-label={`选择${partyLabels[props.kind]}候选`}><p className="iw-inline-state" role={failed ? 'alert' : 'status'}>{failed ? '候选控件暂不可加载。' : '正在准备候选控件…'}</p><button type="button" className="iw-button" onClick={props.close}>关闭</button>{failed && <button type="button" className="iw-button" onClick={() => setRetry(value => value + 1)}>重试控件</button>}</div>;
}
