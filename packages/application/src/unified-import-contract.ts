import {historicalSettlementRetentionMatches,historicalSettlementRetentionMatchesSource} from './unified-historical-settlement-retention.ts';
import type {HistoricalSettlementRetentionApproval} from './unified-historical-settlement-retention.ts';
import {validateHistoricalSalesHallEvidence,historicalSalesHallApprovalMatchesSource} from "./unified-historical-sales-hall-evidence.ts";
import type {HistoricalSalesHallApproval} from "./unified-historical-sales-hall-evidence.ts";
import {reconcileSourceOccurrenceEvidence} from "./unified-import-source-reconciliation.ts";
import type {SourceOccurrenceEvidence} from "./unified-import-source-reconciliation.ts";
import {currentEffectiveAlignmentMatchesManifest} from "./unified-current-effective-alignment.ts";
import type {CurrentEffectiveAlignmentEvidence} from "./unified-current-effective-alignment.ts";
import {explicitZeroApproved,explicitZeroApprovalCount,explicitZeroScopeCounts,explicitZeroScopeRecordValid,explicitZeroScopeMembersMatch} from './unified-explicit-zero-approval.ts';
import type {ExplicitZeroApproval, ExplicitZeroEvidence} from './unified-explicit-zero-approval.ts';
import { historicalStaffNullHallApproved, historicalStaffHallApprovalMatchesSource } from "./unified-historical-staff-hall-approval.ts";
import type { HistoricalStaffHallApproval } from "./unified-historical-staff-hall-approval.ts";
import {validateZeroAmountArchive} from './unified-zero-amount-archive.ts';
import { parseStableSourceKey, validateStableIdentityBinding } from "./unified-import-stable-identity.ts";
import { isRetainedHistoricalSale, isRetainedHistoricalSalesDocument } from "./unified-import-historical-sales.ts";
import {historicalLineAmountDifference, historicalLineAmountEvidenceMatchesSource} from "./unified-historical-line-amount-evidence.ts";
import type {HistoricalLineAmountEvidence, HistoricalLineAmountDifference} from "./unified-historical-line-amount-evidence.ts";
import { validateCalendarDate } from "./calendar-date.ts";
export { validateCalendarDate } from "./calendar-date.ts";
import { createHash } from "node:crypto";
import { stableImportId } from "./inventory-cutoff-import.ts";
import { requestHash } from "./request-hash.ts";
import { allocateSalesDiscount } from "../../domain/src/sales-money.ts";
import { nativeBarcodeSchemeInitializationRows26 } from "./native-barcode-import.ts";
import { minorAmount } from "../../domain/src/values.ts";

