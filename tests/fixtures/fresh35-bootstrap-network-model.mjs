/** Explicit OS/source model for offline tests; never registers production authority. */
let networkModelSerial=0;
export async function createFresh35BootstrapNetworkModel({proposalDate='20261106'}={}){
 const fs=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process');
 const dir=await fs.mkdtemp(join(tmpdir(),'bootstrap-network-model-')),workspace=join(dir,'cloud-pg-fresh35-'+proposalDate+'-r9');await fs.mkdir(workspace);
 const url=new URL('../../scripts/release/unified-install/fresh35-combined-target-v1.mjs',import.meta.url);
 const original=process.env.FRESH35_NETWORK_BASELINE==='1'?execFileSync('git',['show','HEAD:candidate0448/scripts/release/unified-install/fresh35-combined-target-v1.mjs'],{encoding:'utf8'}):await fs.readFile(url,'utf8');
 const stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
 const io=stub(`import * as fs from 'node:fs/promises';export const serial=${++networkModelSerial};let uid=0n;export function owner(v){uid=BigInt(v)}const normalize=s=>Object.create(s,{uid:{value:uid}});export const readFile=fs.readFile;export async function lstat(p,o){return normalize(await fs.lstat(p,o))}export async function open(p,f){const h=await fs.open(p,f);return{stat:async o=>normalize(await h.stat(o)),readFile:(...a)=>h.readFile(...a),close:()=>h.close()}}`);
 let source=original.replace(/export const FRESH35_COMBINED_TARGET_MODULE_SHA256=.*?;/,"export const FRESH35_COMBINED_TARGET_MODULE_SHA256="+JSON.stringify((await import('node:crypto')).createHash('sha256').update(original).digest('hex'))+";");
 source=source.replace("'node:fs/promises'",JSON.stringify(io)).replace("'./trusted-install-path.mjs'",JSON.stringify(stub('export async function assertTrustedRootPath(){}')));
 source=source.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_m,_q,p)=>'from '+JSON.stringify(new URL(p,url).href));
 source=source.replace(/import\((['"])(\.{1,2}\/[^'"]+)\1\)/g,(_m,_q,p)=>'import('+JSON.stringify(new URL(p,url).href)+')');
 const moduleURL=stub(source),api=await import(moduleURL),ioApi=await import(io),now=Date.now(),arg={proposal:{database:'synthetic_fresh35_'+proposalDate+'_r9',owner:'fresh35_owner_'+proposalDate+'_r9',controller:'fresh35_controller_'+proposalDate+'_r9',runtime:'fresh35_runtime_'+proposalDate+'_r9',admin:'fresh35_admin_'+proposalDate+'_r9',host:'127.0.0.1',port:57639,workspaceDirectory:workspace},physical:{systemIdentifier:'7703999999999999999',databaseOid:'16384',serverVersionNum:'170011'}};
 arg.startsAt=now-1000;arg.expiresAt=now+60000;arg.physical.postmasterStart=new Date(now-500).toISOString().replace('T',' ').replace('Z','+00');
 const target=api.bindFresh35CombinedTarget(arg),path=join(workspace,'bootstrap-network-observation.json'),sourceSetSha256='a'.repeat(64);
 const value={format:'FRESH35_SYNTHETIC_BOOTSTRAP_NETWORK_OBSERVATION_V1',...arg.physical,host:arg.proposal.host,port:arg.proposal.port,listenAddresses:'127.0.0.1',unixSocketDirectories:'',adminActor:arg.proposal.admin,startsAt:arg.startsAt,expiresAt:arg.expiresAt,sourceSetSha256};
 const write=async v=>{try{await fs.chmod(path,0o600)}catch{}await fs.writeFile(path,JSON.stringify(v));await fs.chmod(path,0o444)};
 return{fs,api,moduleURL,ioApi,arg,target,value,path,sourceSetSha256,write,close:()=>fs.rm(dir,{recursive:true,force:true})};
}


export async function rewriteFresh35ModelModule(model,path,replacements=[]){
 const url=new URL(path,import.meta.url);let text=await model.fs.readFile(url,'utf8');
 text=text.replaceAll('import.meta.url',JSON.stringify(url.href));
 text=text.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_m,_q,p)=>'from '+JSON.stringify(new URL(p,url).href));
 text=text.replace(/import\((['"])(\.{1,2}\/[^'"]+)\1\)/g,(_m,_q,p)=>'import('+JSON.stringify(new URL(p,url).href)+')');
 for(const [name,replacement]of replacements)text=text.replaceAll(new URL(name,url).href,replacement);
 return 'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
}
export async function prepareFresh35CatalogProgramModel(model,source,paths){
 const {describeFresh35CombinedSource}=await import('../../scripts/release/unified-install/fresh35-combined-source-v1.mjs');
 model.sourceSetSha256=describeFresh35CombinedSource(source).sourceSetSha256;model.value.sourceSetSha256=model.sourceSetSha256;
 await model.write(model.value);
 const catalogURL=await rewriteFresh35ModelModule(model,'../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs',[['./fresh35-combined-target-v1.mjs',model.moduleURL]]),catalogAPI=await import(catalogURL);
 const lifecycleURL=await rewriteFresh35ModelModule(model,'../../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs',[['./fresh35-combined-target-v1.mjs',model.moduleURL],['./fresh35-combined-catalog-v1.mjs',catalogURL]]),lifecycleAPI=await import(lifecycleURL);
 const catalog=await catalogAPI.buildFresh35CombinedCatalog(source,model.target,paths),program=await lifecycleAPI.compileFresh35CombinedProgram({source,target:model.target,catalog});
 return{catalogAPI,lifecycleAPI,catalog,program,catalogURL,lifecycleURL};
}
