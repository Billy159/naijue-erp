import {databaseIdentifier as ident, type DatabaseConfig} from './config.js';
import {bootstrapAssertionSql, identityRecord} from './identity.js';
import {sqlLiteral as literal} from './sql.js';

/** One explicit, administrative installation. Never called by the HTTP server. */
export function bootstrapSql(config: DatabaseConfig, bootstrapUser: string): string {
  ident(bootstrapUser);
  const c = ident(config.schemas.control);
  const r = config.roles;
  const schemas = config.schemas;
  const owners = [r.source, r.runtime, r.auth, r.control];
  const names = Object.values(r).map(literal).join(',');
  return `BEGIN;
    SELECT pg_advisory_xact_lock(hashtextextended(${literal(config.database + ':t08-bootstrap')},0));
    ${bootstrapAssertionSql(config, bootstrapUser)}
    DO $preflight$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN (${names}))
        OR to_regnamespace(${literal(schemas.control)}) IS NOT NULL
      THEN RAISE EXCEPTION 'T08_EXISTING_ROLE_OR_CONTROL_SCHEMA'; END IF;
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema',${Object.values(schemas).map(literal).join(',')}))
        OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S'))
      THEN RAISE EXCEPTION 'T08_UNEXPECTED_DATABASE_CONTENTS'; END IF;
    END $preflight$;
    ${owners.map(role => `CREATE ROLE ${ident(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;`).join('\n')}
    CREATE ROLE ${ident(r.app)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
    CREATE ROLE ${ident(r.migrator)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
    GRANT ${[r.source, r.runtime, r.auth].map(ident).join(',')} TO ${ident(r.migrator)} WITH INHERIT FALSE, SET TRUE;
    REVOKE ALL ON DATABASE ${ident(config.database)} FROM PUBLIC;
    GRANT CONNECT ON DATABASE ${ident(config.database)} TO ${ident(r.app)},${ident(r.migrator)};
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    ${(['source', 'runtime', 'auth', 'control'] as const).map(layer => `
      CREATE SCHEMA IF NOT EXISTS ${ident(schemas[layer])} AUTHORIZATION ${ident(r[layer])};
      ALTER SCHEMA ${ident(schemas[layer])} OWNER TO ${ident(r[layer])};
      REVOKE ALL ON SCHEMA ${ident(schemas[layer])} FROM PUBLIC;
      DO $ownership$ DECLARE obj record; BEGIN
        FOR obj IN SELECT c.oid,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=${literal(schemas[layer])} AND c.relkind IN ('r','p','v','m')
          ORDER BY c.relname LOOP
          EXECUTE format('ALTER %s %I.%I OWNER TO %I', CASE obj.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
            ${literal(schemas[layer])},obj.relname,${literal(r[layer])});
        END LOOP;
        FOR obj IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${literal(schemas[layer])} AND c.relkind='S' LOOP
          EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO %I',${literal(schemas[layer])},obj.relname,${literal(r[layer])});
        END LOOP;
        FOR obj IN SELECT t.typname,t.typtype FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=${literal(schemas[layer])} AND t.typtype IN ('e','d') LOOP
          EXECUTE format('ALTER %s %I.%I OWNER TO %I',CASE obj.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END,${literal(schemas[layer])},obj.typname,${literal(r[layer])});
        END LOOP;
        FOR obj IN SELECT p.oid::regprocedure fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${literal(schemas[layer])} AND p.prokind='f' LOOP
          EXECUTE format('ALTER FUNCTION %s OWNER TO %I',obj.fn,${literal(r[layer])});
        END LOOP;
      END $ownership$;
    `).join('\n')}
    SET LOCAL ROLE ${ident(r.control)};
    CREATE TABLE ${c}.environment_identity (singleton boolean PRIMARY KEY CHECK(singleton), identity jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE ${c}.schema_version (position integer PRIMARY KEY CHECK(position>0), id text UNIQUE NOT NULL, checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'), applied_at timestamptz NOT NULL DEFAULT now(), applied_by text NOT NULL);
    CREATE FUNCTION ${c}.deny_control_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$ BEGIN RAISE EXCEPTION 'IMMUTABLE_DATABASE_CONTROL'; END $fn$;
    CREATE TRIGGER identity_immutable BEFORE UPDATE OR DELETE ON ${c}.environment_identity FOR EACH ROW EXECUTE FUNCTION ${c}.deny_control_mutation();
    CREATE TRIGGER identity_no_truncate BEFORE TRUNCATE ON ${c}.environment_identity FOR EACH STATEMENT EXECUTE FUNCTION ${c}.deny_control_mutation();
    CREATE TRIGGER version_immutable BEFORE UPDATE OR DELETE ON ${c}.schema_version FOR EACH ROW EXECUTE FUNCTION ${c}.deny_control_mutation();
    CREATE TRIGGER version_no_truncate BEFORE TRUNCATE ON ${c}.schema_version FOR EACH STATEMENT EXECUTE FUNCTION ${c}.deny_control_mutation();
    INSERT INTO ${c}.environment_identity(singleton,identity) VALUES(true,${literal(JSON.stringify(identityRecord(config)))}::jsonb);
    RESET ROLE;
    CREATE FUNCTION ${c}.cluster_identifier() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT system_identifier::text FROM pg_catalog.pg_control_system()';
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${c} FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION ${c}.cluster_identifier() TO ${ident(r.app)},${ident(r.migrator)};
    GRANT USAGE ON SCHEMA ${c} TO ${ident(r.app)},${ident(r.migrator)};
    GRANT SELECT ON ${c}.environment_identity,${c}.schema_version TO ${ident(r.app)},${ident(r.migrator)};
    GRANT INSERT ON ${c}.schema_version TO ${ident(r.migrator)};
    ${[r.app,r.migrator].map(role => `ALTER ROLE ${ident(role)} IN DATABASE ${ident(config.database)} SET search_path=pg_catalog;
      ALTER ROLE ${ident(role)} IN DATABASE ${ident(config.database)} SET timezone='UTC';
      ALTER ROLE ${ident(role)} IN DATABASE ${ident(config.database)} SET statement_timeout='60s';
      ALTER ROLE ${ident(role)} IN DATABASE ${ident(config.database)} SET lock_timeout='10s';`).join('\n')}
    COMMIT;
  `;
}
