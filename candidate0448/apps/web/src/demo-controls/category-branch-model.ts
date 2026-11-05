import type { DemoMultiOption } from './multi-select-contract.ts';

/** Current candidates only. Native parent metadata is not a display label. */
export interface CategoryBranchTreeNode {
  readonly key: string;
  readonly value: string;
  readonly title: string;
  readonly disabled?: boolean;
  readonly children?: CategoryBranchTreeNode[];
}

export interface CategoryBranchProjection {
  readonly treeData: readonly CategoryBranchTreeNode[];
  /** Current metadata overrides retained selected-option metadata. */
  readonly known: ReadonlyMap<string, DemoMultiOption>;
  readonly checkedIds: readonly string[];
  readonly coveredByParent: ReadonlyMap<string, string>;
  /** Native links also prove coverage when the parent row is not loaded. */
  readonly parentById: ReadonlyMap<string, string>;
  readonly currentIds: ReadonlySet<string>;
}

export type CategoryBranchSelectionChange =
  | { readonly kind: 'change'; readonly ids: readonly string[] }
  | { readonly kind: 'refused'; readonly option: DemoMultiOption; readonly reason?: 'branch-exclusion' }
  | { readonly kind: 'unchanged' };

type CategoryBranchNodeBuilder = { -readonly [Property in keyof CategoryBranchTreeNode]: CategoryBranchTreeNode[Property] };

function optionMap(options: readonly DemoMultiOption[]): Map<string, DemoMultiOption> {
  if (!Array.isArray(options)) throw new TypeError('Category candidates must be an array.');
  const result = new Map<string, DemoMultiOption>();
  for (const option of options) {
    if (!option || typeof option !== 'object' || typeof option.id !== 'string' || !option.id.length || typeof option.name !== 'string') {
      throw new TypeError('Category candidates require a string ID and label.');
    }
    if (result.has(option.id)) throw new TypeError(`Duplicate category ID: ${option.id}`);
    if (option.parentId !== undefined && option.parentId !== null && (typeof option.parentId !== 'string' || !option.parentId.length)) {
      throw new TypeError(`Invalid category parent: ${option.id}`);
    }
    if (option.disabled !== undefined && typeof option.disabled !== 'boolean') {
      throw new TypeError(`Invalid category disabled state: ${option.id}`);
    }
    if (option.parentId === option.id) throw new TypeError(`Self-parented category: ${option.id}`);
    result.set(option.id, option);
  }
  return result;
}

/**
 * Project native two-level branches without fetching or synthesizing rows.
 * Invalid metadata throws so the caller can fail closed instead of guessing.
 * Projection never rewrites the canonical selection or infers ALL from a page.
 */
export function createCategoryBranchProjection(
  options: readonly DemoMultiOption[],
  selectedOptions: readonly DemoMultiOption[],
  value: readonly string[],
): CategoryBranchProjection {
  const selected = optionMap(selectedOptions);
  const current = optionMap(options);
  const known = new Map([...selected, ...current]);
  const parentById = new Map<string, string>();
  for (const option of known.values()) {
    const parentId = option.parentId;
    if (parentId === undefined || parentId === null) continue;
    const parent = known.get(parentId);
    if (parent?.parentId !== undefined && parent.parentId !== null) {
      throw new TypeError(`Category branches must have at most two levels: ${option.id}`);
    }
    parentById.set(option.id, parentId);
  }

  const nodes = new Map<string, CategoryBranchNodeBuilder>();
  for (const option of current.values()) {
    nodes.set(option.id, {
      key: option.id,
      value: option.id,
      title: option.name,
      ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
    });
  }
  const treeData: CategoryBranchTreeNode[] = [];
  for (const [id, node] of nodes) {
    const parentId = parentById.get(id);
    const parent = parentId === undefined ? undefined : nodes.get(parentId);
    if (!parent) {
      treeData.push(node);
      continue;
    }
    // These are newly allocated plain nodes, never the source metadata.
    // Roots and children share their builder object regardless of input order.
    (parent.children ??= []).push(node);
  }

  const selectedIds = new Set(value);
  // Unrestricted ALL is a standalone choice, not a checked enumeration of the
  // loaded page. Its ordinary rows stay unchecked, as in the frozen source.
  const checkedIds = new Set(value);
  const coveredByParent = new Map<string, string>();
  for (const [id, parentId] of parentById) {
    if (selectedIds.has(parentId)) {
      coveredByParent.set(id, parentId);
      if (current.has(id)) checkedIds.add(id);
    }
  }
  return { treeData, known, checkedIds: [...checkedIds], coveredByParent, parentById, currentIds: new Set(current.keys()) };
}

/** Apply one explicit action, preserving retained IDs whose metadata is absent. */
export function changeCategoryBranchSelection(
  projection: CategoryBranchProjection,
  value: readonly string[],
  id: string,
  checked: boolean,
  source: 'checkbox' | 'tag' = 'checkbox',
): CategoryBranchSelectionChange {
  if (source === 'tag') {
    // A tag represents an explicit canonical token, not projected branch scope.
    // Removing a redundant child tag keeps that child covered by its parent.
    return !checked && value.includes(id) ? { kind: 'change', ids: value.filter(selectedId => selectedId !== id) } : { kind: 'unchanged' };
  }
  const option = projection.known.get(id);
  if (value.length === 0) {
    // A positive check deliberately replaces standalone ALL with exactly that
    // branch/category. A false callback must never approximate ALL minus one.
    if (!checked) return option ? { kind: 'refused', option } : { kind: 'unchanged' };
    return projection.currentIds.has(id) && option && !option.disabled
      ? { kind: 'change', ids: [id] } : { kind: 'unchanged' };
  }
  const selected = new Set(value);
  const parentId = projection.parentById.get(id);
  if (parentId !== undefined && selected.has(parentId)) {
    return !checked && option ? { kind: 'refused', option, reason: 'branch-exclusion' } : { kind: 'unchanged' };
  }
  if (!checked) {
    return selected.has(id) ? { kind: 'change', ids: value.filter(selectedId => selectedId !== id) } : { kind: 'unchanged' };
  }
  if (selected.has(id) || !projection.currentIds.has(id) || !option || option.disabled) return { kind: 'unchanged' };
  // Only explicit parent addition removes children, and only with native proof.
  // Unknown selected IDs and unrelated branches are deliberately retained.
  const ids = value.filter(selectedId => projection.parentById.get(selectedId) !== id);
  ids.push(id);
  return { kind: 'change', ids };
}
