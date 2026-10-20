import type {FastifyInstance} from 'fastify';
import {registerBusinessRoute} from '../../security/http.js';
import {identifier, invalid, object} from '../../security/errors.js';
import {inventoryFilters,ledgerFilters,queryInventory,inventoryLedger} from './query.js';
import {attachLedgerTargets,authorizeInventoryRevision,postingTrace} from './trace.js';
import {queryWarehouseOccupancy} from './read-summary.js';

export function registerInventoryRoutes(app: FastifyInstance): void {
  for(const url of ['/api/inventory/warehouse-occupancy','/api/runtime/warehouse-occupancy']) {
    registerBusinessRoute(app,{method:'GET',url,resolve:() => ({id:'inventory.query',selection:{kind:'global'}}),
      handler:(context,request) => {
        if(Object.keys(object(request.query)).length)return invalid();
        return queryWarehouseOccupancy(context);
      }});
  }
  for (const url of ['/api/inventory','/api/runtime/inventory','/api/runtime/stock','/api/runtime/warehouse-stock']) {
    registerBusinessRoute(app,{method:'GET',url,resolve:() => ({id:url.endsWith('stock') ? 'inventory.balance' : 'inventory.query',selection:{kind:'global'}}),
      handler:(context,request) => queryInventory(context,inventoryFilters(request.query))});
  }
  for (const url of ['/api/inventory/ledger','/api/runtime/ledger']) {
    registerBusinessRoute(app,{method:'GET',url,resolve:() => ({id:'inventory.ledger',selection:{kind:'global'}}),
      handler:async (context,request) => attachLedgerTargets(context,await inventoryLedger(context,ledgerFilters(request.query)))});
  }
  registerBusinessRoute(app,{method:'GET',url:'/api/inventory/postings/:postingId',
    resolve:request => ({id:'inventory.sourceTrace',selection:{kind:'inventory-posting',id:identifier(object(request.params)['postingId'],true)}}),
    handler:(context,request) => postingTrace(context,identifier(object(request.params)['postingId'],true))});
  registerBusinessRoute(app,{method:'GET',url:'/api/inventory/documents/:documentId/revisions/:revision',
    resolve:request => ({id:'inventory.sourceTrace',selection:{kind:'document',id:identifier(object(request.params)['documentId'],true)}}),
    handler:(context,request) => {
      const params = object(request.params), n = params['revision'];
      if (typeof n !== 'string' || !/^[1-9]\d*$/.test(n) || !Number.isSafeInteger(Number(n)) || Number(n)>2147483647) return invalid();
      return authorizeInventoryRevision(context,identifier(params['documentId'],true),Number(n));
    }});
}
