/* Phase-one frozen Demo fixtures. Load as a blocking classic script BEFORE auth-entry.js.
 * Keep REAL_DATA_MODE=true and the complete, unchanged real-data-bridge.mjs.
 * No credentials, runtime server, database, business writes or live API fallback.
 */
(() => {
  'use strict';
  const root = globalThis;
  const nativeFetch = root.fetch.bind(root);
  const copy = value => structuredClone(value);
  const admin = {id:'local-admin',name:'副本样例管理员',role:'管理员',enabled:true,
    employmentStatus:'在职',loginEnabled:true,loginName:'replica-sample',authVersion:1,hasPassword:false};
  const logoutKey = 'demo-replica-fixture-signed-out';
  let signedIn = !new URLSearchParams(location.search).has('sample-login') && sessionStorage.getItem(logoutKey)!=='1';
  let fixture;
  const failOnce = new URLSearchParams(location.search).get('fixture-fail-once');
  let failureUsed = false;
  const response = (data, status = 200) => new Response(JSON.stringify(
    status === 200 ? {ok:true,data,fixture:true} : {ok:false,error:data,fixture:true}
  ), {status,headers:{'Content-Type':'application/json; charset=utf-8'}});
  const page = (items, url) => {
    const size = Math.max(1, Number(url.searchParams.get('size')) || 200);
    const number = Math.max(1, Number(url.searchParams.get('page')) || 1);
    return {items:items.slice((number-1)*size,number*size),total:items.length,page:number,size};
  };
  function samples() {
    if (fixture) return fixture;
    const D = root.ERP_DEMO, C = root.PRODUCT_CATALOG;
    if (!D || !C || !root.GOLD || !root.SALES_MODEL) throw Error('副本原样例尚未加载，fixture 注入时序错误');
    // Snapshot before the original bridge replaces these collections. Never read browser storage.
    const products = copy(D.products.filter(p => /^M26\d{3}$/.test(p.id)));
    if (!products.length) throw Error('副本原商品样例缺失');
    products[0].images=[{id:'fixture-main-image:'+products[0].id,name:'合成样例图片（非真实商品）',
      url:'/replica-fixture-image.svg',role:'主图',colorId:''}];
    const warehouses = copy(D.warehouses.filter(w => ['main','outlet','wenzhou','reserve'].includes(w.id)));
    const customers = copy(root.SALES_MODEL.catalog.customers);
    const suppliers = copy(C.suppliers.filter(s => s.id.startsWith('demo-supplier-')));
    const staff = copy(root.SALES_MODEL.catalog.staff).map(e => ({...e,hall_id:'hall-outlet',
      source_salesperson:true,enabled:true,login_enabled:false,source_payload:{}}));
    const methods = ['现金','银行转账','微信','支付宝','其它'].map((name,i) => ({
      id:['cash','bank','wechat','alipay','other'][i],name,source_code:'DEMO-P0'+(i+1),enabled:true}));
    // The original sample methods have no synthetic bank accounts. These are explicit
    // fixture-only shape rows; original exported account numbers are not consumed.
    const accounts = methods.map(m => ({id:'fixture-account:'+m.id,name:'样例'+m.name+'账户',
      source_code:'FIXTURE-'+m.id,primary_payment_method_id:m.id,enabled:true}));
    const refs = {
      categories:C.categories.filter(c => c.id !== 'all').map(c => ({...copy(c),
        id:'fixture-category:'+c.id,code:c.id,parent_code:c.parent || 'all',enabled:!c.disabled})),
      warehouses, halls:[{id:'hall-outlet',source_code:'DEMO-H01',name:'网点营业厅',enabled:true}],
      employees:staff,customers,suppliers,colors:copy(C.colors),fits:copy(C.fits),
      sizes:copy(C.groups.flatMap(g => g.sizes)), 'size-groups':copy(C.groups),
      'payment-methods':methods,'fund-accounts':accounts
    };
    const catalog = {products:[],skus:[],barcodes:[],profiles:[],aliases:[]}, stock = [];
    for (const p of products) {
      const id = 'fixture-product:'+p.id, fitId = /修身/.test(p.fit) ? 'Y' : 'A';
      catalog.products.push({id,code:p.id,name:p.name,category_code:p.categoryId,
        category_name:p.category,fit_id:fitId,fit_name:p.fit,counterparty_id:p.supplierId,
        enabled:p.enabled,unit:p.unit || '件',source_type:'V2',source_size_group_id:p.groupId,
        stock_total:D.total(p),attributes:{price:p.price,purchasePrice:p.purchasePrice,
          minimumPrice:p.minimumPrice,year:p.year,season:p.season,images:copy(p.images || []),schemeId:p.schemeId}});
      for (let c=0;c<p.colorIds.length;c++) for (let s=0;s<p.sizeIds.length;s++) {
        const binding = p.barcodes[p.colorIds[c]+'|'+p.sizeIds[s]];
        if (!binding) continue;
        const skuId = 'fixture-sku:'+p.id+':'+c+':'+s;
        const size = C.groups.find(g => g.id===p.groupId)?.sizes.find(x => x.id===p.sizeIds[s]);
        catalog.skus.push({id:skuId,product_id:id,fit_id:fitId,fit_name:p.fit,
          options:{COLOR:{id:p.colorIds[c],name:p.colors[c]},SIZE:{id:p.sizeIds[s],name:p.sizes[s],
            code:size?.code || '',currentGroupId:p.groupId,standardGroup:C.group(p.groupId)?.name}}});
        for (const [code,generated] of [[binding.current,true],...(binding.history || []).map(code => [code,false])]) {
          if (code) catalog.barcodes.push({product_id:id,sku_id:skuId,barcode:code,generated,
            scheme_id:p.schemeId,demo:true,evidence:{generated,fixture:true}});
        }
        for (const w of warehouses) {
          const quantity = p.stock[w.id]?.[c]?.[s];
          if (!Number.isFinite(quantity)) throw Error('原样例库存缺失：'+p.id+'/'+w.id+'/'+c+'/'+s);
          stock.push({product_id:id,product_code:p.id,variant_id:skuId,warehouse_id:w.id,
            color_id:p.colorIds[c],size_id:p.sizeIds[s],quantity:String(quantity)});
        }
      }
    }
    const hallConfig = {aliases:{},stores:[{id:'hall-outlet',name:'网点营业厅',
      defaultCustomerId:'retail',defaultWarehouseId:'outlet',warehouseIds:['outlet']}]};
    // Preserve both original draft samples. Additional read-only view snapshots follow.
    const documents = copy(root.GOLD.documents).map(d => {
      const id = 'fixture-document:'+d.id;
      const lines = Object.entries(d.q).filter(([,n]) => Number(n)>0).map(([key,n],i) => {
        const [code,c,s] = key.split('|'), p = products.find(p => p.id===code);
        if (!p) throw Error('原调拨样例引用未知商品：'+code);
        const sku = catalog.skus.find(x => x.product_id==='fixture-product:'+code &&
          x.options.COLOR.id===p.colorIds[Number(c)] && x.options.SIZE.id===p.sizeIds[Number(s)]);
        if (!sku) throw Error('原调拨样例引用未知规格：'+key);
        return {source_id:d.id+':'+i,target_line_id:id+':'+i,target_document_id:id,sku_id:sku.id,product_id:sku.product_id,
          source_product_code:p.id,source_product_name:p.name,color_id:sku.options.COLOR.id,
          size_id:sku.options.SIZE.id,source_color_name:p.colors[Number(c)],source_size_name:p.sizes[Number(s)],
          source_quantity:String(n),unit:p.unit || '件',unit_price:null,amount:null,
          warehouse_id:d.from,source_lineage:{fixture:true}};
      });
      return {id,number:d.id,document_type:'TRANSFER',business_day:d.date,
        status:d.status==='已审核'?'APPROVED':d.status==='已作废'?'DELETED':'UNAUDITED',
        version:1,current_revision:1,baseline_was_included:true,current_effect_active:false,
        created_at:null,updated_at:null,history:[],body:{header:{business_date:d.date,
          source_from_warehouse_id:d.from,source_to_warehouse_id:d.to,note:d.note || '',
          source_payload:{fixture:true}},lines,fundsRecords:[]}};
    });
    // RP1-G01/G02: explicitly synthetic saved view states, never results of a command.
    // The historical size is the exact original model record; no current-size inference.
    const historical = root.PRODUCT_LEGACY_SIZES.records.find(s => s.id==='legacy:tplus:size:row:22');
    if (!historical) throw Error('原历史尺码样例行缺失');
    const firstSku = catalog.skus.find(s => s.product_id==='fixture-product:M26001');
    const historicalSku = {...copy(firstSku),id:'fixture-sku:M26001:historical-row-22',
      options:{COLOR:copy(firstSku.options.COLOR),SIZE:{...copy(historical),
        sourceName:historical.name,sourceCode:historical.code,
        // Declared membership of this synthetic display scenario, not a migration
        // decision or a binding to the separate current-size/SKU identity.
        standardGroup:firstSku.options.SIZE.standardGroup,
        fixtureProjection:'SYNTHETIC_DISPLAY_ONLY'}}};
    catalog.skus.push(historicalSku);refs.sizes.push(copy(historical));
    catalog.barcodes.push({product_id:historicalSku.product_id,sku_id:historicalSku.id,
      barcode:'FIXTURE-HISTORY-M26001-165-S',generated:false,demo:true});
    for (const w of warehouses) stock.push({product_id:historicalSku.product_id,product_code:'M26001',
      variant_id:historicalSku.id,warehouse_id:w.id,color_id:historicalSku.options.COLOR.id,
      size_id:historical.id,quantity:'0'}); // Explicit synthetic zero balances for this added sample SKU.
    const actor = {id:'fixture-actor:phase1',name:'合成样例操作员'};
    const snapshot = (number,type,status,body) => {
      const id = 'fixture-document:'+number;
      body.header.note='只读合成快照 · '+number+' · 未执行真实保存或审核';
      body.header.source_payload={...body.header.source_payload,fixture:true,
        fixtureSnapshot:number,v2_creator:copy(actor)};
      for (const [i,line] of body.lines.entries()) {
        line.source_id=number+':line:'+i;line.target_line_id=id+':line:'+i;
        line.target_document_id=id;
      }
      for (const [i,fund] of body.fundsRecords.entries()) {
        fund.source_id=number+':fund:'+i;fund.settlement_id=id+':fund:'+i;fund.target_document_id=id;
        fund.settled_at=status==='APPROVED'?'2026-10-24T08:02:00.000Z':null;
      }
      const created = copy(body);created.header.note='只读合成快照 · 首次录入（未执行命令）';
      const operations=status==='UNAUDITED'?['create','save']:['create','save',status==='APPROVED'?'approve':'delete'];
      return {id,number,document_type:type,business_day:'2026-10-24',status,
        version:operations.length,current_revision:operations.length,baseline_was_included:false,
        current_effect_active:status==='APPROVED',created_at:'2026-10-24T08:00:00.000Z',
        updated_at:'2026-10-24T08:0'+(operations.length-1)+':00.000Z',body,
        fixture:true,history:operations.map((operation,i) => ({operation,version:i+1,revision:i+1,
          actor_id:actor.id,actor_name:actor.name,created_at:'2026-10-24T08:0'+i+':00.000Z',
          fixture:true,body:copy(i===0?created:body),previous_body:i===0?null:copy(i===1?created:body)}))};
    };
    const historicalLine = {source_id:'fixture-historical-line',target_line_id:'fixture-historical-line',
      sku_id:historicalSku.id,product_id:historicalSku.product_id,source_product_code:'M26001',
      source_product_name:products[0].name,color_id:historicalSku.options.COLOR.id,size_id:historical.id,
      source_color_name:historicalSku.options.COLOR.name,source_size_name:historical.name,
      source_quantity:'1',unit:'件',unit_price:null,amount:null,warehouse_id:'main',
      source_lineage:{fixture:true,originalSizeRecord:historical.id}};
    const transferBody=copy(documents[0].body);
    transferBody.header.business_date='2026-10-24';transferBody.lines.push(copy(historicalLine));
    documents.push(snapshot('FIXTURE-TR-AUDITED','TRANSFER','APPROVED',copy(transferBody)),
      snapshot('FIXTURE-TR-VOIDED','TRANSFER','DELETED',copy(transferBody)));
    const saleLine=(sku,quantity,amount) => ({sku_id:sku.id,product_id:sku.product_id,
      source_product_code:'M26001',source_product_name:products[0].name,color_id:sku.options.COLOR.id,
      size_id:sku.options.SIZE.id,source_color_name:sku.options.COLOR.name,source_size_name:sku.options.SIZE.name,
      source_quantity:quantity,unit:'件',unit_price:'100.00',amount,warehouse_id:'outlet',gift:false,
      source_lineage:{fixture:true},source_payload:{v2_reference_price_cents:10000,
        v2_pricing_rule:'unit-price',v2_line_note:'只读合成明细'}});
    const fund=(method,amount) => ({payment_method_id:method,fund_account_id:'fixture-account:'+method,
      source_payment_method_name:methods.find(m => m.id===method).name,
      source_fund_account_name:accounts.find(a => a.primary_payment_method_id===method).name,
      amount,direction:'receipt',source_business_date:'2026-10-24',source_payload:{fixture:true}});
    const saleBody={header:{business_date:'2026-10-24T16:00',source_party_id:'retail',
      source_warehouse_id:'outlet',source_employee_id:'sales-1',hall_id:'hall-outlet',adjustment:'0.00',
      source_payload:{businessType:'销售',rounding:'0.00',amountAfterRounding:'200.00'}},
      lines:[saleLine(firstSku,'2','200.00')],fundsRecords:[fund('cash','120.00'),fund('bank','80.00')]};
    const mixedBody=copy(saleBody);
    mixedBody.header.source_payload={businessType:'退货/换货',rounding:'0.00',amountAfterRounding:'100.00'};
    mixedBody.lines.push(saleLine(historicalSku,'-1','-100.00'));mixedBody.fundsRecords=[fund('cash','100.00')];
    documents.push(snapshot('FIXTURE-SALE-DRAFT','SALE','UNAUDITED',copy(saleBody)),
      snapshot('FIXTURE-SALE-MIXED','SALE','UNAUDITED',mixedBody),
      snapshot('FIXTURE-SALE-AUDITED','SALE','APPROVED',copy(saleBody)),
      snapshot('FIXTURE-SALE-VOIDED','SALE','DELETED',copy(saleBody)));
    // One isolated DTO example, not a reconstructed ledger or posting calculation.
    const ledgerSku=documents.find(d => d.number==='FIXTURE-TR-AUDITED').body.lines[0].sku_id;
    const balance=Number(stock.find(s => s.variant_id===ledgerSku && s.warehouse_id==='main').quantity);
    const ledger=[{id:'fixture-ledger:transfer-audited:1',sku:ledgerSku,warehouse:'main',
      time:'2026-10-24T08:02:00.000Z',type:'调拨出',delta:-4,stock_delta:-4,before:balance+4,after:balance,
      source:'FIXTURE-TR-AUDITED',source_route:'transfer/doc/FIXTURE-TR-AUDITED',
      document_id:'fixture-document:FIXTURE-TR-AUDITED',document_type:'TRANSFER',version:3,
      user:actor.name,phase:1,historical_only:false,fixture:true}];
    const mock = root.TRANSFER_MOCK_CORE.seed(root.GOLD.documents,products);
    fixture = {products,refs,catalog,stock,hallConfig,documents,mock,ledger};
    return fixture;
  }
  function inventory(f, body, url) {
    const codes = new Set(body.products), warehouseIds = new Set(body.warehouses);
    const selected = f.products.filter(p => codes.has(p.id));
    const chosen = page(selected,url).items;
    const rows = [], productGroups = [], colorGroups = [];
    let rowCount = 0, total = 0, index = 0;
    for (const p of selected) {
      const first = index, cols = {};
      for (const colorId of p.colorIds) {
        const colorFirst = index, colorCols = {};
        for (const w of f.refs.warehouses.filter(w => warehouseIds.has(w.id))) {
          const cells = f.stock.filter(x => x.product_code===p.id && x.color_id===colorId && x.warehouse_id===w.id);
          if (!cells.length) continue;
          const values = Object.fromEntries(cells.map(x => [x.size_id,x.quantity]));
          const sum = cells.reduce((n,x) => n+Number(x.quantity),0);
          for (const x of cells) {cols[x.size_id]=(cols[x.size_id] || 0)+Number(x.quantity);
            colorCols[x.size_id]=(colorCols[x.size_id] || 0)+Number(x.quantity);}
          if (chosen.includes(p)) rows.push({code:p.id,color_id:colorId,warehouse_id:w.id,values,total:sum,index});
          index++; rowCount++; total+=sum;
        }
        if (chosen.includes(p)) colorGroups.push({code:p.id,color_id:colorId,cols:colorCols,first:colorFirst,last:index-1});
      }
      if (chosen.includes(p)) productGroups.push({code:p.id,cols,first,last:index-1});
    }
    return {rows,products:productGroups,colors:colorGroups,productCount:selected.length,rowCount,total};
  }
  root.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input),location.href);
    const method = String(init.method || request?.method || 'GET').toUpperCase();
    const isData = url.pathname.startsWith('/runtime/') || url.pathname.startsWith('/reference/');
    if (!isData) {
      if (url.origin===location.origin && (method==='GET' || method==='HEAD')) return nativeFetch(input,init);
      return response('副本禁止访问外部服务：'+url.origin,403);
    }
    if (url.origin!==location.origin && url.origin!=='http://127.0.0.1:8878') {
      return response('副本未提供此数据地址：'+url.origin,403);
    }
    const path = url.pathname;
    if (path==='/runtime/session' && method==='GET') return response({employee:signedIn?copy(admin):null});
    if (path==='/runtime/logout' && method==='POST') {
      signedIn=false;sessionStorage.setItem(logoutKey,'1');return response({loggedOut:true});
    }
    if (!signedIn) return response('副本样例会话未开启；不使用真实账号或密码',401);
    let body;
    try {body = init.body !== undefined ? JSON.parse(init.body) : request && method!=='GET' ? await request.clone().json() : undefined;}
    catch {return response('副本请求内容不是有效 JSON',400);}
    const samplePost = path==='/runtime/inventory' || path==='/runtime/work' &&
      ['logs','acquire','renew','check','release','work','work-result'].includes(body?.type);
    if (method!=='GET' && !(method==='POST' && samplePost)) {
      return response('第一阶段样例未实现此操作，未保存、未审核、未修改资料：'+method+' '+path,501);
    }
    try {
      const f = samples();
      const failDetail=failOnce==='transfer-detail' && path.startsWith('/runtime/document/') &&
        f.documents.some(d => d.document_type==='TRANSFER' &&
          [d.id,d.number].includes(decodeURIComponent(path.slice('/runtime/document/'.length))));
      if (!failureUsed && (failDetail || failOnce==='ledger' && path==='/runtime/ledger')) {
        failureUsed=true;return response('合成一次读取失败；本次未返回数据，请使用原入口重试',503);
      }
      if (path==='/runtime/employees') return response([copy(admin),...copy(f.refs.employees).map(e => ({
        ...e,storeId:e.hall_id,employmentStatus:'在职',loginEnabled:false,authVersion:1,hasPassword:false}))]);
      if (path.startsWith('/reference/')) {
        const kind = path.slice('/reference/'.length);
        return Object.hasOwn(f.refs,kind) ? response(page(f.refs[kind],url)) : response('未提供此样例字典：'+kind,501);
      }
      if (path==='/runtime/hall-config') return response(f.hallConfig);
      if (path==='/runtime/catalog') return response(f.catalog);
      if (path==='/runtime/product-masters') return response([]); // No overlay edits in the original sample seed.
      if (path==='/runtime/product-totals') return response(f.catalog.products.map(p => ({product_id:p.id,quantity:p.stock_total})));
      if (path==='/runtime/warehouse-stock') return response(f.refs.warehouses.map(w => ({id:w.id,
        absolute_quantity:f.stock.filter(x => x.warehouse_id===w.id).reduce((n,x) => n+Math.abs(Number(x.quantity)),0)})));
      if (path==='/runtime/stock') {
        const codes = JSON.parse(url.searchParams.get('products') || '[]');
        if (!Array.isArray(codes) || codes.some(code => !f.products.some(p => p.id===code))) return response('原样例中没有所请求的商品',404);
        return response(f.stock.filter(x => codes.includes(x.product_code)));
      }
      if (path==='/runtime/products') {
        const query = JSON.parse(url.searchParams.get('query') || '{}'), filters = query.filters || {};
        const rows = f.products.filter(p => (!filters.products?.length || filters.products.includes(p.id)) &&
          (!filters.categories?.length || filters.categories.includes(p.categoryId)) &&
          ['year','season','supplierId','fitId','thickness','shapeCode'].every(key => {
            const values = filters[key==='year'?'years':key==='season'?'seasons':key];
            const value = key==='fitId' ? f.catalog.skus.find(s => s.product_id==='fixture-product:'+p.id)?.fit_id : p[key];
            return !values?.length || values.includes(String(value || ''));
          }));
        const start = (Math.max(1,query.page || 1)-1)*(query.size || 20);
        return response({codes:rows.slice(start,start+(query.size || 20)).map(p => p.id),total:rows.length});
      }
      if (path==='/runtime/inventory' && Array.isArray(body?.products) && Array.isArray(body?.warehouses)) {
        if (body.products.some(id => !f.products.some(p => p.id===id)) || body.warehouses.some(id => !f.refs.warehouses.some(w => w.id===id))) {
          return response('原样例中没有所请求的商品或仓库',404);
        }
        return response(inventory(f,body,url));
      }
      if (path==='/runtime/documents') {
        const type = url.searchParams.get('type');
        if (!['SALE','TRANSFER'].includes(type)) return response('未提供此样例单据类型',501);
        const filters = JSON.parse(url.searchParams.get('filters') || '{}');
        const supported = ['q','from','to','status','start','end'];
        if (Object.entries(filters).some(([key,value]) => !supported.includes(key) && value && (!Array.isArray(value) || value.length))) {
          return response('第一阶段样例未实现此单据筛选条件',501);
        }
        const selected = (values,id) => !values || (Array.isArray(values)?!values.length || values.includes(id):values===id);
        const items = f.documents.filter(d => d.document_type===type &&
          (!filters.q || d.number.toLowerCase().includes(String(filters.q).toLowerCase())) &&
          selected(filters.from,d.body.header.source_from_warehouse_id) &&
          selected(filters.to,d.body.header.source_to_warehouse_id) &&
          (!filters.start || d.business_day>=filters.start) && (!filters.end || d.business_day<=filters.end) &&
          (!filters.status?.length || (Array.isArray(filters.status)?filters.status:[filters.status]).some(s =>
            ({'未审核':'UNAUDITED','已审核':'APPROVED','已作废':'DELETED'}[s] || s)===d.status)));
        return response(page(items,url));
      }
      if (path.startsWith('/runtime/document/')) {
        const id = decodeURIComponent(path.slice('/runtime/document/'.length));
        const found = f.documents.find(d => d.id===id || d.number===id);
        return found ? response(found) : response('原样例中没有此单据：'+id,404);
      }
      if (path==='/runtime/work' && body?.type==='logs') {
        if (!f.documents.some(d => d.id===body.docId || d.number===body.docId)) return response('原样例中没有此单据',404);
        const items = Object.values(f.mock.workEvents).filter(e => e.docId===body.docId && e.record).map(e => e.record);
        return response({items:items.concat((f.mock.salesWork || []).filter(e => e.docId===body.docId))});
      }
      if (path==='/runtime/work' && samplePost) {
        // Reuse the original mock reducers for transient edit leases and scan records.
        // Business save/approve/delete still goes to /runtime/command and is rejected above.
        const sessionId = root.TRANSFER_SERVICE.sessionId;
        const session = root.MASTER_DATA.context();
        f.mock.sessions[sessionId]=session;
        const saved=root.LEGACY_REAL.docs.get(body.docId);
        if (saved && !f.mock.docs.some(d => d.id===saved.id)) f.mock.docs.push(copy(saved));
        f.mock.salesDocs=copy(root.SALES_SERVICE.docs);
        let result;
        if (body.type==='work' && body.record) {
          result = root.SALES_CORE.apply(f.mock,body,{session,catalog:root.SALES_SERVICE.catalog,
            products:root.ERP_DEMO.products,warehouses:root.ERP_DEMO.warehouses});
        } else {
          result = root.TRANSFER_MOCK_CORE.reduce(f.mock,{...body,sessionId});
          if (result.doc) result.doc=copy(root.LEGACY_REAL.docs.get(body.docId));
        }
        const {state:ignored,...data}=result;
        return response(data);
      }
      if (path==='/runtime/recommendations') {
        if (!f.refs.halls.some(h => h.id===url.searchParams.get('hallId'))) return response('原样例中没有此营业厅',404);
        return response({accounts:[]}); // No recommendations in the original sample seed.
      }
      if (path==='/runtime/ledger') {
        const query=JSON.parse(url.searchParams.get('query') || '{}'),filters=query.filters || {};
        if (!f.catalog.skus.some(s => s.id===query.sku) || !f.refs.warehouses.some(w => w.id===query.warehouse)) {
          return response('原样例中没有此流水规格或仓库',404);
        }
        const all=f.ledger.filter(row => row.sku===query.sku && row.warehouse===query.warehouse);
        const items=all.filter(row => (!filters.start || row.time.slice(0,10)>=filters.start) &&
          (!filters.end || row.time.slice(0,10)<=filters.end) && (!filters.type || row.type===filters.type) &&
          (!filters.source || row.source.toLowerCase().includes(filters.source.toLowerCase())));
        const index=(Math.max(1,Number(query.page) || 1)-1)*20;
        const quantity=Number(f.stock.find(s => s.variant_id===query.sku && s.warehouse_id===query.warehouse).quantity);
        return response({items:items.slice(index,index+20),total:items.length,
          types:['库存初始化 / 期初','调拨入','调拨出','销货出库','退货入库','进货'],quantity,openingMode:null,fixture:true});
      }
      return response('第一阶段样例未实现此读取，未调用真实服务：'+method+' '+path,501);
    } catch (error) {
      return response('副本样例读取失败：'+error.message,500);
    }
  };
})();
