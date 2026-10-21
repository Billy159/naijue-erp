import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryProductSelectStyles } from './product-candidate-styles.ts';
function fakeDocument(inline = false) {
  const links: { rel: string; href: string; dataset: Record<string, string>; onload: (() => void) | null; onerror: (() => void) | null; remove: () => void }[] = [];
  const document = { querySelector: () => inline ? {} : null,
    createElement() { const link = { rel: '', href: '', dataset: {}, onload: null, onerror: null, remove() { const index = links.indexOf(link); if (index >= 0) links.splice(index, 1); } }; return link; },
    head: { append: (link: typeof links[number]) => links.push(link) } } as unknown as Document;
  return { document, links };
}
test('product search stylesheet has one action-owned relative URL and releases its link', async () => {
  const f = fakeDocument(); const lease = createInventoryProductSelectStyles(f.document); assert.equal(f.links.length, 0);
  const first = lease.load(); assert.equal(lease.load(), first); assert.equal(f.links.length, 1);
  assert.equal(f.links[0]!.rel, 'stylesheet'); assert.match(f.links[0]!.href, /\/product-candidate-action\.css$/);
  f.links[0]!.onload!(); await first; lease.dispose(); assert.equal(f.links.length, 0); await assert.rejects(lease.load());
});
test('closed pending product style load rejects, cannot publish late load or retain handlers', async () => {
  const f = fakeDocument(); const lease = createInventoryProductSelectStyles(f.document); const pending = lease.load(); const link = f.links[0]!;
  const rejected = assert.rejects(pending); lease.dispose(); await rejected;
  assert.equal(f.links.length, 0); assert.equal(link.onload, null); assert.equal(link.onerror, null); lease.dispose();
});
test('product style errors are retryable, and only actual portable-inline marker skips the link', async () => {
  const f = fakeDocument(); const lease = createInventoryProductSelectStyles(f.document); const failed = lease.load(); const rejected = assert.rejects(failed);
  f.links[0]!.onerror!(); await rejected; assert.equal(f.links.length, 0); const next = lease.load(); f.links[0]!.onload!(); await next; lease.dispose();
  const inline = fakeDocument(true); const portable = createInventoryProductSelectStyles(inline.document); await portable.load(); assert.equal(inline.links.length, 0); portable.dispose();
});
