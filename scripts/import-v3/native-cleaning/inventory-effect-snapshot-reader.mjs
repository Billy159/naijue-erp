import {readFixedLegacyTableSet} from './reference-snapshot-reader.mjs';

// Reused retained old catalogue SHA256: 1c855bac95459d56f26ef1226cd5c5135e86508fd2fa00f6fd01131f3f865cf2
// Capture evidence, not a current-stock calculation or target posting plan.
export const legacyInventoryEffectTables = Object.freeze([
  {
    "table": "erp_prod_runtime.inventory_delta",
    "keys": [
      "warehouse_id",
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_formal_baseline_activation",
    "keys": [
      "run_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_formal_baseline_cell",
    "keys": [
      "run_id",
      "source_key"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_formal_baseline_chunk",
    "keys": [
      "run_id",
      "kind",
      "ordinal"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_formal_baseline_document",
    "keys": [
      "run_id",
      "document_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_formal_baseline_document_leg",
    "keys": [
      "run_id",
      "document_id",
      "ordinal"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_formal_baseline_movement",
    "keys": [
      "run_id",
      "posting_id",
      "leg_index"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_formal_baseline_run",
    "keys": [
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_formal_baseline_schema",
    "keys": [
      "singleton"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_alias",
    "keys": [
      "run_id",
      "source_number"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_cell",
    "keys": [
      "run_id",
      "warehouse_id",
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_change",
    "keys": [
      "run_id",
      "event_id",
      "ordinal"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_delta",
    "keys": [
      "run_id",
      "warehouse_id",
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_event",
    "keys": [
      "run_id",
      "event_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_event_leg",
    "keys": [
      "run_id",
      "event_id",
      "boundary",
      "contribution_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_mapping_chunk",
    "keys": [
      "run_id",
      "ordinal"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_movement",
    "keys": [
      "run_id",
      "identity",
      "leg_index"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_history_run",
    "keys": [
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_opening_cell",
    "keys": [
      "run_id",
      "warehouse_id",
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_opening_delta_checkpoint",
    "keys": [
      "run_id",
      "warehouse_id",
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_opening_prior_document",
    "keys": [
      "run_id",
      "document_id",
      "revision"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_opening_prior_posting",
    "keys": [
      "run_id",
      "posting_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_opening_run",
    "keys": [
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_quantity_identity",
    "keys": [
      "kind",
      "target_key"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_stock_generation",
    "keys": [
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_stock_member",
    "keys": [
      "generation_id",
      "warehouse_id",
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_stock_rebuild_dirty",
    "keys": [
      "generation_id",
      "warehouse_id",
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_stock_relation",
    "keys": [
      "generation_id",
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.inventory_stock_standard_cell",
    "keys": [
      "generation_id",
      "cell_key",
      "filter_bucket_key"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.movement",
    "keys": [
      "posting_id",
      "line_index",
      "warehouse_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.posting",
    "keys": [
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.standard_sku_relation",
    "keys": [
      "sku_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.standard_sku_relation_dirty",
    "keys": [
      "product_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.standard_sku_relation_state",
    "keys": [
      "singleton"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.version_history",
    "keys": [
      "document_id",
      "version"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.work_event",
    "keys": [
      "document_key",
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_runtime.work_record",
    "keys": [
      "document_key",
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_source.inventory_balance",
    "keys": [
      "variant_id",
      "warehouse_id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_source.inventory_movement",
    "keys": [
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_source.inventory_posting",
    "keys": [
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_source.opening_ledger",
    "keys": [
      "id"
    ],
    "keyKind": "PRIMARY_KEY"
  },
  {
    "table": "erp_prod_source.tplus_inventory_balance_source",
    "keys": [
      "batch_id",
      "source_id"
    ],
    "keyKind": "PRIMARY_KEY"
  }
].map(row => Object.freeze({...row, keys: Object.freeze(row.keys)})));

export function readLegacyInventoryEffectTables(client, {pageRows, onInventory, signal}) {
  return readFixedLegacyTableSet(client, legacyInventoryEffectTables, {pageRows, onReferences: onInventory, signal,
    cursorPrefix: 'cleaning_inventory_effect', progressProperty: 'inventorySnapshotProgress'});
}
