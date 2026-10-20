import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {databaseIdentifier as ident, type DatabaseConfig} from './config.js';
import {identityAssertionSql} from './identity.js';
import {schemaShapeSql, legacyAuthObjects} from './catalog.js';
import {sqlLiteral as literal, sqlBlock} from './sql.js';

type Layer = 'source' | 'runtime' | 'auth';
interface Relation {readonly name: string; readonly kind: string}
interface Shape {readonly relations: readonly Relation[]; readonly functions: readonly string[]; readonly enums: readonly unknown[]}
export interface Migration {readonly id: string; readonly checksum: string; readonly sql: string}
const layers: readonly Layer[] = ['source', 'runtime', 'auth'];
const load = (name: string): string => readFileSync(new URL('./sql/' + name, import.meta.url), 'utf8');

export function renderSql(config: DatabaseConfig, template: string): string {
  const tokens: Record<string, string> = {
    __SOURCE__: ident(config.schemas.source), __RUNTIME__: ident(config.schemas.runtime), __AUTH__: ident(config.schemas.auth),
    __SOURCE_OWNER__: ident(config.roles.source), __RUNTIME_OWNER__: ident(config.roles.runtime), __AUTH_OWNER__: ident(config.roles.auth),
    __APP__: ident(config.roles.app), __RUNTIME_NAME__: config.schemas.runtime, __APP_NAME__: config.roles.app,
  };
  return template.replace(/__[A-Z_]+__/g, token => {
    const value = tokens[token]; if (value === undefined) throw new Error('UNKNOWN_MIGRATION_TOKEN'); return value;
  });
}
function normalisedShapeSql(config: DatabaseConfig, layer: Layer): string {
  let sql = `(${schemaShapeSql(config.schemas[layer], layer === 'runtime' ? legacyAuthObjects : [])})::text`;
  for (const name of layers) sql = `replace(${sql},${literal(config.schemas[name] + '.')},${literal('__' + name.toUpperCase() + '__.')})`;
  return `(${sql})::jsonb`;
}

export function baselineAssertionSql(config: DatabaseConfig, manifest: Record<Layer, Shape>, allowEmpty = false): string {
  return layers.map(layer => `DO $shape$ DECLARE actual jsonb; BEGIN
    SELECT ${normalisedShapeSql(config,layer)} INTO actual;
    IF ${allowEmpty ? "actual <> '{\"relations\":[],\"functions\":[],\"enums\":[]}'::jsonb AND " : ''}
      actual IS DISTINCT FROM ${literal(JSON.stringify(manifest[layer]))}::jsonb
    THEN RAISE EXCEPTION 'T08_UNSUPPORTED_${layer.toUpperCase()}_STRUCTURE'; END IF;
  END $shape$;`).join('\n');
}
export function readBaselineManifest(): Record<Layer, Shape> { return JSON.parse(load('0001-manifest.json')) as Record<Layer, Shape>; }

