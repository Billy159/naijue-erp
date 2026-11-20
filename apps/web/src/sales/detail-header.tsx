import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { SalesHeaderDto } from './contracts.ts';
import { SalesHistoryAction, type SalesHistoryCapability } from './history-view.tsx';

/** The frozen document has one flat title/status/save-state/action row. Reused
 * during code/style/query waits, so 返回列表 is never gated by a business read. */
export function SalesDetailHeader({ close, status, history, salesId, output }: { readonly output?: ReactNode; readonly close: () => void; readonly status?: SalesHeaderDto['status']; readonly history?: SalesHistoryCapability; readonly salesId?: string }) {
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    // Readiness may replace the lightweight frame. Restore its lost focus, but
    // do not steal focus if the user has moved to the surrounding app shell.
    if (document.activeElement === document.body || document.activeElement?.closest('.sales-detail-loading, [data-document-list="sales"][hidden]')) back.current?.focus({ preventScroll: true });
  }, []);
  return <div className="tc-head sale-head sales-document-state"><h1>查看销货单</h1>
    {status && <><span className={`tc-status ${status === 'APPROVED' ? 'doc-effective' : status === 'VOID' ? 'doc-void' : 'doc-pending'}`}>{status === 'APPROVED' ? '已审核' : status === 'VOID' ? '已作废' : '未审核'}</span><span id="sale-save-state" className="sale-muted">· 已保存</span></>}
    <div className="actions"><button ref={back} type="button" className="btn" onClick={close}>返回列表</button>{output ?? ['导出', '打印'].map(label => <button key={label} type="button" className="btn" disabled title="保存并读取单据后可输出">{label}</button>)}<SalesHistoryAction {...(history ? { capability: history } : {})} {...(salesId ? { salesId } : {})} /></div>
  </div>;
}
