import {businessDate} from '../../../../../../packages/domain/src/values.ts';
/** Specific display message only; existing query validators remain authoritative. */
export function documentDateOrderMessage(start:string,end:string):string|null {
 if(!start||!end)return null;
 try{businessDate(start);businessDate(end);}catch{return null;}
 return start>end?'开始日期不能晚于结束日期。':null;
}