export function loadMigrations(config: DatabaseConfig): readonly Migration[] {
  const manifestText = load('0001-manifest.json');
  const manifest = readBaselineManifest();
  const templates = layers.map(layer => load('0001-' + layer + '.sql'));
  const linkTemplate = load('0001-link-layers.sql');
  const baselineSql = layers.map((layer, index) => `
    SET LOCAL ROLE ${ident(config.roles[layer])};
    DO $baseline$ DECLARE actual jsonb; BEGIN
      SELECT ${normalisedShapeSql(config,layer)} INTO actual;
      IF actual = '{"relations":[],"functions":[],"enums":[]}'::jsonb THEN
        EXECUTE ${sqlBlock(renderSql(config,templates[index] ?? ''))};
      END IF;
    END $baseline$;
    ${layer === 'source' ? renderSql(config,linkTemplate) : ''}
    RESET ROLE;
  `).join('\n') + baselineAssertionSql(config,manifest);
  const accessTemplate = load('0002-access-and-history.sql');
  const masterDataTemplate = load('0003-master-data.sql');
  const transactionTemplate = load('0004-transaction-core.sql');
  const correctionTemplate = load('0005-inventory-correction.sql');
  const referenceImportTemplate = load('0006-reference-import.sql');
  const preferenceTemplate = load('0007-user-preferences.sql');
  const historyInventoryTemplate = load('0008-history-inventory.sql');
  const documentHallVisibilityTemplate = load('0009-document-hall-visibility.sql');
  const transferCreationSnapshotTemplate = load('0010-transfer-creation-snapshot.sql');
  const historyMappingStorageTemplate = load('0011-history-mapping-storage.sql');
  const currentExportInventoryTemplate = load('0012-current-export-inventory.sql');
  const hash = (values: readonly string[]): string => createHash('sha256').update(JSON.stringify(values)).digest('hex');
  return [
    {id: '0001_structural_baseline', checksum: hash([manifestText, ...templates, linkTemplate]), sql: baselineSql},
    {id: '0002_access_and_history', checksum: hash([accessTemplate]), sql: renderSql(config,accessTemplate)},
    {id: '0003_master_data', checksum: hash([masterDataTemplate]), sql: renderSql(config,masterDataTemplate)},
    {id: '0004_transaction_core', checksum: hash([transactionTemplate]), sql: renderSql(config,transactionTemplate)},
    {id: '0005_inventory_correction', checksum: hash([correctionTemplate]), sql: renderSql(config,correctionTemplate)},
    {id: '0006_reference_import', checksum: hash([referenceImportTemplate]), sql: renderSql(config,referenceImportTemplate)},
    {id: '0007_user_preferences', checksum: hash([preferenceTemplate]), sql: renderSql(config,preferenceTemplate)},
    {id: '0008_history_inventory', checksum: hash([historyInventoryTemplate]), sql: renderSql(config,historyInventoryTemplate)},
    {id: '0009_document_hall_visibility', checksum: hash([documentHallVisibilityTemplate]), sql: renderSql(config,documentHallVisibilityTemplate)},
    {id: '0010_transfer_creation_snapshot', checksum: hash([transferCreationSnapshotTemplate]), sql: renderSql(config,transferCreationSnapshotTemplate)},
    {id: '0011_history_mapping_storage', checksum: hash([historyMappingStorageTemplate]), sql: renderSql(config,historyMappingStorageTemplate)},
    {id: '0012_current_export_inventory', checksum: hash([currentExportInventoryTemplate]), sql: renderSql(config,currentExportInventoryTemplate)},
  ];
}

/** Every upgrade and its journal entries commit together on one maintenance connection. */
export function migrationSql(config: DatabaseConfig, migrations: readonly Migration[] = loadMigrations(config)): string {
  const c = ident(config.schemas.control);
  const expected = migrations.map((m,index) => `(${index + 1},${literal(m.id)},${literal(m.checksum)})`).join(',');
  return `BEGIN;
    SELECT pg_advisory_xact_lock(hashtextextended(${literal(config.instanceId + ':schema-migrations')},0));
    ${identityAssertionSql(config,'migrator')}
    DO $journal$ BEGIN
      IF EXISTS (SELECT 1 FROM ${c}.schema_version v LEFT JOIN (VALUES ${expected}) AS e(position,id,checksum)
        ON v.position=e.position AND v.id=e.id AND v.checksum=e.checksum WHERE e.position IS NULL)
        OR (SELECT count(*) FROM ${c}.schema_version) <> (SELECT coalesce(max(position),0) FROM ${c}.schema_version)
      THEN RAISE EXCEPTION 'T08_MIGRATION_JOURNAL_MISMATCH'; END IF;
    END $journal$;
    ${migrations.map((m,index) => `DO $apply$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM ${c}.schema_version WHERE position=${index + 1}) THEN
        EXECUTE ${sqlBlock(m.sql)};
        INSERT INTO ${c}.schema_version(position,id,checksum,applied_by) VALUES(${index + 1},${literal(m.id)},${literal(m.checksum)},session_user);
      END IF;
    END $apply$;`).join('\n')}
    SELECT jsonb_build_object('applied',coalesce(jsonb_agg(id ORDER BY position) FILTER (WHERE applied_at=transaction_timestamp()),'[]'::jsonb),
      'versions',coalesce(jsonb_agg(jsonb_build_object('position',position,'id',id,'checksum',checksum,'appliedBy',applied_by) ORDER BY position),'[]'::jsonb)) FROM ${c}.schema_version;
    COMMIT;`;
}

