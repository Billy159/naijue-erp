import assert from 'node:assert/strict';
import test from 'node:test';
import type { DemoMultiOption } from './multi-select-contract.ts';
import { changeCategoryBranchSelection, createCategoryBranchProjection } from './category-branch-model.ts';

const parent: DemoMultiOption = { id: 'p', name: 'Native parent' };
const child: DemoMultiOption = { id: 'c', name: 'Provider child label', parentId: 'p' };
const other: DemoMultiOption = { id: 'q', name: 'Other parent', parentId: null };
const options = [parent, child, other];
const project = (value: readonly string[], current: readonly DemoMultiOption[] = options, selected: readonly DemoMultiOption[] = []) => createCategoryBranchProjection(current, selected, value);

test('only current loaded native parent rows are nested, preserving provider labels and order', () => {
  const projection = project(['p'], [child, other, parent]);
  assert.deepEqual(projection.treeData, [
    { key: 'q', value: 'q', title: 'Other parent' },
    { key: 'p', value: 'p', title: 'Native parent', children: [{ key: 'c', value: 'c', title: 'Provider child label' }] },
  ]);
  assert.deepEqual([...projection.parentById], [['c', 'p']]);
});

test('selected-only and unknown parent rows are not invented or injected into tree data', () => {
  for (const selected of [[], [parent]]) {
    const projection = project(['p'], [child], selected);
    assert.deepEqual(projection.treeData, [{ key: 'c', value: 'c', title: 'Provider child label' }]);
    assert.deepEqual(projection.checkedIds, ['p', 'c']);
    assert.equal(projection.coveredByParent.get('c'), 'p');
  }
  assert.deepEqual(project(['unhydrated'], [], []).treeData, []);
});

test('current candidate metadata overrides selected-only metadata without rejecting cross-input IDs', () => {
  const stale = { ...child, name: 'Stale label', parentId: 'missing', disabled: true };
  const projection = project(['p'], options, [stale]);
  assert.equal(projection.known.get('c'), child);
  assert.equal(projection.parentById.get('c'), 'p');
  assert.equal(projection.treeData[0]?.children?.[0]?.title, child.name);
  assert.deepEqual(projection.checkedIds, ['p', 'c']);
});

test('native parent coverage is projected without changing or normalizing canonical value', () => {
  const value = Object.freeze(['p', 'unknown']);
  const projection = project(value);
  assert.deepEqual(value, ['p', 'unknown']);
  assert.deepEqual(projection.checkedIds, ['p', 'unknown', 'c']);
  assert.deepEqual([...projection.coveredByParent], [['c', 'p']]);
  assert.deepEqual(changeCategoryBranchSelection(projection, value, 'c', true), { kind: 'unchanged' });
});

test('selected children never imply a parent check or half-check', () => {
  const sibling = { id: 'sibling', name: 'Sibling', parentId: 'p' };
  const projection = project(['c', 'sibling'], [parent, child, sibling]);
  assert.deepEqual(projection.checkedIds, ['c', 'sibling']);
  assert.deepEqual([...projection.coveredByParent], []);
  assert.equal(Object.hasOwn(projection, 'halfCheckedIds'), false);
});

test('ALL stays standalone; a positive check chooses exactly one current enabled category', () => {
  const disabled = { ...other, disabled: true };
  const projection = project([], [parent, child, disabled], [{ id: 'retained', name: 'Not loaded' }]);
  assert.deepEqual(projection.checkedIds, []);
  assert.deepEqual([...projection.coveredByParent], []);
  assert.deepEqual(projection.treeData[1], { key: 'q', value: 'q', title: 'Other parent', disabled: true });
  assert.deepEqual(changeCategoryBranchSelection(projection, [], 'c', false), { kind: 'refused', option: child });
  assert.deepEqual(changeCategoryBranchSelection(projection, [], 'p', false), { kind: 'refused', option: parent });
  assert.deepEqual(changeCategoryBranchSelection(projection, [], 'c', true), { kind: 'change', ids: ['c'] });
  assert.deepEqual(changeCategoryBranchSelection(projection, [], 'p', true), { kind: 'change', ids: ['p'] });
  assert.deepEqual(changeCategoryBranchSelection(projection, [], 'q', true), { kind: 'unchanged' });
  assert.deepEqual(changeCategoryBranchSelection(projection, [], 'retained', true), { kind: 'unchanged' });
  assert.deepEqual(changeCategoryBranchSelection(projection, [], 'unknown', true), { kind: 'unchanged' });
});

