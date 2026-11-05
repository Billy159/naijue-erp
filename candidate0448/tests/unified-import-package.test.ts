import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { UNIFIED_PACKAGE_VERSION, WORK_PACKAGES, TABLE_SCHEMAS, validateUnifiedPackage, validateMoneyString, validateQuantityString, validateInt32, validateCalendarDate, validateOffsetInstant, registryTargetId } from "../packages/application/src/unified-import-contract.ts";
import { createSyntheticPackage, repinSyntheticPackage, writeSyntheticPackage } from "./fixtures/unified-import/synthetic-package.ts";
import { inspectPackageDirectory } from "../tools/unified-import/package-reader.ts";
import { stableImportId } from "../packages/application/src/inventory-cutoff-import.ts";

function codes(result: ReturnType<typeof validateUnifiedPackage>): string[] { return result.issues.map(issue => issue.code); }
function fixture() { return createSyntheticPackage(); }
function mutate(table: string, fn: (fields: Record<string, unknown>) => void) { const p = fixture(); fn(p.records[table]![0]!.fields); return repinSyntheticPackage(p); }

test("fixed version and thirteen package ownership do not inherit the old numbering", () => {
  assert.equal(UNIFIED_PACKAGE_VERSION, "UNIFIED_STANDARD_PACKAGE_V1");
  assert.deepEqual(WORK_PACKAGES.map(w => w.number), Array.from({length:13}, (_, i) => i + 1));
  assert.ok(WORK_PACKAGES[3]!.tables.includes("sku"));
  assert.deepEqual(WORK_PACKAGES.slice(7).map(w => w.tables), [["transfer_header"],["transfer_line"],["sales_header"],["sales_line"],["sales_settlement"],["inventory_baseline"]]);
});
test("deterministic synthetic package covers every supported table and preserves 16 settlements", () => {
  const p = fixture(), r = validateUnifiedPackage(p, { allowSynthetic: true });
  assert.deepEqual(r.issues, []); assert.equal(r.valid, true); assert.equal(r.import_eligible, false);
  assert.equal(p.records.sales_settlement!.length, 16);
  assert.deepEqual(Object.keys(p.records).sort(), Object.keys(TABLE_SCHEMAS).sort());
  assert.deepEqual(p, fixture());
});
test("synthetic is never silently accepted as actual user new-file data", () => { assert.ok(codes(validateUnifiedPackage(fixture())).includes("SYNTHETIC_REQUIRES_OPT_IN")); });

test("central registry uses existing typed stableImportId, not UUIDv5 or filenames", () => {
  assert.equal(registryTargetId("synthetic.unified.v1", "SKU", "sku:01"), stableImportId("entity", "synthetic.unified.v1", "SKU", "sku:01"));
  const p = fixture(); const e = p.registry.find(e => e.entity_type === "SKU")!;
  e.target_id = "12345678-1234-1234-1234-123456789abc"; e.identity_basis = "EXISTING_VERIFIED";
  const prior = p.records.sku![0]!.fields;
  assert.equal(prior.sku_code, "SYNTHETIC-0001");
  assert.ok(!codes(validateUnifiedPackage(repinSyntheticPackage(p), {allowSynthetic:true})).includes("REGISTRY_ID_ALGORITHM_MISMATCH"));
});

for (const value of [0, 1.1, "1e2", "+1.00", "01.00", "-0.00", "1.001", "10000000000000000.00"]) test(`money rejects ${String(value)}`, () => assert.equal(validateMoneyString(value, "READY"), false));
for (const value of ["0.00", "1.20", "-9999999999999999.99"]) test(`money accepts exact ${value}`, () => assert.equal(validateMoneyString(value, "READY"), true));
test("CLEANED permits exact lossless padding, READY requires two decimals", () => { assert.equal(validateMoneyString("1.2", "CLEANED"), true); assert.equal(validateMoneyString("1.2", "READY"), false); });
for (const value of [1, "01", "-0", "1.0", "+1", "9223372036854775808", "-9223372036854775809"]) test(`quantity rejects ${String(value)}`, () => assert.equal(validateQuantityString(value), false));
test("quantity bigint limits are exact", () => { assert.equal(validateQuantityString("-9223372036854775808"), true); assert.equal(validateQuantityString("9223372036854775807"), true); });
test("int32 requires safe JSON integer, not string/float/out-of-range", () => { for (const v of ["1", 1.5, 2147483648, -2147483649, Infinity]) assert.equal(validateInt32(v), false); assert.equal(validateInt32(2147483647), true); });
test("calendar rejects normalized invalid dates", () => { assert.equal(validateCalendarDate("2026-02-29"), false); assert.equal(validateCalendarDate("2024-02-29"), true); assert.equal(validateCalendarDate("2026-04-31"), false); });
test("instant requires real date explicit offset <=microseconds, never invents Z", () => { for (const v of ["2026-11-02", "2026-11-02T08:00:00", "2026-02-30T00:00:00Z", "2026-11-02T08:00:00.1234567Z", "2026-11-02T08:00:00+25:00"]) assert.equal(validateOffsetInstant(v), false); assert.equal(validateOffsetInstant("2026-11-02T08:00:00.123456+08:00"), true); });

