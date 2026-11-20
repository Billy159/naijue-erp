import {emptyTransferFilter,type TransferFilterDraft} from '../../../../src/transfers/contracts.ts';
import type {TransferPageSize} from '../../../../src/transfers/format.ts';
export interface TransferListViewState {draft:TransferFilterDraft;applied:TransferFilterDraft;size:TransferPageSize;requested?:{sequence:number;draft:TransferFilterDraft};more:boolean;scrollTop:number;scrollLeft:number;reload:boolean}
export const newTransferListViewState=():TransferListViewState=>({draft:emptyTransferFilter(),applied:emptyTransferFilter(),size:20,more:false,scrollTop:0,scrollLeft:0,reload:false});
