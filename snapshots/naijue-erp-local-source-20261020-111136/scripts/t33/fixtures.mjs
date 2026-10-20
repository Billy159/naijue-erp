import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {HISTORY_CONTRACT,HISTORY_CONTRACT_SHA256,HISTORY_RULING_SHA256,historyDigest} from '../../server/domain/inventory/history-plan.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const fixtureId=n=>`33000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const A=fixtureId(1),B=fixtureId(2),SKU=fixtureId(3),SKU2=fixtureId(4),SKU3=fixtureId(5),DOC=fixtureId(6),PRODUCT=fixtureId(7),HALL=fixtureId(8);
export const openingBoundary={at:'2020-01-01T00:00:00+08:00',timezone:'Asia/Shanghai',inclusive:true};
export const cutoff={at:'2020-02-01T12:00:00+08:00',timezone:'Asia/Shanghai',inclusive:true};
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const json=(file,data)=>writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
export const historicalSaleBody={header:{business_date:'2020-01-20',hall_id:HALL,source_warehouse_id:A,source_number:'SALE-HISTORY'},
  lines:[{source_id:'SALE-L1',sku_id:SKU3,warehouse_id:A,source_quantity:'2',stock_quantity_contribution:'-2',unit:'件',unit_price:'10.00',amount:'20.00'}],fundsRecords:[]};
export const historicalInactiveTransferBody={header:{business_date:'2020-01-10',source_number:'unapproved-at-t',source_from_warehouse_id:A,source_to_warehouse_id:B},
  lines:[{sku_id:SKU,from_warehouse_id:A,to_warehouse_id:B,source_quantity:'1',unit:'件'}],fundsRecords:[]};

