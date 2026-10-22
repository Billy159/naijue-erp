import { SalesStatusTag } from './sales-status-tag.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import { useLayoutEffect, useRef } from 'react';
import type { SalesHeaderDto } from './contracts.ts';
import { SalesHistoryAction, type SalesHistoryCapability } from './history-view.tsx';

/** The frozen document has one flat title/status/save-state/action row. Reused
 * during code/style/query waits, so 返回列表 is never gated by a business read. */
export function SalesDetailHeader({ close, status, history, salesId }: { readonly close: () => void; readonly status?: SalesHeaderDto['status']; readonly history?: SalesHistoryCapability; readonly salesId?: string }) {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    // Readiness may replace the lightweight frame. Restore its lost focus, but
    // do not steal focus if the user has moved to the surrounding app shell.
    if (document.activeElement === document.body || document.activeElement?.closest('.sales-detail-loading, [data-document-list="sales"][hidden]')) back.current?.focus({ preventScroll: true });
  }, []);
  return <div className="tc-head sale-head sales-document-state"><h1>查看销货单</h1>
    {status && <><SalesStatusTag status={status} /><span className="sale-muted">· 已保存 · 只读</span></>}
    <div className="actions"><UIButton ref={back} type="button" className="iw-text-button" onClick={close}>返回列表</UIButton>{['导出', '打印'].map(label => <UIButton key={label} type="button" className="iw-text-button" disabled title={`${label}尚未接入`}>{label}</UIButton>)}<SalesHistoryAction {...(history ? { capability: history } : {})} {...(salesId ? { salesId } : {})} /></div>
  </div>;
}
