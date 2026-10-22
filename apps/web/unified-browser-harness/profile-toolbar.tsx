import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { UISelect, UIButton } from '../src/components/standard-controls.tsx';
import { reviewProfile, type UnifiedReviewProfile } from './review-profile.ts';
import type { UnifiedProfileSession } from './profile-host.ts';
import './profile-toolbar.css';

const labels: Readonly<Record<UnifiedReviewProfile, string>> = { standard: '标准合成交易模式', 'transfer-readonly': '合成只读调拨模式' };
function ReviewProfileToolbar({ session, changed }: { readonly session: UnifiedProfileSession; readonly changed: (profile: UnifiedReviewProfile) => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [selected, setSelected] = useState<UnifiedReviewProfile>(state.profile), attached = useRef(false);
  const host = useRef<HTMLDivElement>(null), applyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { attached.current = true; return () => { attached.current = false; }; }, []);
  const busy = ['entering', 'switching', 'revoking'].includes(state.phase), disabled = busy || state.phase === 'disposed';
  const apply = async () => {
    const target = selected, initiatingControl = applyButton.current, restore = document.activeElement === initiatingControl;
    const ok = await session.switchProfile(target), latest = session.getSnapshot();
    if (ok && attached.current && latest.phase === 'ready' && latest.notice === 'changed' && latest.profile === target) {
      changed(target);
      requestAnimationFrame(() => {
        const now = session.getSnapshot();
        if (restore && attached.current && now.phase === 'ready' && now.notice === 'changed' && now.profile === target && (document.activeElement === initiatingControl || document.activeElement === document.body)) host.current?.querySelector<HTMLElement>('.arco-select')?.focus({ preventScroll: true });
      });
    }
  };
  return <div ref={host} className="unified-review-profile" role="group" aria-label="合成验收配置工具栏">
    <UISelect aria-label="合成验收配置" value={selected} disabled={disabled} onChange={value => setSelected(reviewProfile(value))} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} />
    <UIButton ref={applyButton} type="button" disabled={disabled || selected === state.profile} onClick={() => { void apply(); }}>切换并结束旧合成会话</UIButton>
    <p>当前：{labels[state.profile]}。这是合成验收配置，不代表真实角色权限。切换后需重新点击进入；旧内存单据不会带入新配置。</p>
    <p role="status">{state.notice === 'cannot-leave' ? '未切换：请处理未保存内容或核实原操作回执。' : state.notice === 'changed' ? '旧合成会话已结束，请重新进入。' : state.notice === 'revoked' ? '合成身份已清除，配置保持不变。' : state.notice === 'failed' ? '操作未完成，请检查当前页面状态。' : busy ? '正在处理合成会话…' : '切换会使用当前页面的脏稿及原操作保护。'}</p>
    <small>根数量：最多一个业务 Application 根，另有一个本验收工具栏 React 根；同一页面 URL，无 iframe。</small>
  </div>;
}
/** One independent tools root, in addition to exactly one business root. */
export function mountReviewProfileToolbar(container: HTMLElement, session: UnifiedProfileSession, changed: (profile: UnifiedReviewProfile) => void) {
  const root = createRoot(container); let disposed = false;
  root.render(<StrictMode><ReviewProfileToolbar session={session} changed={changed} /></StrictMode>);
  return () => { if (!disposed) { disposed = true; root.unmount(); } };
}
