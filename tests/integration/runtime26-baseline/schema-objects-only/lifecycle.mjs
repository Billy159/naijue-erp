/** Connection-free lifecycle primitives with injected native operations for fault tests. */
export const need=(ok,code)=>{if(!ok)throw Error(code);};
export function captureData(input,keys,code='CLOSED_OWN_DATA_REQUIRED'){
 need(input&&Object.getPrototypeOf(input)===Object.prototype&&Reflect.ownKeys(input).length===keys.length,code);const out={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(input,key);need(d&&d.enumerable&&Object.hasOwn(d,'value'),code);out[key]=d.value;}return Object.freeze(out);
}
export const literal=x=>{need(typeof x==='string','PRIMITIVE_SQL_LITERAL_REQUIRED');return "'"+x.replaceAll("'","''")+"'";};
export const identifier=x=>{need(typeof x==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(x),'PRIMITIVE_CLOSED_IDENTIFIER_REQUIRED');return '"'+x+'"';};
export function captureOptions(input){const t=captureData(input,['id','port']);need(typeof t.id==='string'&&/^[a-f0-9]{8,16}$/.test(t.id)&&typeof t.port==='number'&&Number.isInteger(t.port)&&t.port>1024&&t.port<65536&&![5432,55437,55438,55439].includes(t.port),'NEW_PRIMITIVE_RUN_ID_PORT_REQUIRED');return t;}
export function createBudget(start,duration=1200000,now=Date.now){need(Number.isSafeInteger(start)&&Number.isSafeInteger(duration)&&duration>0&&duration<=1200000&&typeof now==='function','FINITE_ENGINE_BUDGET_REQUIRED');return Object.freeze({startsAt:start,expiresAt:start+duration,remaining(){const n=now();need(Number.isSafeInteger(n)&&n>=start&&n<start+duration,'ENGINE_ABSOLUTE_DEADLINE_EXPIRED');return start+duration-n;}});}
export async function budgetedQuery(client,sql,parameters,budget,cleanup=false){
 const limit=()=>cleanup?5000:Math.min(45000,budget.remaining());
 const run=async(text,values)=>{const query_timeout=limit();try{return await client.query({text,values,query_timeout});}catch(e){if(e?.message==='Query read timeout')client.connection?.stream?.destroy();throw e;}};
 // SET is illegal in an aborted transaction; ROLLBACK must be the first wire SQL.
 if(sql==='ROLLBACK')return await run('ROLLBACK',undefined);
 await run(`SET statement_timeout='${limit()}ms'`,undefined);if(!cleanup)budget.remaining();const r=await run(sql,parameters);if(!cleanup)budget.remaining();return r;
}
export function assertPhysicalIdentity(expected,actual){for(const key of ['path','uid','mode','device','inode'])need(expected[key]===actual[key],'PHYSICAL_BIRTH_IDENTITY_CHANGED:'+key);need(actual.mode===0o700&&actual.canonical===true&&actual.symbolicLink===false,'PRIVATE_CANONICAL_0700_REQUIRED');}
export function closedPortEvidence(errorCode){return Object.freeze({state:errorCode==='ECONNREFUSED'?'CLOSED':'UNKNOWN',errorCode});}
export function terminalStatus(sourcePassed,c){return sourcePassed&&c.stopExitCode===0&&c.portState==='CLOSED'&&c.pidFileAbsent===true&&c.processAbsent===true&&c.controlShutDown===true&&c.otherClients===0&&c.clientsClosed===true?'PASS_SOURCE_OBJECTS_ONLY_NOT_RUNTIME_CANONICAL_OR_ACL_APPROVAL':sourcePassed?'FAILED_CLEANUP_UNCONFIRMED':'FAILED_SOURCE_QUARANTINED_NO_REPLAY';}
export async function runChildCommand(spawn,executable,args,{cwd,env,input='',timeoutMs,graceMs=2000,sanitize=String,timers={setTimeout,clearTimeout}}){
 need(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=60000&&Number.isSafeInteger(graceMs)&&graceMs>0&&graceMs<=2000,'FINITE_NATIVE_COMMAND_TIMEOUT_REQUIRED');
 return await new Promise((resolve,reject)=>{let child;try{child=spawn(executable,args,{cwd,env,stdio:['pipe','pipe','pipe']});}catch(e){reject(e);return;}let out='',err='',spawnError=null,timedOut=false,killTimer=null;
 const alive=()=>child.exitCode===null&&child.signalCode===null;
 const timer=timers.setTimeout(()=>{timedOut=true;if(alive())child.kill('SIGTERM');killTimer=timers.setTimeout(()=>{if(alive())child.kill('SIGKILL');},graceMs);},timeoutMs);
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',e=>{spawnError=sanitize(e.message);});
 child.once('close',(code,signal)=>{timers.clearTimeout(timer);if(killTimer!==null)timers.clearTimeout(killTimer);resolve({code,signal,timedOut,spawnError,stdout:sanitize(out),stderr:sanitize(err),definitiveClose:true});});child.stdin.on('error',e=>{spawnError=sanitize(e.message);});try{child.stdin.end(input);}catch(e){spawnError=sanitize(e.message);}
 });
}
export async function settleClient(client,{timeoutMs=5000,graceMs=1000,timers={setTimeout,clearTimeout}}={}){
 need(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=5000&&Number.isInteger(graceMs)&&graceMs>0&&graceMs<=1000,'BOUNDED_CLIENT_CLOSE_REQUIRED');
 return await new Promise(resolve=>{let done=false,timer,grace,destroyed=false;const finish=result=>{if(done)return;done=true;timers.clearTimeout(timer);if(grace!==undefined)timers.clearTimeout(grace);resolve({...result,destroyAttempted:destroyed});};
 timer=timers.setTimeout(()=>{try{const stream=client.connection?.stream;if(stream){destroyed=true;stream.destroy();}}catch{}grace=timers.setTimeout(()=>finish({settled:false,confirmed:false,reason:'CLIENT_END_UNCONFIRMED_AFTER_BOUND'}),graceMs);},timeoutMs);
 try{const ended=client.end();if(!ended||typeof ended.then!=='function'){finish({settled:false,confirmed:false,reason:'CLIENT_END_PROMISE_REQUIRED'});return;}Promise.resolve(ended).then(()=>finish({settled:true,confirmed:true}),()=>finish({settled:true,confirmed:false,reason:'CLIENT_END_REJECTED'}));}catch{finish({settled:true,confirmed:false,reason:'CLIENT_END_THROWN'});}
 });
}
export async function connectCaptured(create,onFailureClose,closeOptions){const client=create();try{await client.connect();return client;}catch(error){const receipt=await settleClient(client,closeOptions);onFailureClose(receipt);throw error;}}

