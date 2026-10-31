import {emptySalesFilter,type SalesFilterDraft,type SalesQueryPageSize} from '../../../../src/sales/contracts.ts';
export interface SalesListViewState { draft:SalesFilterDraft; applied:SalesFilterDraft; size:SalesQueryPageSize;requested?:{sequence:number;draft:SalesFilterDraft};more:boolean; scrollTop:number;scrollLeft:number;reload:boolean }
export const newSalesListViewState=():SalesListViewState=>({draft:emptySalesFilter(),applied:emptySalesFilter(),size:20,more:false,scrollTop:0,scrollLeft:0,reload:false});