/** The only file/field contract for ordinary document imports. No DB writes or legacy history pipeline. */
export const UNIFIED_PACKAGE_VERSION = "UNIFIED_STANDARD_PACKAGE_V1" as const;
export const SCHEMA_BASELINE_COMMIT = "aa10f48d592b5200e6899a476e95340ad42b205a";
export const ENUM_MAPPING_VERSION = "ORDINARY_DOCUMENT_ENUMS_V1";
export const WORK_PACKAGES = [
  {number:1,name:"decisions",tables:[]}, {number:2,name:"source_files",tables:[]},
  {number:3,name:"products",tables:["product_category","product","product_image"]},
  {number:4,name:"sku_dimensions_barcodes",tables:["color","fit","size","size_group","size_group_member","season","sku","barcode_scheme","sku_barcode"]},
  {number:5,name:"halls_warehouses",tables:["hall","warehouse"]}, {number:6,name:"staff",tables:["staff"]},
  {number:7,name:"customers_suppliers_payments",tables:["customer","supplier","payment_method","payment_account","payment_account_hall"]},
  {number:8,name:"transfer_headers",tables:["transfer_header"]}, {number:9,name:"transfer_lines",tables:["transfer_line"]},
  {number:10,name:"sales_headers",tables:["sales_header"]}, {number:11,name:"sales_lines",tables:["sales_line"]},
  {number:12,name:"complete_settlements",tables:["sales_settlement"]}, {number:13,name:"new_inventory_snapshot",tables:["inventory_baseline"]},
] as const;
export type PackageStage = "CLEANED" | "READY";
export type JsonRecord = Record<string, unknown>;
export interface SourceRef { file_sha256:string; sheet:string|null; row:number; }
export interface StandardRecord { source_key:string; fields:JsonRecord; source_refs:SourceRef[]; explicit_zero_evidence?:ExplicitZeroEvidence; zero_amount_archive?:unknown; historical_hall_evidence?:unknown; }
export interface IdentityEntry { entity_type:string; source_namespace:string; canonical_source_key:string; target_id:string; aliases:string[]; identity_basis:"EXISTING_VERIFIED"|"STABLE_IMPORT_ID_V1"; source_refs:SourceRef[]; }
export interface FilePin { relative_path:string; bytes:number; sha256:string; row_count:number; }
export interface DataFilePin extends FilePin { table:string; work_package:number; }
export interface ReportFilePin extends FilePin { role:"DECISIONS"|"EXCEPTIONS"|"RECONCILIATION"|"CUTOFF_ALIGNMENT"; encoding:"JSON"|"JSONL"; }
export interface AssetFilePin extends SourceFilePin { file_ref:string; mime:string; }
export interface SourceFilePin { relative_path:string; bytes:number; sha256:string; }
export interface PackageManifest {
  format_version:typeof UNIFIED_PACKAGE_VERSION; stage:PackageStage; package_kind:"REAL"|"SYNTHETIC"; source_namespace:string;
  identity_registry:FilePin; schema_contract:{commit:string;source_declarations_sha256:string;proposed_contract_version:typeof UNIFIED_PACKAGE_VERSION}; enum_mapping_version:string; decimal_scale:2; quantity_unit:"PIECE"; snapshot_mode:"CURRENT_EFFECTIVE"; files:DataFilePin[]; reports:ReportFilePin[]; assets:AssetFilePin[]; source_files:SourceFilePin[]; work_packages:{number:number;version:string}[];
  inventory_source:{kind:string;source_file_sha256:string;exported_at:string|null;source_timezone:string|null;cutoff_at:string|null;unit:string;coverage_mode:string;warehouse_registry_sha256:string;sku_registry_sha256:string};
  document_cutoff_alignment:{scope:"CURRENT_EFFECTIVE";evidence_sha256:string|null};
}
export interface UnifiedPackage { manifest:PackageManifest; registry:IdentityEntry[]; records:Record<string,StandardRecord[]>; artifacts:Record<string,Uint8Array>; reports:Record<string,unknown>; }
export type IssueSeverity = "BLOCK_SCHEMA"|"BLOCK_REFERENCE"|"BLOCK_POSTING"|"BLOCK_CUTOVER";
export interface PackageIssue { code:string;severity:IssueSeverity;path:string;message:string; }
export interface PackageValidation { format_version:typeof UNIFIED_PACKAGE_VERSION;valid:boolean;import_eligible:boolean;database_import_implemented:false;package_kind:"REAL"|"SYNTHETIC"|null;stage:PackageStage|null;counts:Record<string,number>;issues:PackageIssue[]; historical_line_amount_differences?:HistoricalLineAmountDifference[]; source_occurrence_reconciliation?:ReturnType<typeof reconcileSourceOccurrenceEvidence>; }
export interface ValidationOptions { historicalSettlementRetentionApproval?:HistoricalSettlementRetentionApproval; historicalSalesHallApproval?:HistoricalSalesHallApproval; sourceOccurrenceEvidence?:SourceOccurrenceEvidence; currentEffectiveAlignmentEvidence?:CurrentEffectiveAlignmentEvidence; historicalLineAmountEvidence?:HistoricalLineAmountEvidence; explicitZeroApproval?:ExplicitZeroApproval; allowSynthetic?:boolean; historicalStaffHallApproval?:HistoricalStaffHallApproval; }
export interface FieldRule {kind:string;nullable:boolean;generated?:boolean;reference?:string;enum?:readonly string[];minimum?:number|string;maximum?:number|string;pattern?:string;}
export const TABLE_SCHEMAS:Readonly<Record<string,Readonly<Record<string,FieldRule>>>> = {
  "hall": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "default_customer_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "customer"
    },
    "default_sales_warehouse_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "warehouse"
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    }
  },
  "warehouse": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "hall_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "hall"
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "created_operation_id": {
      "kind": "uuid",
      "nullable": true,
      "generated": true
    }
  },
  "customer": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "code": {
      "kind": "text",
      "nullable": false
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "created_at": {
      "kind": "instant",
      "nullable": true
    },
    "updated_at": {
      "kind": "instant",
      "nullable": true
    }
  },
  "supplier": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "code": {
      "kind": "text",
      "nullable": false
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "created_at": {
      "kind": "instant",
      "nullable": true
    },
    "updated_at": {
      "kind": "instant",
      "nullable": true
    }
  },
  "staff": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "hall_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "hall"
    },
    "role": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "ADMIN",
        "WAREHOUSE",
        "SALESPERSON"
      ]
    },
    "contact": {
      "kind": "text",
      "nullable": true
    },
    "employment_status": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "在职",
        "离职"
      ]
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    }
  },
  "product_category": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "parent_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "product_category"
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "display_order": {
      "kind": "int32",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "deleted_at": {
      "kind": "instant",
      "nullable": true
    }
  },
  "color": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "code": {
      "kind": "text",
      "nullable": false
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "deleted_at": {
      "kind": "instant",
      "nullable": true
    }
  },
  "fit": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "code": {
      "kind": "text",
      "nullable": false,
      "pattern": "^[A-Z]$"
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "deleted_at": {
      "kind": "instant",
      "nullable": true
    }
  },
  "size": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "code": {
      "kind": "text",
      "nullable": true
    },
    "name": {
      "kind": "text",
      "nullable": false
    }
  },
  "size_group": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "code": {
      "kind": "text",
      "nullable": false
    },
    "name": {
      "kind": "text",
      "nullable": false
    }
  },
  "size_group_member": {
    "size_group_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "size_group"
    },
    "size_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "size"
    },
    "display_order": {
      "kind": "int32",
      "nullable": false
    }
  },
  "season": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "code": {
      "kind": "text",
      "nullable": false
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "display_order": {
      "kind": "int32",
      "nullable": false
    }
  },
  "product": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "product_code": {
      "kind": "text",
      "nullable": false
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "category_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "product_category"
    },
    "supplier_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "supplier"
    },
    "season_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "season"
    },
    "size_group_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "size_group"
    },
    "retail_price": {
      "kind": "money",
      "nullable": true
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "year": {
      "kind": "int32",
      "nullable": true
    },
    "system_item_code": {
      "kind": "text",
      "nullable": true
    },
    "thickness": {
      "kind": "text",
      "nullable": true
    },
    "collar_pants_type": {
      "kind": "text",
      "nullable": true
    },
    "purchase_price": {
      "kind": "money",
      "nullable": true
    },
    "wholesale5_price": {
      "kind": "money",
      "nullable": true
    },
    "wholesale6_price": {
      "kind": "money",
      "nullable": true
    },
    "wholesale7_price": {
      "kind": "money",
      "nullable": true
    },
    "wholesale8_price": {
      "kind": "money",
      "nullable": true
    },
    "wholesale9_price": {
      "kind": "money",
      "nullable": true
    },
    "wholesale10_price": {
      "kind": "money",
      "nullable": true
    },
    "minimum_price": {
      "kind": "money",
      "nullable": true
    },
    "deleted_at": {
      "kind": "instant",
      "nullable": true
    },
    "default_barcode_scheme_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "barcode_scheme"
    },
    "season_ids": {
      "kind": "uuid_array",
      "nullable": true,
      "reference": "season"
    }
  },
  "product_image": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "product_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "product"
    },
    "file_ref": {
      "kind": "text",
      "nullable": false
    },
    "mime": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "image/png",
        "image/jpeg",
        "image/webp"
      ]
    },
    "byte_size": {
      "kind": "quantity",
      "nullable": false,
      "minimum": "1",
      "maximum": "8388608"
    },
    "display_order": {
      "kind": "int32",
      "nullable": false
    },
    "created_at": {
      "kind": "instant",
      "nullable": false
    },
    "created_by_account_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "user_account"
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "image_role": {
      "kind": "text",
      "nullable": true,
      "enum": [
        "MAIN",
        "WHITE_BACKGROUND",
        "HANG_TAG",
        "DETAIL",
        "COLOR"
      ]
    },
    "color_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "color"
    }
  },
  "sku": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "product_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "product"
    },
    "color_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "color"
    },
    "fit_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "fit"
    },
    "size_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "size"
    },
    "sku_code": {
      "kind": "text",
      "nullable": false
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    },
    "created_operation_id": {
      "kind": "uuid",
      "nullable": true,
      "generated": true
    }
  },
  "barcode_scheme": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "barcode_type": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "Code128"
      ]
    },
    "rule_description": {
      "kind": "text",
      "nullable": false
    },
    "code_length": {
      "kind": "int32",
      "nullable": true,
      "minimum": 1
    },
    "rule_version": {
      "kind": "text",
      "nullable": false
    },
    "status": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "CURRENT",
        "HISTORICAL"
      ]
    }
  },
  "sku_barcode": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "barcode": {
      "kind": "text",
      "nullable": false
    },
    "sku_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "sku"
    },
    "barcode_kind": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "MAIN",
        "CONFIRMED_OLD"
      ]
    },
    "scheme_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "barcode_scheme"
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    }
  },
  "payment_method": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    }
  },
  "payment_account": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "name": {
      "kind": "text",
      "nullable": false
    },
    "payment_method_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "payment_method"
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "generated": true,
      "minimum": 1
    }
  },
  "payment_account_hall": {
    "payment_account_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "payment_account"
    },
    "hall_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "hall"
    }
  },
  "sales_header": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "minimum": 1,
      "generated": true
    },
    "stock_basis": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "RUNTIME_LEDGER",
        "CUTOFF_HISTORY"
      ],
      "generated": true
    },
    "import_batch_id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "number": {
      "kind": "text",
      "nullable": false
    },
    "business_type": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "SALE",
        "RETURN",
        "EXCHANGE"
      ]
    },
    "business_date": {
      "kind": "date",
      "nullable": false
    },
    "hall_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "hall"
    },
    "salesperson_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "staff"
    },
    "customer_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "customer"
    },
    "warehouse_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "warehouse"
    },
    "status": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "DRAFT",
        "APPROVED",
        "VOID"
      ]
    },
    "gross_amount": {
      "kind": "signed_money",
      "nullable": false
    },
    "order_discount": {
      "kind": "money",
      "nullable": false
    },
    "net_due": {
      "kind": "signed_money",
      "nullable": false
    },
    "note": {
      "kind": "text",
      "nullable": true
    },
    "created_by_account_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "user_account"
    },
    "created_hall_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "hall"
    },
    "created_at": {
      "kind": "instant",
      "nullable": true
    },
    "updated_at": {
      "kind": "instant",
      "nullable": true
    },
    "approved_by_account_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "user_account"
    },
    "approved_at": {
      "kind": "instant",
      "nullable": true
    },
    "responsible_staff_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "staff"
    },
    "created_by_staff_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "staff"
    },
    "approved_by_staff_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "staff"
    }
  },
  "transfer_header": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "version": {
      "kind": "int32",
      "nullable": false,
      "minimum": 1,
      "generated": true
    },
    "stock_basis": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "RUNTIME_LEDGER",
        "CUTOFF_HISTORY"
      ],
      "generated": true
    },
    "import_batch_id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "number": {
      "kind": "text",
      "nullable": false
    },
    "business_date": {
      "kind": "date",
      "nullable": false
    },
    "from_warehouse_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "warehouse"
    },
    "to_warehouse_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "warehouse"
    },
    "status": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "DRAFT",
        "APPROVED",
        "VOID"
      ]
    },
    "note": {
      "kind": "text",
      "nullable": true
    },
    "created_by_account_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "user_account"
    },
    "created_hall_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "hall"
    },
    "created_at": {
      "kind": "instant",
      "nullable": true
    },
    "updated_at": {
      "kind": "instant",
      "nullable": true
    },
    "approved_by_account_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "user_account"
    },
    "approved_at": {
      "kind": "instant",
      "nullable": true
    },
    "responsible_staff_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "staff"
    },
    "created_by_staff_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "staff"
    },
    "approved_by_staff_id": {
      "kind": "uuid",
      "nullable": true,
      "reference": "staff"
    },
    "created_role": {
      "kind": "text",
      "nullable": true,
      "enum": [
        "ADMIN",
        "WAREHOUSE",
        "SALESPERSON"
      ]
    }
  },
  "sales_line": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "is_current": {
      "kind": "boolean",
      "nullable": false,
      "generated": true
    },
    "sales_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "sales_header"
    },
    "line_no": {
      "kind": "int32",
      "nullable": false,
      "minimum": 1
    },
    "sku_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "sku"
    },
    "quantity": {
      "kind": "quantity",
      "nullable": false
    },
    "reference_price": {
      "kind": "money",
      "nullable": true
    },
    "deal_price": {
      "kind": "money",
      "nullable": false
    },
    "line_amount": {
      "kind": "signed_money",
      "nullable": false
    },
    "allocated_discount": {
      "kind": "money",
      "nullable": true
    },
    "is_gift": {
      "kind": "boolean",
      "nullable": true
    },
    "product_code_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "product_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "color_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "fit_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "size_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "barcode_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "pricing_rule": {
      "kind": "text",
      "nullable": true,
      "enum": [
        "UNIT_PRICE",
        "DISCOUNT"
      ]
    },
    "discount_tenths": {
      "kind": "int32",
      "nullable": true,
      "minimum": 0,
      "maximum": 100
    },
    "zero_confirmed": {
      "kind": "boolean",
      "nullable": true
    }
  },
  "transfer_line": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "is_current": {
      "kind": "boolean",
      "nullable": false,
      "generated": true
    },
    "transfer_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "transfer_header"
    },
    "line_no": {
      "kind": "int32",
      "nullable": false,
      "minimum": 1
    },
    "sku_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "sku"
    },
    "quantity": {
      "kind": "quantity",
      "nullable": false
    },
    "product_code_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "product_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "color_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "fit_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "size_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "barcode_snapshot": {
      "kind": "text",
      "nullable": true
    }
  },
  "sales_settlement": {
    "id": {
      "kind": "uuid",
      "nullable": false,
      "generated": true
    },
    "sales_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "sales_header"
    },
    "line_no": {
      "kind": "int32",
      "nullable": false,
      "minimum": 1
    },
    "payment_account_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "payment_account"
    },
    "direction": {
      "kind": "text",
      "nullable": false,
      "enum": [
        "RECEIVE",
        "REFUND"
      ]
    },
    "amount": {
      "kind": "money",
      "nullable": false
    },
    "account_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "method_name_snapshot": {
      "kind": "text",
      "nullable": true
    },
    "payment_method_id_snapshot": {
      "kind": "uuid",
      "nullable": true,
      "reference": "payment_method"
    }
  },
  "inventory_baseline": {
    "warehouse_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "warehouse"
    },
    "sku_id": {
      "kind": "uuid",
      "nullable": false,
      "reference": "sku"
    },
    "quantity": {
      "kind": "quantity",
      "nullable": false
    }
  }
};

// Runtime immutability prevents accidental same-version schema mutation by a caller.
for(const table of Object.values(TABLE_SCHEMAS)){for(const rule of Object.values(table)){if(rule.enum)Object.freeze(rule.enum);Object.freeze(rule);}Object.freeze(table);}Object.freeze(TABLE_SCHEMAS);
for(const pkg of WORK_PACKAGES){Object.freeze(pkg.tables);Object.freeze(pkg);}Object.freeze(WORK_PACKAGES);
export const SCHEMA_DECLARATIONS_SHA256=requestHash({format_version:UNIFIED_PACKAGE_VERSION,work_packages:WORK_PACKAGES,fields:TABLE_SCHEMAS});
/** Explicit additive profile: the prior V1 declaration and its hash remain exact. */
export const NUMERIC_FIT_TABLE_SCHEMAS: typeof TABLE_SCHEMAS = Object.freeze({
  ...TABLE_SCHEMAS,
  fit: Object.freeze({ ...TABLE_SCHEMAS.fit!, code: Object.freeze({ ...TABLE_SCHEMAS.fit!.code!, pattern: "^[A-Z356789]$" }) }),
});
export const NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256=requestHash({format_version:UNIFIED_PACKAGE_VERSION,work_packages:WORK_PACKAGES,fields:NUMERIC_FIT_TABLE_SCHEMAS});

/** Explicit successor: nullable source calendar date; prior declaration hashes stay unchanged. */
export const STAFF_DEPARTURE_TABLE_SCHEMAS: typeof TABLE_SCHEMAS = Object.freeze({
  ...NUMERIC_FIT_TABLE_SCHEMAS,
  staff: Object.freeze({...TABLE_SCHEMAS.staff!, departure_date: Object.freeze({kind:"date" as const,nullable:true})}),
});
export const STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256=requestHash({format_version:UNIFIED_PACKAGE_VERSION,work_packages:WORK_PACKAGES,fields:STAFF_DEPARTURE_TABLE_SCHEMAS});

