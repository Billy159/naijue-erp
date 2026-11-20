import type {salesProposalMoney} from '../../../../src/current-form/sales-proposal.ts';
import {salesInputMoney} from '../../../../src/sales/commands/form-model.ts';
export function salesPaymentSummary(money:ReturnType<typeof salesProposalMoney>):string {
 if(!money)return '';
 if(money.settledMinor===null||money.differenceMinor===null)return '收退款资料未完整或金额无效，已收／已退金额暂无法计算。';
 const settled=BigInt(money.settledMinor),difference=BigInt(money.differenceMinor),net=BigInt(money.netDueMinor),abs=(value:bigint)=>salesInputMoney((value<0n?-value:value).toString());
 const paid=(settled<0n?'已退':'已收')+' ¥'+abs(settled);
 if(difference===0n)return paid+' · 已结清';
 const label=net<0n?(difference<0n?'未退':'超退'):(difference>0n?'未收':'超收');
 return paid+' · '+label+' ¥'+abs(difference);
}
