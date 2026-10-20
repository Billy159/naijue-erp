import {isAbsolute} from 'node:path';
import {readDatabaseConfig, assertIsolatedTarget, databaseIdentifier} from './config.js';
import {maintenanceSql} from './psql.js';
import {bootstrapAssertionSql, identityAssertionSql} from './identity.js';
import {bootstrapSql} from './bootstrap.js';
import {loadMigrations, migrationSql, inspectSql, baselineAssertionSql, readBaselineManifest} from './migrations.js';
import {sqlLiteral} from './sql.js';
import {assertProductionAdmission, executeProductionDdl, executeProductionInspection, type ProductionOperation} from './production-admission.js';

/** Explicit maintenance entrypoint, also shipped in the verified backend package. */
export async function runDatabaseCommand(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const command = args[0];
  if (!command || !['bootstrap','migrate','inspect','plan'].includes(command) || args.length !== 1) throw new Error('USE_DATABASE_BOOTSTRAP_MIGRATE_INSPECT_OR_PLAN');
  const config = readDatabaseConfig(env);
  const admission = config.productionAdmission;
  const operation = ('database-' + command) as ProductionOperation;
  const assertTarget = (): void => {
    if (admission) assertProductionAdmission(config,admission,operation);
    else assertIsolatedTarget(config);
  };
  assertTarget();
  const migrations = loadMigrations(config);
  const target = {host: config.host, port: config.port, database: config.database, environment: config.environment,
    instanceId: config.instanceId, clusterId: config.clusterId, schemas: config.schemas, roles: config.roles};
  if (command === 'plan') {
    console.log(JSON.stringify({target, migrations: migrations.map(({id,checksum}) => ({id,checksum})), connections: 0}));
    return;
  }
  if (admission) {
    if (command === 'bootstrap') {
      const user = env['POSTGRES_BOOTSTRAP_USER'];
      if (!user) throw new Error('POSTGRES_BOOTSTRAP_USER_REQUIRED');
      databaseIdentifier(user);
      let alreadyBootstrapped = false;
      await executeProductionDdl(config,admission,{operation:'database-bootstrap',bootstrapUser:user,script:state => {
        alreadyBootstrapped = state.controlSchemaExists;
        if (state.controlSchemaExists) return 'BEGIN; COMMIT;';
        return bootstrapSql(config,user).replace(/^BEGIN;/,() => `BEGIN; ${baselineAssertionSql(config,readBaselineManifest(),true)}`);
      }});
      console.log(JSON.stringify(alreadyBootstrapped ? {target,alreadyBootstrapped:true} : {target,bootstrapped:true,accountSeeds:0}));
    } else if (command === 'migrate') {
      const result = JSON.parse(await executeProductionDdl(config,admission,{operation:'database-migrate',script:migrationSql(config,migrations)})) as {readonly applied:readonly string[];readonly versions:unknown};
      const inspection: unknown = JSON.parse(await executeProductionInspection(config,admission,inspectSql(config)));
      console.log(JSON.stringify({target,...result,inspection}));
    } else console.log(await executeProductionInspection(config,admission,inspectSql(config)));
    return;
  }
  const binary = env['PSQL_BIN'];
  if (!binary || !isAbsolute(binary)) throw new Error('ABSOLUTE_PSQL_BINARY_REQUIRED');
  const sql = (user: string, statement: string): Promise<string> => {assertTarget(); return maintenanceSql(config,user,statement,binary);};
  if (command === 'bootstrap') {
    const user = env['POSTGRES_BOOTSTRAP_USER'];
    if (!user) throw new Error('POSTGRES_BOOTSTRAP_USER_REQUIRED');
    databaseIdentifier(user);
    if (Object.values(config.roles).includes(user)) throw new Error('SEPARATE_BOOTSTRAP_USER_REQUIRED');
    const preflight = JSON.parse(await sql(user,`BEGIN READ ONLY; ${bootstrapAssertionSql(config,user)}
      SELECT jsonb_build_object('exists',to_regnamespace(${sqlLiteral(config.schemas.control)}) IS NOT NULL); ROLLBACK;`)) as {exists: boolean};
    if (preflight.exists) {
      await sql(config.roles.app,`BEGIN READ ONLY; ${identityAssertionSql(config,'app')} ROLLBACK;`);
      console.log(JSON.stringify({target,alreadyBootstrapped:true}));
    } else {
      await sql(user,`BEGIN READ ONLY; ${bootstrapAssertionSql(config,user)} ${baselineAssertionSql(config,readBaselineManifest(),true)} ROLLBACK;`);
      await sql(user,bootstrapSql(config,user));
      console.log(JSON.stringify({target,bootstrapped:true,accountSeeds:0}));
    }
  } else if (command === 'migrate') {
    const result = JSON.parse(await sql(config.roles.migrator,migrationSql(config,migrations))) as {readonly applied: readonly string[]; readonly versions: unknown};
    const inspection: unknown = JSON.parse(await sql(config.roles.app,inspectSql(config)));
    console.log(JSON.stringify({target,...result,inspection}));
  } else console.log(await sql(config.roles.app,inspectSql(config)));
}
