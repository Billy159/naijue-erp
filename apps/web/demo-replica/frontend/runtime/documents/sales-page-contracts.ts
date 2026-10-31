import type {SalesListViewState} from './sales-list-state.ts';
import type {HttpQueryError} from '../../../../src/transport/http-query.ts';
import type { ReplicaSalesSession } from './sales-session.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { SalesDetailDto, SalesReferenceReader } from '../../../../src/sales/contracts.ts';
import type { ProductReadOnlyReader } from '../../../../src/inventory/product-contracts.ts';
import type { HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import type { AuthenticationPrincipal } from '../../../../src/authentication/contracts.ts';
import type { SalesExistingDocumentSession } from '../../../../src/current-form/sales-existing-document.ts';
export interface Options {http:HttpQueryOptions;historyRevision:boolean;newRequestKey:()=>string;principal:AuthenticationPrincipal;session:ReplicaSalesSession;scope:ReadScope;references:SalesReferenceReader;productReader:ProductReadOnlyReader;view:SalesListViewState;manualCreate:boolean;existingEdit:boolean;denied:(error:HttpQueryError)=>void;navigate:(route:string)=>void;onCommitted:()=>void;onDiscarded:()=>void;viewProduct?:(product:{id:string;label:string})=>void}
