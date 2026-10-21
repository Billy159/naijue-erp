/** Offline primitives only. No SQL, coercion of identities, timezone guesses or rounding. */
export interface V2Limits { fieldCharacters: number; columns: number; rows: number; characters: number }
export const V2_LIMITS: Readonly<V2Limits> = Object.freeze({ fieldCharacters: 65_536, columns: 128, rows: 2_000_000, characters: 512_000_000 });
export async function* parseV2Csv(chunks: AsyncIterable<string>, limits = V2_LIMITS): AsyncGenerator<string[]> {
  let field = '', row: string[] = [], state: 'plain' | 'quoted' | 'closed' = 'plain';
  let chars = 0, rows = 0, skipLf = false, started = false;
  const append = (c: string) => { field += c; if (field.length > limits.fieldCharacters) throw Error('CSV_FIELD_LIMIT'); };
  const push = () => { /* Force V8 to flatten accumulated strings without changing Unicode. */ field.indexOf('\0'); row.push(field); field = ''; if (row.length > limits.columns) throw Error('CSV_COLUMN_LIMIT'); };
  for await (const chunk of chunks) for (const c of chunk) {
    if (++chars > limits.characters) throw Error('CSV_CHARACTER_LIMIT');
    if (c === '\0' || (!started && c === '\ufeff')) throw Error('CSV_INVALID_CHARACTER');
    started = true;
    if (skipLf) { skipLf = false; if (c === '\n') continue; }
    if (state === 'quoted') { if (c === '"') state = 'closed'; else append(c); continue; }
    if (state === 'closed' && c === '"') { append(c); state = 'quoted'; continue; }
    if (c === ',') { push(); state = 'plain'; continue; }
    if (c === '\n' || c === '\r') {
      push(); if (++rows > limits.rows) throw Error('CSV_ROW_LIMIT'); yield row; row = []; state = 'plain'; skipLf = c === '\r'; continue;
    }
    if (state === 'closed') throw Error('CSV_TRAILING_QUOTE_DATA');
    if (c === '"') { if (field !== '') throw Error('CSV_QUOTE_IN_UNQUOTED_FIELD'); state = 'quoted'; }
    else append(c);
  }
  if (state === 'quoted') throw Error('CSV_UNCLOSED_QUOTE');
  if (field !== '' || row.length || state === 'closed') { push(); if (++rows > limits.rows) throw Error('CSV_ROW_LIMIT'); yield row; }
}
export function v2Nullable(raw: string): string | null { return raw === '' ? null : raw; }
export function v2Integer(raw: string): bigint {
  if (raw.length > 20 || !/^-?\d+$/.test(raw)) throw Error('INTEGER_FORMAT');
  const n = BigInt(raw); if (n < -9223372036854775808n || n > 9223372036854775807n) throw Error('INTEGER_RANGE'); return n;
}
export function v2Cents(raw: string): bigint {
  if (raw.length > 22 || !/^-?\d+(?:\.\d{1,2})?$/.test(raw)) throw Error('MONEY_FORMAT_OR_PRECISION');
  const [whole, fraction = ''] = raw.replace(/^-/, '').split('.');
  const n = (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))) * (raw.startsWith('-') ? -1n : 1n);
  if (n < -999999999999999999n || n > 999999999999999999n) throw Error('MONEY_RANGE'); return n;
}
export interface MoneyApproval { fileSha256: string; sheet: string; row: string; sourceId: string; field: string; rawValue: string; exactCentValue: string }
const approvalKey = (a: MoneyApproval) => JSON.stringify([a.fileSha256,a.sheet,a.row,a.sourceId,a.field,a.rawValue,a.exactCentValue]);
/** expected must come from a separately trusted approval, never the input's own assertion. */
export function v2MoneyApprovalSet(expected: readonly MoneyApproval[], supplied: readonly MoneyApproval[]): ReadonlyMap<string, MoneyApproval> {
  if (expected.length !== 32 || supplied.length !== 32) throw Error('MONEY_APPROVAL_COUNT');
  const trusted = new Set(expected.map(approvalKey));
  const actual = new Map(supplied.map(a => [approvalKey(a), a]));
  if (trusted.size !== 32 || actual.size !== 32 || [...actual.keys()].some(k => !trusted.has(k))) throw Error('MONEY_APPROVAL_IDENTITY_MISMATCH');
  const cells = new Set<string>();
  for (const a of supplied) {
    if (!/^[a-f0-9]{64}$/.test(a.fileSha256) || !/^[1-9]\d*$/.test(a.row)) throw Error('MONEY_APPROVAL_PROVENANCE');
    v2Cents(a.exactCentValue);
    const cell = JSON.stringify([a.fileSha256,a.sheet,a.row,a.sourceId,a.field]);
    if (cells.has(cell)) throw Error('MONEY_APPROVAL_DUPLICATE_CELL'); cells.add(cell);
  }
  return actual;
}
export function v2ApprovedCents(cell: MoneyApproval, approvals: ReadonlyMap<string, MoneyApproval>): bigint {
  if (!approvals.has(approvalKey(cell))) throw Error('MONEY_CELL_NOT_APPROVED');
  return v2Cents(cell.exactCentValue);
}
export function v2Temporal(raw: string): { raw: string | null; state: 'UNKNOWN' | 'POLICY_REQUIRED'; parsed: null } {
  return { raw: v2Nullable(raw), state: raw === '' ? 'UNKNOWN' : 'POLICY_REQUIRED', parsed: null };
}
export interface V2Coordinate { product: string; color: string; fit: string; size: string }
const coordinateKey = (c: V2Coordinate) => JSON.stringify([c.product,c.color,c.fit,c.size]);
export function v2AliasIndex(canonical: ReadonlyMap<string,V2Coordinate>, aliases: Iterable<{ oldId: string; canonicalId: string; coordinate: V2Coordinate }>): ReadonlyMap<string,string> {
  const result = new Map<string,string>(); const covered = new Set<string>();
  for (const a of aliases) {
    if (!a.oldId || result.has(a.oldId)) throw Error('ALIAS_DUPLICATE_OR_EMPTY');
    const target = canonical.get(a.canonicalId);
    if (!target) throw Error('ALIAS_TARGET_MISSING');
    if (coordinateKey(target) !== coordinateKey(a.coordinate)) throw Error('ALIAS_COORDINATE_MISMATCH');
    result.set(a.oldId,a.canonicalId); covered.add(a.canonicalId);
  }
  if (covered.size !== canonical.size) throw Error('ALIAS_TARGET_NOT_COVERED');
  return result;
}
/** Historical-only identities are not promoted to active customer catalogue entries. */
export function v2HistoricalCustomerIds(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length > 100_000) throw Error('HISTORICAL_CUSTOMER_DICTIONARY');
  const result = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || typeof row.sourceKey !== 'string' || !row.sourceKey || row.sourceKey.length > V2_LIMITS.fieldCharacters || row.enabled !== false || row.historicalOnly !== true || row.visibleInCurrentCustomerList !== false || result.has(row.sourceKey)) throw Error('HISTORICAL_CUSTOMER_DICTIONARY');
    result.add(row.sourceKey);
  }
  return result;
}
export function v2HistoricalCustomerReference(field: string, sourceId: string, ids: ReadonlySet<string>): boolean {
  return field === 'SALES_HEADER.客户来源编号->CUSTOMER' && ids.has(sourceId);
}
/** Bounded line framing; each JSON value stays literal and is decoded by JSON.parse only. */
export async function* parseV2JsonLines(chunks: AsyncIterable<string>, maxLineCharacters = 4_194_304, maxRows = 1_000_000): AsyncGenerator<unknown> {
  let pending = '', rows = 0;
  for await (const chunk of chunks) {
    let start = 0;
    for (;;) {
      const end = chunk.indexOf('\n', start);
      const part = chunk.slice(start, end === -1 ? undefined : end);
      if (pending.length + part.length > maxLineCharacters) throw Error('JSONL_LINE_LIMIT');
      pending += part;
      if (end === -1) break;
      if (!pending || ++rows > maxRows) throw Error('JSONL_EMPTY_OR_ROW_LIMIT');
      yield JSON.parse(pending); pending = ''; start = end + 1;
    }
  }
  if (pending) { if (++rows > maxRows) throw Error('JSONL_ROW_LIMIT'); yield JSON.parse(pending); }
}
/** Hall context only, never visibility authorization; no warehouse fallback input exists. */
export function v2CreatorHallDecision(entity: 'SALES_HEADER' | 'TRANSFER_HEADER', personId: string, staffHalls: ReadonlyMap<string,string>): { matchedStaffId: string | null; candidateHall: string | null; provenance: 'MIGRATION_DERIVED' | 'UNKNOWN'; reason: string } {
  if (!personId || !staffHalls.has(personId)) return { matchedStaffId: null, candidateHall: null, provenance: 'UNKNOWN', reason: entity === 'SALES_HEADER' && personId === '' ? 'UNKNOWN_NO_SALESPERSON_ID' : 'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED' };
  const hall = staffHalls.get(personId)!;
  if (hall === '') return { matchedStaffId: personId, candidateHall: null, provenance: 'UNKNOWN', reason: 'UNKNOWN_MATCHED_EMPLOYEE_HAS_NO_HALL' };
  return { matchedStaffId: personId, candidateHall: hall, provenance: 'MIGRATION_DERIVED', reason: 'MIGRATION_DERIVED_CURRENT_EMPLOYEE_HALL' };
}
/** Explicit v3 selection only: excluded rows stay evidence; this never mutates the v2 source. */
export function v3BarcodeExclusion(
  columns: readonly string[], sourceRows: readonly Readonly<Record<string,string>>[],
  excludedRows: readonly Readonly<Record<string,string>>[], effectiveRows: readonly Readonly<Record<string,string>>[],
  expected: { excluded: number; effective: number },
): { sourceRows: number; excludedProductEvidenceRows: number; effectiveSkuRows: number; effectiveFieldsUnchanged: true; productRowsInEffectiveTarget: 0 } {
  const index = (rows: readonly Readonly<Record<string,string>>[]) => {
    const result = new Map<string,Readonly<Record<string,string>>>();
    for (const row of rows) {
      if (Object.keys(row).length !== columns.length || columns.some(c => typeof row[c] !== 'string')) throw Error('V3_BARCODE_ROW_SCHEMA');
      const id = row['来源编号']; if (!id || result.has(id)) throw Error('V3_BARCODE_DUPLICATE_OR_EMPTY_ID'); result.set(id,row);
    }
    return result;
  };
  const source = index(sourceRows), excluded = index(excludedRows), effective = index(effectiveRows);
  if (excluded.size !== expected.excluded || effective.size !== expected.effective || source.size !== expected.excluded + expected.effective) throw Error('V3_BARCODE_SELECTION_COUNT');
  const unchanged = (a: Readonly<Record<string,string>>, b: Readonly<Record<string,string>>) => columns.every(c => a[c] === b[c]);
  for (const [id,row] of excluded) {
    const original = source.get(id);
    if (!original || original['绑定范围'] !== 'PRODUCT' || original['SKU来源编号'] !== '' || original['商品来源编号'] === '') throw Error('V3_EXCLUSION_NOT_PRODUCT');
    if (!unchanged(original,row)) throw Error('V3_EXCLUSION_RAW_CHANGED');
  }
  for (const [id,row] of source) {
    if (row['绑定范围'] === 'PRODUCT') { if (!excluded.has(id)) throw Error('V3_PRODUCT_EXCLUSION_MISSING'); }
    else if (row['绑定范围'] !== 'SKU' || row['SKU来源编号'] === '') throw Error('V3_SOURCE_BARCODE_SCOPE');
    if (excluded.has(id)) { if (effective.has(id)) throw Error('V3_EXCLUDED_ROW_IN_TARGET'); continue; }
    const retained = effective.get(id);
    if (!retained || retained['绑定范围'] !== 'SKU' || !unchanged(row,retained)) throw Error('V3_EFFECTIVE_FIELDS_OR_COVERAGE');
  }
  for (const id of effective.keys()) if (!source.has(id) || excluded.has(id)) throw Error('V3_EFFECTIVE_UNAUTHORIZED_ROW');
  return { sourceRows: source.size, excludedProductEvidenceRows: excluded.size, effectiveSkuRows: effective.size, effectiveFieldsUnchanged: true, productRowsInEffectiveTarget: 0 };
}
