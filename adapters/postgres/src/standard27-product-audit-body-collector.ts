import { types } from 'node:util';
import { entityId } from '../../../packages/domain/src/values.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
type Client={query(sql:string,values?:unknown[]):Promise<{rows:readonly Record<string,unknown>[]}>};
// Copy driver-owned scalars before the next await. Query doubles are not
// authority, but getters, proxies and later buffer reuse must not rewrite the
// provenance observation after it has passed validation.
function snapshotRows(result: unknown): readonly Record<string, unknown>[] {
 const fail = () => { throw new TypeError('Own bounded audit observation required'); };
 if (!result || typeof result !== 'object' || types.isProxy(result)) fail();
 const descriptor = Object.getOwnPropertyDescriptor(result, 'rows');
 if (!descriptor || !('value' in descriptor)) return fail();
 const rows: unknown = descriptor.value;
 if (!Array.isArray(rows) || types.isProxy(rows) || Object.getPrototypeOf(rows) !== Array.prototype || rows.length > 1024
   || Reflect.ownKeys(rows).length !== rows.length + 1) return fail();
 let bytes = 0;
 return Object.freeze(Array.from({ length: rows.length }, (_, index) => {
  const entry = Object.getOwnPropertyDescriptor(rows, String(index));
  if (!entry?.enumerable || !('value' in entry)) return fail();
  const row: unknown = entry.value;
  if (!row || typeof row !== 'object' || types.isProxy(row) || Object.getPrototypeOf(row) !== Object.prototype) return fail();
  const keys = Reflect.ownKeys(row);
  if (keys.length > 22) return fail();
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
   if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) return fail();
   const field = Object.getOwnPropertyDescriptor(row, key);
   if (!field?.enumerable || !('value' in field)) return fail();
   const value: unknown = field.value;
   if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isSafeInteger(value))) return fail();
   bytes += Buffer.byteLength(key) + (typeof value === 'string' ? Buffer.byteLength(value) : 8);
   if (bytes > 17 * 1024 * 1024) return fail();
   copy[key] = value;
  }
  return Object.freeze(copy);
 }));
}

/** Single-statement, bounded same-client audit-body observation only. It is not
 * connected to product runtime and does not prove metadata, publication,
 * receipt contents, the absence of phantoms or caller authority. JSONB bodies
 * are returned as database text, without JavaScript numeric parsing; a future
 * exact decoder must be reviewed before these values enter any model. The SQL has
 * not been admitted on a live catalog. Never issue write authority from it. */
export async function collectStandard27ProductAuditBodies(client:Client,productId:string,assertSameActiveClient:(client:Client)=>Promise<void>):Promise<{verification:'UNVERIFIED_CANDIDATE_ONLY';rows:readonly Record<string,unknown>[]}> {
 entityId('product',productId);if(!client||typeof client.query!=='function'||typeof assertSameActiveClient!=='function')throw TypeError('Original transaction client required');
 const before:unknown=assertSameActiveClient(client);if(!(before instanceof Promise)||await before!==undefined)throw TypeError('Original-client guard must resolve without a substitute');
 const result=await client.query(`/* std27-product:audit-bodies */ WITH audits AS MATERIALIZED (
   SELECT a.id,a.operation_id,a.object_type,a.object_id,a.action,a.old_version,a.new_version,a.actor_account_id,
     to_char(a.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
     a.before_values,a.after_values
   FROM naijue_erp.audit_change a WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid
   ORDER BY a.new_version,a.id LIMIT $2 FOR SHARE OF a
 ), receipts AS MATERIALIZED (
   SELECT r.id AS receipt_id,r.status AS receipt_status,r.target_type,r.target_id,r.action AS receipt_action,
     r.actor_account_id AS receipt_actor,r.request_hash,
     to_char(r.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_at
   FROM naijue_erp.operation_receipt r WHERE r.target_type='PRODUCT' AND r.target_id=$1::uuid
   ORDER BY r.id LIMIT $2 FOR SHARE OF r
 ), paired AS (
   SELECT a.*,r.* FROM audits a FULL OUTER JOIN receipts r ON r.receipt_id=a.operation_id
 ), sized AS (
   SELECT *,count(*) OVER () AS total_rows,sum(octet_length(coalesce(before_values::text,''))+octet_length(coalesce(after_values::text,''))) OVER () AS total_bytes FROM paired
 )
 SELECT id,operation_id,object_type,object_id,action,old_version,new_version,actor_account_id,occurred_at,
   receipt_id,receipt_status,target_type,target_id,receipt_action,receipt_actor,request_hash,completed_at,
   total_rows::text,total_bytes::text,
   CASE WHEN total_rows<=1024 AND total_bytes<=16777216 THEN before_values::text ELSE NULL END AS before_values,
   CASE WHEN total_rows<=1024 AND total_bytes<=16777216 THEN after_values::text ELSE NULL END AS after_values
 FROM sized ORDER BY new_version,id`,[productId,1025]);
 const rows = snapshotRows(result);
 const after:unknown=assertSameActiveClient(client);if(!(after instanceof Promise)||await after!==undefined)throw TypeError('Original-client guard must resolve without a substitute');
 requireDomain(Array.isArray(rows)&&rows.length<=1024,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Bounded audit body rows required');
 const auditIds = new Set<string>(), operationIds = new Set<string>();
 let bodyBytes = 0;
 for(const row of rows){
  requireDomain(typeof row.id === 'string' && row.id.length > 0 && !auditIds.has(row.id)
   && typeof row.operation_id === 'string' && row.operation_id.length > 0 && !operationIds.has(row.operation_id),
   'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Unique audit and operation identities required');
  auditIds.add(row.id as string); operationIds.add(row.operation_id as string);
  requireDomain(typeof row.total_rows==='string'&&/^(0|[1-9][0-9]*)$/.test(row.total_rows)&&BigInt(row.total_rows)===BigInt(rows.length)
   &&typeof row.total_bytes==='string'&&row.total_bytes===rows[0]!.total_bytes&&/^(0|[1-9][0-9]*)$/.test(row.total_bytes)&&BigInt(row.total_bytes)<=16777216n
   &&typeof row.operation_id==='string'&&row.receipt_id===row.operation_id&&row.object_type==='PRODUCT'&&row.target_type==='PRODUCT'&&row.object_id===productId&&row.target_id===productId
   &&row.receipt_status==='COMMITTED'&&typeof row.action==='string'&&row.action===row.receipt_action&&typeof row.actor_account_id==='string'&&row.actor_account_id===row.receipt_actor
   &&typeof row.request_hash==='string'&&/^[a-f0-9]{64}$/.test(row.request_hash)&&typeof row.occurred_at==='string'&&row.occurred_at===row.completed_at
   &&typeof row.after_values==='string' && row.after_values.length>0
   &&(row.before_values===null || (typeof row.before_values==='string' && row.before_values.length>0)),
   'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Incomplete or oversized audit and receipt observation');
  bodyBytes += Buffer.byteLength(row.after_values as string) + (row.before_values === null ? 0 : Buffer.byteLength(row.before_values as string));
  requireDomain(bodyBytes <= 16777216, 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Bounded exact audit bytes required');
 }
 requireDomain(rows.length === 0 || String(bodyBytes) === rows[0]!.total_bytes, 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Observed body bytes differ from aggregate');
 return Object.freeze({verification:'UNVERIFIED_CANDIDATE_ONLY',rows});
}
