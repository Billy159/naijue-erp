/** Independent synthetic Fastify.inject/scripted-storage probes. No real PG, socket or browser. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createPostgresReadApi } from '../../apps/api/src/postgres-read-api.ts';
import { createTransferSessionAuthenticator } from '../../apps/api/src/transfer-authentication.ts';
import { createSourceAuthenticationPolicy } from '../../packages/authentication/src/source-policy.ts';
import { sessionTokenHash } from '../../packages/authentication/src/service.ts';
import { DomainError } from '../../packages/domain/src/errors.ts';

const ORIGIN = 'https://independent-synthetic.invalid';
const NOW = '2026-10-20T14:00:00.000Z';
const TOKEN = Buffer.alloc(32, 29).toString('base64url');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ACCOUNT = id(1), STAFF = id(2), HALL = id(3), PRODUCT = id(4), WAREHOUSE = id(5), SKU = id(6);
const rows = values => ({ rows: values, rowCount: values.length });
const config = () => ({target: {host:'scripted-never-connected.invalid',port:5432,database:'SYNTHETIC',user:'SYNTHETIC',password:'SYNTHETIC_NOT_A_SECRET',ssl:false},
  max:2,maxPendingAcquisitions:1,connectionTimeoutMillis:300,acquisitionTimeoutMillis:300,queryTimeoutMillis:300,
  statementTimeoutMillis:250,lockTimeoutMillis:200,idleInTransactionTimeoutMillis:300,idlePoolTimeoutMillis:300,
  disposeGraceMillis:0,disposeTimeoutMillis:300});
class Driver extends EventEmitter {
  connects = 0; ends = 0; releases = 0; business = 0; calls = []; lock = null; failAuth = false;
  constructor() { super(); this.reset(); }
  reset() {
    this.account = {account_id:ACCOUNT,staff_id:STAFF,login_name:'SYNTHETIC',password_hash:'SYNTHETIC_NOT_USED',login_enabled:true,
      auth_version:1,role:'SALESPERSON',employment_status:'在职',hall_id:HALL};
    this.session = {token_hash:sessionTokenHash(TOKEN),account_id:ACCOUNT,auth_version:1,created_at:NOW,expires_at:'2026-10-20T14:05:00.000Z',revoked_at:null};
    this.hallEnabled = true; this.lock = null; this.failAuth = false;
  }
  factory = configuration => { assert.equal(configuration.host,'scripted-never-connected.invalid'); return this; };
  async connect() {
    this.connects++;
    return Object.assign(new EventEmitter(),{query: async (sql, values=[]) => {
      this.calls.push({sql,values});
      if (sql.startsWith('BEGIN ') || sql === 'COMMIT' || sql === 'ROLLBACK') return rows([]);
      if (this.failAuth && sql.includes('auth_session')) throw new Error('SYNTHETIC PRIVATE AUTH STORE');
      if (sql.includes('FROM naijue_erp.auth_session')) {
        if (sql.includes('FOR UPDATE') && this.lock) await this.lock();
        return rows(this.session && values[0] === this.session.token_hash ? [{...this.session}] : []);
      }
      if (sql.includes('FROM naijue_erp.user_account a JOIN')) return rows(this.account ? [{...this.account}] : []);
      if (sql === 'SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE') return rows([{enabled:this.hallEnabled}]);
      this.business++; if (this.read) return this.read(sql,values);
      if (sql.includes('FROM naijue_erp.product p')) return rows([]);
      throw new Error('Unexpected business query in independent denial probe');
    },release:()=>{this.releases++;}});
  }
  async end() { this.ends++; }
}
const requests = [
  ['/inventory/query',{filter:{products:[],category:null,warehouses:[],suppliers:[],fits:[],seasons:[]},page:1,pageSize:100}],
  ['/inventory/ledger/query',{warehouseId:WAREHOUSE,skuId:SKU,pageSize:20,after:null}],
  ['/sales/query',{filter:{startDate:null,endDate:null,status:null,businessType:null,hallId:null,salespersonId:null,customerId:null,warehouseId:null,number:null},page:1,pageSize:20}],
  ['/transfers/query',{filter:{startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null},page:1,pageSize:20}],
  ['/products/basics/query',{productId:PRODUCT}]
];
function options(observe=()=>{}) {
  const deny = {async authorize(actor,intent) {observe(actor,intent);throw new DomainError('FORBIDDEN','SYNTHETIC PRIVATE DENIAL');}};
  return {postgres:config(),authentication:{trustedOrigin:ORIGIN,now:()=>NOW,policy:createSourceAuthenticationPolicy(300)},
    authorization:{inventory:deny,sales:deny,transfers:deny,products:deny},productMedia:null};
}
const post = (api,url,payload,headers={}) => api.app.inject({method:'POST',url,payload,
  headers:{'content-type':'application/json',origin:ORIGIN,cookie:`__Host-naijue_session=${TOKEN}`,...headers}});

test('independent: current account/session invalidations deny all five read families before policy/business SQL',async t=>{
  let policies = 0; const driver = new Driver(); const api = await createPostgresReadApi(options(()=>policies++),driver.factory);t.after(()=>api.close());
  for (const [url,payload] of requests) {
    const response = await post(api,url,payload);assert.equal(response.statusCode,403,`${url}: ${response.body}`);
    assert.equal(response.body.includes('SYNTHETIC'),false);
  }
  assert.equal(policies,5);assert.equal(driver.business,0);
  const invalidations = [
    d=>{d.account.login_enabled=false;},d=>{d.account.employment_status='离职';},d=>{d.account.auth_version=2;},
    d=>{d.account.role='UNKNOWN';},d=>{d.account.hall_id=null;},d=>{d.hallEnabled=false;},
    d=>{d.session.revoked_at=NOW;},d=>{d.session.expires_at=NOW;},d=>{d.session.created_at='2026-10-20T14:01:00.000Z';},
    d=>{d.lock=async()=>{d.session.revoked_at=NOW;};}
  ];
  for (const invalidate of invalidations) for (const [url,payload] of requests) {
    driver.reset();invalidate(driver);const before = policies;const response=await post(api,url,payload);
    assert.equal(response.statusCode,401,`${url}: ${response.body}`);assert.equal(policies,before);assert.equal(driver.business,0);
  }
  assert.equal(driver.connects,driver.releases);
});
test('independent: current hall and role facts, not forged headers/body, reach mandatory authorization',async t=>{
  const observed=[];const driver=new Driver();const api=await createPostgresReadApi(options(actor=>observed.push(actor)),driver.factory);t.after(()=>api.close());
  driver.account.hall_id=id(7);driver.account.role='WAREHOUSE';
  const response=await post(api,'/transfers/query',requests[3][1],{'x-role':'ADMIN','x-hall-id':id(999)});
  assert.equal(response.statusCode,403);assert.deepEqual(observed,[{accountId:ACCOUNT,hallId:id(7),role:'WAREHOUSE'}]);
  const before=observed.length;const injected=await post(api,'/transfers/query',{...requests[3][1],actor:{role:'ADMIN'}});
  assert.equal(injected.statusCode,400);assert.equal(observed.length,before);assert.equal(driver.business,0);
});
test('independent: failed authentication storage stays sanitized and never becomes an empty business response',async t=>{
  let policies=0;const driver=new Driver();const api=await createPostgresReadApi(options(()=>policies++),driver.factory);t.after(()=>api.close());driver.failAuth=true;
  for(const[url,payload]of requests){const response=await post(api,url,payload);assert.equal(response.statusCode,500);assert.equal(response.body.includes('SYNTHETIC'),false);}
  assert.equal(policies,0);assert.equal(driver.business,0);assert.equal(driver.connects,driver.releases);
});
test('independent: invalid host contracts never allocate a driver or silently enable fallback policy/media',async()=>{
  const base=options();let allocations=0;const factory=()=>{allocations++;throw new Error('must never allocate');};
  const variants=[undefined,{}, {...base,authorization:{...base.authorization,transfers:null}}, {...base,productMedia:undefined},
    {...base,authentication:{...base.authentication,trustedOrigin:`${ORIGIN}/path`}},
    {...base,productMedia:{deliveryOrigin:'http://unsafe.invalid',resolveThumbnails(){},resolveOriginal(){}}},
    {...base,postgres:{...config(),target:{...config().target,ssl:{rejectUnauthorized:false}}}}];
  for(const value of variants)await assert.rejects(createPostgresReadApi(value,factory));assert.equal(allocations,0);
});
test('independent: closing one API retires an injected active read and never closes another API pool',async t=>{
  const aDriver=new Driver(),bDriver=new Driver();const value=options();value.authorization.products={async authorize(_actor,intent){return{productId:intent.parameters.productId};}};
  let resume,enter;const entered=new Promise(resolve=>{enter=resolve;});const held=new Promise(resolve=>{resume=resolve;});
  aDriver.read=async()=>{enter();await held;return rows([]);};
  const a=await createPostgresReadApi(value,aDriver.factory),b=await createPostgresReadApi(value,bDriver.factory);t.after(()=>b.close());
  const pending=post(a,'/products/basics/query',{productId:PRODUCT});await entered;
  // inject has no listening server socket to drain. This proves bounded lease teardown,
  // not real HTTP graceful shutdown or PostgreSQL cancellation of the underlying query.
  await a.close();assert.equal(aDriver.ends,1);assert.equal(bDriver.ends,0);
  await assert.rejects(post(a,'/products/basics/query',{productId:PRODUCT}),/closed|closing/i);
  const sibling=await post(b,'/products/basics/query',{productId:PRODUCT});assert.equal(sibling.statusCode,200);
  assert.equal((await pending).statusCode,500);resume();await a.close();assert.equal(aDriver.ends,1);assert.equal(bDriver.ends,0);
  await b.close();assert.equal(bDriver.ends,1);assert.equal(a.app.server.listening,false);assert.equal(b.app.server.listening,false);
});
test('independent: standalone transfer authenticator snapshots origin, service, and resolver method',async()=>{
  let originalCalls=0,replacedCalls=0;const service={async resolve(){originalCalls++;return null;},
    async login(){throw new Error('unused');},async logout(){},async changeOwnPassword(){}};
  const mutable={trustedOrigin:ORIGIN,service};const authenticate=createTransferSessionAuthenticator(mutable);
  mutable.trustedOrigin='http://untrusted.invalid';mutable.service={async resolve(){replacedCalls++;return{accountId:ACCOUNT,hallId:HALL,role:'ADMIN'};}};
  service.resolve=async()=>{replacedCalls++;return{accountId:ACCOUNT,hallId:HALL,role:'ADMIN'};};
  const input={method:'POST',url:'/transfers/query',ip:'127.0.0.1',headers:{origin:'http://untrusted.invalid',cookie:`__Host-naijue_session=${TOKEN}`}};
  assert.equal(await authenticate(input),null);assert.equal(replacedCalls,0);assert.equal(originalCalls,0);
  assert.equal(await authenticate({...input,headers:{...input.headers,origin:ORIGIN}}),null);assert.equal(originalCalls,1);assert.equal(replacedCalls,0);
});
test('independent: composition captures all policy methods while their current internal state remains authoritative',async t=>{
  const value=options();const observed=[];let replacements=0;
  for(const name of ['inventory','sales','transfers','products'])value.authorization[name]={state:'before',async authorize(){observed.push([name,this.state]);throw new DomainError('FORBIDDEN','SYNTHETIC');}};
  const driver=new Driver();const api=await createPostgresReadApi(value,driver.factory);t.after(()=>api.close());
  for(const name of ['inventory','sales','transfers','products']){value.authorization[name].state='current';value.authorization[name].authorize=async()=>{replacements++;throw new Error('must not replace');};}
  for(const[url,payload]of requests)assert.equal((await post(api,url,payload)).statusCode,403);
  assert.deepEqual(observed,[['inventory','current'],['inventory','current'],['sales','current'],['transfers','current'],['products','current']]);
  assert.equal(replacements,0);assert.equal(driver.business,0);
});
test('independent: captured media origin/methods still validate each current provider URL, never exposing private fileRef',async t=>{
  const IMAGE=id(8),MEDIA='https://controlled-media.invalid';const value=options();let replacements=0;const variants=[];
  value.authorization.products={async authorize(_actor,intent){return{productId:intent.parameters.productId};}};
  const media={deliveryOrigin:MEDIA,current:1,bad:false,
    async resolveThumbnails(read){variants.push(['thumbnail',this.current]);return read.images.map(image=>({imageId:image.id,variant:'thumbnail',url:`${this.bad?'https://other.invalid':MEDIA}/opaque/thumbnail-${this.current}`}));},
    async resolveOriginal(read){variants.push(['original',this.current]);return{imageId:read.images[0].id,variant:'original',url:`${this.bad?'https://other.invalid':MEDIA}/opaque/original-${this.current}`};}};
  value.productMedia=media;const driver=new Driver();driver.read=async sql=>sql.includes('FROM naijue_erp.product_image i')
    ?rows([{id:IMAGE,product_id:PRODUCT,file_ref:'SYNTHETIC_PRIVATE_FILE_REF',mime:'image/png',byte_size:'32',display_order:1}])
    :rows([{id:PRODUCT,name:'SYNTHETIC PRODUCT'}]);
  const api=await createPostgresReadApi(value,driver.factory);t.after(()=>api.close());
  media.deliveryOrigin='https://other.invalid';media.current=2;
  media.resolveThumbnails=async()=>{replacements++;throw new Error('must not replace');};media.resolveOriginal=async()=>{replacements++;throw new Error('must not replace');};
  const thumbs=await post(api,'/products/images/query',{productId:PRODUCT});assert.equal(thumbs.statusCode,200);assert.equal(thumbs.json().images[0].thumbnailUrl,`${MEDIA}/opaque/thumbnail-2`);
  const original=await post(api,'/products/image/query',{productId:PRODUCT,imageId:IMAGE});assert.equal(original.statusCode,200);assert.equal(original.json().url,`${MEDIA}/opaque/original-2`);
  assert.equal(thumbs.body.includes('PRIVATE_FILE_REF'),false);assert.equal(original.body.includes('PRIVATE_FILE_REF'),false);assert.deepEqual(variants,[['thumbnail',2],['original',2]]);assert.equal(replacements,0);
  media.bad=true;const bad=await post(api,'/products/image/query',{productId:PRODUCT,imageId:IMAGE});assert.equal(bad.statusCode,500);assert.equal(bad.body.includes('other.invalid'),false);
});
test('independent: injected pending policy is not network-drained by close and cannot acquire business storage afterward',async()=>{
  const value=options();let enter,resume;const entered=new Promise(resolve=>{enter=resolve;});const hold=new Promise(resolve=>{resume=resolve;});let signal;
  value.authorization.products={async authorize(_actor,intent,readSignal){signal=readSignal;enter();await hold;return{productId:intent.parameters.productId};}};
  const driver=new Driver();const api=await createPostgresReadApi(value,driver.factory);const pending=post(api,'/products/basics/query',{productId:PRODUCT});
  await entered;await api.close();assert.equal(driver.ends,1);assert.equal(driver.business,0);
  // No real socket existed, so Fastify close did not abort or await this injected policy.
  assert.equal(signal.aborted,false);resume();const response=await pending;assert.equal(response.statusCode,500);assert.equal(driver.business,0);
});