export function inspectSql(config: DatabaseConfig): string {
  const c = ident(config.schemas.control);
  const expected = loadMigrations(config).map(({id,checksum}) => ({id,checksum}));
  return `BEGIN READ ONLY;
    ${identityAssertionSql(config,'app')}
    DO $permissions$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=${literal(config.schemas.source)} AND t.relkind IN ('r','p','v','m')
        AND (has_table_privilege(session_user,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
          OR has_any_column_privilege(session_user,t.oid,'INSERT,UPDATE')))
        OR EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
          WHERE n.nspname=${literal(config.schemas.source)} AND t.relkind='S' AND has_sequence_privilege(session_user,t.oid,'USAGE,UPDATE'))
        OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname=${literal(config.schemas.source)} AND has_function_privilege(session_user,p.oid,'EXECUTE'))
      THEN RAISE EXCEPTION 'T08_SOURCE_WRITE_PRIVILEGE'; END IF;
      IF EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname IN (${[config.schemas.control,config.schemas.runtime,config.schemas.auth].map(literal).join(',')})
        AND t.relname IN ('environment_identity','schema_version','revision','version_history','posting','movement','employee_account_audit',
          'inventory_opening_cell','inventory_opening_delta_checkpoint','inventory_opening_prior_posting','inventory_opening_prior_document','reference_import_batch','reference_import_row','preference_request',
          'inventory_history_run','inventory_history_cell','inventory_history_event','inventory_history_alias','inventory_history_event_leg','inventory_history_change','inventory_history_movement','inventory_history_mapping_chunk',
          'inventory_quantity_identity','inventory_current_export_run','inventory_current_export_chunk','inventory_current_export_cell')
        AND (has_table_privilege(session_user,t.oid,'UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege(session_user,t.oid,'UPDATE')))
      THEN RAISE EXCEPTION 'T08_HISTORY_WRITE_PRIVILEGE'; END IF;
      IF EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=${literal(config.schemas.runtime)} AND t.relname='inventory_opening_run'
        AND (has_table_privilege(session_user,t.oid,'UPDATE,DELETE,TRUNCATE')
          OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0 AND a.attname<>'active'
            AND has_column_privilege(session_user,t.oid,a.attname,'UPDATE'))
          OR NOT has_column_privilege(session_user,t.oid,'active','UPDATE')))
      THEN RAISE EXCEPTION 'T08_OPENING_RUN_PRIVILEGE'; END IF;
      IF (SELECT jsonb_agg(jsonb_build_object('id',id,'checksum',checksum) ORDER BY position) FROM ${c}.schema_version)
        IS DISTINCT FROM ${literal(JSON.stringify(expected))}::jsonb
      THEN RAISE EXCEPTION 'T08_PENDING_MIGRATIONS'; END IF;
    END $permissions$;
    SELECT jsonb_build_object('identity',identity,'login',session_user,'superuser',false,'sourceReadOnly',true,
      'versions',(SELECT jsonb_agg(jsonb_build_object('position',position,'id',id,'checksum',checksum) ORDER BY position) FROM ${c}.schema_version))
      FROM ${c}.environment_identity;
    ROLLBACK;`;
}