for (const [label, change, code] of [
  ["money number", (f:Record<string,unknown>) => { f.deal_price = 1; }, "FIELD_TYPE"],
  ["missing field", (f:Record<string,unknown>) => { delete f.zero_confirmed; }, "FIELD_MISSING"],
  ["invented unit", (f:Record<string,unknown>) => { f.main_unit = "PIECE"; }, "FIELD_UNKNOWN"],
  ["posting overflow", (f:Record<string,unknown>) => { f.quantity = "-9223372036854775808"; }, "POSTING_NEGATION_OVERFLOW"],
  ["economic mismatch", (f:Record<string,unknown>) => { f.line_amount = "1.00"; }, "ECONOMIC_DIFFERENCE"],
] as const) test(label, () => assert.ok(codes(validateUnifiedPackage(mutate("sales_line", change), {allowSynthetic:true})).includes(code)));

test("known unknown actors times and pricing stay null, never fake account/now/false", () => {
  const p = fixture(); const h = p.records.sales_header![0]!.fields, l = p.records.sales_line![0]!.fields;
  assert.equal(h.created_by_account_id, null); assert.equal(h.created_at, null); assert.equal(h.created_by_staff_id, null);
  assert.equal(l.is_gift, null); assert.equal(l.pricing_rule, null); assert.equal(l.zero_confirmed, null);
  assert.equal(validateUnifiedPackage(p, {allowSynthetic:true}).valid, true);
});
test("missing date blocks READY without substituting cutoff", () => { assert.ok(codes(validateUnifiedPackage(mutate("sales_header", f => { f.business_date = null; }), {allowSynthetic:true})).includes("FIELD_TYPE")); });
test("SALE positive rule, RETURN/EXCHANGE signed rules are source semantics", () => {
  for (const kind of ["RETURN", "EXCHANGE"]) { const p = fixture(); p.records.sales_header![0]!.fields.business_type = kind; assert.ok(!codes(validateUnifiedPackage(repinSyntheticPackage(p), {allowSynthetic:true})).includes("INVALID_SALES_QUANTITY")); }
  const runtimeSale=mutate("sales_line", f => { f.quantity = "-1"; }); runtimeSale.records.sales_header![0]!.fields.stock_basis="RUNTIME_LEDGER";
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(runtimeSale), {allowSynthetic:true})).includes("INVALID_SALES_QUANTITY"));
});
test("transfer quantity must be positive and warehouses distinct", () => {
  assert.ok(codes(validateUnifiedPackage(mutate("transfer_line", f => { f.quantity = "-1"; }), {allowSynthetic:true})).includes("INVALID_TRANSFER_QUANTITY"));
  assert.ok(codes(validateUnifiedPackage(mutate("transfer_header", f => { f.to_warehouse_id = f.from_warehouse_id; }), {allowSynthetic:true})).includes("TRANSFER_WAREHOUSE_CONFLICT"));
});
test("sixteen settlement rows retain original position and source keys without cap or merging", () => { const p = fixture(); assert.equal(new Set(p.records.sales_settlement!.map(r => r.source_key)).size,16); assert.equal(new Set(p.records.sales_settlement!.map(r => r.fields.line_no)).size,16); assert.equal(validateUnifiedPackage(p,{allowSynthetic:true}).counts.sales_settlement,16); });
test("approved settlement mismatch reports, drafts can be unbalanced", () => {
  const p = mutate("sales_settlement", f => { f.amount = "2.00"; });
  assert.ok(codes(validateUnifiedPackage(p,{allowSynthetic:true})).includes("SETTLEMENT_MISMATCH"));
  p.records.sales_header![0]!.fields.status = "DRAFT";
  assert.ok(!codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("SETTLEMENT_MISMATCH"));
});
test("no source-key aliases may collide or cross namespaces", () => { const p = fixture(); p.registry[0]!.aliases = [p.registry[0]!.canonical_source_key]; assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("REGISTRY_ALIAS_CONFLICT")); });
test("unknown FK and duplicate current position fail closed", () => {
  assert.ok(codes(validateUnifiedPackage(mutate("sales_line", f => { f.sku_id = stableImportId("unknown"); }),{allowSynthetic:true})).includes("REGISTRY_UNRESOLVED"));
  const p = fixture(); p.records.sales_settlement![1]!.fields.line_no = 1;
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("DUPLICATE_LINE_POSITION"));
});
test("missing stock keys are unknown, never implicitly zero; duplicate explicit keys rejected", () => { const p = fixture(); assert.equal(p.manifest.inventory_source.coverage_mode,"EXPLICIT_KEYS"); p.records.inventory_baseline!.push(structuredClone(p.records.inventory_baseline![0]!)); assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("STOCK_DUPLICATE_KEY")); });
test("READY real package requires actual cutoff and source/alignment evidence", () => { const p = fixture(); p.manifest.package_kind = "REAL"; p.manifest.inventory_source.kind = "UNVERIFIED"; p.manifest.inventory_source.cutoff_at = null; p.manifest.document_cutoff_alignment.evidence_sha256 = null; const c = codes(validateUnifiedPackage(repinSyntheticPackage(p))); assert.ok(c.includes("STOCK_SOURCE_NOT_VERIFIED")); assert.ok(c.includes("BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN")); });
test("hash and row counts are verified independently, not caller validation flags", () => { const p = fixture(); p.manifest.files[0]!.sha256 = "a".repeat(64); p.manifest.files[0]!.row_count += 1; const c = codes(validateUnifiedPackage(p,{allowSynthetic:true})); assert.ok(c.includes("FILE_HASH_MISMATCH")); assert.ok(c.includes("FILE_ROW_COUNT_MISMATCH")); });
test("secret-bearing fields are rejected without echoing secret value", () => { const p = fixture(); p.records.staff![0]!.fields.password_hash = "DO_NOT_PRINT_SYNTHETIC_SECRET"; const r = validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true}); assert.ok(codes(r).includes("FORBIDDEN_CREDENTIAL")); assert.ok(!JSON.stringify(r).includes("DO_NOT_PRINT_SYNTHETIC_SECRET")); });

