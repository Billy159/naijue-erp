/** Candidate decoder for JSONB text only. Not wired into any runtime proof.
 * For genuine PostgreSQL JSONB::text (whose keys are already unique), it rejects
 * all visible non-integer/unsafe numeric values instead of rounding or
 * guessing. Node must expose the original token through reviver context.source;
 * an older runtime or unsupported numeric shape fails closed. Exact source
 * bytes, receipt, catalog, transaction and publication remain unverified. It is
 * not an arbitrary JSON lexer: duplicate keys can be hidden by JSON.parse. */
export function decodeStandard27AuditJson(raw:string):Record<string,unknown> {
 try {
  if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>16*1024*1024) throw Error();
  const parse=JSON.parse as unknown as (text:string, reviver:(key:string,value:unknown,context?:{source?:unknown})=>unknown)=>unknown;
  const parsed=parse(raw,(key,value,context)=>{
   if(['__proto__','constructor','prototype'].includes(key))throw Error();
   if(typeof value==='number') {
    const source=context?.source;
    if(typeof source!=='string'||!/^(-?[1-9][0-9]*|0)$/.test(source)||!Number.isSafeInteger(value)||String(value)!==source)throw Error();
   }
   return value;
  });
  if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed)) throw Error();
  return parsed as Record<string,unknown>;
 } catch { throw Error('STANDARD27_AUDIT_EXACT_DECODE_UNAVAILABLE'); }
}
