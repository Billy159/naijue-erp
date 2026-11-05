/** Synthetic PG boundary only: does not parse SQL or establish engine acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresHistorySalesDetailBindingResolver, createPostgresHistorySalesDetailBindingResolver26 } from "../adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts";
import type { PgSalesClient, PgSalesPool, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { syntheticSalesDetailChunk, salesDetailId, salesDetailHash } from "./support/synthetic-sales-detail-fixtures.ts";

type Row = Record<string, unknown>;
const fixture = () => {
  const input = syntheticSalesDetailChunk(), row = input.rows[0]!;
  return { scope: { batchId: input.batchId, fixedSourceNamespace: input.fixedSourceNamespace,
    selectionSha256: input.selection.selectionSha256 },
  query: { entity: "SALES_LINE" as const, sourceKey: row.source.sourceKey,
    rawFields: row.source.rawFields, normalizedFields: row.source.normalizedFields },
  binding: { header: row.header, sku: row.sku } };
};

/** Scripted database replies; SQL semantics still require a real engine run. */
class ReadOnlyPool implements PgSalesPool {
  lease:PgSalesClient|undefined;
  connects = 0;
  releases: (Error | boolean | undefined)[] = [];
  calls: { sql: string; values: unknown[] }[] = [];
  rows: Record<string, Row[]> = {
    "resolver-schema": [{ versions: Array.from({ length: 14 }, (_, i) => i + 1) }],
    "resolver-batch": [{ id: salesDetailId(1) }],
    "resolver-header": [{ id: salesDetailId(2), source_row_id: salesDetailId(3),
      source_file_sha256: salesDetailHash, row_sha256: salesDetailHash, version: 1 }],
    "resolver-sku": [{ id: salesDetailId(4), source_row_id: salesDetailId(5), import_record_id: salesDetailId(6) }],
    "resolver-check": [{ id: salesDetailId(2) }],
  };
  failure = new Error("Synthetic resolver failure");
  rollbackFailure = new Error("Synthetic resolver rollback failure");
  failAt: string | undefined;
  failRollback = false;
  beforeBorrow: (() => void) | undefined;
  async connect(): Promise<PgSalesClient> {
    this.connects++; this.beforeBorrow?.();
    if (this.failAt === "connect") throw this.failure;
    this.lease={ query: async (sql, values = []): Promise<PgSalesResult> => {
      this.calls.push({ sql, values });
      const tag = /\/\* sales-detail:([^*]+?) \*\//.exec(sql)?.[1] ?? sql;
      if (tag === "ROLLBACK" && this.failRollback) throw this.rollbackFailure;
      if (this.failAt === tag) throw this.failure;
      if (sql.startsWith("BEGIN")) {
        assert.equal(sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        return { rows: [], rowCount: 0 };
      }
      if (sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      assert.match(sql.replace(/^\/\*.*?\*\/\s*/, ""), /^SELECT\b/);
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b|\bFOR SHARE\b|cutoff_import_lock|import_source_key_lock/);
      assert.ok(Object.hasOwn(this.rows, tag), `Unexpected database read: ${tag}`);
      return { rows: structuredClone(this.rows[tag]!), rowCount: this.rows[tag]!.length };
    }, release: error => { this.releases.push(error); } };return this.lease;
  }
}

test("sales-detail resolver refuses a different original line identity before borrowing a connection", async () => {
  const input = syntheticSalesDetailChunk(), source = input.rows[0]!.source;
  let connects = 0;
  const pool: PgSalesPool = { async connect() { connects++; throw new Error("Unexpected connection for mismatched source identity"); } };
  const resolve = createPostgresHistorySalesDetailBindingResolver(pool, {
    batchId: input.batchId, fixedSourceNamespace: input.fixedSourceNamespace,
    selectionSha256: input.selection.selectionSha256,
  });
  await assert.rejects(resolve({ entity: "SALES_LINE", sourceKey: "SYNTHETIC-DIFFERENT-LINE",
    rawFields: source.rawFields, normalizedFields: source.normalizedFields }),
  { code: "HISTORY_SALES_DETAIL_RESOLVER_QUERY" });
  assert.equal(connects, 0);
});

test("sales-detail resolver returns exact selected same-batch header and old-to-canonical SKU proof through a read-only snapshot", async () => {
  const f = fixture(), pool = new ReadOnlyPool();
  const resolve = createPostgresHistorySalesDetailBindingResolver(pool, f.scope);
  assert.deepEqual(await resolve(f.query), f.binding);
  assert.equal(pool.connects, 1);
  assert.deepEqual(pool.releases, [undefined]);
  assert.equal(pool.calls.at(-1)!.sql, "COMMIT");
  assert.deepEqual(pool.calls.find(x => x.sql.includes("resolver-batch"))!.values,
    [salesDetailId(1), "synthetic-sales-detail", salesDetailHash]);
  assert.deepEqual(pool.calls.find(x => x.sql.includes("resolver-header"))!.values,
    [salesDetailId(1), "SYNTHETIC-SALES-1"]);
  assert.deepEqual(pool.calls.find(x => x.sql.includes("resolver-sku"))!.values,
    [salesDetailId(1), "SYNTHETIC-OLD-SKU", "SYNTHETIC-CANONICAL-SKU"]);
  assert.deepEqual(pool.calls.find(x => x.sql.includes("resolver-check"))!.values,
    [salesDetailId(1), salesDetailId(2), salesDetailId(3), "SYNTHETIC-SALES-1", salesDetailHash,
      salesDetailHash, 1, salesDetailId(4), salesDetailId(5), "SYNTHETIC-OLD-SKU",
      "SYNTHETIC-CANONICAL-SKU", salesDetailId(6), salesDetailHash]);
});

test("sales-detail resolver rejects invalid fixed scope and inconsistent literal source/header/SKU identities without SQL", async () => {
  for (const field of ["batchId", "fixedSourceNamespace", "selectionSha256"] as const) {
    const f = fixture(), pool = new ReadOnlyPool(); f.scope[field] = "INVALID";
    assert.throws(() => createPostgresHistorySalesDetailBindingResolver(pool, f.scope),
      { code: "HISTORY_SALES_DETAIL_RESOLVER_SCOPE" });
    assert.equal(pool.connects, 0);
  }
  for (const kind of ["raw-line", "effective-line", "header", "old-sku", "canonical-sku"] as const) {
    const f = fixture(), pool = new ReadOnlyPool();
    if (kind === "raw-line") f.query.rawFields["来源编号"] = "SYNTHETIC-OTHER";
    if (kind === "effective-line") f.query.normalizedFields["来源编号"] = "SYNTHETIC-OTHER";
    if (kind === "header") f.query.rawFields["单据来源编号"] = "SYNTHETIC-OTHER";
    if (kind === "old-sku") f.query.rawFields["SKU来源编号"] = "";
    if (kind === "canonical-sku") f.query.normalizedFields["SKU来源编号"] = "";
    await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, f.scope)(f.query),
      { code: "HISTORY_SALES_DETAIL_RESOLVER_QUERY" });
    assert.equal(pool.connects, 0);
  }
});