test("offline reader and CLI validate files; execution handlers fail closed without target inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "unified-package-test-"));
  try {
    await writeSyntheticPackage(root);
    const inspected = await inspectPackageDirectory(root, {allowSynthetic:true}); assert.equal(inspected.valid,true);
    const cli = join(process.cwd(),"tools/unified-import/cli.ts");
    const valid = spawnSync(process.execPath,[cli,"validate","--package",root,"--allow-synthetic"],{encoding:"utf8"});
    assert.equal(valid.status,0,valid.stderr+valid.stdout); assert.equal(JSON.parse(valid.stdout).database_import_implemented,false);
    for (const cmd of ["import","reconcile","prepare","dry-run"]) { const r = spawnSync(process.execPath,[cli,cmd,"--package",root],{encoding:"utf8"}); assert.equal(r.status,3); assert.equal(JSON.parse(r.stdout).code,"NOT_IMPLEMENTED"); }
    const resume = spawnSync(process.execPath,[cli,"resume","--package",root],{encoding:"utf8"}); assert.equal(resume.status,1); assert.equal(JSON.parse(resume.stdout).code,"TARGET_PROFILE_UNVERIFIED");
    const bad = spawnSync(process.execPath,[cli,"validate","--package",root,"--database-url","SYNTHETIC_NOT_A_SECRET"],{encoding:"utf8"}); assert.equal(bad.status,2); assert.ok(!bad.stdout.includes("SYNTHETIC_NOT_A_SECRET"));
  } finally { await rm(root,{recursive:true,force:true}); }
});
test("reader rejects traversal symlinks BOM CRLF invalid UTF8 and modified bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "unified-package-errors-"));
  try {
    await writeSyntheticPackage(root); const file = join(root,"sales_line.jsonl"), original = await readFile(file);
    await writeFile(file,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),original])); assert.ok((await inspectPackageDirectory(root,{allowSynthetic:true})).issues.some(i => i.code === "INVALID_ENCODING"));
    await writeFile(file,original.toString().replace(/\n/g,"\r\n")); assert.ok((await inspectPackageDirectory(root,{allowSynthetic:true})).issues.some(i => i.code === "INVALID_ENCODING"));
    await writeFile(file,Buffer.from([0xff,0x0a])); assert.ok((await inspectPackageDirectory(root,{allowSynthetic:true})).issues.some(i => i.code === "INVALID_ENCODING"));
    await writeSyntheticPackage(root); const path = join(root,"manifest.json"), m = JSON.parse(await readFile(path,"utf8")); m.files[0].relative_path = "../outside.jsonl"; await writeFile(path,JSON.stringify(m)); assert.ok((await inspectPackageDirectory(root,{allowSynthetic:true})).issues.some(i => i.code === "UNSAFE_PATH"));
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("closed fields reject prototype names and a missing newly assigned registry target", () => {
  const p=fixture();p.records.staff![0]!.fields.toString="SYNTHETIC" as unknown as (()=>string);
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("FIELD_UNKNOWN"));
  const q=fixture();q.records.warehouse=[];assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(q),{allowSynthetic:true})).includes("REGISTRY_TARGET_ROW_MISSING"));
});
test("retained six scheme IDs/descriptions are validated, not just fixture decoration", () => {
  const p=fixture();p.records.barcode_scheme![0]!.fields.rule_description="SYNTHETIC changed approved description";
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("BARCODE_SCHEME_CONFIGURATION_MISMATCH"));
});
test("pinned decision exceptions and reconciliation reports are part of the same package", () => {
  const p=fixture();assert.equal(p.manifest.reports.length,3);assert.equal(validateUnifiedPackage(p,{allowSynthetic:true}).valid,true);
  (p.reports["exceptions.jsonl"] as unknown[]).push({entity_type:"SKU",source_key:"SYNTHETIC",field:"fit_id",code:"REGISTRY_UNRESOLVED",observed_value:null,expected_rule:"Frozen mapping",source_refs:p.records.sku![0]!.source_refs,severity:"BLOCK_REFERENCE",proposed_action:"Resolve centrally"});
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("UNRESOLVED_EXCEPTION"));
});
test("duplicate JSON keys and non-JSON malformed inputs never become successful validation", async () => {
  for(const input of [null,[],{}, {manifest:{},registry:[],records:{},artifacts:{},reports:{}}])assert.equal(validateUnifiedPackage(input).valid,false);
  const root=await mkdtemp(join(tmpdir(),"unified-duplicate-"));try{await writeSyntheticPackage(root);const path=join(root,"manifest.json"),text=await readFile(path,"utf8");await writeFile(path,text.replace('"stage": "READY"','"stage": "CLEANED", "stage": "READY"'));assert.ok((await inspectPackageDirectory(root,{allowSynthetic:true})).issues.some(i=>i.code==="INVALID_MANIFEST"));}finally{await rm(root,{recursive:true,force:true});}
});
test("planned public cli.mjs has offline/report/version/capability interface", async () => {
  const root=await mkdtemp(join(tmpdir(),"unified-cli-public-"));try{const pkg=join(root,"package"),report=join(root,"report");await writeSyntheticPackage(pkg);const cli=join(process.cwd(),"tools/unified-import/cli.mjs");const r=spawnSync(process.execPath,[cli,"validate","--package",pkg,"--offline","--allow-synthetic","--report",report],{encoding:"utf8"});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(await readFile(join(report,"validation-report.json"),"utf8")).valid,true);for(const cmd of ["version","capability-report"]){const v=spawnSync(process.execPath,[cli,cmd],{encoding:"utf8"});assert.equal(v.status,0);assert.equal(JSON.parse(v.stdout).format_version,UNIFIED_PACKAGE_VERSION);}for(const cmd of ["plan","rehearse","rollback-plan"]){const v=spawnSync(process.execPath,[cli,cmd],{encoding:"utf8"});assert.equal(v.status,3);assert.equal(JSON.parse(v.stdout).code,"NOT_IMPLEMENTED");}for(const cmd of ["inspect-target","apply","status","verify"]){const v=spawnSync(process.execPath,[cli,cmd],{encoding:"utf8"});assert.equal(v.status,1);assert.equal(JSON.parse(v.stdout).code,"TARGET_PROFILE_UNVERIFIED");}}finally{await rm(root,{recursive:true,force:true});}
});

