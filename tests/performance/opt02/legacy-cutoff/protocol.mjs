/** Original public reader/service/source-authorizer composition; no engine on import. */
import {buildLegacyCutoffFixture,need,SHA,freeze} from './fixture.mjs';import{readCases,assertStockPage,ADMISSION_SQL,admissionCases,assertCutoffAdmission}from'./read-contract.mjs';import{loadOriginals}from'./originals.mjs';
export function originalStockService(original,pool){return original.createService({reader:new original.Reader(pool),authorization:original.createAuthorization(pool).productManagement});}
/** Source-only enumeration: scripted facts select original query branches. This
 * is not a passing DB, capability, publication certificate or timing evidence. */
export async function prepareOriginalStockProtocol(){
 const original=await loadOriginals(),f=buildLegacyCutoffFixture(),queries=new Map();let selection=readCases()[0],published=true;
 const selected=()=>selection.parameters.filter.productIds.length?f.expectedProductStocks.filter(p=>selection.parameters.filter.productIds.includes(p.id)):f.expectedProductStocks;
 const page=()=>selection.parameters.page===1?selected():[];
 const pool={async connect(){return{async query(sql,values=[]){if(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','COMMIT','ROLLBACK'].includes(sql))return{rows:[],rowCount:0};queries.set(sql,{sha256:SHA(sql),sql,arity:values.length,scope:'ORIGINAL_SOURCE_SCRIPTED_ENUMERATION_NOT_DATABASE'});let rows;
 if(sql.includes('application-read:identity'))rows=[{account_id:f.reference.actor.accountId,staff_id:f.reference.staffId,login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:null,native_hall_id:null,hall_enabled:null}];
 else if(sql.includes('product-management:count'))rows=[{exact_total:String(selected().length),invalid_category_tree:false}];
 else if(sql.includes('product-management:publication'))rows=published?[{id:f.batchId,checkpoint:f.checkpoints[3],completed:true,final_approval:true}]:[];
 else if(sql.includes('inventory:guards'))rows=[{integrity_guards_present:true}];
 else if(sql.includes('product-management:stock-coverage'))rows=[{uncovered_warehouse:false,uncovered_sku:false,invalid_size:false,missing_sizes:false,invalid_balance:false}];
 else if(sql.includes('product-management:page'))rows=page().map(p=>({id:p.id,product_code:p.id===f.alternateProduct.id?f.alternateProduct.code:f.reference.expectedProductCode+(p.id===f.reference.disabledProductId?'-DISABLED':''),name:p.id===f.alternateProduct.id?f.alternateProduct.name:'SYNTHETIC PRODUCT'+(p.id===f.reference.disabledProductId?'-DISABLED':''),category_name:'SYNTHETIC CATEGORY',year:null,season_name:null,supplier_name:null,thickness:null,retail_price:p.id===f.alternateProduct.id?'2.50':'1.25'})).sort((a,b)=>a.product_code<b.product_code?-1:a.product_code>b.product_code?1:a.id<b.id?-1:1);
 else if(sql.includes('product-management:fits'))rows=page().filter(p=>p.id!==f.reference.disabledProductId).map(p=>({product_id:p.id,id:f.reference.fitId,name:'SYNTHETIC FIT',code:'A'})).sort((a,b)=>a.product_id<b.product_id?-1:1);
 else if(sql.includes('product-management:stock'))rows=page().map(p=>({id:p.id,quantity:p.quantity})).sort((a,b)=>a.id<b.id?-1:1);
 else throw Error('UNENUMERATED_ORIGINAL_STOCK_SQL:'+sql);return{rows,rowCount:rows.length};},release(){}};}};
 const service=originalStockService(original,pool),out=[];for(const c of readCases()){selection=c;const result=await service.readList(f.reference.actor,c.parameters,new AbortController().signal);out.push(assertStockPage(result,c));}
 published=false;selection=readCases()[0];let rejection;try{await service.readList(f.reference.actor,selection.parameters,new AbortController().signal);}catch(e){rejection=e;}need(rejection?.code==='PRODUCT_MANAGEMENT_STOCK_NOT_READY','ORIGINAL_UNPUBLISHED_MUST_NOT_BECOME_ZERO');need(queries.size===8,'EXACT_PREENGINE_ORIGINAL_QUERY_SET_REQUIRED');return freeze({format:'SOURCE_ONLY_ORIGINAL_STOCK_SQL_ENUMERATION_V1',originalQueries:[...queries.values()],cases:out,unpublishedCode:rejection.code,actualDatabase:false});
}
export async function runOriginalStockReads(original,pool,{published,step=async(_name,work)=>work()}){
 const f=buildLegacyCutoffFixture(),service=originalStockService(original,pool),results=[];
 if(!published){let failure;try{await step('unpublished-stock-must-remain-unknown-not-zero',()=>service.readList(f.reference.actor,readCases()[0].parameters,new AbortController().signal));}catch(e){failure=e;}need(failure?.code==='PRODUCT_MANAGEMENT_STOCK_NOT_READY','ACTUAL_UNPUBLISHED_SCOPE_MUST_REJECT');return{published:false,code:failure.code,quantityNotInvented:true};}
 for(const c of readCases()){const actual=await step(c.name,()=>service.readList(f.reference.actor,c.parameters,new AbortController().signal));results.push({...assertStockPage(actual,c),items:actual.items});}
 for(const [index,c]of admissionCases().entries())await step('cutoff-member-pair-'+index,async()=>{const client=await pool.connect();let begun=false,commitAttempted=false;try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;const rows=(await client.query(ADMISSION_SQL,[c.warehouseId,c.skuId])).rows;const result=assertCutoffAdmission(rows,c.expected);commitAttempted=true;await client.query('COMMIT');begun=false;results.push({admissionPair:index,...result});}catch(e){if(begun&&!commitAttempted)try{await client.query('ROLLBACK');}catch(rollback){throw new AggregateError([e,rollback],'Admission read and rollback failed');}throw e;}finally{client.release();}});
 return{published:true,cases:results,notPerformanceBaseline:true,notNormalRuntime:true};
}
/** NO DATABASE. Select original legacy store branches solely to enumerate SQL
 * bytes/arity before any engine. The virtual rows below are SCRIPTED protocol
 * inputs, never a receipt, source approval, DB fixture or success evidence. */
