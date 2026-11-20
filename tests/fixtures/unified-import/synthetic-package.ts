import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TABLE_SCHEMAS, SCHEMA_BASELINE_COMMIT, SCHEMA_DECLARATIONS_SHA256, ENUM_MAPPING_VERSION, UNIFIED_PACKAGE_VERSION, WORK_PACKAGES, registryTargetId, sha256, jsonlBytes } from "../../../packages/application/src/unified-import-contract.ts";
import type { UnifiedPackage, StandardRecord, IdentityEntry, PackageManifest, JsonRecord } from "../../../packages/application/src/unified-import-contract.ts";
import { nativeBarcodeSchemeInitializationRows26 } from "../../../packages/application/src/native-barcode-import.ts";
import { stableImportId } from "../../../packages/application/src/inventory-cutoff-import.ts";

/** All business records, dates, quantities and provenance are deterministic SYNTHETIC examples.
 * Original six scheme definitions are reused as fixed configuration, not as source business data. */
export function createSyntheticPackage():UnifiedPackage {
  const namespace="synthetic.unified.v1",sourceDescription="SYNTHETIC ONLY source spreadsheet fixture, NOT user data",alignmentDescription="SYNTHETIC ONLY cutoff alignment evidence",sourceHash=sha256(sourceDescription),alignmentHash=sha256(alignmentDescription);
  const refs=[{file_sha256:sourceHash,sheet:"SYNTHETIC",row:1}];
  const registry:IdentityEntry[]=[],records:Record<string,StandardRecord[]>={};
  const sourceKey=(table:string,index=1)=>`${table}:${String(index).padStart(2,"0")}`;
  const identity=(table:string,index=1)=>registryTargetId(namespace,table.toUpperCase(),sourceKey(table,index));
  for(const table of Object.keys(TABLE_SCHEMAS)) {
    const fields:JsonRecord={};
    for(const [key,rule] of Object.entries(TABLE_SCHEMAS[table]!)) {
      if(rule.nullable){fields[key]=null;continue;}
      if(key==="id"){fields[key]=identity(table);continue;}
      if(rule.reference){fields[key]=identity(rule.reference);continue;}
      if(rule.enum){fields[key]=rule.enum[0];continue;}
      fields[key]=({uuid:stableImportId("synthetic",key),text:`SYNTHETIC ${key}`,int32:1,quantity:"1",money:"1.00",signed_money:"1.00",boolean:true,instant:"2026-11-02T08:00:00+08:00",date:"2026-11-02",uuid_array:[]})[rule.kind];
    }
    records[table]=[{source_key:sourceKey(table),fields,source_refs:structuredClone(refs)}];
    if(TABLE_SCHEMAS[table]!.id)registry.push({entity_type:table.toUpperCase(),source_namespace:namespace,canonical_source_key:sourceKey(table),target_id:identity(table),aliases:[],identity_basis:"STABLE_IMPORT_ID_V1",source_refs:structuredClone(refs)});
  }
  const f=(table:string)=>records[table]![0]!.fields;
  Object.assign(f("hall"),{name:"SYNTHETIC hall",default_customer_id:identity("customer"),default_sales_warehouse_id:identity("warehouse")});
  const second=structuredClone(records.warehouse![0]!);second.source_key=sourceKey("warehouse",2);second.fields.id=identity("warehouse",2);second.fields.name="SYNTHETIC second warehouse";records.warehouse!.push(second);
  registry.push({entity_type:"WAREHOUSE",source_namespace:namespace,canonical_source_key:second.source_key,target_id:second.fields.id as string,aliases:[],identity_basis:"STABLE_IMPORT_ID_V1",source_refs:structuredClone(refs)});
  Object.assign(f("staff"),{role:"SALESPERSON",hall_id:identity("hall"),employment_status:"在职",contact:"001234"});
  Object.assign(f("fit"),{code:"A",name:"SYNTHETIC explicit fit A"});
  Object.assign(f("size"),{code:"900",name:"SYNTHETIC group-context size"});
  Object.assign(f("product"),{product_code:"SYNTHETIC-P0001",name:"SYNTHETIC product",season_id:identity("season"),season_ids:[identity("season")],default_barcode_scheme_id:"0e70e45e-1a51-4d44-afe8-0002cf3fb7ef"});
  for(const [key,rule]of Object.entries(TABLE_SCHEMAS.product!))if(rule.kind==="money")f("product")[key]="1.00";
  Object.assign(f("product_image"),{file_ref:"synthetic-images/example.png",mime:"image/png",byte_size:"68",image_role:null,color_id:null,created_by_account_id:null});
  Object.assign(f("sku"),{sku_code:"SYNTHETIC-0001"});
  registry.splice(registry.findIndex(r=>r.entity_type==="BARCODE_SCHEME"),1);
  records.barcode_scheme=nativeBarcodeSchemeInitializationRows26().map(({sourceSchemeKey,native})=>{
    registry.push({entity_type:"BARCODE_SCHEME",source_namespace:namespace,canonical_source_key:sourceSchemeKey,target_id:native.id,aliases:[],identity_basis:"EXISTING_VERIFIED",source_refs:structuredClone(refs)});
    return{source_key:sourceSchemeKey,fields:{...native},source_refs:structuredClone(refs)};
  });
  Object.assign(f("sku_barcode"),{barcode:"000000000000001",scheme_id:"0e70e45e-1a51-4d44-afe8-0002cf3fb7ef",barcode_kind:"MAIN"});
  for(const table of ["sales_header","transfer_header"])Object.assign(f(table),{number:`SYNTHETIC-${table}`,status:"APPROVED",stock_basis:"CUTOFF_HISTORY",import_batch_id:stableImportId("synthetic","unified-batch"),note:null});
  Object.assign(f("sales_header"),{business_type:"SALE",gross_amount:"16.00",order_discount:"0.00",net_due:"16.00"});
  Object.assign(f("sales_line"),{quantity:"16",deal_price:"1.00",line_amount:"16.00",allocated_discount:null,reference_price:null,is_gift:null,pricing_rule:null,discount_tenths:null,zero_confirmed:null});
  Object.assign(f("transfer_header"),{from_warehouse_id:identity("warehouse"),to_warehouse_id:identity("warehouse",2)});
  Object.assign(f("transfer_line"),{quantity:"2"});
  const template=records.sales_settlement![0]!;
  registry.splice(registry.findIndex(r=>r.entity_type==="SALES_SETTLEMENT"),1);
  records.sales_settlement=Array.from({length:16},(_,i)=>{
    const key=sourceKey("sales_settlement",i+1),target=identity("sales_settlement",i+1);
    registry.push({entity_type:"SALES_SETTLEMENT",source_namespace:namespace,canonical_source_key:key,target_id:target,aliases:[],identity_basis:"STABLE_IMPORT_ID_V1",source_refs:[{...refs[0]!,row:i+1}]});
    return{...structuredClone(template),source_key:key,fields:{...template.fields,id:target,line_no:i+1,amount:"1.00",direction:"RECEIVE"},source_refs:[{...refs[0]!,row:i+1}]};
  });
  Object.assign(f("inventory_baseline"),{quantity:"100"});
  // A NEW declared synthetic source fact, not a default for missing real keys.
  // The approved transfer's TO endpoint explicitly has known snapshot zero.
  const explicitToZero=structuredClone(records.inventory_baseline![0]!);
  explicitToZero.source_key=sourceKey("inventory_baseline",2);
  Object.assign(explicitToZero.fields,{warehouse_id:identity("warehouse",2),quantity:"0"});
  explicitToZero.source_refs=[{...refs[0]!,row:2}];records.inventory_baseline!.push(explicitToZero);
  const manifest:PackageManifest={format_version:UNIFIED_PACKAGE_VERSION,stage:"READY",package_kind:"SYNTHETIC",source_namespace:namespace,
    schema_contract:{commit:SCHEMA_BASELINE_COMMIT,source_declarations_sha256:SCHEMA_DECLARATIONS_SHA256,proposed_contract_version:UNIFIED_PACKAGE_VERSION},enum_mapping_version:ENUM_MAPPING_VERSION,decimal_scale:2,quantity_unit:"PIECE",snapshot_mode:"CURRENT_EFFECTIVE",identity_registry:{relative_path:"identity-registry.jsonl",bytes:0,sha256:"",row_count:0},files:[],reports:[],assets:[],source_files:[{relative_path:"SYNTHETIC-source-description.txt",bytes:Buffer.byteLength(sourceDescription),sha256:sourceHash},{relative_path:"SYNTHETIC-alignment-evidence.txt",bytes:Buffer.byteLength(alignmentDescription),sha256:alignmentHash}],
    work_packages:WORK_PACKAGES.map(w=>({number:w.number,version:"SYNTHETIC_V1"})),
    inventory_source:{kind:"SYNTHETIC_NEW_SNAPSHOT",source_file_sha256:sourceHash,exported_at:"2026-11-02T16:00:00+08:00",source_timezone:"Asia/Shanghai",cutoff_at:"2026-11-02T16:00:00+08:00",unit:"PIECE",coverage_mode:"EXPLICIT_KEYS",warehouse_registry_sha256:"",sku_registry_sha256:""},
    document_cutoff_alignment:{scope:"CURRENT_EFFECTIVE",evidence_sha256:alignmentHash}};
  return repinSyntheticPackage({manifest,registry,records,artifacts:{},reports:{"decisions.json":{format_version:UNIFIED_PACKAGE_VERSION,package_kind:"SYNTHETIC",source_namespace:namespace,rules:[{code:"NO_MAIN_UNIT",scope:"SYNTHETIC all product fields; never add main_unit",evidence_sha256:sourceHash},{code:"DEFAULT_FIT_A",scope:"SYNTHETIC approved missing-source-fit scope only; no known-fit override or alias-conflict resolution",evidence_sha256:sourceHash},{code:"PRESERVE_EXISTING_SIZE_MAPPING",scope:"SYNTHETIC original size-group context, never global code dedupe",evidence_sha256:sourceHash}]},"exceptions.jsonl":[],"reconciliation.json":{format_version:UNIFIED_PACKAGE_VERSION,package_kind:"SYNTHETIC",source_namespace:namespace,tables:Object.fromEntries(Object.entries(records).map(([table,rows])=>[table,{source_rows:rows.length,retained_rows:rows.length,rejected_rows:0}]))}}});
}

