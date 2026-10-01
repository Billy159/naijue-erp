const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
process.env.TZ='Asia/Shanghai';
const text=fs.readFileSync(require('node:path').join(__dirname,'../gold.js'),'utf8');
const dateExpression=text.match(/escDate=(.+);\n/)[1];
const defaults=text.match(/function ledgerDefaults\(\)\{[^\n]+/)[0];
let instant='2026-09-30T16:05:00Z';
class Clock extends Date {constructor(value){super(value===undefined?instant:value)}}
const context=vm.createContext({Date:Clock});
vm.runInContext('const escDate='+dateExpression+';'+defaults+';globalThis.range=ledgerDefaults;',context);
let range=context.range();
assert.equal(range.end,'2026-10-01','local early morning must include today');
assert.equal(range.start,'2026-09-01');
instant='2026-10-01T16:05:00Z';
range=context.range();
assert.equal(range.end,'2026-10-02','reopening after midnight must refresh the range');
assert.equal(range.start,'2026-09-02');
console.log('Inventory ledger local day and midnight refresh: PASS');
