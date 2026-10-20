import { useLayoutEffect, useRef } from 'react';
import type { SalesHeaderDto } from './contracts.ts';
import { salesStatusLabels } from './model.ts';

/** The frozen document has one flat title/status/save-state/action row. Reused
 * during code/style/query waits, so 返回列表 is never gated by a business read. */
export function SalesDetailHeader({ close, status }: { readonly close: () => void; readonly status?: SalesHeaderDto['status'] }) {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    // Readiness may replace the lightweight frame. Restore its lost focus, but
    // do not steal focus if the user has moved to the surrounding app shell.
    if (document.activeElement === document.body || document.activeElement?.closest('.sales-detail-loading, [data-document-list="sales"][hidden]')) back.current?.focus({ preventScroll: true });
  }, []);
  return <div className="tc-head sale-head sales-document-state"><h1>查看销货单</h1>
    {status && <><span className="tc-status" data-document-status={status === 'APPROVED' ? 'effective' : status === 'VOID' ? 'void' : 'pending'}>{salesStatusLabels[status]}</span><span className="sale-muted">· 已保存 · 只读</span></>}
    <div className="actions"><button ref={back} type="button" className="iw-text-button" onClick={close}>返回列表</button>{['导出', '打印', '操作历史'].map(label => <button key={label} type="button" className="iw-text-button" disabled title={`${label}尚未接入`}>{label}</button>)}</div>
  </div>;
}