test('explicitly selecting every known ID is never normalized to ALL', () => {
  const projection = project(['p', 'c']);
  assert.deepEqual(changeCategoryBranchSelection(projection, ['p', 'c'], 'q', true), { kind: 'change', ids: ['p', 'c', 'q'] });
  assert.deepEqual(project(['p', 'c', 'q']).checkedIds, ['p', 'c', 'q']);
  assert.deepEqual(changeCategoryBranchSelection(project(['p', 'c', 'q']), ['p', 'c', 'q'], 'p', true), { kind: 'unchanged' });
});

test('adding a native parent removes only proven redundant selected children and preserves unknown IDs', () => {
  const retainedChild = { id: 'retained-child', name: 'Retained child', parentId: 'p' };
  const projection = project(['c', 'retained-child', 'unknown', 'q'], options, [retainedChild]);
  assert.deepEqual(changeCategoryBranchSelection(projection, ['c', 'retained-child', 'unknown', 'q'], 'p', true), {
    kind: 'change', ids: ['unknown', 'q', 'p'],
  });
});

test('parent addition uses current native proof, not stale selected metadata', () => {
  const movedChild = { ...child, parentId: 'q' };
  const projection = project(['c', 'unknown'], [parent, movedChild, other], [child]);
  assert.deepEqual(changeCategoryBranchSelection(projection, ['c', 'unknown'], 'p', true), { kind: 'change', ids: ['c', 'unknown', 'p'] });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['c', 'unknown'], 'q', true), { kind: 'change', ids: ['unknown', 'q'] });
});

test('covered children cannot exclude a selected branch, even if also explicitly selected', () => {
  for (const value of [['p'], ['p', 'c']]) {
    assert.deepEqual(changeCategoryBranchSelection(project(value), value, 'c', false), { kind: 'refused', option: child, reason: 'branch-exclusion' });
  }
  const projection = project(['p'], [child]);
  assert.deepEqual(changeCategoryBranchSelection(projection, ['p'], 'c', false), { kind: 'refused', option: child, reason: 'branch-exclusion' });
});

test('removing an explicit redundant child tag preserves branch coverage while checkbox exclusion stays refused', () => {
  const value = ['p', 'c'];
  const projection = project(value);
  assert.deepEqual(changeCategoryBranchSelection(projection, value, 'c', false, 'tag'), { kind: 'change', ids: ['p'] });
  assert.deepEqual(project(['p']).checkedIds, ['p', 'c']);
  assert.deepEqual(changeCategoryBranchSelection(projection, value, 'c', false, 'checkbox'), { kind: 'refused', option: child, reason: 'branch-exclusion' });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['p'], 'c', false, 'tag'), { kind: 'unchanged' });
});

test('disabled redundant child tags remain removable without enabling branch checkbox exclusion', () => {
  const disabledChild = { ...child, disabled: true };
  const value = ['p', 'c', 'q'];
  const projection = project(value, [parent, disabledChild, other]);
  assert.deepEqual(changeCategoryBranchSelection(projection, value, 'c', false, 'tag'), { kind: 'change', ids: ['p', 'q'] });
  assert.deepEqual(changeCategoryBranchSelection(projection, value, 'c', false), { kind: 'refused', option: disabledChild, reason: 'branch-exclusion' });
});

test('tag actions only remove explicit tokens, including unknown IDs and the final token', () => {
  const projection = project(['unknown']);
  assert.deepEqual(changeCategoryBranchSelection(projection, ['unknown'], 'unknown', false, 'tag'), { kind: 'change', ids: [] });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['unknown'], 'p', false, 'tag'), { kind: 'unchanged' });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['unknown'], 'p', true, 'tag'), { kind: 'unchanged' });
  assert.deepEqual(changeCategoryBranchSelection(projection, [], 'p', false, 'tag'), { kind: 'unchanged' });
});