test("alias rows cannot import one central target twice", () => {
  const p=fixture(),e=p.registry.find(r=>r.entity_type==="CUSTOMER")!;e.aliases=["SYNTHETIC alias"];
  const duplicate=structuredClone(p.records.customer![0]!);duplicate.source_key=e.aliases[0]!;duplicate.fields.code="SYNTHETIC-other-code";p.records.customer!.push(duplicate);
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("DUPLICATE_TARGET_ID"));
});
test("media bytes, immutable file ref and color uniqueness are verified", () => {
  const p=fixture();assert.ok(p.manifest.assets.length>0);p.artifacts[p.manifest.assets[0]!.relative_path]=new Uint8Array([1,2,3]);
  const c=codes(validateUnifiedPackage(p,{allowSynthetic:true}));assert.ok(c.includes("FILE_HASH_MISMATCH"));assert.ok(c.includes("IMAGE_ASSET_MISMATCH"));
  const q=fixture(),image=q.records.product_image![0]!;image.fields.image_role="COLOR";image.fields.color_id=q.records.sku![0]!.fields.color_id;
  const duplicate=structuredClone(image);duplicate.source_key="SYNTHETIC color image 2";duplicate.fields.id=stableImportId("synthetic","image2");q.registry.push({entity_type:"PRODUCT_IMAGE",source_namespace:q.manifest.source_namespace,canonical_source_key:duplicate.source_key,target_id:duplicate.fields.id as string,aliases:[],identity_basis:"EXISTING_VERIFIED",source_refs:duplicate.source_refs});q.records.product_image!.push(duplicate);
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(q),{allowSynthetic:true})).includes("IMAGE_COLOR_CONFLICT"));
});
test("credential detection never echoes a credential embedded in a source key", () => {
  const p=fixture();p.records.sales_line![0]!.source_key="Bearer SYNTHETIC_NEVER_PRINT_THIS";p.records.sales_line![0]!.fields.quantity="0";
  const r=validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true});assert.ok(codes(r).includes("FORBIDDEN_CREDENTIAL"));assert.ok(!JSON.stringify(r).includes("SYNTHETIC_NEVER_PRINT_THIS"));
});
test("nonnullable source identifiers are not blank, and text must be valid Unicode", () => {
  for(const [table,field]of [["sales_header","number"],["customer","code"],["sku_barcode","barcode"],["product_image","file_ref"]])assert.ok(codes(validateUnifiedPackage(mutate(table!,f=>{f[field!]="";}),{allowSynthetic:true})).includes("FIELD_TYPE"));
  assert.ok(codes(validateUnifiedPackage(mutate("product",f=>{f.name="\ud800";}),{allowSynthetic:true})).includes("FIELD_TYPE"));
});
test("source timezone must be an IANA zone or explicit valid offset", () => {const p=fixture();p.manifest.inventory_source.source_timezone="not a timezone";assert.ok(codes(validateUnifiedPackage(p,{allowSynthetic:true})).includes("STOCK_SOURCE_NOT_VERIFIED"));});

