import test from 'node:test';import assert from 'node:assert/strict';
import {documentDateOrderMessage} from './date-order-message.ts';
test('reverse valid dates get actionable message, while open/same/invalid dates retain original validation',()=>{
 assert.equal(documentDateOrderMessage('2026-10-30','2026-10-01'),'开始日期不能晚于结束日期。');
 for(const [a,b] of [['','2026-10-01'],['2026-10-01',''],['2026-10-01','2026-10-01'],['2026-02-30','2026-02-01'],['invalid','2026-10-01']])assert.equal(documentDateOrderMessage(a,b),null);
});
