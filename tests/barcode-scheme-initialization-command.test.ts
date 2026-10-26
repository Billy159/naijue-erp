/** Synthetic command checks only; no PostgreSQL or business import. */
import test from "node:test";
import assert from "node:assert/strict";
import { stableImportId, validateCutoffImportCommand, validateBarcodeSchemeInitializationCommand } from "../packages/application/src/inventory-cutoff-import.ts";
import type { BarcodeSchemeInitializationCommand } from "../packages/application/src/inventory-cutoff-import.ts";
import { entityId } from "../packages/domain/src/values.ts";
function command(): BarcodeSchemeInitializationCommand {
  return { action:"IMPORT_INITIALIZE_BARCODE_SCHEMES", actorAccountId:entityId("account",stableImportId("synthetic","actor")),
    batchId:stableImportId("synthetic","batch"),requestKey:"SYNTHETIC_SCHEME_V19",expectedSequence:2,expectedCursor:22,
    schemeInitialization:{version:"BARCODE_SCHEME_INITIALIZATION_V19",coreReceiptId:stableImportId("synthetic","core"),coreSourceDigest:"a".repeat(64),
      fixedSourceNamespace:"synthetic:schemes",selectionSha256:"b".repeat(64),cutoffAt:"2026-01-01T00:00:00.000Z",
      target:{database:"SYNTHETIC",role:"synthetic_import",serverAddress:null,serverPort:null,postmasterStartedAt:"SYNTHETIC_PROCESS"},
      approvalPins:{proposalSha256:"c".repeat(64),approvalSha256:"d".repeat(64),writeContractReplySha256:"e".repeat(64)},
      schemes:["2018","2020","2021","2021fit","2023","2026"].map(k=>({sourceSchemeKey:k,native:{id:stableImportId("synthetic",k),name:k,barcode_type:"Code128",
        rule_description:"SYNTHETIC ONLY",code_length:15,rule_version:"SYNTHETIC",status:k==="2026"?"CURRENT":"HISTORICAL"}}))}};
}
test("v19 scheme command admits six exact data shapes and distinct action, never empty CHUNK",()=>{
 const c=command(); assert.doesNotThrow(()=>validateCutoffImportCommand(c));
 assert.throws(()=>validateCutoffImportCommand({...c,action:"IMPORT_CHUNK",items:[]} as never));
 for(const change of [ {accountingVersion:"NATIVE_IMPORT_RECORD_ACCOUNTING_V1"},{items:[]},{historyValidationPassed:true},{extra:true}])
  assert.throws(()=>validateBarcodeSchemeInitializationCommand({...c,...change} as never));
});
test("v19 scheme command rejects missing/extra/duplicate/drifted identity and invalid checkpoints",()=>{
 for(const mutate of [
  (c:any)=>c.schemeInitialization.schemes.pop(),(c:any)=>c.schemeInitialization.schemes.push(c.schemeInitialization.schemes[0]),
  (c:any)=>c.schemeInitialization.schemes[1].native.id=c.schemeInitialization.schemes[0].native.id,
  (c:any)=>c.schemeInitialization.schemes[0].sourceSchemeKey="unknown",(c:any)=>c.schemeInitialization.schemes[0].native.status="CURRENT",
  (c:any)=>c.schemeInitialization.schemes[0].native.extra=true,(c:any)=>c.schemeInitialization.approvalPins.writeContractSha256="f".repeat(64),
  (c:any)=>c.expectedSequence=0,(c:any)=>c.expectedCursor=-1,(c:any)=>c.schemeInitialization.target.serverPort=5432,
 ]) {const c=command();mutate(c);assert.throws(()=>validateBarcodeSchemeInitializationCommand(c));}
});
test("v19 scheme command captures only own data and does not invoke getters or lose hidden fields",()=>{
 for(const mutate of [
  (c:any)=>Object.defineProperty(c,"hidden",{value:1}),
  (c:any)=>Object.defineProperty(c.schemeInitialization,"coreSourceDigest",{enumerable:true,get(){throw Error("GETTER_INVOKED");}}),
  (c:any)=>c.schemeInitialization.schemes.push(undefined),
  (c:any)=>Object.defineProperty(c.schemeInitialization.schemes,"named",{value:1}),
 ]) {const c=command();mutate(c);assert.throws(()=>validateBarcodeSchemeInitializationCommand(c),e=>!(e instanceof Error)||e.message!=="GETTER_INVOKED");}
});
