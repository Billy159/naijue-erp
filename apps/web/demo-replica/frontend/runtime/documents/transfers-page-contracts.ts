import type {TransferListViewState} from './transfers-list-state.ts';
import type {HttpQueryError,HttpQueryOptions} from '../../../../src/transport/http-query.ts';
import type {ReplicaTransferSession} from './transfers-session.ts';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import type {TransferDetailDto} from '../../../../src/transfers/contracts.ts';
export interface Options{manualCreate:boolean;reset:()=>void;productReader:import('../../../../src/inventory/product-contracts.ts').ProductReadOnlyReader;http:HttpQueryOptions;historyRevision:boolean;newRequestKey:()=>string;session:ReplicaTransferSession;scope:ReadScope;view:TransferListViewState;existingEdit:boolean;denied:(error:HttpQueryError)=>void;navigate:(route:string)=>void;viewProduct?:((product:{id:string;label:string})=>void)}
