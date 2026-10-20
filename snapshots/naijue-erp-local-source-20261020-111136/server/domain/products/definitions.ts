import {SecurityError, object} from '../../security/errors.js';

export const priceFields = ['purchasePrice','price','wholesale5','wholesale6','wholesale7','wholesale8','wholesale9','wholesale10','minimumPrice'] as const;
export const imageRoles:Record<string,string>={'主图':'main','白底图':'white','吊牌图':'tag','详情图':'detail','颜色配图':'color','辅助图片':'aux'};
export const imageRoleLabel=(code:string):string=>Object.entries(imageRoles).find(([,value])=>value===code)?.[0]||code;
export interface Size {id:string; name:string; code:string}
export interface SizeGroup {id:string; name:string; sizes:Size[]}
// The accepted current catalogue is read-only. Historical 900/910 are never inferred from it.
export function sizeGroups(): SizeGroup[] {
  const rows: [string,string,string[]][] = [
    ['UPPER','男装上衣尺码',['160/XS','165/S','170/M','175/L','180/XL','185/2XL','190/3XL','195/4XL','200/5XL','205/6XL','无尺码']],
    ['PANTS','男装裤子尺码',['29','30','31','32','33','34','35','36','38','40','无尺码']],
    ['WOMEN','女装尺码组',['150/XS','155/S','160/M','165/L','170/XL','175/2XL','180/3XL','185/4XL','190/5XL','195/6XL','无尺码']],
    ['SHOES','鞋码',['38','39','40','41','42','43','44']], ['KIDS','童装尺码',['90','100','110','120','130','140']], ['FREE','配饰均码',['无尺码','均码']],
  ];
  return rows.map(([id,name,names])=>({id,name,sizes:names.map((name,index)=>({name,
    id:id==='UPPER'&&index===0?'UPPER-2026-size-xs':id==='PANTS'&&index===0?'PANTS-2026-size-29':id==='FREE'&&index===0?'FREE-2026-size-none':`${id}-demo-size-${index-(['UPPER','PANTS','FREE'].includes(id)?1:0)}`,
    code:['UPPER','PANTS','WOMEN'].includes(id)?name==='无尺码'?'900':String(({UPPER:201,PANTS:901,WOMEN:251} as Record<string,number>)[id]!+index):''}))}));
}
export const fits = ['Y','A','B','C','D','E'].map((id,i)=>({id,code:id,name:`${id}版（${['修身','标准','宽松','加肥','加肥加大','特体'][i]}）`,fixed:true}));
export const seasons = ['春','夏','秋','冬'].map(name=>({id:name,name}));
export function fail(message:string,code='VALIDATION',status=400): never {throw new SecurityError(code,status,message);}
export function text(value:unknown,label:string,max=120,allowEmpty=false): string {
  if (typeof value!=='string'||value.includes('\0')||value.length>max||!allowEmpty&&!value.trim()) return fail(`${label}无效`);
  return value.trim();
}
export function price(value:unknown): string|null {
  if (value===null||value==='') return null;
  if (typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return fail('价格必须是非负金额，最多两位小数');
  const [whole,fraction='']=value.split('.'),cents=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));
  if (cents>99999999999n) return fail('价格不能超过 999999999.99');
  return `${whole}.${fraction.padEnd(2,'0')}`;
}
export function baseFit(name:unknown): string {
  const s=String(name||'');return s.match(/([YABCDE])\s*版/i)?.[1]?.toUpperCase()||(/特体/.test(s)?'E':/加肥加大/.test(s)?'D':/加肥/.test(s)?'C':/宽松|偏大|大版/.test(s)?'B':/修身|偏小/.test(s)?'Y':'A');
}
export function mainBarcode(profile:Record<string,unknown>,fit:string,color:string,size:string): string {
  if (profile['schemeId']==='2018') return /^\d{5}$/.test(String(profile['freeCode']))&&/^\d$/.test(color)&&/^\d{2}$/.test(size)?`8${profile['freeCode']}${color}${size}`:'';
  const rule=({'2020':['0',3,3],'2021':['6',3,2],'2021fit':['2',3,2],'2023':['9',3,3],'2026':['5',3,3]} as Record<string,[string,number,number]>)[String(profile['schemeId'])];
  if (!rule||!/^\d{7}$/.test(String(profile['barcodeItemCode']))||!new RegExp(`^\\d{${rule[1]}}$`).test(color)||!new RegExp(`^\\d{${rule[2]}}$`).test(size)||!/^[A-Z]$/.test(fit)) return '';
  return `${rule[0]}${profile['schemeId']==='2026'?fit:''}${profile['barcodeItemCode']}${profile['schemeId']==='2021fit'?fit:''}${color}${size}`;
}
export function record(value:unknown): Record<string,unknown> {return value&&typeof value==='object'&&!Array.isArray(value)?object(value):{};}
