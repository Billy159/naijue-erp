import {defaults,type DisplaySettings} from './matrix.tsx';
const key=(accountId:string)=>'naijue:inventory-display:v1:'+accountId;
/** Display-only booleans; never store query results, identities or drafts. */
export function readDisplayPreferences(accountId:string):DisplaySettings {
 const result={...defaults};
 try {const raw:unknown=JSON.parse(localStorage.getItem(key(accountId))??'null');if(raw&&typeof raw==='object')for(const name of Object.keys(defaults) as (keyof DisplaySettings)[]){const value=(raw as Record<string,unknown>)[name];if(typeof value==='boolean')result[name]=value;}}catch{/* Storage may be disabled or contain an older invalid value. */}
 return result;
}
export function saveDisplayPreferences(accountId:string,value:DisplaySettings):void {
 const safe=Object.fromEntries(Object.keys(defaults).map(name=>[name,value[name as keyof DisplaySettings]]));
 try{localStorage.setItem(key(accountId),JSON.stringify(safe));}catch{/* A blocked/full preference store must not break inventory reads. */}
}
