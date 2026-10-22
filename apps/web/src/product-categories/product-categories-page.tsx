import { UIButton, UIInput } from '../components/standard-controls.tsx';
import { useMemo, useState, useSyncExternalStore } from 'react';
import type { QueryRead } from '../loading/latest-query.ts';
import { validateCatalogueSettingsTree } from '../../../../packages/application/src/catalogue-settings-read-validation.ts';
import type { CatalogueSettingsPageProps, CatalogueSettingsTree, CatalogueSettingsTreeQuery } from '../product-settings/colors/contracts.ts';
import { useCatalogueReadOwner, type CatalogueReadOwner } from '../product-settings/colors/read-owner.tsx';
import { CatalogueReadState } from '../product-settings/colors/read-state.tsx';
import { CatalogueCategoryTree } from './category-tree.tsx';
import { categoryPath, categoryTreeIndex } from './tree-model.ts';
import '../product-settings/colors/source-catalogue-settings.css';
import './source-product-categories.css';

const initial: CatalogueSettingsTreeQuery = Object.freeze({});
export function ProductCategoriesPage(props: CatalogueSettingsPageProps) {
  const execute = useMemo(() => async (read: QueryRead<CatalogueSettingsTreeQuery>) => validateCatalogueSettingsTree(await props.reader.readCategories(read)), [props.reader]);
  const owner = useCatalogueReadOwner(props, execute, initial);
  return owner ? <CategoryContent key={owner.scope.routeInstanceId} owner={owner} /> : null;
}
function CategoryContent({ owner }: { readonly owner: CatalogueReadOwner<CatalogueSettingsTreeQuery, CatalogueSettingsTree> }) {
  const { scope, query } = owner, snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const result = snapshot.success?.data, index = useMemo(() => categoryTreeIndex(result?.items ?? []), [result]);
  const [selection, setSelection] = useState<string | null>(null), selected = selection && index.byId.has(selection) ? index.byId.get(selection)! : (index.children.get(null)?.[0] ?? null);
  const run = () => { if (scope.active) void query.run(initial); }, busy = snapshot.phase === 'loading';
  const state = <CatalogueReadState accessFailure={owner.getAccessFailure()} snapshot={snapshot} retry={run} cancel={() => query.cancel()} />;
  if (snapshot.phase === 'disposed') return <div className="catalogue-workbench">{state}</div>;
  return <div className="catalogue-workbench catalogue-categories pc-workbench pc-categories"><div className="pc-page-head"><h1>商品分类</h1><div className="iw-head-actions"><UIButton type="button" disabled title="撤销排序维护尚未接入">撤销排序</UIButton><UIButton type="button" disabled title="分类新增维护尚未接入">新增一级分类</UIButton><UIButton type="button" disabled title="分类新增维护尚未接入">新增下级分类</UIButton><UIButton type="button" disabled={busy} onClick={run}>刷新</UIButton></div></div><p className="catalogue-maintenance-note">当前仅提供真实授权只读查询；新增、保存、删除和排序尚未接入。</p>{state}{snapshot.success && (busy || snapshot.phase === 'error') && <p role="status">以下仍为上次成功读取的完整分类目录，并非本次读取结果。</p>}<div className="pc-category-layout"><aside className="pc-filter-tree">{result ? <CatalogueCategoryTree index={index} selectedId={selected?.id ?? null} select={id => { if (scope.active) setSelection(id); }} /> : <p className="hint">分类资料尚未读取。</p>}</aside><section className="pc-category-detail" aria-label="分类资料">{selected ? <form onSubmit={event => event.preventDefault()}><div className="pc-category-detail-head"><h2>分类资料</h2><div><UIButton type="button" disabled title="当前为只读资料，没有未保存编辑">取消</UIButton><UIButton className="primary" type="button" disabled title="分类保存维护尚未接入">保存</UIButton></div></div><div className="pc-category-facts"><div className="field"><span>分类路径</span><p className="pc-text-block">{selected.parentId === null ? '一级分类' : categoryPath(index, selected.id).map(item => item.name).join(' / ')}</p></div><label className="field"><span>分类名称</span><UIInput value={selected.name} readOnly /></label><div className="field"><span>商品数量</span><p className="pc-text-block" data-category-product-count>{selected.productCount === null ? '未提供' : `${selected.productCount} 款`}</p></div><div className="field"><span>下级分类数量</span><p className="pc-text-block">{selected.childCount} 个</p></div></div><div className="pc-delete-zone"><UIButton type="button" disabled title="分类删除维护尚未接入">删除分类</UIButton></div><dl className="catalogue-native-facts"><dt>分类编码</dt><dd>未提供</dd><dt>原生显示顺序</dt><dd>{selected.displayOrder}</dd><dt>版本</dt><dd>{selected.version}</dd></dl>{selected.productCount === null && <p className="catalogue-count-note">商品计数未获独立完整可见范围授权；未提供不表示 0。</p>}</form> : <><h2>分类资料</h2><div className="empty" role="status">{result ? '没有分类资料。' : '选择分类前请先读取资料。'}</div></>}</section></div>{result && <p className="catalogue-tree-total">本次完整目录：{result.total} 个分类；保留原生层级及顺序。</p>}</div>;
}
