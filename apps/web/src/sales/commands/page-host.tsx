import { SalesManualCreateHost } from './manual-create-host.tsx';
import type { SalesManualCreateCapability } from './contracts.ts';
import { createElement, useEffect, useState, useSyncExternalStore, type ComponentType } from 'react';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { SalesReader, SalesReferenceReader } from '../contracts.ts';
import { SalesPageHost } from '../sales-route.tsx';
import type { SalesEditorSession } from './editor-session.ts';
type SalesFormComponent = ComponentType<{ readonly session: SalesEditorSession; readonly close: () => void }>;

export function SalesCommandPageHost(props: { readonly scope: ReadScope; readonly reader: SalesReader; readonly references: SalesReferenceReader;
  readonly session: SalesEditorSession; readonly manualCreate?: SalesManualCreateCapability; readonly loadDetailStyles: () => Promise<unknown> }) {
  const state = useSyncExternalStore(props.session.subscribe, props.session.getSnapshot, props.session.getSnapshot);
  const [styleState, setStyles] = useState<{ readonly scope: ReadScope; readonly session: SalesEditorSession; readonly loader: () => Promise<unknown>; readonly phase: 'idle' | 'loading' | 'ready' | 'error'; readonly Form: SalesFormComponent | null }>(() => ({ scope: props.scope, session: props.session, loader: props.loadDetailStyles, phase: 'idle', Form: null }));
  const styles = styleState.scope === props.scope && styleState.session === props.session && styleState.loader === props.loadDetailStyles ? styleState.phase : 'idle';
  const [retry, setRetry] = useState(0), [discard, setDiscard] = useState(false);
  const [manualActive, setManualActive] = useState(false);
  const active = manualActive || !!state.command.editor || state.preparing;
  useEffect(() => {
    if (!active || manualActive || styles === 'ready') return;
    let attached = true; const owner = { scope: props.scope, session: props.session, loader: props.loadDetailStyles }; setStyles({ ...owner, phase: 'loading', Form: null });
    void Promise.all([props.loadDetailStyles(), import('./form.tsx')]).then(([, module]) => { if (attached && props.scope.active) setStyles({ ...owner, phase: 'ready', Form: module.SalesCommandForm }); }, () => { if (attached && props.scope.active) setStyles({ ...owner, phase: 'error', Form: null }); });
    return () => { attached = false; };
  }, [active, manualActive, props.loadDetailStyles, props.scope, props.session, retry]);
  useEffect(() => { setDiscard(false); }, [props.scope, props.session]);
  useEffect(() => () => props.session.suspend(), [props.session]);
  return <><SalesPageHost scope={props.scope} reader={props.reader} references={props.references} loadDetailStyles={props.loadDetailStyles} write={{
    active, canCreate: props.session.canCreate || !!props.manualCreate, preparing: state.preparing, commitRevision: state.commitRevision,
    openCreate: () => { if (props.manualCreate && props.manualCreate.canLeave() && props.session.canLeave()) setManualActive(true); else if (!props.manualCreate) void props.session.openCreate(); }, openExisting: salesId => { void props.session.openExisting(salesId); },
    editor: manualActive && props.manualCreate ? <SalesManualCreateHost parentScope={props.scope} capability={props.manualCreate} loadStyles={props.loadDetailStyles} close={() => setManualActive(false)} /> : styles === 'ready' && styleState.Form ? createElement(styleState.Form, { session: props.session, close: () => {} }) : <section className="tc-workbench" aria-label="销货单编辑"><h1>销货单</h1>
      <button type="button" className="iw-button" disabled={props.session.commands.hasUnresolvedWrite} onClick={() => {
        if (state.preparing) { props.session.suspend(); return; }
        if (props.session.hasDirtyDraft) setDiscard(true); else props.session.discardEditor();
      }}>返回列表</button>
      {discard && <p role="alert">离开将放弃未保存输入，已保存单据不变。<button type="button" className="iw-button" onClick={() => setDiscard(false)}>继续录单</button><button type="button" className="iw-button" onClick={() => { if (props.session.discardEditor(true)) setDiscard(false); }}>放弃修改并返回</button></p>}
      {styles === 'error' ? <p role="alert">单据样式未准备完成，或编辑器加载失败，尚未开放录入。<button type="button" className="iw-link" onClick={() => setRetry(value => value + 1)}>重试</button></p> : <p role="status">正在准备单据…</p>}</section>,
  }} />{!active && (state.notice || state.command.notice) && <p className="iw-alert" role="alert">{state.notice ?? state.command.notice}</p>}</>;
}
