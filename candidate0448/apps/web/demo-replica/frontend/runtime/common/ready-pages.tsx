import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import type {ReadyPageOptions,Navigate,PrepareRoute,FeatureRuntime} from './feature-contracts.ts';
import {createSalesFeature} from '../documents/sales-feature.ts';
import {createTransfersFeature} from '../documents/transfers-feature.ts';
import {createInventoryFeature} from '../inventory/feature.ts';
import {createProductsFeature} from '../products/feature.ts';
import {createCatalogueFeature} from '../catalogue/feature.ts';
import {createSettingsFeature} from '../settings/feature.tsx';
export type {ReadyPageOptions,MountedReplicaPage} from './feature-contracts.ts';

/** The shell selects a feature. Each feature owns its capabilities and durable workspace. */
export function createReadyPageMounts(options:ReadyPageOptions,navigate:Navigate,prepareRoute?:PrepareRoute){
 const catalogue=createCatalogueFeature(options),inventory=createInventoryFeature(options,navigate);
 const sales=createSalesFeature(options,navigate),transfers=createTransfersFeature(options,navigate);
 const products=createProductsFeature(options,navigate,prepareRoute,catalogue,inventory);
 const features:FeatureRuntime[]=[catalogue,inventory,sales,transfers,products];
 const hasUnresolvedWrite=()=>features.some(feature=>feature.hasUnresolvedWrite());
 const settings=createSettingsFeature(options,hasUnresolvedWrite);features.push(settings);
 const select=(route:string)=>route==='sales'||route.startsWith('sales/')?sales:route==='transfer'||route.startsWith('transfer/')?transfers:route==='inventory'?inventory:route==='products'||route.startsWith('products/')?products:['product-categories','product-settings','barcode-schemes'].includes(route)?catalogue:settings;
 return {prepare:(route:string)=>select(route).prepare(route),mount:(host:HTMLElement,route:string,scope:ReadScope)=>select(route).mount(host,route,scope),hasUnresolvedWrite,retainedCatalogueCommands:catalogue.retainedCommands,dispose(){for(const feature of features)feature.dispose();}};
}