export function trackForeground(child){let closed=false,error=null;const completion=new Promise(resolve=>{child.on('error',e=>{error=e.message;});child.once('close',(code,signal)=>{closed=true;resolve({code,signal,error,definitiveClose:true});});});return Object.freeze({child,completion,state:()=>Object.freeze({closed,error})});}
export async function stopForeground(tracked,{timeoutMs=30000,timers={setTimeout,clearTimeout}}={}){
 need(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=30000,'BOUNDED_FOREGROUND_STOP_REQUIRED');let forced=false;
 const alive=()=>!tracked.state().closed&&tracked.child.exitCode===null&&tracked.child.signalCode===null;
 if(alive())tracked.child.kill('SIGINT');const timer=timers.setTimeout(()=>{if(alive()){forced=true;tracked.child.kill('SIGKILL');}},timeoutMs);
 const closed=await tracked.completion;timers.clearTimeout(timer);return{...closed,forced};
}

export function assertBootstrapIdentity(actual,expected){const t=captureData(expected,['systemIdentifier','data','port']);need(actual&&actual.id===t.systemIdentifier&&actual.version==='170011'&&actual.data===t.data&&actual.address_match===true&&actual.port===t.port&&actual.sockets==='','DIRECT_PHYSICAL_BIRTH_MISMATCH');}