test("reconciliation counts are checked against every retained row, never trusted flags", () => {
  const p=fixture();p.reports["reconciliation.json"]={};assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("INVALID_RECONCILIATION"));
  const q=fixture();(q.reports["reconciliation.json"] as {tables:Record<string,{retained_rows:number}>}).tables.sales_settlement!.retained_rows=3;(q.reports["reconciliation.json"] as {tables:Record<string,{source_rows:number}>}).tables.sales_settlement!.source_rows=3;
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(q),{allowSynthetic:true})).includes("RECONCILIATION_COUNT_MISMATCH"));
});
test("frozen decision rules carry scopes and source-pinned evidence", () => {const p=fixture();p.reports["decisions.json"]={};assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("INVALID_DECISIONS"));});
test("RETURN negative rows and REFUND direction stay independent exact facts", () => {
  const p=fixture();Object.assign(p.records.sales_header![0]!.fields,{business_type:"RETURN",gross_amount:"-16.00",net_due:"-16.00"});Object.assign(p.records.sales_line![0]!.fields,{quantity:"-16",line_amount:"-16.00"});for(const row of p.records.sales_settlement!)row.fields.direction="REFUND";
  assert.equal(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true}).valid,true);
});
test("EXCHANGE same-SKU opposite signed rows are never merged", () => {
  const p=fixture();p.records.sales_header![0]!.fields.business_type="EXCHANGE";Object.assign(p.records.sales_line![0]!.fields,{quantity:"-8",line_amount:"-8.00"});
  const line=structuredClone(p.records.sales_line![0]!);line.source_key="sales_line:02";Object.assign(line.fields,{id:registryTargetId(p.manifest.source_namespace,"SALES_LINE",line.source_key),line_no:2,quantity:"24",line_amount:"24.00"});p.records.sales_line!.push(line);p.registry.push({entity_type:"SALES_LINE",source_namespace:p.manifest.source_namespace,canonical_source_key:line.source_key,target_id:line.fields.id as string,aliases:[],identity_basis:"STABLE_IMPORT_ID_V1",source_refs:line.source_refs});
  (p.reports["reconciliation.json"] as {tables:Record<string,unknown>}).tables.sales_line={source_rows:2,retained_rows:2,rejected_rows:0};assert.equal(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true}).valid,true);assert.equal(p.records.sales_line!.length,2);
});

test("schema identity, enums, scale and snapshot mode are frozen receiving-code pins", () => {
  const p=fixture();p.manifest.schema_contract.source_declarations_sha256="a".repeat(64);assert.ok(codes(validateUnifiedPackage(p,{allowSynthetic:true})).includes("SCHEMA_CONTRACT_MISMATCH"));
  const q=fixture();(q.manifest as unknown as Record<string,unknown>).decimal_scale=3;assert.ok(codes(validateUnifiedPackage(q,{allowSynthetic:true})).includes("VALUE_CONVENTION_MISMATCH"));
  assert.throws(()=>{(TABLE_SCHEMAS.sales_line!.quantity as {kind:string}).kind="text";},TypeError);
});
test("actual symlinks modified plain bytes and credential paths are rejected without disclosure", async () => {
  const {symlink}=await import("node:fs/promises");const root=await mkdtemp(join(tmpdir(),"unified-path-hardening-"));
  try{const pkg=join(root,"package");await writeSyntheticPackage(pkg);const file=join(pkg,"sales_line.jsonl"),bytes=await readFile(file);await writeFile(file,bytes.toString().replace('"16.00"','"15.00"'));assert.ok((await inspectPackageDirectory(pkg,{allowSynthetic:true})).issues.some(i=>i.code==="FILE_HASH_MISMATCH"));
    await writeSyntheticPackage(pkg);const outside=join(root,"outside.jsonl");await writeFile(outside,bytes);await rm(file);await symlink(outside,file);assert.ok((await inspectPackageDirectory(pkg,{allowSynthetic:true})).issues.some(i=>i.code==="UNSAFE_PATH"));
    await rm(file);await writeSyntheticPackage(pkg);const mp=join(pkg,"manifest.json"),m=JSON.parse(await readFile(mp,"utf8"));m.files[0].relative_path="Bearer SYNTHETIC_HIDDEN_PATH";await writeFile(mp,JSON.stringify(m));const r=await inspectPackageDirectory(pkg,{allowSynthetic:true});assert.ok(r.issues.some(i=>i.code==="FORBIDDEN_CREDENTIAL"));assert.ok(!JSON.stringify(r).includes("SYNTHETIC_HIDDEN_PATH"));
  }finally{await rm(root,{recursive:true,force:true});}
});
test("report directory is rejected before changing immutable intake; reports never overwrite", async () => {
  const {access}=await import("node:fs/promises"),root=await mkdtemp(join(tmpdir(),"unified-report-safe-"));try{const pkg=join(root,"package"),nested=join(pkg,"new-report"),report=join(root,"report");await writeSyntheticPackage(pkg);const cli=join(process.cwd(),"tools/unified-import/cli.mjs");const bad=spawnSync(process.execPath,[cli,"validate","--package",pkg,"--allow-synthetic","--report",nested],{encoding:"utf8"});assert.equal(bad.status,2);await assert.rejects(access(nested));const args=[cli,"validate","--package",pkg,"--allow-synthetic","--report",report];assert.equal(spawnSync(process.execPath,args).status,0);const previous=await readFile(join(report,"validation-report.json"));assert.equal(spawnSync(process.execPath,args).status,2);assert.deepEqual(await readFile(join(report,"validation-report.json")),previous);}finally{await rm(root,{recursive:true,force:true});}
});

