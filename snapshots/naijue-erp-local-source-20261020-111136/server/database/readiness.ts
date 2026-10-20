import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {PoolClient} from 'pg';
import {databaseIdentifier as ident, type DatabaseConfig} from './config.js';
import {identityRecord, identityAssertionSql} from './identity.js';
import {DataAccessError} from './access-errors.js';

/** Read version resources without importing the maintenance/DDL execution modules. */
function expectedVersions(): readonly {position: number; id: string; checksum: string}[] {
  const load = (name: string): string => readFileSync(new URL('./sql/' + name, import.meta.url), 'utf8');
  const hash = (names: readonly string[]): string => createHash('sha256').update(JSON.stringify(names.map(load))).digest('hex');
  return Object.freeze([
    {position: 1, id: '0001_structural_baseline', checksum: hash(['0001-manifest.json','0001-source.sql','0001-runtime.sql','0001-auth.sql','0001-link-layers.sql'])},
    {position: 2, id: '0002_access_and_history', checksum: hash(['0002-access-and-history.sql'])},
    {position: 3, id: '0003_master_data', checksum: hash(['0003-master-data.sql'])},
    {position: 4, id: '0004_transaction_core', checksum: hash(['0004-transaction-core.sql'])},
    {position: 5, id: '0005_inventory_correction', checksum: hash(['0005-inventory-correction.sql'])},
    {position: 6, id: '0006_reference_import', checksum: hash(['0006-reference-import.sql'])},
    {position: 7, id: '0007_user_preferences', checksum: hash(['0007-user-preferences.sql'])},
    {position: 8, id: '0008_history_inventory', checksum: hash(['0008-history-inventory.sql'])},
    {position: 9, id: '0009_document_hall_visibility', checksum: hash(['0009-document-hall-visibility.sql'])},
    {position: 10, id: '0010_transfer_creation_snapshot', checksum: hash(['0010-transfer-creation-snapshot.sql'])},
    {position: 11, id: '0011_history_mapping_storage', checksum: hash(['0011-history-mapping-storage.sql'])},
    {position: 12, id: '0012_current_export_inventory', checksum: hash(['0012-current-export-inventory.sql'])},
  ]);
}

export function readinessCheck(config: DatabaseConfig): (client: PoolClient) => Promise<void> {
  const versions = expectedVersions(); const control = ident(config.schemas.control);
  // Identifiers come only from validated configuration; data values use protocol parameters.
  return async client => {
    await client.query(identityAssertionSql(config, 'app'));
    const result = await client.query<{ready: boolean}>({text: `SELECT
      current_user = $1 AND current_database() = $2
      AND (SELECT identity FROM ${control}.environment_identity WHERE singleton) = $3::jsonb
      AND (SELECT jsonb_agg(jsonb_build_object('position',position,'id',id,'checksum',checksum) ORDER BY position) FROM ${control}.schema_version) = $4::jsonb
      AND NOT EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=$5 AND t.relkind IN ('r','p','v','m') AND
          (has_table_privilege(session_user,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR has_any_column_privilege(session_user,t.oid,'INSERT,UPDATE')))
      AND NOT EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=$5 AND t.relkind='S' AND has_sequence_privilege(session_user,t.oid,'USAGE,UPDATE'))
      AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=$5 AND has_function_privilege(session_user,p.oid,'EXECUTE'))
      AND NOT EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname = ANY($6::text[]) AND t.relname IN ('environment_identity','schema_version','revision','version_history','posting','movement','employee_account_audit',
          'inventory_opening_cell','inventory_opening_delta_checkpoint','inventory_opening_prior_posting','inventory_opening_prior_document','reference_import_batch','reference_import_row','preference_request',
          'inventory_history_run','inventory_history_cell','inventory_history_event','inventory_history_alias','inventory_history_event_leg','inventory_history_change','inventory_history_movement','inventory_history_mapping_chunk',
          'inventory_quantity_identity','inventory_current_export_run','inventory_current_export_chunk','inventory_current_export_cell')
          AND (has_table_privilege(session_user,t.oid,'UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege(session_user,t.oid,'UPDATE')))
      AND NOT EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=$7 AND t.relname='inventory_opening_run'
          AND (has_table_privilege(session_user,t.oid,'UPDATE,DELETE,TRUNCATE')
            OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0 AND a.attname<>'active'
              AND has_column_privilege(session_user,t.oid,a.attname,'UPDATE'))
            OR NOT has_column_privilege(session_user,t.oid,'active','UPDATE')))
      AS ready`, values: [config.roles.app, config.database, JSON.stringify(identityRecord(config)), JSON.stringify(versions), config.schemas.source,
        [config.schemas.control,config.schemas.runtime,config.schemas.auth],config.schemas.runtime]});
    if (result.rows[0]?.ready !== true) throw new DataAccessError('DATABASE_NOT_READY');
  };
}
