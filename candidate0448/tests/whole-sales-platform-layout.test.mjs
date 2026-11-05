import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {salesInstallLayout} from '../scripts/release/unified-install/whole-sales-platform-layout.mjs';
test('Mac has explicit native root paths without Linux procfs or Linux psql',()=>{assert.deepEqual(salesInstallLayout('darwin'),{root:'/Library/Application Support/NaijueERP/whole-sales-v1',node:'/usr/local/bin/node',psql:'/Library/PostgreSQL/17/bin/psql',etc:'/private/etc/naijue-erp',config:'/private/etc/naijue-erp/whole-sales-install-config-v1.json'});assert.ok(Object.isFrozen(salesInstallLayout('darwin')))});
test('Linux paths remain unchanged and unknown platforms fail closed',()=>{assert.equal(salesInstallLayout('linux').root,'/opt/naijue-erp/whole-sales-v1');assert.equal(salesInstallLayout('linux').node,'/usr/bin/node');assert.throws(()=>salesInstallLayout('win32'),/SALES_INSTALL_PLATFORM_UNSUPPORTED/)});
async function handoff(text,regular=false){return new Promise((resolve,reject)=>{const script=`import os,subprocess,sys,tempfile
if sys.argv[3]=='file':
 f=tempfile.TemporaryFile();f.write(sys.argv[2].encode());f.seek(0);r=f.fileno()
else:
 r,w=os.pipe();os.write(w,sys.argv[2].encode());os.close(w)
if r!=3: os.dup2(r,3)
code="import {readSalesLaunchHandoff} from './scripts/release/unified-install/install-whole-sales-record-v1.mjs'; try{readSalesLaunchHandoff(); console.log('accepted')}catch(e){console.error(e.message);process.exitCode=1}"
p=subprocess.run([sys.argv[1],'--input-type=module','-e',code],pass_fds=(3,))
sys.exit(p.returncode)`;const c=spawn('/usr/bin/python3',['-I','-S','-c',script,process.execPath,text,regular?'file':'pipe'],{stdio:['ignore','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.once('error',reject);c.once('close',code=>resolve({code,out,err}))})}
test('launcher handoff uses inherited descriptor directly, without procfs',async()=>{const good=await handoff('WHOLE_SALES_TRUSTED_LAUNCH_V1\n');assert.equal(good.code,0,good.err);assert.equal(good.out,'accepted\n');const bad=await handoff('forged');assert.equal(bad.code,1);assert.match(bad.err,/SALES_INSTALL_PRE_NODE_LAUNCH_REQUIRED/)});

test('handoff rejects regular files and trailing bytes, not just a matching marker',async()=>{for(const [text,regular] of [['WHOLE_SALES_TRUSTED_LAUNCH_V1\n',true],['WHOLE_SALES_TRUSTED_LAUNCH_V1\nextra',false]]){const result=await handoff(text,regular);assert.equal(result.code,1);assert.match(result.err,/SALES_INSTALL_PRE_NODE_LAUNCH_REQUIRED/)}});
test('missing launcher descriptor fails without closing an unrelated Node runtime descriptor',async()=>{const result=await new Promise((resolve,reject)=>{const c=spawn(process.execPath,['--input-type=module','-e',"import {readSalesLaunchHandoff} from './scripts/release/unified-install/install-whole-sales-record-v1.mjs';try{readSalesLaunchHandoff();process.exitCode=9}catch(e){console.error(e.message);process.exitCode=1}"],{stdio:['ignore','pipe','pipe']});let err='';c.stderr.on('data',b=>err+=b);c.once('error',reject);c.once('close',(code,signal)=>resolve({code,signal,err}))});assert.equal(result.signal,null,result.err);assert.equal(result.code,1);assert.match(result.err,/SALES_INSTALL_PRE_NODE_LAUNCH_REQUIRED/)});
