/** Opt-in, process-local synthetic second hall. No business writes or default auto-selection. */
import {qaHalls,qaCustomers,qaSalesReferences,qaWarehouses,qaId} from '../frontend/qa-reference-fixtures.mts';
export function installCustomerRecommendationFixture(){
 if(qaHalls.some(h=>h.id===qaId(3299)))throw Error('Customer recommendation fixture already installed');
 const first=qaHalls[0],customer=qaCustomers[1];
 const second={...first,id:qaId(3299),name:'推荐测试二厅',defaultCustomer:{id:customer.id,name:customer.name,enabled:customer.enabled},defaultSalesWarehouse:{...first.defaultSalesWarehouse,id:qaId(3399),name:'推荐测试二厅仓',hallId:qaId(3299)}};
 qaHalls.push(second);
 const warehouse={...qaWarehouses[0],id:qaId(3399),name:'推荐测试二厅仓',hall:{id:second.id,name:second.name,enabled:true}};
 qaWarehouses.push(warehouse);
 qaSalesReferences.warehouse.push({...qaSalesReferences.warehouse[0],id:warehouse.id,name:warehouse.name,hallId:second.id,hallName:second.name});
 qaSalesReferences.hall.push({...qaSalesReferences.hall[0],id:second.id,name:second.name,hallId:second.id,hallName:second.name});
}