test("sales-detail resolver refuses absent, incomplete, duplicated or unknown registry prefixes and rolls back its snapshot", async () => {
  for (const rows of [[], [{ versions: [] }], [{ versions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }],
    [{ versions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11] }],
    [{ versions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 999] }],
    [{ versions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }, { versions: [] }]]) {
    const f = fixture(), pool = new ReadOnlyPool(); pool.rows["resolver-schema"] = rows;
    await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, f.scope)(f.query),
      { code: "HISTORY_SALES_DETAIL_SCHEMA" });
    assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
    assert.deepEqual(pool.releases, [undefined]);
    assert.ok(!pool.calls.some(x => x.sql.includes("resolver-batch")));
  }
});

test("sales-detail resolver never picks the first batch, header or SKU when the database reports missing or ambiguous bindings", async () => {
  for (const key of ["resolver-batch", "resolver-header", "resolver-sku"] as const) {
    for (const cardinality of [0, 2]) {
      const f = fixture(), pool = new ReadOnlyPool();
      const first = pool.rows[key]![0]!; pool.rows[key] = Array.from({ length: cardinality }, () => structuredClone(first));
      await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, f.scope)(f.query),
        { code: key === "resolver-batch" ? "HISTORY_SALES_DETAIL_RESOLVER_SCOPE" : "HISTORY_SALES_DETAIL_RESOLVER_MISSING" });
      assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
      assert.deepEqual(pool.releases, [undefined]);
      assert.ok(!pool.calls.some(x => x.sql === "COMMIT" || x.sql.includes("resolver-check")));
    }
  }
});

