import {TransfersList} from './transfers-list.tsx';
import type {Options} from './transfers-page-contracts.ts';
export default function ListPage(p:Options){return <TransfersList session={p.session} view={p.view} canCreate={p.manualCreate} create={()=>p.navigate('transfer/new')} open={row=>{p.session.selection.row=row;p.navigate(row.dataset==='LIVE'?'transfer/view/'+encodeURIComponent(row.documentId):'transfer/history/'+encodeURIComponent(row.batchId)+'/'+encodeURIComponent(row.documentId)+'/'+row.effectiveVersion);}} denied={p.denied}/>;}
