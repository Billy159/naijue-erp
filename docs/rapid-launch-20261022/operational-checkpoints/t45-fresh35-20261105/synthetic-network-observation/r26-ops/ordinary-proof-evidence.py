"""Fixed new-r2 container probe. No PG connection or application source writes."""
import hashlib,json,os,selectors,signal,stat,subprocess,time
from pathlib import Path

SOURCE='af75afcf7f933000e22fb326d05038391e9008a61fb6e4915ebc13f8da46d01c'
PROOF=Path('/var/lib/naijue-erp/fresh35-isolated/cloud-pg-fresh35-20261105-r1/bootstrap-network-observation.json')
NODE='/usr/local/bin/node'
UID=61035
NODE_SCRIPT=r'''
import {readFileSync,lstatSync,watch} from 'node:fs';
import {createHash} from 'node:crypto';
const root='/opt/naijue-erp/fresh35-combined-v1';
const fixed='/var/lib/naijue-erp/fresh35-isolated/cloud-pg-fresh35-20261105-r1/bootstrap-network-observation.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c)};
const code=e=>/^[A-Z][A-Z0-9_]{0,180}$/.test(e?.code??e?.message??'')?(e.code??e.message):'PROBE_FAILURE';
const metadata=s=>({uid:String(s.uid),gid:String(s.gid),mode:Number(s.mode&0o7777n),nlink:String(s.nlink),device:String(s.dev),inode:String(s.ino),bytes:String(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs)});
let stage='UID',watcher,timer;
try{
 const input=JSON.parse(readFileSync(0,'utf8'));
 need(process.getuid()===61035&&process.geteuid()===61035&&process.getgid()===61035,'ACTUAL_ORDINARY_UID_REQUIRED');
 need(process.versions.node==='24.21.0'&&input.sourceSetSha256==="af75afcf7f933000e22fb326d05038391e9008a61fb6e4915ebc13f8da46d01c"&&Date.now()<input.expiresAt-10000,'EXACT_PROBE_SCOPE_REQUIRED');
 stage='NATIVE_RECORD';
 const recordModule=await import(root+'/scripts/release/unified-install/fresh35-combined-record-v1.mjs');
 const envelope=await recordModule.loadFresh35CombinedRecordEnvelope();
 need(envelope.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V1'&&envelope.binding.sourceSetSha256===input.sourceSetSha256&&envelope.target.expiresAt===input.expiresAt,'EXACT_NEW_RECORD_REQUIRED');
 stage='NATIVE_SOURCE';
 const sourceModule=await import(root+'/scripts/release/unified-install/fresh35-combined-source-v1.mjs');
 const paths=await sourceModule.resolveFresh35ReferenceInputPaths(root+'/reference-inputs');
 const source=await sourceModule.loadFresh35CombinedSource(root,{baselineDirectory:paths.baselineDirectory});
 need(sourceModule.describeFresh35CombinedSource(source).sourceSetSha256===input.sourceSetSha256,'EXACT_CURRENT_SOURCE_REQUIRED');
 const targetModule=await import(root+'/scripts/release/unified-install/fresh35-combined-target-v1.mjs');
 const catalogModule=await import(root+'/scripts/release/unified-install/fresh35-combined-catalog-v1.mjs');
 const {proposal,physical,startsAt,expiresAt}=envelope.target;
 need(proposal.workspaceDirectory+'/bootstrap-network-observation.json'===fixed,'FIXED_NEW_PROOF_REQUIRED');
 const target=targetModule.bindFresh35CombinedTarget({proposal,physical,startsAt,expiresAt});
 stage='CATALOG_BASELINE';
 const catalog=await catalogModule.buildFresh35CombinedCatalog(source,target,paths);
 const descriptor=catalogModule.describeFresh35CombinedCatalog(catalog);
 const proofSha256=sha(readFileSync(fixed));
 need(descriptor.bootstrapNetworkObservationSha256===proofSha256&&descriptor.catalogSpecSha256===envelope.catalogSpecSha256,'EXACT_CATALOG_PROOF_REQUIRED');
 await catalogModule.assertFresh35CombinedCatalogCurrent(catalog);
 stage='EPOCH_BIND';
 const match=physical.postmasterStart.match(/^(.*:\d{2})(?:\.(\d{1,6}))?(\+00)$/);
 need(match,'CANONICAL_EPOCH_REQUIRED');
 const fraction=Number((match[2]??'').padEnd(6,'0'));
 const changed=String(fraction===999999?999998:fraction+1).padStart(6,'0');
 const badPhysical={...physical,postmasterStart:match[1]+'.'+changed+match[3]};
 const badTarget=targetModule.bindFresh35CombinedTarget({proposal,physical:badPhysical,startsAt,expiresAt});
 stage='EPOCH_CATALOG';let epochCode;
 try{await catalogModule.buildFresh35CombinedCatalog(source,badTarget,paths)}catch(e){epochCode=code(e)}
 need(epochCode==='FRESH35_COMBINED_BOOTSTRAP_NETWORK_BINDING_DIFFERS','EPOCH_PROOF_REFUSAL_NOT_CONFIRMED');
 stage='WATCH';
 let resolveEvent;const event=new Promise(resolve=>{resolveEvent=resolve});
 watcher=watch(fixed,kind=>resolveEvent({kind}));watcher.on('error',e=>resolveEvent({error:code(e)}));
 timer=setTimeout(()=>resolveEvent({error:'WATCH_TIMEOUT'}),5000);
 const before=metadata(lstatSync(fixed,{bigint:true}));
 need(before.uid==='0'&&before.mode===0o444&&before.nlink==='1','EXACT_PUBLIC_PROOF_METADATA_REQUIRED');
 const ancestors=[];let parent=fixed.slice(0,fixed.lastIndexOf('/'));
 while(parent){const s=lstatSync(parent,{bigint:true});ancestors.push({path:parent,uid:String(s.uid),mode:Number(s.mode&0o7777n)});parent=parent.slice(0,parent.lastIndexOf('/'));}
 need(ancestors.some(s=>s.mode===0o711),'ACTUAL_TRAVERSABLE_PRIVATE_ANCESTOR_REQUIRED');
 process.stdout.write(JSON.stringify({state:'READY_FOR_ONE_METADATA_TOUCH',uid:process.getuid(),euid:process.geteuid(),gid:process.getgid(),node:process.versions.node,proofSha256,metadata:before,ancestors,epochCode,watchEstablished:true,sourceSetSha256:input.sourceSetSha256})+'\n');
 const observed=await event;clearTimeout(timer);watcher.close();watcher=undefined;
 need(!observed.error&&['change','rename'].includes(observed.kind),observed.error??'WATCH_EVENT_REQUIRED');
 stage='CATALOG_CURRENT_AFTER_TOUCH';let currentCode;
 try{await catalogModule.assertFresh35CombinedCatalogCurrent(catalog)}catch(e){currentCode=code(e)}
 need(currentCode==='FRESH35_COMBINED_BOOTSTRAP_NETWORK_FILE_CHANGED','CATALOG_CHANGE_REFUSAL_NOT_CONFIRMED');
 const after=metadata(lstatSync(fixed,{bigint:true}));
 need(sha(readFileSync(fixed))===proofSha256&&['uid','gid','mode','nlink','device','inode','bytes'].every(k=>before[k]===after[k]),'PROOF_CONTENT_OR_IDENTITY_CHANGED');
 process.stdout.write(JSON.stringify({state:'PASS_ACTUAL_ORDINARY_READ_WATCH_EPOCH_AND_CATALOG_CHANGE',event:observed.kind,currentCode,proofSha256,after,watcherClosed:true,nativeSamePoolRevocation:'NOT_TESTED',sqlExecuted:false})+'\n');
}catch(e){process.stdout.write(JSON.stringify({state:'FAILED_OR_UNVERIFIED',stage,code:code(e),sqlExecuted:false})+'\n');process.exitCode=2}
finally{clearTimeout(timer);watcher?.close()}
'''