export async function prepareOriginalWriteProtocol(){
 const {createOriginalLegacyPublication}=await import('./publication.mjs');const f=buildLegacyCutoffFixture(),queries=new Map();let index=0,acks=0;
 const pool={async connect(){return{async query(sql,values=[]){if(['BEGIN ISOLATION LEVEL READ COMMITTED','COMMIT','ROLLBACK'].includes(sql))return{rows:[],rowCount:0};const previous=queries.get(sql);need(!previous||previous.arity===values.length,'ONE_FIXED_ORIGINAL_WRITE_ARITY_REQUIRED');queries.set(sql,{sql,arity:values.length,sha256:SHA(sql),scope:'SCRIPTED_ORIGINAL_WRITE_SQL_ENUMERATION_NOT_A_DATABASE_OR_PUBLICATION'});
 if(sql.includes('SELECT id, source_name, source_manifest_ref, source_hash,')){if(index===0)return{rows:[],rowCount:0};return{rows:[{id:f.batchId,source_name:f.namespace,source_manifest_ref:f.commands[0].sourceManifestRef,source_hash:f.commands[0].sourceHash,cutoff_at:f.cutoffAt,mapping_version:f.commands[0].mappingVersion,inventory_mode:'CUTOFF_STOCK_BASELINE',status:index===1?'STAGED':'VALIDATING',checkpoint:f.checkpoints[index-1],created_at:f.cutoffAt,completed_at:null,history_expected_counts:null,history_payload_hash:null}],rowCount:1};}
 return{rows:[],rowCount:/^(INSERT|UPDATE) /.test(sql)?1:0};},release(){}};}};
 const run=createOriginalLegacyPublication({pool,readArtifact:async p=>Buffer.from(f.artifacts.find(a=>a.path===p).utf8),now:()=>f.cutoffAt,beforeCommand:async i=>{index=i;},onAcknowledged:async()=>{acks++;}});await run.execute();need(acks===4,'FOUR_SCRIPTED_BRANCH_SELECTIONS_REQUIRED');return freeze({format:'SOURCE_ONLY_ORIGINAL_LEGACY_WRITER_SQL_ENUMERATION_V1',actualDatabase:false,published:false,queries:[...queries.values()],scriptedBranches:acks});
}
const preparedProtocols=new WeakSet();
export async function prepareLegacyProtocol(){const p=Object.freeze({read:await prepareOriginalStockProtocol(),write:await prepareOriginalWriteProtocol(),original:await loadOriginals()});preparedProtocols.add(p);return p;}
export function assertPreparedProtocol(protocol){need(preparedProtocols.has(protocol),'EXACT_ORIGINAL_PREENGINE_PROTOCOL_REQUIRED');return protocol;}
