import {readFileSync,writeFileSync} from 'node:fs';
import {applyAcceptedSizeDecisions} from './accepted-size-decisions.mjs';

const auditPath=new URL('./user-size-audit.json',import.meta.url);
const audit=JSON.parse(readFileSync(auditPath,'utf8'));
const policy=JSON.parse(readFileSync(new URL('./accepted-size-decisions.json',import.meta.url),'utf8'));
const matches=applyAcceptedSizeDecisions(audit.matches,policy);
const changed=matches.filter((row,index)=>JSON.stringify(row)!==JSON.stringify(audit.matches[index])).length;
if(changed)writeFileSync(auditPath,JSON.stringify({...audit,matches},null,2)+'\n');
console.log(JSON.stringify({revision:policy.revision,accepted:policy.decisions.length,changed,originalSkus:matches.length}));
