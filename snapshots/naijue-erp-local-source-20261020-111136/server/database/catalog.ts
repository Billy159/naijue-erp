import {sqlLiteral} from './sql.js';

/** Structural adoption checks exclude ownership/ACL and contain no row values. */
export function schemaShapeSql(schema: string, excluded: readonly string[] = []): string {
  const filter = excluded.length ? `AND c.relname NOT IN (${excluded.map(sqlLiteral).join(',')})` : '';
  return `SELECT jsonb_build_object('relations', (SELECT coalesce(jsonb_agg(shape ORDER BY name), '[]'::jsonb) FROM (
    SELECT c.relname name, jsonb_build_object('name', c.relname, 'kind', c.relkind,
      'columns', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum),'[]'::jsonb)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
      'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid,true)) ORDER BY k.conname),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=c.oid),
      'indexes', (SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ci.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),
      'view', CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END,
      'sequence', (SELECT jsonb_build_object('type',format_type(s.seqtypid,NULL),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle) FROM pg_sequence s WHERE s.seqrelid=c.oid)
    ) shape FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=${sqlLiteral(schema)} AND c.relkind IN ('r','p','v','m','S') ${filter}
  ) shapes), 'functions', (SELECT coalesce(jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.oid::regprocedure::text),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${sqlLiteral(schema)} AND p.prokind IN ('f','p')),
    'enums', (SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.typname,'values',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)) ORDER BY t.typname),'[]'::jsonb)
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=${sqlLiteral(schema)} AND t.typtype='e'))`;
}

export const legacyAuthObjects = ['employee_login', 'employee_session', 'employee_account_audit', 'employee_account_audit_id_seq'] as const;