test("sales-detail resolver rejects a bare candidate whose full same-batch creator/source predicate is missing or ambiguous", async () => {
  for (const rows of [[], [{ id: salesDetailId(2) }, { id: salesDetailId(2) }]]) {
    const f = fixture(), pool = new ReadOnlyPool(); pool.rows["resolver-check"] = rows;
    await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, f.scope)(f.query),
      { code: "HISTORY_SALES_DETAIL_NATIVE_BINDING" });
    assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
    assert.deepEqual(pool.releases, [undefined]);
    assert.ok(!pool.calls.some(x => x.sql === "COMMIT"));
  }
});

test("sales-detail resolver captures its fixed scope and copies literal query identities before an asynchronous pool borrow", async () => {
  const f = fixture(), pool = new ReadOnlyPool();
  const resolve = createPostgresHistorySalesDetailBindingResolver(pool, f.scope);
  f.scope.batchId = salesDetailId(99); f.scope.fixedSourceNamespace = "different-namespace";
  f.scope.selectionSha256 = "b".repeat(64);
  pool.beforeBorrow = () => {
    f.query.sourceKey = "SYNTHETIC-CHANGED";
    f.query.rawFields["SKU来源编号"] = "SYNTHETIC-CHANGED-OLD";
    f.query.normalizedFields["SKU来源编号"] = "SYNTHETIC-CHANGED-CANONICAL";
  };
  assert.deepEqual(await resolve(f.query), f.binding);
  assert.deepEqual(pool.calls.find(x => x.sql.includes("resolver-batch"))!.values,
    [salesDetailId(1), "synthetic-sales-detail", salesDetailHash]);
  assert.deepEqual(pool.calls.find(x => x.sql.includes("resolver-sku"))!.values,
    [salesDetailId(1), "SYNTHETIC-OLD-SKU", "SYNTHETIC-CANONICAL-SKU"]);
});

test("sales-detail resolver preserves any pre-COMMIT database failure and returns only a rolled-back clean lease", async () => {
  for (const tag of ["resolver-schema", "resolver-batch", "resolver-header", "resolver-sku", "resolver-check"]) {
    const f = fixture(), pool = new ReadOnlyPool(); pool.failAt = tag;
    await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, f.scope)(f.query), e => e === pool.failure);
    assert.equal(pool.connects, 1);
    assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
    assert.deepEqual(pool.releases, [undefined]);
    assert.ok(!pool.calls.some(x => x.sql === "COMMIT"));
  }
});

test("sales-detail resolver does not retry failed connection acquisition or a BEGIN with uncertain transport outcome", async () => {
  for (const tag of ["connect", "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"]) {
    const f = fixture(), pool = new ReadOnlyPool(); pool.failAt = tag;
    await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, f.scope)(f.query), e => e === pool.failure);
    assert.equal(pool.connects, 1);
    assert.deepEqual(pool.releases, tag === "connect" ? [] : [pool.failure]);
    assert.ok(!pool.calls.some(x => x.sql === "ROLLBACK" || x.sql === "COMMIT"));
  }
});

test("sales-detail resolver discards a lost COMMIT acknowledgment with the original error and never rolls back or retries", async () => {
  const f = fixture(), pool = new ReadOnlyPool(); pool.failAt = "COMMIT";
  await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, f.scope)(f.query), e => e === pool.failure);
  assert.equal(pool.connects, 1);
  assert.equal(pool.calls.at(-1)!.sql, "COMMIT");
  assert.equal(pool.calls.filter(x => x.sql === "COMMIT").length, 1);
  assert.deepEqual(pool.releases, [pool.failure]);
  assert.ok(!pool.calls.some(x => x.sql === "ROLLBACK"));
});