/** Additive source-declaration profile. CLEANED explicitly declares the existing
 * sales stock basis; this is provenance classification, not independently proven
 * source truth. READY has the same fields and retains its generated batch binding. */
const {generated: _salesBasisGenerated, ...sourceSalesBasis}=STAFF_DEPARTURE_TABLE_SCHEMAS.sales_header!.stock_basis!;
export const HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS: typeof TABLE_SCHEMAS=Object.freeze({
  ...STAFF_DEPARTURE_TABLE_SCHEMAS,
  sales_header:Object.freeze({...STAFF_DEPARTURE_TABLE_SCHEMAS.sales_header!,stock_basis:Object.freeze(sourceSalesBasis)}),
});
export const HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256=requestHash({format_version:UNIFIED_PACKAGE_VERSION,work_packages:WORK_PACKAGES,fields:HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS});
/** Explicit current-batch profile. Its declaration includes the required source
 * evidence envelope policy, while preserving the old field-only profile. */
export const HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256=requestHash({format_version:UNIFIED_PACKAGE_VERSION,work_packages:WORK_PACKAGES,fields:HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS,historical_hall_policy:'HISTORICAL_SALES_HALL_EVIDENCE_V1_REQUIRED'});
export const HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256=requestHash({format_version:UNIFIED_PACKAGE_VERSION,work_packages:WORK_PACKAGES,fields:HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS,historical_hall_policy:'HISTORICAL_SALES_HALL_EVIDENCE_V2_REQUIRED'});
export function isHistoricalSalesHallSourceProfile(value:unknown):boolean {return value===HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256||value===HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256;}
export function historicalSalesHallEvidenceMatchesProfile(evidence:unknown,profile:unknown):boolean {return object(evidence)&&evidence.format_version===(profile===HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256?'HISTORICAL_SALES_HALL_EVIDENCE_V1':profile===HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256?'HISTORICAL_SALES_HALL_EVIDENCE_V2':null);}
export function isHistoricalSalesSourceProfile(value:unknown):boolean {return value===HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256||isHistoricalSalesHallSourceProfile(value);}