test("checked-in SYNTHETIC package is byte-identical to deterministic builder and validates", async () => {
  const path=join(process.cwd(),"tests/fixtures/unified-import/ready-synthetic"),p=fixture();
  assert.equal((await inspectPackageDirectory(path,{allowSynthetic:true})).valid,true);
  for(const [file,bytes]of Object.entries(p.artifacts))assert.deepEqual(await readFile(join(path,file)),Buffer.from(bytes));
  assert.deepEqual(JSON.parse(await readFile(join(path,"manifest.json"),"utf8")),p.manifest);
});
test("CLEANED excludes generated facts and retains explicit nullable unknowns", () => {
  const p=fixture();p.manifest.stage="CLEANED";for(const [table,rows]of Object.entries(p.records))for(const row of rows)for(const [key,rule]of Object.entries(TABLE_SCHEMAS[table]!))if(rule.generated)delete row.fields[key];
  const r=validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true});assert.deepEqual(r.issues,[]);assert.equal(r.valid,true);assert.equal(p.records.sales_header![0]!.fields.created_at,null);
});
test("real READY intake cannot omit its external manifest pin", async () => {
  const root=await mkdtemp(join(tmpdir(),"unified-real-ready-pin-"));try{await writeSyntheticPackage(root);const file=join(root,"manifest.json"),m=JSON.parse(await readFile(file,"utf8"));m.package_kind="REAL";await writeFile(file,JSON.stringify(m));assert.ok((await inspectPackageDirectory(root)).issues.some(i=>i.code==="MANIFEST_HASH_REQUIRED"));}finally{await rm(root,{recursive:true,force:true});}
});

test("business-person imports cannot silently provision a new login account or invented creator", () => {
  const p=fixture(),key="SYNTHETIC-unprovisioned-account",target=registryTargetId(p.manifest.source_namespace,"USER_ACCOUNT",key);p.registry.push({entity_type:"USER_ACCOUNT",source_namespace:p.manifest.source_namespace,canonical_source_key:key,target_id:target,aliases:[],identity_basis:"STABLE_IMPORT_ID_V1",source_refs:p.records.staff![0]!.source_refs});p.records.sales_header![0]!.fields.created_by_account_id=target;
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true})).includes("ACCOUNT_PROVISIONING_NOT_PACKAGE_INPUT"));
});

test("repinning does not rewrite original fields to make image facts pass", () => {
  const p=mutate("product_image",f=>{f.byte_size="999";});assert.equal(p.records.product_image![0]!.fields.byte_size,"999");
  assert.ok(codes(validateUnifiedPackage(p,{allowSynthetic:true})).includes("IMAGE_ASSET_MISMATCH"));
});

test("SALE discount bounds do not depend on knowing original line allocations", () => {
  for (const status of ["DRAFT", "APPROVED"]) {
    const p=fixture();
    Object.assign(p.records.sales_header![0]!.fields,{status,order_discount:"17.00",net_due:"-1.00"});
    for (const row of p.records.sales_settlement!) Object.assign(row.fields,{amount:"0.00",direction:"RECEIVE"});
    Object.assign(p.records.sales_settlement![0]!.fields,{amount:"1.00",direction:"REFUND"});
    repinSyntheticPackage(p);const original=JSON.stringify(p.records),result=validateUnifiedPackage(p,{allowSynthetic:true});
    assert.equal(result.valid,false);assert.ok(codes(result).includes("INVALID_ORDER_DISCOUNT"));
    assert.equal(JSON.stringify(p.records),original);assert.equal(p.records.sales_line![0]!.fields.allocated_discount,null);
  }
  const fullyDiscounted=fixture();Object.assign(fullyDiscounted.records.sales_header![0]!.fields,{order_discount:"16.00",net_due:"0.00"});
  for(const row of fullyDiscounted.records.sales_settlement!)row.fields.amount="0.00";
  assert.equal(validateUnifiedPackage(repinSyntheticPackage(fullyDiscounted),{allowSynthetic:true}).valid,true);
  for(const business_type of ["RETURN","EXCHANGE"])for(const negative of [false,true]) {
    const p=fixture(),amount=negative?"-16.00":"16.00";
    Object.assign(p.records.sales_header![0]!.fields,{business_type,gross_amount:amount,net_due:amount});
    Object.assign(p.records.sales_line![0]!.fields,{quantity:negative?"-16":"16",line_amount:amount});
    for(const row of p.records.sales_settlement!)row.fields.direction=negative?"REFUND":"RECEIVE";
    assert.equal(validateUnifiedPackage(repinSyntheticPackage(p),{allowSynthetic:true}).valid,true);
  }
});

