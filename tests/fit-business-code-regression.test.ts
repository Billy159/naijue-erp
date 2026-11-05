import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogueMaintenanceCommand } from '../packages/application/src/catalogue-maintenance-validation.ts';
import { NUMERIC_FIT_TABLE_SCHEMAS } from '../packages/application/src/unified-import-contract.ts';

test('fit numeric business codes accepted without losing legacy uppercase identity', () => {
  for (const code of ['3','5','6','7','8','9','A','Y']) {
    const result = parseCatalogueMaintenanceCommand('FIT', {action:'CREATE',requestKey:`fit-${code}`,values:{name:'SYNTHETIC',code,enabled:true}});
    assert.equal(result.action,'CREATE'); if (result.action === 'CREATE') { assert.ok('code' in result.values); assert.equal(result.values.code,code); }
  }
  for (const code of ['0','1','2','4','a','AA','']) assert.throws(() => parseCatalogueMaintenanceCommand('FIT',{action:'CREATE',requestKey:'fit-bad',values:{name:'SYNTHETIC',code,enabled:true}}));
});
test('unified package accepts exact numeric or retained letter fit code only', () => {
  const pattern = (NUMERIC_FIT_TABLE_SCHEMAS as any).fit.code.pattern as string;
  const rule = new RegExp(pattern);
  for (const code of ['3','5','6','7','8','9','A','Y']) assert.match(code,rule);
  for (const code of ['0','1','2','4','a','AA','']) assert.doesNotMatch(code,rule);
});

test('schema successor only widens code check; rollback refuses retained numeric identities', async () => {
  const {readFile} = await import('node:fs/promises');
  const up=await readFile(new URL('../adapters/postgres/patches/0027_fit_numeric_business_codes_successor.sql',import.meta.url),'utf8');
  const down=await readFile(new URL('../adapters/postgres/patches/0027_fit_numeric_business_codes_rollback.sql',import.meta.url),'utf8');
  assert.match(up,/CHECK\s*\(code ~ '\^\[A-Z356789\]\$'\)/);
  assert.doesNotMatch(up,/\b(?:UPDATE|DELETE|INSERT)\s+(?:INTO\s+|FROM\s+)?naijue_erp\./i);
  assert.match(down,/IF EXISTS\s*\(SELECT 1 FROM naijue_erp\.fit WHERE code !~ '\^\[A-Z\]\$'\)/);
  assert.match(down,/RAISE EXCEPTION/); assert.doesNotMatch(down,/\b(?:UPDATE|DELETE|INSERT)\s+(?:INTO\s+|FROM\s+)?naijue_erp\./i);
});

test('inventory ledger accepts a digit while preserving the actual retained fit identity', async () => {
  const { checkedInventoryLedgerSnapshot } = await import('../packages/application/src/inventory-ledger-query-validation.ts');
  const { ledgerRead, ledgerSnapshot } = await import('./support/synthetic-inventory-ledger-query.ts');
  const read=ledgerRead(), original=structuredClone(ledgerSnapshot(read));
  const changed={...original,data:{...original.data,sku:{...original.data.sku,fit:{...original.data.sku.fit,code:'5'}}}};
  const validated=checkedInventoryLedgerSnapshot(changed,read.parameters,read.scope);
  assert.equal(validated.data.sku.fit.code,'5'); assert.equal(validated.data.sku.fit.id,original.data.sku.fit.id);
});

test('legacy package pin retains strict original rule, numeric successor is explicit and separate', async () => {
  const { createSyntheticPackage, repinSyntheticPackage } = await import('./fixtures/unified-import/synthetic-package.ts');
  const { SCHEMA_DECLARATIONS_SHA256, NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256, validateUnifiedPackage } = await import('../packages/application/src/unified-import-contract.ts');
  const p=createSyntheticPackage(); assert.notEqual(SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256);
  assert.equal(validateUnifiedPackage(p,{allowSynthetic:true}).valid,true);
  p.records.fit![0]!.fields.code='5'; repinSyntheticPackage(p);
  assert.ok(validateUnifiedPackage(p,{allowSynthetic:true}).issues.some(x=>x.code==='FIELD_TYPE' && x.path.includes('fit')));
  p.manifest.schema_contract.source_declarations_sha256=NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256;
  const successor=validateUnifiedPackage(p,{allowSynthetic:true}); assert.equal(successor.valid,true,JSON.stringify(successor.issues));
  for (const bad of ['0'.repeat(64), [SCHEMA_DECLARATIONS_SHA256], [NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256], {}, null, 123]) {
    (p.manifest.schema_contract as unknown as Record<string, unknown>).source_declarations_sha256=bad;
    assert.ok(validateUnifiedPackage(p,{allowSynthetic:true}).issues.some(x=>x.code==='SCHEMA_CONTRACT_MISMATCH'));
  }
});

test('CLI exposes numeric fit profile only by explicit selection, keeping legacy default', async () => {
  const {spawnSync} = await import('node:child_process');
  const {SCHEMA_DECLARATIONS_SHA256, NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256}=await import('../packages/application/src/unified-import-contract.ts');
  const cli='tools/unified-import/cli.mjs';
  const old=spawnSync(process.execPath,[cli,'contract-schema'],{encoding:'utf8'});
  const newer=spawnSync(process.execPath,[cli,'contract-schema','--profile','numeric-fit-v1'],{encoding:'utf8'});
  assert.equal(old.status,0,old.stderr); assert.equal(newer.status,0,newer.stderr);
  const a=JSON.parse(old.stdout), b=JSON.parse(newer.stdout);
  assert.equal(a.schema_contract.source_declarations_sha256,SCHEMA_DECLARATIONS_SHA256);
  assert.equal(b.schema_contract.source_declarations_sha256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256);
  assert.equal(b.numeric_fit_engine_validated,false); assert.equal(b.tables.fit.code.pattern,'^[A-Z356789]$');
  assert.equal(spawnSync(process.execPath,[cli,'contract-schema','--profile','unknown'],{encoding:'utf8'}).status,1);
});