const object = (v:unknown):v is JsonRecord => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const wellFormed=(value:string):boolean=>/^(?:[\u0000-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/.test(value);
const nonempty = (v:unknown):v is string => typeof v === "string" && wellFormed(v) && v.trim().length > 0 && !v.includes("\0");
const hash = (v:unknown):v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const uuid = (v:unknown):v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const sha256 = (bytes:Uint8Array|string):string => createHash("sha256").update(bytes).digest("hex");
export const jsonlBytes = (rows:readonly unknown[]):Uint8Array => new TextEncoder().encode(rows.map(row => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
export const registryTargetId = (namespace:string,entityType:string,sourceKey:string):string => stableImportId("entity",namespace,entityType,sourceKey);
export function validateInt32(value:unknown):value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647; }
export function validateQuantityString(value:unknown):value is string { return typeof value === "string" && /^(0|-?[1-9][0-9]*)$/.test(value) && value.length <= 20 && BigInt(value) >= -9223372036854775808n && BigInt(value) <= 9223372036854775807n; }
export function validateMoneyString(value:unknown, stage:PackageStage="READY"):value is string {
  if (typeof value !== "string" || !/^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value) || /^-0(?:\.0{1,2})?$/.test(value)) return false;
  return stage !== "READY" || /\.[0-9]{2}$/.test(value);
}
export function validateOffsetInstant(value:unknown):value is string {
  if (typeof value !== "string") return false;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || !validateCalendarDate(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59) return false;
  const offset = m[6]!;
  return offset === "Z" || (Number(offset.slice(1,3)) <= 14 && Number(offset.slice(4)) <= 59 && (Number(offset.slice(1,3)) !== 14 || Number(offset.slice(4)) === 0));
}
export function validateSourceTimezone(value:unknown):value is string {
  if(typeof value!=="string")return false;
  if(/^[+-](?:0[0-9]|1[0-3]):[0-5][0-9]$/.test(value)||/^[+-]14:00$/.test(value))return true;
  try{new Intl.DateTimeFormat("en-US",{timeZone:value}).format(0);return true;}catch{return false;}
}
export function safePackagePath(value:unknown):value is string { return typeof value === "string" && value.length <= 240 && /^[A-Za-z0-9_./-]+$/.test(value) && !value.startsWith("/") && !value.split("/").some(p => p === ".." || p === "." || p === "") && !value.includes(":"); }
const credentialKey = /(?:password|passwd|pwd|secret|token|cookie|authorization|private[_-]?key|connection[_-]?(?:string|url)|database[_-]?url|dsn|salt)/i;
const credentialValue = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/|\bBearer\s+[A-Za-z0-9._~-]+|[?&](?:token|sig|access_token|password)=)/i;
export function findCredentialPath(value:unknown,path="$"):string|null {
  const pending=[{value,path,depth:0}];let visited=0;
  while(pending.length){const item=pending.pop()!;if(item.depth>64||++visited>5000000)throw new Error("JSON structure bound");const v=item.value;
    if(typeof v==="string"){if(credentialValue.test(v))return "$";continue;}
    if(Array.isArray(v)){for(let i=0;i<v.length;i++)pending.push({value:v[i],path:`${item.path}[${i}]`,depth:item.depth+1});}
    else if(object(v))for(const[k,child]of Object.entries(v)){if(credentialKey.test(k)||credentialValue.test(k))return "$";pending.push({value:child,path:`${item.path}.${k}`,depth:item.depth+1});}
  }
  return null;
}

function fieldValid(value:unknown,rule:FieldRule,stage:PackageStage):boolean {
  if (value === null) return rule.nullable;
  let ok=false;
  switch (rule.kind) {
    case "text": ok = typeof value === "string" && wellFormed(value) && !value.includes("\0") && (rule.nullable || value.trim().length > 0); break;
    case "uuid": ok=uuid(value); break;
    case "uuid_array": ok=Array.isArray(value) && value.every(uuid) && value.every((v,i)=>i===0 || value[i-1]! < v); break;
    case "boolean": ok=typeof value === "boolean"; break;
    case "int32": ok=validateInt32(value); break;
    case "quantity": ok=validateQuantityString(value); break;
    case "money": ok=validateMoneyString(value,stage) && !value.startsWith("-"); break;
    case "signed_money": ok=validateMoneyString(value,stage); break;
    case "instant": ok=validateOffsetInstant(value); break;
    case "date": ok=validateCalendarDate(value); break;
  }
  if (!ok) return false;
  if (rule.enum && !rule.enum.includes(value as string)) return false;
  if (rule.pattern && !new RegExp(rule.pattern).test(value as string)) return false;
  if (rule.minimum !== undefined && (typeof value === "number" ? value < Number(rule.minimum) : BigInt(value as string) < BigInt(rule.minimum))) return false;
  if (rule.maximum !== undefined && (typeof value === "number" ? value > Number(rule.maximum) : BigInt(value as string) > BigInt(rule.maximum))) return false;
  return true;
}
function exactKeys(value:JsonRecord,keys:readonly string[]):boolean { return Object.keys(value).sort().join(",") === [...keys].sort().join(","); }
function cents(value:unknown):bigint|null { if (!validateMoneyString(value,"CLEANED")) return null; const negative=value.startsWith("-"); const [a,b=""]=(negative?value.slice(1):value).split("."); return (BigInt(a!)*100n+BigInt(b.padEnd(2,"0")))*(negative?-1n:1n); }

/** Pure preflight. Inputs carry only standard-package bytes, not raw spreadsheet/SQL readers. */
function validatePackageUnchecked(input:unknown,options:ValidationOptions={}):PackageValidation {
  const result:PackageValidation={format_version:UNIFIED_PACKAGE_VERSION,valid:false,import_eligible:false,database_import_implemented:false,package_kind:null,stage:null,counts:{},issues:[]};
  const issue=(code:string,path:string,message:string,severity:IssueSeverity="BLOCK_SCHEMA") => {result.issues.push({code,path,message,severity});};
  if (!object(input) || !object(input.manifest) || !Array.isArray(input.registry) || !object(input.records) || !object(input.artifacts) || !object(input.reports)) {issue("INVALID_PACKAGE","$","Expected manifest, registry, records and independently pinned file bytes");return result;}
  const m=input.manifest,artifacts=input.artifacts,reports=input.reports;
  const credential=findCredentialPath({manifest:m,registry:input.registry,records:input.records,reports});
  if (credential) {issue("FORBIDDEN_CREDENTIAL","$","Credential-bearing key/value is prohibited; contents and paths are never echoed");return result;}
  if (!exactKeys(m,["format_version","stage","package_kind","source_namespace","identity_registry","schema_contract","enum_mapping_version","decimal_scale","quantity_unit","snapshot_mode","files","reports","assets","source_files","work_packages","inventory_source","document_cutoff_alignment"])) issue("MANIFEST_KEYS","manifest","Manifest must use the single closed versioned contract");
  if(!object(m.schema_contract)||!exactKeys(m.schema_contract,["commit","source_declarations_sha256","proposed_contract_version"])||m.schema_contract.commit!==SCHEMA_BASELINE_COMMIT||(typeof m.schema_contract.source_declarations_sha256!=="string" || ![SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256].includes(m.schema_contract.source_declarations_sha256))||m.schema_contract.proposed_contract_version!==UNIFIED_PACKAGE_VERSION)issue("SCHEMA_CONTRACT_MISMATCH","manifest.schema_contract","Package must pin this receiving-code baseline and typed declaration SHA256");
  if(m.enum_mapping_version!==ENUM_MAPPING_VERSION||m.decimal_scale!==2||m.quantity_unit!=="PIECE"||m.snapshot_mode!=="CURRENT_EFFECTIVE")issue("VALUE_CONVENTION_MISMATCH","manifest","Freeze ordinary enums, exact scale 2, PIECE and CURRENT_EFFECTIVE snapshot");
  if(m.format_version !== UNIFIED_PACKAGE_VERSION)issue("UNSUPPORTED_VERSION","manifest.format_version","Unsupported package contract version");
  if(m.stage !== "CLEANED" && m.stage !== "READY")issue("INVALID_STAGE","manifest.stage","Stage must be CLEANED or READY");else result.stage=m.stage;
  if(m.package_kind !== "REAL" && m.package_kind !== "SYNTHETIC")issue("INVALID_PACKAGE_KIND","manifest.package_kind","Package kind must be explicit");else result.package_kind=m.package_kind;
  if(m.package_kind === "SYNTHETIC" && !options.allowSynthetic)issue("SYNTHETIC_REQUIRES_OPT_IN","manifest.package_kind","Synthetic package requires explicit offline opt-in and is never import eligible");
  if(!nonempty(m.source_namespace))issue("SOURCE_NAMESPACE_REQUIRED","manifest.source_namespace","Freeze one nonempty source namespace");
  if(!Array.isArray(m.files) || !Array.isArray(m.source_files) || !Array.isArray(m.assets) || !Array.isArray(m.reports) || !Array.isArray(m.work_packages) || !object(m.identity_registry) || !object(m.inventory_source) || !object(m.document_cutoff_alignment) || !result.stage || !result.package_kind){issue("INVALID_MANIFEST_FIELDS","manifest","Manifest collections and baseline/alignment declarations have invalid types");return result;}
  const stage=result.stage,sourceHashes=new Set<string>(),paths=new Set<string>();
  for(const [i,f] of m.source_files.entries()) {
    if(!object(f) || !exactKeys(f,["relative_path","bytes","sha256"]) || !safePackagePath(f.relative_path) || !Number.isSafeInteger(f.bytes) || Number(f.bytes)<0 || !hash(f.sha256)) issue("INVALID_SOURCE_FILE",`manifest.source_files[${i}]`,"Source inventory requires safe relative path, exact bytes and SHA256");
    else {if(sourceHashes.has(f.sha256))issue("DUPLICATE_SOURCE_FILE",`manifest.source_files[${i}]`,"Source hashes must be unique");sourceHashes.add(f.sha256);}
  }
  if(options.historicalStaffHallApproval&&!historicalStaffHallApprovalMatchesSource(options.historicalStaffHallApproval,m.source_namespace as string,sourceHashes))issue("STAFF_HALL_APPROVAL_SOURCE","staff","Approval must bind the current package source inventory","BLOCK_REFERENCE");
  if(options.historicalLineAmountEvidence&&!historicalLineAmountEvidenceMatchesSource(options.historicalLineAmountEvidence,m.source_namespace as string,sourceHashes))issue("HISTORICAL_LINE_AMOUNT_EVIDENCE_SOURCE","sales_line","Evidence must bind the separately reviewed source inventory","BLOCK_REFERENCE");
  if(options.historicalSalesHallApproval&&(!object(m.schema_contract)||!isHistoricalSalesHallSourceProfile(m.schema_contract.source_declarations_sha256)))issue("HISTORICAL_HALL_PROFILE_REQUIRED","sales_header","New hall evidence cannot enter a legacy source profile","BLOCK_REFERENCE");
  if(options.historicalSalesHallApproval&&!historicalSalesHallApprovalMatchesSource(options.historicalSalesHallApproval,m.source_namespace as string,sourceHashes))issue("HISTORICAL_HALL_APPROVAL_SOURCE","sales_header","Hall derivation approval must bind reviewed source inventory","BLOCK_REFERENCE");
  if(object(m.schema_contract)&&isHistoricalSalesHallSourceProfile(m.schema_contract.source_declarations_sha256)&&!historicalSalesHallApprovalMatchesSource(options.historicalSalesHallApproval,m.source_namespace as string,sourceHashes))issue("HISTORICAL_HALL_APPROVAL_REQUIRED","sales_header","This source profile requires the separately reviewed complete historical hall bundle","BLOCK_REFERENCE");
  if(sourceHashes.size === 0)issue("SOURCE_FILES_REQUIRED","manifest.source_files","At least one original source pin is required");
  const refs=(value:unknown,path:string) => {
    if(!Array.isArray(value) || !value.length) {issue("SOURCE_REFS_REQUIRED",path,"Nonempty original-source locators are required");return;}
    for (const [i,r] of value.entries()) if(!object(r) || !exactKeys(r,["file_sha256","sheet","row"]) || !hash(r.file_sha256) || !sourceHashes.has(r.file_sha256 as string) || !(r.sheet===null || nonempty(r.sheet)) || !validateInt32(r.row) || r.row<1) issue("INVALID_SOURCE_REF",`${path}[${i}]`,"Locator must resolve a pinned source hash, sheet or null, and positive int32 row");
  };
  const pins=(f:JsonRecord,path:string,rows:readonly unknown[],registry=false) => {
    if(!exactKeys(f,registry?["relative_path","bytes","sha256","row_count"]:["relative_path","bytes","sha256","row_count","table","work_package"]))issue("FILE_PIN_KEYS",path,"File pin keys are closed");
    if(!safePackagePath(f.relative_path)) {issue("UNSAFE_PATH",path,"File must remain inside the standard package");return;}
    if(paths.has(f.relative_path))issue("DUPLICATE_FILE_PATH",path,"Each package path has exactly one purpose");paths.add(f.relative_path);
    const bytes=artifacts[f.relative_path];
    if(!(bytes instanceof Uint8Array)){issue("FILE_MISSING",path,"Pinned package file bytes are absent");return;}
    if(!Number.isSafeInteger(f.bytes) || Number(f.bytes)<0 || f.bytes !== bytes.byteLength)issue("FILE_BYTE_COUNT_MISMATCH",path,"File byte count differs from manifest");
    if(!hash(f.sha256) || f.sha256 !== sha256(bytes))issue("FILE_HASH_MISMATCH",path,"File SHA256 differs from manifest");
    if(!validateInt32(f.row_count) || f.row_count<0 || f.row_count !== rows.length)issue("FILE_ROW_COUNT_MISMATCH",path,"File row count differs from manifest");
    try { const parsed=decodeJsonl(bytes);if(requestHash(parsed)!==requestHash(rows))issue("PACKAGE_VIEW_MISMATCH",path,"Decoded file bytes differ from supplied normalized view"); }catch{issue("INVALID_JSONL",path,"File is not strict UTF8 LF JSONL");}
  };
  pins(m.identity_registry,"manifest.identity_registry",input.registry,true);
  const assetRefs=new Set<string>();
  for(const [i,pin]of m.assets.entries()) {
    const path=`manifest.assets[${i}]`;
    if(!object(pin)||!exactKeys(pin,["relative_path","bytes","sha256","file_ref","mime"])||!safePackagePath(pin.relative_path)||!nonempty(pin.file_ref)||!["image/png","image/jpeg","image/webp"].includes(pin.mime as string)||!Number.isSafeInteger(pin.bytes)||Number(pin.bytes)<1||Number(pin.bytes)>8388608){issue("INVALID_ASSET_PIN",path,"Image assets require safe byte/hash/mime pins and original file_ref");continue;}
    if(paths.has(pin.relative_path))issue("DUPLICATE_FILE_PATH",path,"Each file path has one package purpose");paths.add(pin.relative_path);
    if(assetRefs.has(pin.file_ref))issue("DUPLICATE_ASSET_REF",path,"Each immutable image reference resolves one asset");assetRefs.add(pin.file_ref);
    const bytes=artifacts[pin.relative_path];if(!(bytes instanceof Uint8Array)){issue("FILE_MISSING",path,"Pinned image bytes absent");continue;}
    if(pin.bytes!==bytes.length)issue("FILE_BYTE_COUNT_MISMATCH",path,"Image byte count differs");
    if(!hash(pin.sha256)||pin.sha256!==sha256(bytes))issue("FILE_HASH_MISMATCH",path,"Image SHA256 differs");
    const signature=Buffer.from(bytes.slice(0,12));const mime=signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":signature.subarray(0,4).toString()==="RIFF"&&signature.subarray(8,12).toString()==="WEBP"?"image/webp":null;
    if(mime!==pin.mime)issue("IMAGE_ASSET_MISMATCH",path,"Pinned image MIME signature is inconsistent");
  }
  const reportRoles=new Set<string>();
  for(const [i,pin]of m.reports.entries()) {
    const path=`manifest.reports[${i}]`;
    if(!object(pin)||!exactKeys(pin,["relative_path","bytes","sha256","row_count","role","encoding"])||!["DECISIONS","EXCEPTIONS","RECONCILIATION","CUTOFF_ALIGNMENT"].includes(pin.role as string)||!["JSON","JSONL"].includes(pin.encoding as string)||!safePackagePath(pin.relative_path)){issue("INVALID_REPORT_PIN",path,"Reports require closed role/encoding and file hash pins");continue;}
    if(reportRoles.has(pin.role as string))issue("DUPLICATE_REPORT_ROLE",path,"Each report role occurs once");reportRoles.add(pin.role as string);
    if(paths.has(pin.relative_path))issue("DUPLICATE_FILE_PATH",path,"Each package path has exactly one purpose");paths.add(pin.relative_path);
    const bytes=artifacts[pin.relative_path],value=reports[pin.relative_path];
    if(!(bytes instanceof Uint8Array)){issue("FILE_MISSING",path,"Pinned report bytes absent");continue;}
    if(pin.bytes!==bytes.length)issue("FILE_BYTE_COUNT_MISMATCH",path,"Report byte count differs");
    if(!hash(pin.sha256)||pin.sha256!==sha256(bytes))issue("FILE_HASH_MISMATCH",path,"Report SHA256 differs");
    try {const parsed=pin.encoding==="JSONL"?decodeJsonl(bytes):parseStrictJson(decodeUtf8(bytes));if(requestHash(parsed)!==requestHash(value))issue("PACKAGE_VIEW_MISMATCH",path,"Report bytes differ from normalized view");if(pin.row_count!==(Array.isArray(parsed)?parsed.length:1))issue("FILE_ROW_COUNT_MISMATCH",path,"Report row count differs");}catch{issue("INVALID_REPORT",path,"Report encoding or normalized value is invalid");}
    if(pin.role==="EXCEPTIONS") {
      if(pin.encoding!=="JSONL"||!Array.isArray(value))issue("INVALID_EXCEPTIONS",path,"Exceptions use UTF8 JSONL");
      else for(const [j,e]of value.entries()) {
        if(!object(e)||!exactKeys(e,["entity_type","source_key","field","code","observed_value","expected_rule","source_refs","severity","proposed_action"])||!nonempty(e.entity_type)||!nonempty(e.source_key)||!(e.field===null||nonempty(e.field))||!nonempty(e.code)||!nonempty(e.expected_rule)||!nonempty(e.proposed_action)||!["INFO_PRESERVED_UNKNOWN","BLOCK_REFERENCE","BLOCK_SCHEMA","BLOCK_POSTING","BLOCK_CUTOVER"].includes(e.severity as string)){issue("INVALID_EXCEPTION",`${path}[${j}]`,"Exception row must use the closed shared exception contract");continue;}
        refs(e.source_refs,`${path}[${j}].source_refs`);
        if(e.severity!=="INFO_PRESERVED_UNKNOWN")issue("UNRESOLVED_EXCEPTION",`${path}[${j}]`,"Source exception remains blocking; original values are not echoed",e.severity as IssueSeverity);
      }
    }else if(!object(value))issue("INVALID_REPORT",path,"Decision/reconciliation/alignment reports must be JSON objects");
    else if(pin.role==="DECISIONS") {
      if(!exactKeys(value,["format_version","package_kind","source_namespace","rules"])||value.format_version!==UNIFIED_PACKAGE_VERSION||value.package_kind!==m.package_kind||value.source_namespace!==m.source_namespace||!Array.isArray(value.rules)||value.rules.length<3)issue("INVALID_DECISIONS",path,"Frozen decisions require shared version, source namespace and scoped evidence-backed rules");
      else {const decisions=new Set<string>();for(const rule of value.rules){if(!object(rule)||!exactKeys(rule,["code","scope","evidence_sha256"])||!nonempty(rule.code)||!nonempty(rule.scope)||!hash(rule.evidence_sha256)||!sourceHashes.has(rule.evidence_sha256 as string)||decisions.has(rule.code as string))issue("INVALID_DECISIONS",path,"Each distinct decision needs explicit scope and pinned ruling evidence");else decisions.add(rule.code);}for(const code of ["NO_MAIN_UNIT","DEFAULT_FIT_A","PRESERVE_EXISTING_SIZE_MAPPING"])if(!decisions.has(code))issue("INVALID_DECISIONS",path,"Preserve approved no-main-unit, scoped missing-fit A, and existing size mapping decisions");}
    } else if(pin.role==="RECONCILIATION") {
      if(!exactKeys(value,["format_version","package_kind","source_namespace","tables"])||value.format_version!==UNIFIED_PACKAGE_VERSION||value.package_kind!==m.package_kind||value.source_namespace!==m.source_namespace||!object(value.tables)||!exactKeys(value.tables,Object.keys(TABLE_SCHEMAS)))issue("INVALID_RECONCILIATION",path,"Reconciliation needs shared version/namespace and one count closure per standard table");
      else for(const [table,counts]of Object.entries(value.tables)){
        if(!object(counts)||!exactKeys(counts,["source_rows","retained_rows","rejected_rows"])||![counts.source_rows,counts.retained_rows,counts.rejected_rows].every(n=>validateInt32(n)&&n>=0)||counts.source_rows!==Number(counts.retained_rows)+Number(counts.rejected_rows))issue("INVALID_RECONCILIATION",path,"Source rows equal retained plus rejected; counts are nonnegative int32");
        else {const actual=input.records[table];if(!Array.isArray(actual)||counts.retained_rows!==actual.length)issue("RECONCILIATION_COUNT_MISMATCH",path,"Retained row counts must match actual independently hashed standard files");if(counts.rejected_rows!==0)issue("RECONCILIATION_SOURCE_ROWS_UNPRESERVED",path,"Rejected original rows remain a blocking complete-package exception","BLOCK_REFERENCE");}
      }
    }
  }
  for(const role of ["DECISIONS","EXCEPTIONS","RECONCILIATION"])if(!reportRoles.has(role))issue("REPORT_REQUIRED","manifest.reports",`Missing pinned ${role} report`);
  if(m.work_packages.length!==13 || m.work_packages.some((p:unknown,i:number)=>!object(p) || !exactKeys(p,["number","version"]) || p.number!==i+1 || !nonempty(p.version)))issue("WORK_PACKAGE_CATALOG","manifest.work_packages","All thirteen fixed package versions are required in canonical order");
  const identities=new Map<string,IdentityEntry>(),ids=new Map<string,string>(),canonicalIds=new Map<string,IdentityEntry>();
  const allowedTypes=new Set([...Object.keys(TABLE_SCHEMAS).filter(t=>TABLE_SCHEMAS[t]!.id).map(t=>t.toUpperCase()),"USER_ACCOUNT"]);
  for(const [i,e] of input.registry.entries()) {
    const path=`registry[${i}]`;
    if(!object(e) || !exactKeys(e,["entity_type","source_namespace","canonical_source_key","target_id","aliases","identity_basis","source_refs"]) || !allowedTypes.has(e.entity_type as string) || e.source_namespace!==m.source_namespace || !nonempty(e.canonical_source_key) || !uuid(e.target_id) || !Array.isArray(e.aliases) || !e.aliases.every(nonempty) || !["EXISTING_VERIFIED","STABLE_IMPORT_ID_V1"].includes(e.identity_basis as string)) {issue("INVALID_REGISTRY_ENTRY",path,"Central registry entry has invalid closed identity fields");continue;}
    refs(e.source_refs,`${path}.source_refs`);
    if(e.entity_type==="USER_ACCOUNT"&&e.identity_basis!=="EXISTING_VERIFIED")issue("ACCOUNT_PROVISIONING_NOT_PACKAGE_INPUT",path,"Only reliably verified existing account IDs may identify original actors; account provisioning is a separate authorized security flow","BLOCK_REFERENCE");
    const entry=e as unknown as IdentityEntry,key=`${entry.entity_type}:${entry.canonical_source_key}`;
    try { const stable=parseStableSourceKey(entry.canonical_source_key); if(stable && stable.entity_type!==entry.entity_type)issue("STABLE_IDENTITY_ENTITY_MISMATCH",path,"Versioned source key must match registry entity"); } catch { issue("STABLE_SOURCE_KEY_INVALID",path,"Malformed versioned permanent source identity"); }
    if(entry.identity_basis === "STABLE_IMPORT_ID_V1" && entry.target_id!==registryTargetId(entry.source_namespace,entry.entity_type,entry.canonical_source_key))issue("REGISTRY_ID_ALGORITHM_MISMATCH",path,"New identity must reuse existing typed stableImportId");
    if(ids.has(entry.target_id))issue("ID_COLLISION",path,"Each target ID has exactly one canonical identity","BLOCK_REFERENCE");
    ids.set(entry.target_id,key);canonicalIds.set(`${entry.entity_type}:${entry.target_id}`,entry);
    for(const alias of [entry.canonical_source_key,...entry.aliases]) {const k=`${entry.entity_type}:${alias}`;if(identities.has(k))issue("REGISTRY_ALIAS_CONFLICT",path,"Duplicate/cyclic/ambiguous aliases require one central resolution","BLOCK_REFERENCE");else identities.set(k,entry);}
  }
  const tableSeen=new Set<string>(),rowsByTable=new Map<string,StandardRecord[]>();
  for(const [i,pin] of m.files.entries()) {
    const path=`manifest.files[${i}]`;
    if(!object(pin) || typeof pin.table!=="string" || !Object.hasOwn(TABLE_SCHEMAS,pin.table)) {issue("UNKNOWN_TABLE",path,"Only ordinary approved clean-file targets are accepted");continue;}
    const table=pin.table,schema=(object(m.schema_contract) && isHistoricalSalesSourceProfile(m.schema_contract.source_declarations_sha256) ? HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS : object(m.schema_contract) && m.schema_contract.source_declarations_sha256===STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256 ? STAFF_DEPARTURE_TABLE_SCHEMAS : object(m.schema_contract) && m.schema_contract.source_declarations_sha256===NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256 ? NUMERIC_FIT_TABLE_SCHEMAS : TABLE_SCHEMAS)[table]!,data=input.records[table];
    if(tableSeen.has(table))issue("DUPLICATE_TABLE_FILE",path,"One complete standard file per table is required");tableSeen.add(table);
    if(WORK_PACKAGES.find(w=>w.number===pin.work_package)?.tables.includes(table as never)!==true)issue("WORK_PACKAGE_OWNERSHIP",path,"File must use fixed 1–13 package ownership");
    if(!Array.isArray(data)){issue("FILE_MISSING",table,"Missing normalized file rows");continue;}
    pins(pin,path,data);result.counts[table]=data.length;
    const accepted:StandardRecord[]=[],keys=new Set<string>(),targetIds=new Set<string>();
    for(const [j,row] of data.entries()) {
      const rp=`${table}[${j}]`;
      if(!object(row) || !exactKeys(row,["source_key","fields","source_refs",...(Object.hasOwn(row,"explicit_zero_evidence")?["explicit_zero_evidence"]:[]),...(Object.hasOwn(row,"zero_amount_archive")?["zero_amount_archive"]:[]),...(Object.hasOwn(row,"historical_hall_evidence")?["historical_hall_evidence"]:[])]) || !nonempty(row.source_key) || !object(row.fields)){issue("INVALID_ENVELOPE",rp,"Use closed source_key/fields/source_refs envelope");continue;}
      refs(row.source_refs,`${rp}.source_refs`);
      if(table==="inventory_baseline"&&options.explicitZeroApproval&&!explicitZeroScopeRecordValid(options.explicitZeroApproval,row))issue("EXPLICIT_ZERO_SCOPE_RECORD_MISMATCH",rp,"Inventory must exactly match confirmed explicit values or approved absence; unknown mask takes precedence");
      if(Object.hasOwn(row,"explicit_zero_evidence")&&(table!=="inventory_baseline"||!explicitZeroApproved(options.explicitZeroApproval,m.source_namespace as string,m.inventory_source.source_file_sha256 as string,m.inventory_source.cutoff_at as string,row)))issue("EXPLICIT_ZERO_APPROVAL_REQUIRED",rp,"Exact independently pinned absent-key approval is required");
      if(Object.hasOwn(row,"zero_amount_archive")){try{if(table!=="sales_header"||!isRetainedHistoricalSale(row as unknown as StandardRecord,object(m.schema_contract)&&isHistoricalSalesSourceProfile(m.schema_contract.source_declarations_sha256)))throw new Error("ZERO_ARCHIVE_HISTORICAL_SALE_REQUIRED");validateZeroAmountArchive(row.zero_amount_archive,{sourceNamespace:typeof m.source_namespace==="string"?m.source_namespace:"",salesSourceKey:row.source_key,sourceFileHashes:sourceHashes});}catch(error){issue(error instanceof Error?error.message:"ZERO_ARCHIVE_INVALID",`${rp}.zero_amount_archive`,"Zero original records require a pinned historical sale and no money action");}}
      if(keys.has(row.source_key))issue("DUPLICATE_SOURCE_KEY",rp,"Every source entity row is retained once","BLOCK_REFERENCE");keys.add(row.source_key);
      if(table==="sales_header"&&isRetainedHistoricalSalesDocument(row as unknown as StandardRecord,stage==="CLEANED"&&object(m.schema_contract)&&isHistoricalSalesSourceProfile(m.schema_contract.source_declarations_sha256))&&(options.historicalSalesHallApproval!==undefined||object(m.schema_contract)&&isHistoricalSalesHallSourceProfile(m.schema_contract.source_declarations_sha256))&&!Object.hasOwn(row,"historical_hall_evidence"))issue("HISTORICAL_HALL_EVIDENCE_REQUIRED",rp,"Every historical header in this reviewed batch must retain its original/derived/pending hall evidence","BLOCK_REFERENCE");
      let validHallEvidence=false;
      if(Object.hasOwn(row,"historical_hall_evidence")){try{
        if(!object(m.schema_contract)||!isHistoricalSalesHallSourceProfile(m.schema_contract.source_declarations_sha256))throw Error("HISTORICAL_HALL_PROFILE_REQUIRED");
        if(table!=="sales_header"||!isRetainedHistoricalSalesDocument(row as unknown as StandardRecord,stage==="CLEANED"&&object(m.schema_contract)&&isHistoricalSalesSourceProfile(m.schema_contract.source_declarations_sha256)))throw Error('HISTORICAL_HALL_SOURCE_REQUIRED');
        if(!historicalSalesHallEvidenceMatchesProfile(row.historical_hall_evidence,m.schema_contract.source_declarations_sha256))throw Error('HISTORICAL_HALL_PROFILE_VERSION');
        validateHistoricalSalesHallEvidence(row.historical_hall_evidence,{sourceNamespace:m.source_namespace as string,sourceKey:row.source_key,targetId:identities.get(`SALES_HEADER:${row.source_key}`)?.target_id,sourceRefs:row.source_refs as StandardRecord['source_refs'],fields:row.fields,approval:options.historicalSalesHallApproval});validHallEvidence=true;
      }catch(error){issue(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'HISTORICAL_HALL_EVIDENCE_INVALID',`${rp}.historical_hall_evidence`,'Hall source or derivation evidence must exactly match separately reviewed facts','BLOCK_REFERENCE');}}
      const f=row.fields;
      const expected=Object.entries(schema).filter(([,r])=>stage==="READY" || !r.generated);
      let valid=true;
      for(const [key,rule] of expected) {
        if(!Object.hasOwn(f,key)){issue("FIELD_MISSING",`${rp}.fields.${key}`,"Every declared source/generated field must appear; unknown uses explicit nullable null");valid=false;}
        else if(!(table==="sales_header"&&key==="hall_id"&&f[key]===null&&validHallEvidence)&&!fieldValid(f[key],rule,stage)){issue("FIELD_TYPE",`${rp}.fields.${key}`,`Field must satisfy ${rule.kind}${rule.nullable?" or explicit null":""}`);valid=false;}
      }
      for(const key of Object.keys(f))if(!Object.hasOwn(schema,key) || (stage==="CLEANED" && schema[key]!.generated)){issue("FIELD_UNKNOWN",`${rp}.fields.${key}`,"Unknown/generated/database-derived columns are not source input");valid=false;}
      if(schema.id) {
        const e=identities.get(`${table.toUpperCase()}:${row.source_key}`);
        if(!e)issue("REGISTRY_UNRESOLVED",rp,"Row source key must resolve the frozen central registry","BLOCK_REFERENCE");
        else {if(targetIds.has(e.target_id))issue("DUPLICATE_TARGET_ID",rp,"Aliases may locate one canonical entity, never duplicate its target row","BLOCK_REFERENCE");targetIds.add(e.target_id);}
        if(e && stage==="READY" && f.id!==e.target_id)issue("REGISTRY_TARGET_MISMATCH",rp,"READY target ID must preserve the exact central registry identity","BLOCK_REFERENCE");
        if(e)for(const code of validateStableIdentityBinding(e,f,(entity,key)=>identities.get(`${entity}:${key}`)))issue(code,rp,"Versioned source identity must resolve its exact original dimensions or parent","BLOCK_REFERENCE");
      }
      for(const [key,rule] of expected)if(rule.reference && f[key]!==null && Object.hasOwn(f,key)) {
        const values=Array.isArray(f[key])?f[key] as unknown[]:[f[key]];
        for(const value of values)if(!canonicalIds.has(`${rule.reference.toUpperCase()}:${String(value)}`))issue("REGISTRY_UNRESOLVED",`${rp}.fields.${key}`,"Foreign key must resolve the single frozen registry","BLOCK_REFERENCE");
      }
      if(valid)accepted.push(row as unknown as StandardRecord);
    }
    rowsByTable.set(table,accepted);
  }
  for(const table of Object.keys(TABLE_SCHEMAS))if(!tableSeen.has(table))issue("TABLE_FILE_REQUIRED",table,"Complete standard package must declare each target, including an empty file");
  for(const key of Object.keys(input.records))if(!tableSeen.has(key))issue("UNDECLARED_FILE",key,"No undeclared normalized files are accepted");
  const inventory=m.inventory_source,alignment=m.document_cutoff_alignment;
  if(!exactKeys(inventory,["kind","source_file_sha256","exported_at","source_timezone","cutoff_at","unit","coverage_mode","warehouse_registry_sha256","sku_registry_sha256"]) || inventory.kind!==(m.package_kind==="SYNTHETIC"?"SYNTHETIC_NEW_SNAPSHOT":"NEW_AFTERNOON_SNAPSHOT") || !hash(inventory.source_file_sha256) || !sourceHashes.has(inventory.source_file_sha256 as string) || !validateOffsetInstant(inventory.cutoff_at) || (inventory.exported_at!==null&&!validateOffsetInstant(inventory.exported_at)) || !validateSourceTimezone(inventory.source_timezone) || inventory.unit!=="PIECE" || inventory.coverage_mode!=="EXPLICIT_KEYS" || inventory.warehouse_registry_sha256!==m.identity_registry.sha256 || inventory.sku_registry_sha256!==m.identity_registry.sha256)issue("STOCK_SOURCE_NOT_VERIFIED","manifest.inventory_source","Need actual new-snapshot pin, offset times, original timezone, PIECE, EXPLICIT_KEYS and one registry version","BLOCK_CUTOVER");
  if(!exactKeys(alignment,["scope","evidence_sha256"]) || alignment.scope!=="CURRENT_EFFECTIVE" || !hash(alignment.evidence_sha256) || (!sourceHashes.has(alignment.evidence_sha256 as string)&&!currentEffectiveAlignmentMatchesManifest(options.currentEffectiveAlignmentEvidence,m)) || alignment.evidence_sha256===inventory.source_file_sha256 || (inventory.exported_at===null||options.currentEffectiveAlignmentEvidence!==undefined)&&!currentEffectiveAlignmentMatchesManifest(options.currentEffectiveAlignmentEvidence,m))issue("BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN","manifest.document_cutoff_alignment","Current-effective ordinary documents need separately pinned cutoff-alignment evidence","BLOCK_CUTOVER");
  if(options.explicitZeroApproval){
    const scope=explicitZeroScopeCounts(options.explicitZeroApproval);
    if(scope){if(!explicitZeroScopeMembersMatch(options.explicitZeroApproval,input.registry as IdentityEntry[]))issue("EXPLICIT_ZERO_SCOPE_REGISTRY_SET","registry","Both final warehouse and SKU sets must equal the full approved domain");if(stage==="READY"&&scope.unknown)issue("EXPLICIT_ZERO_SCOPE_UNKNOWN","inventory_baseline","Unresolved masked pairs prevent READY");if((rowsByTable.get("inventory_baseline")?.length??0)!==scope.explicit_confirmed+scope.zero)issue("EXPLICIT_ZERO_SCOPE_PARTITION_INCOMPLETE","inventory_baseline","All confirmed explicit and zero pairs must appear exactly once");}
    const approved=rowsByTable.get("inventory_baseline")?.filter(row=>Object.hasOwn(row,"explicit_zero_evidence"))??[];
    if(approved.length!==explicitZeroApprovalCount(options.explicitZeroApproval)||new Set(approved.map(row=>row.explicit_zero_evidence?.approval_row)).size!==approved.length)issue("EXPLICIT_ZERO_APPROVAL_SET_INCOMPLETE","inventory_baseline","Every independently approved key must appear exactly once");
  }
  const materialized=new Set<string>();
  for(const [table,rows]of rowsByTable)for(const row of rows){const entry=identities.get(`${table.toUpperCase()}:${row.source_key}`);if(entry)materialized.add(`${entry.entity_type}:${entry.canonical_source_key}`);}
  for(const entry of canonicalIds.values())if(entry.entity_type!=="USER_ACCOUNT"&&!materialized.has(`${entry.entity_type}:${entry.canonical_source_key}`))issue("REGISTRY_TARGET_ROW_MISSING","registry","Every ordinary central identity must materialize exactly one standard target row","BLOCK_REFERENCE");
  const expectedSchemes=nativeBarcodeSchemeInitializationRows26();
  const actualSchemes=rowsByTable.get("barcode_scheme")??[];
  if(actualSchemes.length!==expectedSchemes.length || expectedSchemes.some(expected=>!actualSchemes.some(row=>{const entry=identities.get(`BARCODE_SCHEME:${row.source_key}`),native={...row.fields,id:entry?.target_id};return entry?.target_id===expected.native.id&&requestHash(native)===requestHash(expected.native);})))issue("BARCODE_SCHEME_CONFIGURATION_MISMATCH","barcode_scheme","Exactly the six existing IDs and all retained configuration facts must remain unchanged");
  for(const row of rowsByTable.get("product_image")??[]){const f=row.fields,pin=m.assets.find((a:unknown)=>object(a)&&a.file_ref===f.file_ref);if(!object(pin)||pin.mime!==f.mime||BigInt(pin.bytes as number)!==BigInt(f.byte_size as string))issue("IMAGE_ASSET_MISMATCH","product_image","Original image reference/mime/exact byte size must resolve pinned real asset bytes");}
  const differences:HistoricalLineAmountDifference[]=[];
  if(options.historicalSettlementRetentionApproval&&!historicalSettlementRetentionMatchesSource(options.historicalSettlementRetentionApproval,m.source_namespace as string,sourceHashes))issue('HISTORICAL_SETTLEMENT_APPROVAL_SOURCE','$','Retention requires separately verified original source pins');
  validateRelations(rowsByTable,identities,issue,stage,typeof inventory.source_file_sha256==="string"?inventory.source_file_sha256:"",object(m.schema_contract)&&isHistoricalSalesSourceProfile(m.schema_contract.source_declarations_sha256),m.source_namespace as string,options.historicalStaffHallApproval,options.explicitZeroApproval,inventory.cutoff_at as string,options.historicalLineAmountEvidence,differences,options.historicalSalesHallApproval,options.historicalSettlementRetentionApproval);
  if(options.historicalSalesHallApproval&&historicalSalesHallApprovalMatchesSource(options.historicalSalesHallApproval,m.source_namespace as string,sourceHashes)&&(rowsByTable.get("sales_header")??[]).filter(r=>Object.hasOwn(r,"historical_hall_evidence")).length!==options.historicalSalesHallApproval.records.length)issue("HISTORICAL_HALL_APPROVAL_SET_INCOMPLETE","sales_header","Every approved historical hall record must appear exactly once","BLOCK_REFERENCE");
  if(differences.length)result.historical_line_amount_differences=differences;
  if(options.historicalLineAmountEvidence&&historicalLineAmountEvidenceMatchesSource(options.historicalLineAmountEvidence,m.source_namespace as string,sourceHashes)&&differences.length!==options.historicalLineAmountEvidence.lines.length)issue("HISTORICAL_LINE_AMOUNT_EVIDENCE_SET_INCOMPLETE","sales_line","Every reviewed source discrepancy must match exactly once","BLOCK_REFERENCE");
  if(options.sourceOccurrenceEvidence&&result.issues.length===0){
    try { result.source_occurrence_reconciliation=reconcileSourceOccurrenceEvidence(options.sourceOccurrenceEvidence,{manifest:m as unknown as PackageManifest,registry:input.registry as IdentityEntry[],records:table=>(input.records as Record<string,StandardRecord[]>)[table]??[],...(options.explicitZeroApproval?{explicitZeroApproval:options.explicitZeroApproval}:{}),...(options.historicalSalesHallApproval?{historicalSalesHallApproval:options.historicalSalesHallApproval}:{})}); }
    catch(error) { const code=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'SOURCE_RECONCILIATION_REJECTED';issue(code,'source_occurrence_evidence','Separately pinned original-source reconciliation failed closed','BLOCK_REFERENCE'); }
  }
  result.valid=result.issues.length===0;
  // No DB writer is implemented; successful REAL validation is not import authorization.
  return result;
}

/** Strict UTF8/LF JSONL, no BOM, CR, blank records or duplicate JSON object keys. */
export function decodeJsonl(bytes:Uint8Array):unknown[] {
  const text=decodeUtf8(bytes);if(!text)return [];
  if(!text.endsWith("\n"))throw new Error("JSONL requires LF terminator");
  return text.slice(0,-1).split("\n").map(line=>{if(!line.trim())throw new Error("Blank record");return parseStrictJson(line);});
}
export function decodeUtf8(bytes:Uint8Array):string {
  if(bytes.length>=3 && bytes[0]===239 && bytes[1]===187 && bytes[2]===191)throw new Error("BOM forbidden");
  const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);if(text.includes("\r"))throw new Error("CR forbidden");return text;
}
/** Duplicate key detection is token-based; JSON.parse alone silently overwrites facts. */
export function parseStrictJson(text:string):unknown {
  const stack:({kind:"object";keys:Set<string>;expectKey:boolean}|{kind:"array"})[]=[];
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {
      let end=i+1;for(;end<text.length;end++){if(text[end]==="\\"){end++;continue;}if(text[end]==='"')break;}
      const token=text.slice(i,end+1),top=stack.at(-1);
      if(top?.kind==="object" && top.expectKey){const key=JSON.parse(token) as string;if(top.keys.has(key))throw new Error("Duplicate JSON key");top.keys.add(key);top.expectKey=false;}
      i=end;
    } else if(c==="{")stack.push({kind:"object",keys:new Set(),expectKey:true});
    else if(c==="[")stack.push({kind:"array"});
    else if(c==="}" || c==="]")stack.pop();
    else if(c===","){const top=stack.at(-1);if(top?.kind==="object")top.expectKey=true;}
  }
  return JSON.parse(text) as unknown;
}

