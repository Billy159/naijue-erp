import {databaseIdentifier as ident, type DatabaseConfig} from './config.js';
import {sqlLiteral as literal} from './sql.js';

export function identityRecord(config: DatabaseConfig): Record<string, unknown> {
  return {database: config.database, environment: config.environment, instanceId: config.instanceId,
    clusterId: config.clusterId, schemas: config.schemas, roles: config.roles};
}

/** Use before any application data access, on the same checked connection. */
export function identityAssertionSql(config: DatabaseConfig, login: 'app' | 'migrator'): string {
  const control = ident(config.schemas.control);
  const user = config.roles[login];
  return `DO $identity$
  BEGIN
    IF current_database() <> ${literal(config.database)} OR session_user <> ${literal(user)}
      OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
      OR (SELECT identity FROM ${control}.environment_identity WHERE singleton) IS DISTINCT FROM ${literal(JSON.stringify(identityRecord(config)))}::jsonb
      OR ${control}.cluster_identifier() <> ${literal(config.clusterId)}
    THEN RAISE EXCEPTION 'T08_DATABASE_IDENTITY_MISMATCH'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolcanlogin AND NOT rolsuper
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
      OR EXISTS (SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=(SELECT oid FROM pg_roles WHERE rolname=session_user))
    THEN RAISE EXCEPTION 'T08_UNSAFE_LOGIN_ROLE'; END IF;
    ${login === 'app' ? `IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user))
      OR has_database_privilege(session_user,current_database(),'CREATE') OR has_database_privilege(session_user,current_database(),'TEMP')
      OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND (nspowner=(SELECT oid FROM pg_roles WHERE rolname=session_user) OR has_schema_privilege(session_user,oid,'CREATE')))
      OR EXISTS (SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=session_user))
      THEN RAISE EXCEPTION 'T08_UNSAFE_APPLICATION_PRIVILEGES'; END IF;` : ''}
  END $identity$;`;
}

export function bootstrapAssertionSql(config: DatabaseConfig, bootstrapUser: string): string {
  return `DO $bootstrap$
    BEGIN
      IF current_database() <> ${literal(config.database)} OR session_user <> ${literal(bootstrapUser)}
        OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
        OR (SELECT system_identifier::text FROM pg_control_system()) <> ${literal(config.clusterId)}
      THEN RAISE EXCEPTION 'T08_DATABASE_IDENTITY_MISMATCH'; END IF;
      IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RAISE EXCEPTION 'T08_BOOTSTRAP_ADMIN_REQUIRED'; END IF;
    END $bootstrap$;`;
}
