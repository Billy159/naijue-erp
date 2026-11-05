/** TEST ONLY: one complete finite catalog, enumerated BEFORE any operation.
 * Not a production identity allocator, authorization source or HTTP server. */
const logicalId = /^test-(?:product|size-group|size|color|fit|warehouse|sku|category|supplier|season)-[A-Za-z0-9_-]+$/;
const logicalKind = /^test-(size-group|product|size|color|fit|warehouse|sku|category|supplier|season)-/;
function collect(value, found) {
  if (typeof value === 'string') { if (logicalId.test(value)) found.add(value); return; }
  if (Array.isArray(value)) { value.forEach(item => collect(item, found)); return; }
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { collect(key, found); collect(item, found); }
}
export function createInventoryIdentityMap(completeFacts) {
  const ids = new Set(); collect(completeFacts, ids);
  if (!ids.size) throw new TypeError('A complete declared inventory identity domain is required.');
  // Sorted complete domain, never first-seen query/page order. This namespace is
  // explicitly synthetic; UUID version bits are a wire shape, not randomness.
  const entries = Object.freeze([...ids].sort().map((id, index) => Object.freeze({
    logicalId: id, wireId: `e6000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
  })));
  const forward = new Map(entries.map(row => [row.logicalId, row.wireId]));
  const reverse = new Map(entries.map(row => [row.wireId, row.logicalId]));
  const kinds = new Map(entries.map(row => [row.logicalId, logicalKind.exec(row.logicalId)[1]]));
  if (reverse.size !== entries.length) throw new TypeError('Duplicate synthetic UUID.');
  function encodeId(id) { const value = forward.get(id); if (!value) throw new TypeError('Undeclared logical identity.'); return value; }
  function decodeId(id, kind) {
    const value = reverse.get(id);
    if (!value || (kind && kinds.get(value) !== kind)) throw new TypeError('Unknown or wrong-kind inventory identity.');
    return value;
  }
  function encode(value) {
    if (typeof value === 'string') return logicalId.test(value) ? encodeId(value) : value;
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [logicalId.test(key) ? encodeId(key) : key, encode(item)]));
    return value;
  }
  return Object.freeze({ entries, encodeId, decodeId, encode });
}
