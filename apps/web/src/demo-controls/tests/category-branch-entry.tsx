import { useState, type ReactNode } from 'react';
import { DemoMultiSelectAction } from '../multi-select-action.tsx';
import type { DemoMultiOption } from '../multi-select-contract.ts';
export { act, createElement, StrictMode } from 'react';
export { createRoot } from 'react-dom/client';

export const categories: readonly DemoMultiOption[] = [
  { id: 'a', name: '上装', parentId: null },
  { id: 'a1', name: '衬衫', parentId: 'a' },
  { id: 'a2', name: '针织', parentId: 'a' },
  { id: 'b', name: '下装', parentId: null },
  { id: 'b1', name: '长裤', parentId: 'b' },
  { id: 'orphan', name: '未载入父类 / 裙装', parentId: 'absent' },
  { id: 'disabled', name: '停用分类', parentId: null, disabled: true },
];
export function CategoryBranchHarness(props: {
  readonly initial: readonly string[];
  readonly options?: readonly DemoMultiOption[];
  readonly selectedOptions?: readonly DemoMultiOption[];
  readonly open?: boolean;
  readonly completeUniverse?: boolean;
  readonly onChange: (ids: readonly string[]) => void;
  readonly onRefusal: (id: string, reason?: 'branch-exclusion') => void;
  readonly onTree?: (menu: ReactNode) => void;
}) {
  const [value, setValue] = useState(props.initial);
  const [refused, setRefused] = useState<DemoMultiOption | null>(null);
  const change = (ids: readonly string[]) => { setValue(ids); setRefused(null); props.onChange(ids); };
  return <section className="demo-ui"><div className="iw-field"><span>商品分类</span>
    <DemoMultiSelectAction hierarchy="category-branches" label="商品分类" allLabel="全部分类" options={props.options ?? categories}
      selectedOptions={props.selectedOptions ?? categories} value={value} open={props.open ?? true} {...(props.completeUniverse === undefined ? {} : { completeUniverse: props.completeUniverse })}
      {...(props.onTree ? { renderMenu: (menu: ReactNode) => { props.onTree?.(menu); return menu; } } : {})}
      onChange={change} onIncompleteSelection={(option, reason) => { setRefused(option); props.onRefusal(option.id, reason); }} />
    <output data-canonical>{JSON.stringify(value)}</output>
    {refused && <p role="status">不能从已包含范围排除该项。<button type="button" disabled={!!refused.disabled} onClick={() => change([refused.id])}>仅选择该项</button></p>}
  </div></section>;
}
