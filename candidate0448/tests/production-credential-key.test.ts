import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,chmod,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readProductionCredentialRequestKey} from '../apps/api/src/production-credential-key.ts';
import {createNodeCredentialRequestTag} from '../packages/authentication/src/passwords.ts';
test('B10 exact private32 raw key gives stable restart tags, changed password differs',async t=>{
 const root=await mkdtemp(path.join(await realpath(tmpdir()),'b10-synthetic-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=path.join(root,'key');
 await writeFile(file,Buffer.alloc(32,7),{mode:0o600});
 const a=createNodeCredentialRequestTag(await readProductionCredentialRequestKey(file)),b=createNodeCredentialRequestTag(await readProductionCredentialRequestKey(file));
 assert.equal(a('SYNTHETIC_A'),b('SYNTHETIC_A'));assert.notEqual(a('SYNTHETIC_A'),b('SYNTHETIC_B'));
});
test('B10 refuses bad path, missing/symlink/directory, modes, short/long/text keys without disclosing path',async t=>{
 const root=await mkdtemp(path.join(await realpath(tmpdir()),'b10-invalid-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=path.join(root,'key');
 const denied=(f:string)=>assert.rejects(readProductionCredentialRequestKey(f),e=>e instanceof TypeError && e.message==='Private credential request key is unavailable or invalid');
 for(const bytes of [Buffer.alloc(31),Buffer.alloc(33),Buffer.from(Buffer.alloc(32).toString('base64')),Buffer.concat([Buffer.alloc(32),Buffer.from('\n')])]){await writeFile(file,bytes,{mode:0o600});await denied(file);}
 await writeFile(file,Buffer.alloc(32));await chmod(file,0o644);await denied(file);await chmod(file,0o600);
 await symlink(file,path.join(root,'link'));await denied(path.join(root,'link'));await denied(root);await denied(path.join(root,'missing'));await denied('relative-key');await denied(root+'/../'+path.basename(root)+'/key');
 await mkdir(path.join(root,'writable'),{mode:0o777});await chmod(path.join(root,'writable'),0o777);const unsafe=path.join(root,'writable','key');await writeFile(unsafe,Buffer.alloc(32),{mode:0o600});await denied(unsafe);
});
