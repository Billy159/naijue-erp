import assert from 'node:assert/strict';
import {corePgErrorFields} from './core-error-fields.mjs';
const context={phase:'CORE',ordinal:0,queryKind:'STEP'};
const first=corePgErrorFields({code:'23514',message:'fixed core constraint rejected',constraint:'core_gate',table:'operation_receipt',column:'request_key',
  detail:'ROW_DATA_SENTINEL',hint:'HINT_SENTINEL',internalQuery:'SELECT SQL_SENTINEL',query:'SELECT SQL_SENTINEL',
  where:'SQL statement "SELECT SQL_SENTINEL"\nPL/pgSQL function core_gate(jsonb) line 9 at RAISE\nPL/pgSQL function core_step(jsonb,jsonb) line 10 at assignment\nPL/pgSQL function core_outer(jsonb) line 11 at SQL statement\nPL/pgSQL function fourth(jsonb) line 12 at RAISE'},context);
assert.equal(first.message,'fixed core constraint rejected');assert.equal(first.sqlState,'23514');assert.equal(first.constraint,'core_gate');assert.equal(first.contextFrames.length,3);
assert.equal(first.phase,'CORE');assert.equal(first.ordinal,0);assert.equal(first.queryKind,'STEP');
assert.ok(!JSON.stringify(first).includes('SENTINEL'));
assert.deepEqual(Object.keys(first).sort(),['phase','ordinal','queryKind','sqlState','message','messageRedacted','constraint','table','column','contextFrames'].sort());
const secret=corePgErrorFields({code:'23514',message:'failed PRIVATE_TOKEN and "ROW_VALUE"',detail:'PRIVATE_TOKEN'},context,['PRIVATE_TOKEN']);
assert.ok(!JSON.stringify(secret).includes('PRIVATE_TOKEN'));assert.ok(!JSON.stringify(secret).includes('ROW_VALUE'));assert.equal(secret.messageRedacted,true);
assert.equal(corePgErrorFields({message:'SELECT raw_data FROM t',code:'23514'},context).message,null);
assert.equal(corePgErrorFields({message:'bad\nPARAMETER_VALUE',constraint:'bad identifier',table:'table; SELECT x'},context).constraint,null);
const long=corePgErrorFields({code:'23514',message:'衣'.repeat(3000)},context);assert.ok(Buffer.byteLength(long.message)<=1024);assert.ok(!long.message.endsWith('\uFFFD'));
assert.equal(corePgErrorFields({code:'ERR_ASSERTION',message:'assertion'},context).sqlState,null);
console.log(JSON.stringify({state:'SCOPED_MEMORY_FILTER_PASS',checks:['scalar-whitelist-and-exact-context','omit-detail-hint-query-and-SQL-context','three-function-frame-bound','private-and-quoted-value-redaction','SQL-or-multiline-message-omitted','metadata-identifier-validation','UTF8-message-bound','no-assertion-as-SQLSTATE'],pgExecutions:0,harnessExecuted:false,fixtureCompiled:false,oldSuitesRerun:false}));
