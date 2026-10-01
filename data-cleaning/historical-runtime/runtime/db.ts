import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
export const SOURCE=(()=>{const value=process.env.TPLUS_SOURCE_SCHEMA||'tplus_demo_20260922_a2';if(!/^[a-z][a-z0-9_]*$/.test(value))throw Error('INVALID_SOURCE_SCHEMA');return value;})();
export const DATABASE=process.env.POSTGRES_DB||'business_management';
export function identifier(s:string){if(!/^[a-z][a-z0-9_]*$/.test(s))throw Error('INVALID_SCHEMA');return '"'+s+'"';}
export function literal(v:unknown):string {if(v==null)return 'NULL';if(typeof v==='number'){if(!Number.isFinite(v))throw Error('INVALID_NUMBER');return String(v);}if(typeof v==='boolean')return v?'true':'false';return "'"+String(v).replaceAll("'","''")+"'";}
/** A single psql connection owns BEGIN through confirmed COMMIT; pipe exit rolls back. */
export class Transaction {
 child; pending:any=null; error=''; closed=false; marker=randomUUID();
 constructor(public schema:string){
  identifier(schema);
  this.child=spawn(process.env.PSQL_BIN||'psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',process.env.POSTGRES_HOST||'127.0.0.1','-p',process.env.POSTGRES_PORT||'5432','-U',process.env.POSTGRES_USER||process.env.USER!,'-d',DATABASE],{stdio:['pipe','pipe','pipe']});
  this.child.stderr.on('data',x=>this.error+=x);
  createInterface({input:this.child.stdout}).on('line',line=>{if(!this.pending)return;if(line===this.marker){const p=this.pending;this.pending=null;try{p.resolve(p.json?JSON.parse(p.lines.join('')):undefined);}catch(e){p.reject(e);}}else this.pending.lines.push(line);});
  const fail=(e:Error)=>{this.closed=true;if(this.pending){this.pending.reject(e);this.pending=null;}};
  this.child.on('error',fail);this.child.on('exit',code=>fail(Error(this.error||`PSQL_EXIT_${code}`)));
  this.child.stdin.on('error',fail);
  this.child.stdin.write(`BEGIN; SET LOCAL search_path=${identifier(schema)},pg_catalog; SET LOCAL standard_conforming_strings=on; SET LOCAL statement_timeout='60s'; SET LOCAL lock_timeout='20s';\n`);
 }
 send(sql:string,json=false):Promise<any>{if(this.closed)return Promise.reject(Error(this.error||'CLOSED_TRANSACTION'));if(this.pending)throw Error('CONCURRENT_QUERY_ON_TRANSACTION');return new Promise((resolve,reject)=>{this.pending={resolve,reject,json,lines:[]};this.child.stdin.write(sql+`;\nSELECT '${this.marker}';\n`);});}
 async query(sql:string,args:readonly unknown[]=[]){const statement=sql.replace(/\$(\d+)/g,(_,n)=>literal(args[Number(n)-1]));const rows=await this.send(`WITH result AS (${statement}) SELECT coalesce(json_agg(result),'[]'::json) FROM result`,true);return {rows,rowCount:rows.length};}
 async execute(sql:string){await this.send(sql);}
 async finish(commit:boolean){if(this.closed){if(commit)throw Error(this.error||'COMMIT_FAILED');return;}try{await this.send(commit?'COMMIT':'ROLLBACK');}finally{this.child.stdin.end('\\q\n');}}
}
export async function transaction<T>(schema:string,work:(tx:Transaction)=>Promise<T>){const tx=new Transaction(schema);try{const result=await work(tx);await tx.finish(true);return result;}catch(e){await tx.finish(false);throw e;}}