test("sales-detail resolver retains both errors and discards the lease if rollback itself fails", async () => {
  const f = fixture(), pool = new ReadOnlyPool(); pool.failAt = "resolver-check"; pool.failRollback = true;
  await assert.rejects(createPostgresHistorySalesDetailBindingResolver(pool, f.scope)(f.query), error => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [pool.failure, pool.rollbackFailure]);
    return true;
  });
  assert.equal(pool.connects, 1);
  assert.deepEqual(pool.releases, [pool.rollbackFailure]);
  assert.equal(pool.calls.at(-1)!.sql, "ROLLBACK");
  assert.ok(!pool.calls.some(x => x.sql === "COMMIT"));
});

function salesResolverRuntime26(p:ReadOnlyPool,denied=false,booleanProof=false){let proofs=0;return {proofs:()=>proofs,cap:{profile:'EXACT26' as const,contract:'NATIVE_RUNTIME26_V1' as const,async assertReady(client:object,purpose:string){proofs++;assert.equal(client,p.lease);assert.equal(purpose,'IMPORT_STAGE');assert.equal(p.calls.length,0);if(denied)throw Error('NATIVE_RUNTIME26_NOT_READY');if(booleanProof)return true as never;}}};}
test('salesResolver26 admits only actual original live client and exact prefix26, preserving legacy19 rejection and preborrow literal checks',async()=>{
 const f=fixture(),p=new ReadOnlyPool();assert.throws(()=>createPostgresHistorySalesDetailBindingResolver26(p,f.scope,undefined as never),/runtime capability/);assert.equal(p.connects,0);p.rows['resolver-schema']=[{versions:Array.from({length:26},(_,i)=>i+1)}];await assert.rejects(createPostgresHistorySalesDetailBindingResolver(p,f.scope)(f.query));assert.equal(p.calls.some(c=>c.sql.includes('resolver-batch')),false);
 for(const o of [[true,false],[false,true]]){const x=new ReadOnlyPool();await assert.rejects(createPostgresHistorySalesDetailBindingResolver26(x,f.scope,salesResolverRuntime26(x,o[0],o[1]).cap)(f.query));assert.equal(x.calls.length,0);assert.ok(x.releases[0]);}
 for(const length of [19,27]){const x=new ReadOnlyPool();x.rows['resolver-schema']=[{versions:Array.from({length},(_,i)=>i+1)}];await assert.rejects(createPostgresHistorySalesDetailBindingResolver26(x,f.scope,salesResolverRuntime26(x).cap)(f.query));assert.equal(x.calls.some(c=>c.sql.includes('resolver-batch')),false);}
 const malformed=new ReadOnlyPool();await assert.rejects(createPostgresHistorySalesDetailBindingResolver26(malformed,f.scope,salesResolverRuntime26(malformed).cap)({...f.query,sourceKey:'OTHER'}));assert.equal(malformed.connects,0);
});
test('salesResolver26 retains exact complete same-batch proofs in read-only snapshot and discards uncertain COMMIT',async()=>{
 const f=fixture(),p=new ReadOnlyPool();p.rows['resolver-schema']=[{versions:Array.from({length:26},(_,i)=>i+1)}];const r=salesResolverRuntime26(p),resolved=await createPostgresHistorySalesDetailBindingResolver26(p,f.scope,r.cap)(f.query);assert.deepEqual(resolved,f.binding);assert.equal(r.proofs(),1);assert.equal(p.calls[0]!.sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(p.calls.at(-1)!.sql,'COMMIT');
 const missing=new ReadOnlyPool();missing.rows['resolver-schema']=p.rows['resolver-schema']!;missing.rows['resolver-header']=[];await assert.rejects(createPostgresHistorySalesDetailBindingResolver26(missing,f.scope,salesResolverRuntime26(missing).cap)(f.query));assert.equal(missing.calls.at(-1)!.sql,'ROLLBACK');
 const lost=new ReadOnlyPool();lost.rows['resolver-schema']=p.rows['resolver-schema']!;lost.failAt='COMMIT';await assert.rejects(createPostgresHistorySalesDetailBindingResolver26(lost,f.scope,salesResolverRuntime26(lost).cap)(f.query),e=>e===lost.failure);assert.equal(lost.connects,1);assert.equal(lost.calls.some(c=>c.sql==='ROLLBACK'),false);assert.ok(lost.releases[0]);
});