test('removing a parent does not materialize children; the last removal becomes ALL', () => {
  assert.deepEqual(changeCategoryBranchSelection(project(['p', 'q']), ['p', 'q'], 'p', false), { kind: 'change', ids: ['q'] });
  assert.deepEqual(changeCategoryBranchSelection(project(['p']), ['p'], 'p', false), { kind: 'change', ids: [] });
  assert.deepEqual(changeCategoryBranchSelection(project(['p', 'c', 'q']), ['p', 'c', 'q'], 'p', false), { kind: 'change', ids: ['c', 'q'] });
});

test('disabled candidates cannot be newly added but retained disabled selections may be removed', () => {
  const disabled = { ...other, disabled: true };
  const projection = project(['p'], [parent, child, disabled]);
  assert.deepEqual(changeCategoryBranchSelection(projection, ['p'], 'q', true), { kind: 'unchanged' });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['p', 'q'], 'q', false), { kind: 'change', ids: ['p'] });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['q'], 'q', false), { kind: 'change', ids: [] });
  const disabledParent = project(['p', 'q'], [{ ...parent, disabled: true }, child, other]);
  assert.deepEqual(changeCategoryBranchSelection(disabledParent, ['p', 'q'], 'p', false), { kind: 'change', ids: ['q'] });
});

test('unknown and selected-only retained IDs may be removed without hydration but cannot be newly added', () => {
  const selectedOnly = { id: 'retained', name: 'Retained', disabled: true };
  const projection = project(['unknown', 'retained'], options, [selectedOnly]);
  assert.deepEqual(changeCategoryBranchSelection(projection, ['unknown', 'retained'], 'unknown', false), { kind: 'change', ids: ['retained'] });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['unknown', 'retained'], 'retained', false), { kind: 'change', ids: ['unknown'] });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['p'], 'unknown', true), { kind: 'unchanged' });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['p'], 'retained', true), { kind: 'unchanged' });
  assert.deepEqual(changeCategoryBranchSelection(projection, ['unknown'], 'unknown', false), { kind: 'change', ids: [] });
});

test('each input rejects duplicate IDs independently while cross-input metadata is allowed', () => {
  assert.throws(() => project([], [parent, parent]), TypeError);
  assert.throws(() => project([], options, [parent, parent]), TypeError);
  assert.doesNotThrow(() => project([], options, [parent]));
});

test('self parents, cycles, and known depth beyond two levels fail closed', () => {
  const invalid: DemoMultiOption[][] = [
    [{ id: 'self', name: 'Self', parentId: 'self' }],
    [{ id: 'a', name: 'A', parentId: 'b' }, { id: 'b', name: 'B', parentId: 'a' }],
    [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parentId: 'a' }, { id: 'c', name: 'C', parentId: 'b' }],
    [{ id: 'b', name: 'B', parentId: 'missing' }, { id: 'c', name: 'C', parentId: 'b' }],
  ];
  for (const current of invalid) assert.throws(() => project([], current), TypeError);
  assert.throws(() => project([], [child], [{ ...parent, parentId: 'ancestor' }]), TypeError);
});

test('malformed parent and disabled metadata fails closed, including stale overwritten metadata', () => {
  for (const bad of [{ parentId: 1 }, { parentId: {} }, { parentId: '' }, { disabled: 'false' }, { disabled: null }]) {
    const malformed = { ...parent, ...bad } as unknown as DemoMultiOption;
    assert.throws(() => project([], [malformed]), TypeError);
    assert.throws(() => project([], options, [malformed]), TypeError);
  }
});

test('projection and selection leave frozen source metadata and canonical arrays unchanged', () => {
  const current = Object.freeze([Object.freeze(parent), Object.freeze(child), Object.freeze(other)]);
  const value = Object.freeze(['c', 'unknown']);
  const projection = project(value, current);
  assert.deepEqual(changeCategoryBranchSelection(projection, value, 'p', true), { kind: 'change', ids: ['unknown', 'p'] });
  assert.deepEqual(value, ['c', 'unknown']);
  assert.equal(current[0]?.name, 'Native parent');
});
