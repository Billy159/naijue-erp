import { createSalesCommandHttpClient } from '../../apps/web/src/sales/commands/http-client.ts';
import { save, json } from '../../apps/web/src/sales/commands/fixtures.test-support.ts';
const client=createSalesCommandHttpClient({origin:'https://synthetic.test',basePath:'',fetch:async()=>json({error:{code:'RECEIPT_NOT_FOUND',message:'no receipt'}},404)});
try{await client.execute(save(),new AbortController().signal)}catch(error){console.log(JSON.stringify({kind:error.kind,code:error.code,outcome:error.outcome,status:error.status}))}
console.log(JSON.stringify(['.','..'].map(key=>({key,receiptUrl:new URL(`https://synthetic.test/sales/receipts/${encodeURIComponent(key)}`).href}))));