function validateRelations(tables:Map<string,StandardRecord[]>,registry:Map<string,IdentityEntry>,issue:(code:string,path:string,message:string,severity?:IssueSeverity)=>void,stage:PackageStage,inventorySourceSha256:string,sourceProfile=false,sourceNamespace="",historicalStaffHallApproval?:HistoricalStaffHallApproval,explicitZeroApproval?:ExplicitZeroApproval,inventoryCutoff="",historicalLineAmountEvidence?:HistoricalLineAmountEvidence,differences:HistoricalLineAmountDifference[]=[],historicalSalesHallApproval?:HistoricalSalesHallApproval,historicalSettlementRetentionApproval?:HistoricalSettlementRetentionApproval):void {
  const retainedSettlementIds=new Set<string>();
  const retained=(row:StandardRecord|undefined)=>isRetainedHistoricalSale(row,stage==="CLEANED"&&sourceProfile);
  const rows=(table:string)=>tables.get(table)??[];
  const id=(table:string,row:StandardRecord)=>registry.get(`${table.toUpperCase()}:${row.source_key}`)?.target_id;
  const byId=(table:string)=>new Map(rows(table).map(r=>[id(table,r),r]));
  const sales=byId("sales_header"),transfers=byId("transfer_header"),warehouses=byId("warehouse"),products=byId("product");
  // EXPLICIT_KEYS has no absent-is-zero carrier. A zero is covered only when an
  // actual byte-pinned baseline row declares it with designated snapshot refs.
  const stockKey=(warehouse:unknown,sku:unknown)=>JSON.stringify([warehouse,sku]);
  const coveredStockKeys=new Set(rows("inventory_baseline")
    .filter(row=>Object.hasOwn(row,"explicit_zero_evidence")?explicitZeroApproved(explicitZeroApproval,sourceNamespace,inventorySourceSha256,inventoryCutoff,row):Array.isArray(row.source_refs)&&row.source_refs.some(ref=>object(ref)&&ref.file_sha256===inventorySourceSha256))
    .map(row=>stockKey(row.fields.warehouse_id,row.fields.sku_id)));
  const requireStockKey=(warehouse:unknown,sku:unknown,path:string)=>{
    if(stage==="READY"&&!coveredStockKeys.has(stockKey(warehouse,sku)))
      issue("BASELINE_KEY_COVERAGE_UNKNOWN",path,"READY approved stock endpoints require explicit designated-snapshot key evidence; missing is unknown, never zero","BLOCK_CUTOVER");
  };
  const categories=byId("product_category");
  // Mirror the retained final-component constraint. A live category's parent
  // must be a live root; this also excludes self/longer cycles and depth > 2.
  for(const row of rows("product_category")) {
    const f=row.fields;
    if(f.deleted_at!==null||f.parent_id===null)continue;
    const parent=categories.get(f.parent_id as string);
    if(f.parent_id===id("product_category",row)||!parent||parent.fields.deleted_at!==null||parent.fields.parent_id!==null)
      issue("CATEGORY_TREE_CONFLICT",`product_category:${row.source_key}`,"Live category components must be acyclic, have live parents and be at most two levels","BLOCK_REFERENCE");
  }
  for(const table of ["sales_header","transfer_header"])for(const row of rows(table)) {
    const f=row.fields;
    if(f.status!=="APPROVED"&&(f.approved_by_account_id!==null||f.approved_by_staff_id!==null||f.approved_at!==null))
      issue("APPROVAL_STATE_CONFLICT",`${table}:${row.source_key}`,"Non-APPROVED current headers cannot retain current approval facts");
  }
  const unique=(table:string,key:(f:JsonRecord)=>string,code:string)=>{const seen=new Set<string>();for(const r of rows(table)){const k=key(r.fields);if(seen.has(k))issue(code,`${table}:${r.source_key}`,"Duplicate target natural/composite key","BLOCK_REFERENCE");seen.add(k);}};
  for(const [table,field] of [["customer","code"],["supplier","code"],["product","product_code"],["color","code"],["fit","code"],["size_group","code"],["season","code"],["sku","sku_code"],["sku_barcode","barcode"]])unique(table!,f=>String(f[field!]),"NATURAL_KEY_CONFLICT");
  unique("sku",f=>[f.product_id,f.color_id,f.fit_id,f.size_id].join(":"),"SKU_DIMENSION_CONFLICT");
  unique("size_group_member",f=>`${f.size_group_id}:${f.size_id}`,"COMPOSITE_KEY_CONFLICT");
  unique("payment_account_hall",f=>`${f.payment_account_id}:${f.hall_id}`,"COMPOSITE_KEY_CONFLICT");
  unique("inventory_baseline",f=>`${f.warehouse_id}:${f.sku_id}`,"STOCK_DUPLICATE_KEY");
  for(const [table,parent] of [["sales_line","sales_id"],["sales_settlement","sales_id"],["transfer_line","transfer_id"]])unique(table!,f=>`${f[parent!]}:${f.line_no}`,"DUPLICATE_LINE_POSITION");
  for(const h of rows("hall")){const w=warehouses.get(h.fields.default_sales_warehouse_id as string);if(w && w.fields.hall_id!==id("hall",h))issue("HALL_DEFAULT_WAREHOUSE_CONFLICT",`hall:${h.source_key}`,"Default warehouse must belong to the same hall","BLOCK_REFERENCE");}
  for(const r of rows("staff"))if(r.fields.role==="SALESPERSON" && r.fields.hall_id===null && !historicalStaffNullHallApproved(historicalStaffHallApproval,sourceNamespace,id("staff",r),r))issue("STAFF_HALL_REQUIRED",`staff:${r.source_key}`,"Salesperson needs a real mapped hall","BLOCK_REFERENCE");
  const main=new Set<string>();for(const r of rows("sku_barcode"))if(r.fields.enabled===true && r.fields.barcode_kind==="MAIN"){const key=String(r.fields.sku_id);if(main.has(key))issue("BARCODE_MAIN_CONFLICT",`sku_barcode:${r.source_key}`,"One enabled main barcode per SKU","BLOCK_REFERENCE");main.add(key);}
  for(const r of rows("sku")) {const product=products.get(r.fields.product_id as string);if(product && !rows("size_group_member").some(s=>s.fields.size_group_id===product.fields.size_group_id && s.fields.size_id===r.fields.size_id))issue("SKU_SIZE_GROUP_CONFLICT",`sku:${r.source_key}`,"Size identity must preserve product size-group context","BLOCK_REFERENCE");}
  const imageColors=new Set<string>();for(const r of rows("product_image"))if(r.fields.image_role==="COLOR"){const key=`${r.fields.product_id}:${r.fields.color_id}`;if(imageColors.has(key))issue("IMAGE_COLOR_CONFLICT","product_image","At most one COLOR image per product/color");imageColors.add(key);}
  for(const r of rows("product_image")) {const f=r.fields;if((f.image_role==="COLOR")!==(f.color_id!==null))issue("IMAGE_COLOR_CONFLICT",`product_image:${r.source_key}`,"Only COLOR images carry an actual mapped color");if(f.image_role==="COLOR" && !rows("sku").some(s=>s.fields.product_id===f.product_id&&s.fields.color_id===f.color_id))issue("IMAGE_COLOR_CONFLICT",`product_image:${r.source_key}`,"Image color must exist in this product SKU");}
  for(const r of rows("transfer_header"))if(r.fields.from_warehouse_id===r.fields.to_warehouse_id)issue("TRANSFER_WAREHOUSE_CONFLICT",`transfer_header:${r.source_key}`,"Transfer warehouses must differ","BLOCK_REFERENCE");
  for(const r of rows("transfer_line")) {
    const f=r.fields,h=transfers.get(f.transfer_id as string),q=BigInt(f.quantity as string);
    if(!h)issue("HEADER_NOT_FOUND",`transfer_line:${r.source_key}`,"Ordinary parent transfer row must be in complete package","BLOCK_REFERENCE");
    if(q<=0n)issue("INVALID_TRANSFER_QUANTITY",`transfer_line:${r.source_key}`,"Transfer quantity is strictly positive");
    if(stage==="READY"&&f.is_current!==true)issue("CURRENT_EFFECTIVE_REQUIRED",`transfer_line:${r.source_key}`,"READY snapshot contains only verified currently effective rows");
    if(h?.fields.status==="APPROVED"&&q!==0n) {
      requireStockKey(h.fields.from_warehouse_id,f.sku_id,`transfer_line:${r.source_key}.FROM`);
      requireStockKey(h.fields.to_warehouse_id,f.sku_id,`transfer_line:${r.source_key}.TO`);
    }
  }
  for(const r of rows("sales_line")) {
    const f=r.fields,h=sales.get(f.sales_id as string),q=BigInt(f.quantity as string);
    if(!h)issue("HEADER_NOT_FOUND",`sales_line:${r.source_key}`,"Ordinary parent sales row must be in complete package","BLOCK_REFERENCE");
    if(q===-9223372036854775808n)issue("POSTING_NEGATION_OVERFLOW",`sales_line:${r.source_key}`,"Signed sales stock delta cannot negate bigint minimum","BLOCK_POSTING");
    const retainedSignedSale=retained(h);
    if(q===0n || (h?.fields.business_type==="SALE"&&q<0n&&!retainedSignedSale))issue("INVALID_SALES_QUANTITY",`sales_line:${r.source_key}`,"SALE positive; independent RETURN/EXCHANGE any nonzero signed quantity");
    // Require the union of real endpoints, not only a netted document vector:
    // opposite EXCHANGE rows can cancel and still need the same covered key.
    if(h?.fields.status==="APPROVED"&&q!==0n)requireStockKey(h.fields.warehouse_id,f.sku_id,`sales_line:${r.source_key}`);
    if(cents(f.line_amount)!==q*cents(f.deal_price)!) {
      const difference=historicalLineAmountDifference(historicalLineAmountEvidence,{namespace:sourceNamespace,header:h,headerId:f.sales_id,line:r,lineId:id("sales_line",r),explicitCleanedSourceProfile:stage==="CLEANED"&&sourceProfile});
      if(difference)differences.push(difference);
      else issue("ECONOMIC_DIFFERENCE",`sales_line:${r.source_key}`,"Original arithmetic difference requires separately pinned exact source evidence; never rewrite facts","BLOCK_POSTING");
    }
    const unknownPricing=f.pricing_rule===null&&f.discount_tenths===null&&f.zero_confirmed===null;
    const knownPricing=f.pricing_rule!==null&&f.zero_confirmed!==null&&
      (f.pricing_rule==="UNIT_PRICE"&&f.discount_tenths===null||f.pricing_rule==="DISCOUNT"&&f.discount_tenths!==null);
    if(!unknownPricing&&!knownPricing)issue("PRICING_FACT_CONFLICT",`sales_line:${r.source_key}`,"Pricing intent, discount and zero confirmation must preserve the complete known/unknown shape");
    if(f.is_gift===true&&cents(f.deal_price)!==0n)issue("GIFT_PRICE_CONFLICT",`sales_line:${r.source_key}`,"Known gift must have zero actual deal price");
    if(stage==="READY"&&f.is_current!==true)issue("CURRENT_EFFECTIVE_REQUIRED",`sales_line:${r.source_key}`,"READY snapshot contains only verified currently effective rows");
  }
  for(const r of rows("sales_settlement"))if(!sales.has(r.fields.sales_id as string))issue("HEADER_NOT_FOUND",`sales_settlement:${r.source_key}`,"Every retained settlement resolves its ordinary parent","BLOCK_REFERENCE");
  for(const [salesId,h] of sales) {
    const f=h.fields,lines=rows("sales_line").filter(r=>r.fields.sales_id===salesId).sort((a,b)=>Number(a.fields.line_no)-Number(b.fields.line_no)),settlements=rows("sales_settlement").filter(r=>r.fields.sales_id===salesId);
    if(!lines.length)issue("DOCUMENT_LINES_REQUIRED",`sales_header:${h.source_key}`,"Complete current-effective document needs actual rows","BLOCK_REFERENCE");
    const gross=lines.reduce((sum,l)=>sum+cents(l.fields.line_amount)!,0n),discount=cents(f.order_discount)!;
    if(cents(f.gross_amount)!==gross || cents(f.net_due)!==gross-discount)issue("ECONOMIC_DIFFERENCE",`sales_header:${h.source_key}`,"Retain source totals and report gross/net difference without rewriting facts","BLOCK_POSTING");
    // Unknown allocation is not permission to bypass an independently known
    // SALE header bound. RETURN/EXCHANGE retain their independent signed facts.
    const retainedSignedSale=retained(h)&&lines.some(l=>BigInt(l.fields.quantity as string)<0n);
    if(f.business_type==="SALE"&&!retainedSignedSale&&(discount<0n||discount>gross))issue("INVALID_ORDER_DISCOUNT",`sales_header:${h.source_key}`,"SALE order discount must be between zero and nonnegative gross total","BLOCK_POSTING");
    if(f.business_type!=="SALE"&&discount!==0n)issue("INDEPENDENT_RETURN_DISCOUNT",`sales_header:${h.source_key}`,"RETURN/EXCHANGE order discount must be zero","BLOCK_POSTING");
    if(lines.length && lines.every(l=>l.fields.allocated_discount!==null)) {
      // Preserve evidenced original allocation, never invent a positive-only
      // largest-remainder split across signed historical rows. Known sums
      // still have to match the retained header; null stays unknown.
      if(retainedSignedSale) {
        if(lines.reduce((sum,l)=>sum+cents(l.fields.allocated_discount)!,0n)!==discount)issue("DISCOUNT_ALLOCATION_MISMATCH",`sales_header:${h.source_key}`,"Retained known historical allocations must sum to the original header discount","BLOCK_POSTING");
      } else try {const shares=f.business_type==="SALE"&&!retainedSignedSale?allocateSalesDiscount(lines.map(l=>minorAmount(cents(l.fields.line_amount)!.toString())),minorAmount(discount.toString())):lines.map(()=>0n);if(lines.some((l,i)=>cents(l.fields.allocated_discount)!==shares[i]))issue("DISCOUNT_ALLOCATION_MISMATCH",`sales_header:${h.source_key}`,"Known allocations must preserve existing stable largest-remainder rule","BLOCK_POSTING");}catch{issue("DISCOUNT_ALLOCATION_MISMATCH",`sales_header:${h.source_key}`,"Known economics cannot satisfy existing discount rule","BLOCK_POSTING");}
    }
    const settlementRetained=historicalSettlementRetentionMatches(historicalSettlementRetentionApproval,{namespace:sourceNamespace,header:h,headerId:salesId,settlements,explicitCleanedSourceProfile:stage==="CLEANED"&&sourceProfile});
    if(settlementRetained)retainedSettlementIds.add(String(salesId));
    const net=settlements.reduce((sum,s)=>sum+(s.fields.direction==="REFUND"?-1n:1n)*cents(s.fields.amount)!,0n);
    if(f.status==="APPROVED"&&!(isRetainedHistoricalSalesDocument(h,stage==="CLEANED"&&sourceProfile)&&settlements.length===0)&&!settlementRetained&&net!==cents(f.net_due))issue("SETTLEMENT_MISMATCH",`sales_header:${h.source_key}`,"All RECEIVE minus REFUND rows must equal approved net due; no truncation/merge","BLOCK_POSTING");
    const w=warehouses.get(f.warehouse_id as string);let validHallEvidence=false;
    if(Object.hasOwn(h,"historical_hall_evidence")){try{validateHistoricalSalesHallEvidence(h.historical_hall_evidence,{sourceNamespace,sourceKey:h.source_key,targetId:salesId,sourceRefs:h.source_refs,fields:f,approval:historicalSalesHallApproval,requireInitializationMaster:true,...(w&&stage==="READY"?{warehouse:w.fields,warehouseSourceKey:w.source_key,warehouseTargetId:id("warehouse",w)}:{})});validHallEvidence=true;}catch(error){issue(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'HISTORICAL_HALL_EVIDENCE_INVALID',`sales_header:${h.source_key}`,'Captured warehouse/hall evidence must remain exact','BLOCK_REFERENCE');}}
    if(w&&w.fields.hall_id!==f.hall_id&&!validHallEvidence)issue("SALES_WAREHOUSE_HALL_CONFLICT",`sales_header:${h.source_key}`,"Sales warehouse must belong to mapped hall unless exact reviewed historical evidence retains the difference","BLOCK_REFERENCE");
  }
  if(historicalSettlementRetentionApproval&&retainedSettlementIds.size!==25)issue('HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED','sales_header','Every one of the25 approved originals and their complete27 settlements must match','BLOCK_REFERENCE');
  for(const [transferId,h]of transfers)if(!rows("transfer_line").some(r=>r.fields.transfer_id===transferId))issue("DOCUMENT_LINES_REQUIRED",`transfer_header:${h.source_key}`,"Complete transfer needs actual current rows","BLOCK_REFERENCE");
}

/** Public untrusted-data boundary never throws or emits caller values. */
export function validateUnifiedPackage(input:unknown,options:ValidationOptions={}):PackageValidation {
  try {return validatePackageUnchecked(input,options);}catch{return{format_version:UNIFIED_PACKAGE_VERSION,valid:false,import_eligible:false,database_import_implemented:false,package_kind:null,stage:null,counts:{},issues:[{code:"MALFORMED_PACKAGE",severity:"BLOCK_SCHEMA",path:"$",message:"Malformed, over-deep or non-JSON package value; failed closed without echoing contents"}]};}
}

/** Shared field predicate for bounded streaming intake; not whole-package admission. */
export function validateStandardImportField(value:unknown,rule:FieldRule,stage:PackageStage):boolean {
  return fieldValid(value,rule,stage);
}