test("pricing intent preserves the complete existing three-field NULL-state contract", () => {
  for(const pricing_rule of [null,"UNIT_PRICE","DISCOUNT"])for(const discount_tenths of [null,10])for(const zero_confirmed of [null,false,true]) {
    const p=fixture();Object.assign(p.records.sales_line![0]!.fields,{pricing_rule,discount_tenths,zero_confirmed});repinSyntheticPackage(p);
    const original=JSON.stringify(p.records),result=validateUnifiedPackage(p,{allowSynthetic:true});
    const expected=pricing_rule===null?discount_tenths===null&&zero_confirmed===null:
      zero_confirmed!==null&&(pricing_rule==="UNIT_PRICE"?discount_tenths===null:discount_tenths!==null);
    assert.equal(result.valid,expected,JSON.stringify({pricing_rule,discount_tenths,zero_confirmed,issues:result.issues}));
    if(!expected)assert.ok(codes(result).includes("PRICING_FACT_CONFLICT"));
    assert.equal(JSON.stringify(p.records),original);
  }
});

test("current category components are acyclic, live-parented and at most two levels", () => {
  const addCategory=(p:ReturnType<typeof fixture>,key:string,parent:string)=>{
    const row=structuredClone(p.records.product_category![0]!),target=registryTargetId(p.manifest.source_namespace,"PRODUCT_CATEGORY",key);
    row.source_key=key;Object.assign(row.fields,{id:target,parent_id:parent,name:`SYNTHETIC ${key}`,deleted_at:null});p.records.product_category!.push(row);
    p.registry.push({entity_type:"PRODUCT_CATEGORY",source_namespace:p.manifest.source_namespace,canonical_source_key:key,target_id:target,aliases:[],identity_basis:"STABLE_IMPORT_ID_V1",source_refs:row.source_refs});
    (p.reports["reconciliation.json"] as {tables:Record<string,unknown>}).tables.product_category={source_rows:p.records.product_category!.length,retained_rows:p.records.product_category!.length,rejected_rows:0};
    return row;
  };
  for(const scenario of ["self","cycle","depth","deleted-parent"]) {
    const p=fixture(),root=p.records.product_category![0]!,rootId=root.fields.id as string;
    if(scenario==="self")root.fields.parent_id=rootId;
    else {
      const child=addCategory(p,"independent-category-child",rootId);
      if(scenario==="cycle")root.fields.parent_id=child.fields.id;
      else if(scenario==="depth")addCategory(p,"independent-category-grandchild",child.fields.id as string);
      else root.fields.deleted_at="2026-11-02T08:00:00+08:00";
    }
    repinSyntheticPackage(p);const original=JSON.stringify(p.records),result=validateUnifiedPackage(p,{allowSynthetic:true});
    assert.equal(result.valid,false,scenario);assert.ok(codes(result).includes("CATEGORY_TREE_CONFLICT"),scenario);assert.equal(JSON.stringify(p.records),original);
  }
  const valid=fixture();addCategory(valid,"independent-valid-child",valid.records.product_category![0]!.fields.id as string);
  assert.equal(validateUnifiedPackage(repinSyntheticPackage(valid),{allowSynthetic:true}).valid,true);
});

test("non-APPROVED current headers reject approval facts without inventing unknown APPROVED facts", () => {
  for(const table of ["sales_header","transfer_header"])for(const status of ["DRAFT","VOID"])for(const field of ["approved_at","approved_by_staff_id","approved_by_account_id"]) {
    const p=fixture(),header=p.records[table]![0]!.fields;header.status=status;
    if(field==="approved_at")header[field]="2026-11-02T08:00:00+08:00";
    else if(field==="approved_by_staff_id")header[field]=p.records.staff![0]!.fields.id;
    else {
      const key="SYNTHETIC-verified-original-account",target=registryTargetId(p.manifest.source_namespace,"USER_ACCOUNT",key);
      p.registry.push({entity_type:"USER_ACCOUNT",source_namespace:p.manifest.source_namespace,canonical_source_key:key,target_id:target,aliases:[],identity_basis:"EXISTING_VERIFIED",source_refs:p.records.staff![0]!.source_refs});header[field]=target;
    }
    repinSyntheticPackage(p);const original=JSON.stringify(p.records),result=validateUnifiedPackage(p,{allowSynthetic:true});
    assert.equal(result.valid,false);assert.ok(codes(result).includes("APPROVAL_STATE_CONFLICT"));assert.equal(JSON.stringify(p.records),original);
  }
  const p=fixture();assert.equal(validateUnifiedPackage(p,{allowSynthetic:true}).valid,true);
  for(const table of ["sales_header","transfer_header"])for(const field of ["approved_at","approved_by_staff_id","approved_by_account_id"])assert.equal(p.records[table]![0]!.fields[field],null);
});

