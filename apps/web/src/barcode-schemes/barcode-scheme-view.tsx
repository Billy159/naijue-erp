import { useMemo, useSyncExternalStore } from 'react';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import type { QueryRead } from '../loading/latest-query.ts';
import { validateDictionaryScheme } from '../../../../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryPageProps, DictionarySchemeQuery } from '../product-settings/size-groups/contracts.ts';
import { useDictionaryOwner } from '../product-settings/size-groups/read-owner.tsx';
import { DictionaryReadState } from '../product-settings/size-groups/read-state.tsx';
export function BarcodeSchemeView(props: DictionaryPageProps & { readonly schemeId: string; readonly close: () => void }) {
  const execute = useMemo(() => async (read: QueryRead<DictionarySchemeQuery>) => {
    const value = await props.reader.readBarcodeScheme(read); if (value === null) return null;
    const result = validateDictionaryScheme(value); if (result.id !== read.parameters.schemeId) throw new Error('Invalid scheme target'); return result;
  }, [props.reader, props.schemeId]);
  const owner = useDictionaryOwner(props, execute, { schemeId: props.schemeId });
  return <StandardOverlay presentation="catalogue" title="查看条码方案" className="erp-scheme-modal pc-arco-modal iw-arco-controls pc-native-scheme-modal" closeLabel="关闭查看条码方案" close={props.close} maskClosable={false}
    footer={close => <div className="pc-modal-foot"><button type="button" className="btn" onClick={close}>关闭</button></div>}>
    <div className="pc-modal-body">{owner ? <SchemeDetail owner={owner} schemeId={props.schemeId} /> : <p role="status">正在准备读取…</p>}</div>
  </StandardOverlay>;
}
function SchemeDetail({ owner, schemeId }: { readonly owner: NonNullable<ReturnType<typeof useDictionaryOwner<DictionarySchemeQuery, import('../product-settings/size-groups/contracts.ts').DictionaryBarcodeScheme | null>>>; readonly schemeId: string }) {
  const { query } = owner, snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot), result = snapshot.success?.data;
  return <><DictionaryReadState snapshot={snapshot} retry={() => { if (owner.scope.active) void query.run({ schemeId }); }} cancel={() => query.cancel()} />{result && <dl className="pc-rule"><dt>方案名称</dt><dd>{result.name}</dd><dt>条码类型</dt><dd>{result.barcodeType}</dd><dt>编码规则</dt><dd>{result.ruleDescription}</dd><dt>总长度</dt><dd>{result.codeLength === null ? '未提供' : `${result.codeLength} 位`}</dd></dl>}{snapshot.phase === 'success' && result === null && <p role="status">此方案不存在或已不可读取。</p>}</>;
}