export function createHistoryFixture(dir,options={}) {
  const runCutoff=options.cutoff??cutoff;
  mkdirSync(dir,{recursive:true});
  const artifacts=[];
  const add=(file,role,data,copy)=>{
    if(copy)writeFileSync(join(dir,file),readFileSync(join(root,copy)),{flag:'wx'});else json(join(dir,file),data);
    artifacts.push({file,role,sha256:sha(join(dir,file))});return file;
  };
  add('contract.json','CONTRACT',null,'references/planning-20261002/库存迁移验收合同-20261002.json');
  add('ruling.md','RULING',null,'references/planning-20261002/库存反推期初裁定-20261004.md');
  add('rules.json','RULE',{dataClass:'ISOLATED_FIXTURE',quantityScale:4,realRecords:false});
  add('t31-program.py','RULE',null,'outputs/T31/revisions/history-contributions-v1/program/contribution_inputs.py');
  add('source-evidence.json','STATE_EVIDENCE',{dataClass:'ISOLATED_FIXTURE',
    facts:['state timelines and canonical source relationships are synthetic','opening original source is synthetic, not a stock report'],
    sourceRows:[{row:1,event:'in',quantity:'7'},{row:2,event:'out',quantity:'12'},{row:3,event:'transfer',quantity:'3'},
      {row:4,event:'stockgain-unknown-cause',quantity:'5'},{row:5,event:'cross-period',quantity:'10'},
      {row:6,event:'old-and-corrected',quantities:['2','3']},{row:7,event:'sale-history',quantity:'2'}]});
  const ref=(file,row=1)=>({kind:'ISOLATED_FIXTURE',file,row,sha256:artifacts.find(a=>a.file===file).sha256});
  const evidence=[ref('source-evidence.json')];
  const event=(id,family,quantity,sku=SKU,unit='件',first='UNAUDITED',when='2020-01-10T00:00:00+08:00')=>({eventId:id,family,cause:null,sourceNumber:id,
    sourceNumbers:[id],sourceAliases:[{dataset:'ISOLATED_FIXTURE',number:id}],canonicalizationEvidence:evidence,
    observedSourceState:{raw:'生效'},historyWindow:{from:'2019-01-01T00:00:00+08:00',through:'2030-01-01T00:00:00+08:00',complete:true,evidence},
    versions:[{versionId:'v1',evidence,lines:[{eventId:id,lineId:id+'-L1',versionId:'v1',originalSkuId:sku,measurementUnit:unit,quantity,
      warehouseId:A,fromWarehouseId:A,toWarehouseId:B,sourceRowReferences:evidence}]}],
    transitions:[{transitionId:id+'-initial',sequence:0,state:first,versionId:'v1',effectiveAt:'2019-01-01T00:00:00+08:00',evidence},
      {transitionId:id+'-approved',sequence:1,state:'EFFECTIVE',versionId:'v1',effectiveAt:when,evidence}]});
  const events=[event('in','INBOUND','7'),event('out','OUTBOUND','12'),event('transfer','TRANSFER','3'),
    event('negative','OUTBOUND','2',SKU2),event('unit-pairs','INBOUND','0.125',SKU,'双'),
    event('effective-gain-cause-unknown','STOCKTAKING_GAIN','5',SKU2),event('cross-period','INBOUND','10',SKU2,'件','EFFECTIVE','2019-12-01T00:00:00+08:00'),
    event('correction','OUTBOUND','2',SKU2),event('SALE-HISTORY','SALE','2',SKU3),event('unapproved-at-t','TRANSFER','9'),
    event('after-t-transfer','TRANSFER','20',SKU,'件','UNAUDITED','2020-02-02T00:00:00+08:00')];
  events[2].sourceNumbers=['DIRECT-3','OTHER-OUT-3','OTHER-IN-3'];events[2].sourceAliases=events[2].sourceNumbers.map(number=>({dataset:'ISOLATED_FIXTURE',number}));
  const correction=events[7];correction.versions.push({...structuredClone(correction.versions[0]),versionId:'v2',lines:correction.versions[0].lines.map(l=>({...l,versionId:'v2',quantity:'3'}))});
  correction.transitions.push({transitionId:'correction-unapprove',sequence:2,state:'UNAPPROVED',versionId:'v1',effectiveAt:'2020-01-15T00:00:00+08:00',evidence},
    {transitionId:'correction-reapprove',sequence:3,state:'EFFECTIVE',versionId:'v2',effectiveAt:'2020-01-16T00:00:00+08:00',evidence},
    {transitionId:'correction-after-t',sequence:4,state:'UNAPPROVED',versionId:'v2',effectiveAt:'2020-02-02T00:00:00+08:00',evidence});
  events[9].transitions.push({transitionId:'unapproved-at-t-reversal',sequence:2,state:'UNAPPROVED',versionId:'v1',effectiveAt:'2020-01-15T00:00:00+08:00',evidence});
  if(options.bindSale)events[8].documentBinding={documentId:DOC,revision:1,effectIdentity:'baseline:SALE-HISTORY',bodySha256:historyDigest(historicalSaleBody)};
  if(options.bindInactiveTransfer){events[9].versions[0].lines[0].quantity='1';events[9].documentBinding={documentId:fixtureId(9),revision:1,effectIdentity:null,bodySha256:historyDigest(historicalInactiveTransferBody)};}
  if(options.duplicate)events.push(structuredClone(events[2]));
  if(options.adjustEvents)options.adjustEvents(events);
  add('canonical-events.json','HISTORY_SOURCE',{openingBoundary,cutoff:runCutoff,events});
  const prep=spawnSync('python3',['-B',join(root,'scripts/t33/prepare-t31.py'),'--source',join(dir,'canonical-events.json'),'--output',join(dir,'t31-selected.json'),
    '--expected-program-sha256',sha(join(root,'outputs/T31/revisions/history-contributions-v1/program/contribution_inputs.py'))],{encoding:'utf8',env:{PATH:process.env.PATH}});
  json(join(dir,'t31-consumption.execution.json'),{args:prep.spawnargs,exitCode:prep.status,stdout:prep.stdout,stderr:prep.stderr});
  if(prep.status!==0)throw Error('T33 T31 fixture consumption failed');
  artifacts.push({file:'t31-selected.json',role:'T31_EXCHANGE',sha256:sha(join(dir,'t31-selected.json'))});
  const selected=JSON.parse(readFileSync(join(dir,'t31-selected.json'),'utf8'));
  const keys=[{warehouseId:A,originalSkuId:SKU,measurementUnit:'件'},{warehouseId:B,originalSkuId:SKU,measurementUnit:'件'},
    {warehouseId:A,originalSkuId:SKU,measurementUnit:'双'},{warehouseId:A,originalSkuId:SKU2,measurementUnit:'件'},
    {warehouseId:A,originalSkuId:SKU3,measurementUnit:'件'},...options.extraKeys??[]];
  add('opening-source.json','ORIGINAL_OPENING',{dataClass:'ISOLATED_FIXTURE',originalValues:keys.map((key,i)=>({...key,quantity:['10','0','1','-4','102'][i]??'0'})),
    at:openingBoundary,alreadyIncludedThrough:openingBoundary,from:'2019-01-01T00:00:00+08:00'});
  const originalOpenings=keys.map((key,i)=>({...key,kind:i===1?'VERIFIED_NO_OPENING':'ORIGINAL_OPENING',quantity:['10','0','1','-4','102'][i]??'0',at:openingBoundary,
    includedPeriod:{from:'2019-01-01T00:00:00+08:00',through:openingBoundary,evidence:[ref('opening-source.json',i+1)]},evidence:[ref('opening-source.json',i+1)]}));
  add('opening-exchange.json','OPENING_EXCHANGE',{openingBoundary,originalOpenings});
  add('mapping-source.json','IDENTITY_MAP',{dataClass:'ISOLATED_FIXTURE',identityPreserving:true,warehouses:[A,B],skus:[SKU,SKU2,SKU3]});
  const mappings=[...new Set(keys.map(x=>x.warehouseId))].map(id=>({kind:'WAREHOUSE',originalId:id,targetId:id,evidence:[ref('mapping-source.json')]}))
    .concat([...new Set(keys.map(x=>x.originalSkuId))].map(id=>({kind:'SKU',originalId:id,targetId:id,evidence:[ref('mapping-source.json')]})));
  add('mapping-exchange.json','MAPPING_EXCHANGE',{mappings});
  add('coverage-source.json','COVERAGE',{dataClass:'ISOLATED_FIXTURE',complete:true,keys});
  const coverage={complete:true,keys,evidence:[ref('coverage-source.json')]};add('coverage-exchange.json','COVERAGE_EXCHANGE',coverage);
  const input={schemaVersion:'T33-HISTORY-PLAN-v1',revision:'T33-SYNTHETIC-BASE',dataClass:'ISOLATED_FIXTURE',contractVersion:HISTORY_CONTRACT,
    contractSha256:HISTORY_CONTRACT_SHA256,rulingSha256:HISTORY_RULING_SHA256,quantityScale:4,openingBoundary,cutoff:runCutoff,artifacts,mappings,coverage,originalOpenings,events:selected.events};
  json(join(dir,'input.json'),input);return {input,rawEvents:events,dir};
}
export function createRuntimeChange(fixture,label,eventId,state,at,expectedOrdinal=0,mode='AUTHORIZED_CORRECTION') {
  const proofFile='runtime-proof-'+label+'.json',exchangeFile='runtime-t31-'+label+'.json';
  json(join(fixture.dir,proofFile),{dataClass:'ISOLATED_FIXTURE',eventId,state,effectiveAt:at,row:1});
  const artifact={file:proofFile,role:'STATE_EVIDENCE',sha256:sha(join(fixture.dir,proofFile))},ref={kind:'ISOLATED_FIXTURE',file:proofFile,sha256:artifact.sha256,row:1};
  const prior=fixture.rawEvents.find(e=>e.eventId===eventId),event=structuredClone(prior),end={at,timezone:'Asia/Shanghai',inclusive:true};
  event.transitions.push({transitionId:label,sequence:100+expectedOrdinal,state,versionId:'v1',effectiveAt:at,evidence:[ref]});
  prior.transitions=structuredClone(event.transitions);
  const rawFile='runtime-canonical-'+label+'.json';json(join(fixture.dir,rawFile),{openingBoundary,cutoff:end,baselineCutoff:cutoff,events:[event]});
  const p=spawnSync('python3',['-B',join(root,'scripts/t33/prepare-t31.py'),'--source',join(fixture.dir,rawFile),'--output',join(fixture.dir,exchangeFile),'--expected-program-sha256',sha(join(root,'outputs/T31/revisions/history-contributions-v1/program/contribution_inputs.py'))],{encoding:'utf8',env:{PATH:process.env.PATH}});
  json(join(fixture.dir,'runtime-'+label+'.execution.json'),{args:p.spawnargs,exitCode:p.status,stdout:p.stdout,stderr:p.stderr});if(p.status!==0)throw Error('T31 runtime selection failed');
  const e=JSON.parse(readFileSync(join(fixture.dir,exchangeFile),'utf8')).events[0];
  return {eventId,requestKey:label,expectedOrdinal,mode,inputs:e.atCutoff,artifacts:[artifact,
    {file:rawFile,role:'HISTORY_SOURCE',sha256:sha(join(fixture.dir,rawFile))},{file:exchangeFile,role:'T31_EXCHANGE',sha256:sha(join(fixture.dir,exchangeFile))}],sourceNumbers:e.sourceNumbers};
}
