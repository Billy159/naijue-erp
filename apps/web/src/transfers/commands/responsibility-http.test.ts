import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransferCommandHttpClient} from './http-client.ts';
import {TransferCommandError,type TransferCommandDto} from './contracts.ts';
import {draft} from './fixtures.test-support.ts';
const command:TransferCommandDto={action:'SAVE',requestKey:'responsibility-known-error',expectedVersion:null,draft:draft()};

test('original backend responsible staff409 is a definitive rejection, never an uncertain successful-save recovery',async()=>{
 let calls=0;
 const client=createTransferCommandHttpClient({origin:'https://synthetic.test',basePath:'/api',fetch:async()=>{calls++;return new Response(JSON.stringify({error:{code:'RESPONSIBLE_STAFF_UNAVAILABLE',message:'private backend message must not surface'}}),{status:409,headers:{'content-type':'application/json'}});}});
 await assert.rejects(client.execute(command,new AbortController().signal),error=>error instanceof TransferCommandError&&error.code==='RESPONSIBLE_STAFF_UNAVAILABLE'&&error.kind==='conflict'&&error.outcome==='rejected'&&error.status===409&&!error.message.includes('private backend'));
 assert.equal(calls,1,'no automatic retry or receipt lookup');
});

test('unknown responsibility409 still stays uncertain; the known POST error is not a valid GET receipt error',async()=>{
 for(const operation of ['unknown-command','receipt'] as const){
  let calls=0;const client=createTransferCommandHttpClient({origin:'https://synthetic.test',basePath:'/api',fetch:async()=>{calls++;return new Response(JSON.stringify({error:{code:operation==='receipt'?'RESPONSIBLE_STAFF_UNAVAILABLE':'RESPONSIBLE_FUTURE_ERROR',message:'not retained'}}),{status:409,headers:{'content-type':'application/json'}});}});
  await assert.rejects(operation==='receipt'?client.receipt(command,new AbortController().signal):client.execute(command,new AbortController().signal),error=>error instanceof TransferCommandError&&error.kind==='malformed-response'&&error.outcome===(operation==='receipt'?'read':'uncertain'));
  assert.equal(calls,1);
 }
});