/** Test-only repinning helper, never a source-cleaning/READY assembly implementation. */
export function repinSyntheticPackage(p:UnifiedPackage):UnifiedPackage {
  p.artifacts={};
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLf8AAAAASUVORK5CYII=","base64");
  p.artifacts["synthetic-images/example.png"]=png;
  p.manifest.assets=[{relative_path:"synthetic-images/example.png",file_ref:"synthetic-images/example.png",bytes:png.length,sha256:sha256(png),mime:"image/png"}];
  const bytes=jsonlBytes(p.registry);p.artifacts["identity-registry.jsonl"]=bytes;
  p.manifest.identity_registry={relative_path:"identity-registry.jsonl",bytes:bytes.byteLength,sha256:sha256(bytes),row_count:p.registry.length};
  p.manifest.inventory_source.warehouse_registry_sha256=p.manifest.identity_registry.sha256;p.manifest.inventory_source.sku_registry_sha256=p.manifest.identity_registry.sha256;
  p.manifest.reports=Object.entries(p.reports).map(([path,value])=>{const encoding=path.endsWith(".jsonl")?"JSONL" as const:"JSON" as const,bytes=encoding==="JSONL"?jsonlBytes(value as unknown[]):new TextEncoder().encode(JSON.stringify(value)+"\n");p.artifacts[path]=bytes;return{relative_path:path,bytes:bytes.length,sha256:sha256(bytes),row_count:Array.isArray(value)?value.length:1,role:({"decisions.json":"DECISIONS","exceptions.jsonl":"EXCEPTIONS","reconciliation.json":"RECONCILIATION"} as const)[path as "decisions.json"],encoding};});
  p.manifest.files=Object.keys(p.records).sort().map(table=>{const rows=p.records[table]!,data=jsonlBytes(rows),path=`${table}.jsonl`;p.artifacts[path]=data;return{table,work_package:WORK_PACKAGES.find(w=>w.tables.includes(table as never))!.number,relative_path:path,bytes:data.byteLength,sha256:sha256(data),row_count:rows.length};});
  return p;
}
export async function writeSyntheticPackage(root:string):Promise<void> { const p=createSyntheticPackage();await mkdir(root,{recursive:true});for(const [path,bytes] of Object.entries(p.artifacts)){const target=join(root,path);await mkdir(join(target,".."),{recursive:true});await writeFile(target,bytes);}await writeFile(join(root,"manifest.json"),JSON.stringify(p.manifest,null,2)+"\n"); }