test("READY approved stock endpoints need explicit source-backed snapshot keys, not assumed zero", () => {
  const complete=()=>{
    const p=fixture(),baseline=p.records.inventory_baseline!,to=p.records.transfer_header![0]!.fields.to_warehouse_id;
    if(!baseline.some(row=>row.fields.warehouse_id===to&&row.fields.sku_id===p.records.transfer_line![0]!.fields.sku_id)) {
      const row=structuredClone(baseline[0]!);row.source_key="SYNTHETIC-explicit-known-zero-TO";
      Object.assign(row.fields,{warehouse_id:to,quantity:"0"});baseline.push(row);
      (p.reports["reconciliation.json"] as {tables:Record<string,unknown>}).tables.inventory_baseline={source_rows:baseline.length,retained_rows:baseline.length,rejected_rows:0};
    }
    return repinSyntheticPackage(p);
  };
  const positive=complete(),before=JSON.stringify(positive.records);
  assert.equal(validateUnifiedPackage(positive,{allowSynthetic:true}).valid,true);
  assert.equal(JSON.stringify(positive.records),before);
  for(const endpoint of ["from_warehouse_id","to_warehouse_id"]) {
    const p=complete(),warehouse=p.records.transfer_header![0]!.fields[endpoint];
    p.records.inventory_baseline=p.records.inventory_baseline!.filter(row=>row.fields.warehouse_id!==warehouse);
    (p.reports["reconciliation.json"] as {tables:Record<string,unknown>}).tables.inventory_baseline={source_rows:p.records.inventory_baseline.length,retained_rows:p.records.inventory_baseline.length,rejected_rows:0};
    repinSyntheticPackage(p);const original=JSON.stringify(p.records),result=validateUnifiedPackage(p,{allowSynthetic:true});
    assert.equal(result.valid,false,endpoint);assert.ok(codes(result).includes("BASELINE_KEY_COVERAGE_UNKNOWN"),endpoint);
    assert.ok(result.issues.some(issue=>issue.code==="BASELINE_KEY_COVERAGE_UNKNOWN"&&issue.severity==="BLOCK_CUTOVER"));assert.equal(JSON.stringify(p.records),original);
  }
  const wrongSource=complete();for(const row of wrongSource.records.inventory_baseline!)row.source_refs[0]!.file_sha256=wrongSource.manifest.document_cutoff_alignment.evidence_sha256!;
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(wrongSource),{allowSynthetic:true})).includes("BASELINE_KEY_COVERAGE_UNKNOWN"));
  const wrongPair=complete(),to=wrongPair.records.transfer_header![0]!.fields.to_warehouse_id;
  wrongPair.records.inventory_baseline!.find(row=>row.fields.warehouse_id===to)!.fields.warehouse_id=wrongPair.records.transfer_header![0]!.fields.from_warehouse_id;
  assert.equal(wrongPair.records.inventory_baseline!.length,positive.records.inventory_baseline!.length);
  assert.ok(codes(validateUnifiedPackage(repinSyntheticPackage(wrongPair),{allowSynthetic:true})).includes("BASELINE_KEY_COVERAGE_UNKNOWN"));
  const cancelling=complete(),header=cancelling.records.sales_header![0]!.fields,first=cancelling.records.sales_line![0]!,opposite=structuredClone(first);
  cancelling.records.transfer_header![0]!.fields.status="DRAFT";Object.assign(header,{business_type:"EXCHANGE",gross_amount:"0.00",net_due:"0.00"});
  opposite.source_key="SYNTHETIC-cancelling-exchange-line";const target=registryTargetId(cancelling.manifest.source_namespace,"SALES_LINE",opposite.source_key);
  Object.assign(opposite.fields,{id:target,line_no:2,quantity:"-16",line_amount:"-16.00"});cancelling.records.sales_line!.push(opposite);
  cancelling.registry.push({entity_type:"SALES_LINE",source_namespace:cancelling.manifest.source_namespace,canonical_source_key:opposite.source_key,target_id:target,aliases:[],identity_basis:"STABLE_IMPORT_ID_V1",source_refs:opposite.source_refs});
  for(const row of cancelling.records.sales_settlement!)row.fields.amount="0.00";
  cancelling.records.inventory_baseline=cancelling.records.inventory_baseline!.filter(row=>row.fields.warehouse_id!==header.warehouse_id);
  const counts=(cancelling.reports["reconciliation.json"] as {tables:Record<string,unknown>}).tables;
  counts.sales_line={source_rows:2,retained_rows:2,rejected_rows:0};counts.inventory_baseline={source_rows:cancelling.records.inventory_baseline.length,retained_rows:cancelling.records.inventory_baseline.length,rejected_rows:0};
  const cancelledResult=validateUnifiedPackage(repinSyntheticPackage(cancelling),{allowSynthetic:true});assert.equal(cancelledResult.valid,false);
  assert.ok(codes(cancelledResult).includes("BASELINE_KEY_COVERAGE_UNKNOWN"));assert.ok(!codes(cancelledResult).includes("ECONOMIC_DIFFERENCE"));
  const draft=complete();for(const table of ["sales_header","transfer_header"])draft.records[table]![0]!.fields.status="DRAFT";
  draft.records.inventory_baseline=[];(draft.reports["reconciliation.json"] as {tables:Record<string,unknown>}).tables.inventory_baseline={source_rows:0,retained_rows:0,rejected_rows:0};
  assert.equal(validateUnifiedPackage(repinSyntheticPackage(draft),{allowSynthetic:true}).valid,true);
  const cleaned=complete();cleaned.manifest.stage="CLEANED";cleaned.records.inventory_baseline=[];
  (cleaned.reports["reconciliation.json"] as {tables:Record<string,unknown>}).tables.inventory_baseline={source_rows:0,retained_rows:0,rejected_rows:0};
  for(const [table,rows]of Object.entries(cleaned.records))for(const row of rows)for(const [key,rule]of Object.entries(TABLE_SCHEMAS[table]!))if(rule.generated)delete row.fields[key];
  assert.equal(validateUnifiedPackage(repinSyntheticPackage(cleaned),{allowSynthetic:true}).valid,true);
});