def need(value,code):
    if not value:raise ValueError(code)

def identity(s):
    return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size)

def main():
    need(os.getuid()==0 and os.geteuid()==0,'ORIGINAL_CONTAINER_ROOT_REQUIRED')
    cfg=json.loads(os.read(0,65537))
    need(set(cfg)=={'sourceSetSha256','expiresAt'} and cfg['sourceSetSha256']==SOURCE and
         type(cfg['expiresAt']) is int and int(time.time()*1000)<cfg['expiresAt']-30000,'EXACT_ORIGINAL_PROBE_WINDOW_REQUIRED')
    child=None;fd=None;ready=None;final=None;touched=False;before=None;after=None;error=None;reaped=False
    try:
        child=subprocess.Popen([NODE,'--no-global-search-paths','--input-type=module','--eval',NODE_SCRIPT],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,user=UID,group=UID,extra_groups=[],
            env={'PATH':'/usr/bin:/bin','HOME':str(PROOF.parent),'LANG':'C.UTF-8'},cwd=str(PROOF.parent),start_new_session=True)
        child.stdin.write(json.dumps(cfg).encode());child.stdin.close()
        selector=selectors.DefaultSelector();selector.register(child.stdout,selectors.EVENT_READ)
        need(selector.select(22),'ORDINARY_READY_TIMEOUT')
        line=child.stdout.readline(16385);need(0<len(line)<=16384,'BOUNDED_ORDINARY_READY_REQUIRED');ready=json.loads(line)
        need(ready.get('state')=='READY_FOR_ONE_METADATA_TOUCH' and ready.get('uid')==UID and ready.get('euid')==UID and
             ready.get('gid')==UID and ready.get('sourceSetSha256')==SOURCE and
             ready.get('epochCode')=='FRESH35_COMBINED_BOOTSTRAP_NETWORK_BINDING_DIFFERS','ACTUAL_ORDINARY_READY_REQUIRED')
        fd=os.open(PROOF,os.O_RDONLY|os.O_NOFOLLOW);s=os.fstat(fd);before=s
        need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o444 and
             0<s.st_size<=16384 and str(s.st_dev)==ready['metadata']['device'] and str(s.st_ino)==ready['metadata']['inode'] and
             str(s.st_mtime_ns)==ready['metadata']['mtimeNs'] and str(s.st_ctime_ns)==ready['metadata']['ctimeNs'],'SAME_FIXED_PROOF_REQUIRED')
        raw=os.read(fd,16385);need(hashlib.sha256(raw).hexdigest()==ready['proofSha256'],'ORIGINAL_PROOF_BYTES_REQUIRED')
        need(int(time.time()*1000)<cfg['expiresAt']-5000,'TOUCH_WINDOW_EXPIRED')
        os.utime(fd,ns=(s.st_atime_ns,s.st_mtime_ns+1));touched=True
        z=os.fstat(fd);after=z;os.lseek(fd,0,os.SEEK_SET)
        need(identity(z)==identity(s) and hashlib.sha256(os.read(fd,16385)).hexdigest()==ready['proofSha256'] and
             identity(PROOF.lstat())==identity(s),'METADATA_ONLY_TOUCH_REQUIRED')
        need(selector.select(8),'ORDINARY_EVENT_RESULT_TIMEOUT')
        line=child.stdout.readline(16385);need(0<len(line)<=16384,'BOUNDED_ORDINARY_RESULT_REQUIRED');final=json.loads(line)
        child.wait(timeout=3);reaped=True
        need(child.returncode==0 and final.get('state')=='PASS_ACTUAL_ORDINARY_READ_WATCH_EPOCH_AND_CATALOG_CHANGE' and
             final.get('currentCode')=='FRESH35_COMBINED_BOOTSTRAP_NETWORK_FILE_CHANGED','ACTUAL_REFUSAL_NOT_CONFIRMED')
    except Exception as e:
        value=str(e) if isinstance(e,ValueError) else type(e).__name__
        error=value if value.replace('_','').isalnum() and len(value)<=180 else 'PROBE_FAILURE'
    finally:
        if fd is not None:os.close(fd)
        if child is not None:
            if child.poll() is None:
                os.killpg(child.pid,signal.SIGKILL)
            child.wait(timeout=3);reaped=True
            child.stdout.close()
        if 'selector' in locals():selector.close()
    print(json.dumps({'state':'PASS_ACTUAL_ORDINARY_PROOF_EVIDENCE' if error is None and reaped else 'FAILED_OR_UNVERIFIED',
        'sourceSetSha256':SOURCE,'ready':ready,'final':final,'errorCode':error,'metadataTouchCount':int(touched),
        'mtimeDeltaNs':after.st_mtime_ns-before.st_mtime_ns if before is not None and after is not None else None,
        'childReaped':reaped,'sqlExecuted':False,'nativeSamePoolRevocation':'NOT_TESTED'}))

if __name__=='__main__':main()
