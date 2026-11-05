/** Freeze only the actual unified browser inputs and rebuild/acceptance support.
 * No server, browser, database, upload or production configuration is started. */
import {readFile,writeFile,mkdir,copyFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..');
const digest=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),outarg=args.indexOf('--outdir'),out=outarg<0?null:args[outarg+1];
if(!out||!path.isAbsolute(out)||path.resolve(out).startsWith(root+path.sep))throw Error('Provide a new absolute Git-external --outdir');
try{await stat(out);throw Error('Refuse to overwrite a frozen review directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const harness=path.resolve(here,'..'),dist=path.join(harness,'dist'),provenance=JSON.parse(await readFile(path.join(dist,'provenance.json'),'utf8'));
if(provenance.syntheticOnly!==true||provenance.frozenDemoCommit!=='b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3')throw Error('Wrong synthetic/frozen baseline');
const htmlName=provenance.artifact.filename;
if(!/^[a-z0-9-]+\.html$/.test(htmlName))throw Error('Unsafe HTML name');
const html=await readFile(path.join(dist,htmlName));
if(digest(html)!==provenance.artifact.sha256||html.length!==provenance.artifact.bytes)throw Error('Artifact provenance mismatch');
const dom=new JSDOM(html.toString('utf8')); // Scripts/resources are never executed.
const doc=dom.window.document,csp=doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content??'';
if(!csp.includes("connect-src 'none'")||!csp.includes("form-action 'none'"))throw Error('Missing network/form CSP');
const links=[...doc.querySelectorAll('[src],[href],[action]')].flatMap(el=>['src','href','action'].map(attr=>el.getAttribute(attr)).filter(Boolean));
const unsafeLinks=links.filter(value=>!value.startsWith('#')&&!value.startsWith('data:'));
if(unsafeLinks.length||doc.querySelector('iframe,object,embed,script[src],link[href],base,form[action]'))throw Error('External resource/frame/form is forbidden');
const css=[...doc.querySelectorAll('style')].map(el=>el.textContent).join('\n');
const cssUrls=[...css.matchAll(/url\(\s*([^)]*)\)/gi)].map(match=>match[1].trim().replace(/^["']|["']$/g,''));
if(/@import\s/i.test(css)||cssUrls.some(value=>!value.startsWith('data:')&&!value.startsWith('#')))throw Error('External CSS resource');
dom.window.close();

const sources=new Set(Object.keys(provenance.inputs??{}));
for(const [name,sha] of Object.entries(provenance.inputs??{})){
  if(name.includes('node_modules')||path.isAbsolute(name)||name.split(/[\\/]/).includes('..')||/^(?:adapters|apps\/api|scripts\/import|evidence)\//.test(name))throw Error(`Unexpected backend/private input: ${name}`);
  if(digest(await readFile(path.join(root,name)))!==sha)throw Error(`Source changed since build: ${name}`);
}
// Build/test runners are review support, not unrecorded business inputs.
async function addTree(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(['dist','node_modules'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await addTree(file);else if(entry.isFile()&&/\.(?:tsx?|mjs|css|json|md|txt)$/.test(entry.name))sources.add(path.relative(root,file));}}
await addTree(harness);
for(const name of ['package.json','package-lock.json','tsconfig.json','apps/web/tsconfig.json','apps/web/management-browser-harness/inline-assets.mjs'])sources.add(name);
for(const [name,sha] of Object.entries(provenance.dependencyManifests??{})){if(digest(await readFile(path.join(root,name)))!==sha)throw Error(`Manifest changed since build: ${name}`);sources.add(name);}
for(const [name,sha] of Object.entries(provenance.rebuildInputs??{})){if(digest(await readFile(path.join(root,name)))!==sha)throw Error(`Rebuild support changed since build: ${name}`);sources.add(name);}
const sourceManifest={syntheticOnly:true,snapshotPurpose:'Frozen audit/build inputs, not a deployable API host or the mutable working tree',generatedAt:new Date().toISOString(),artifact:provenance.artifact,sourceFiles:{}};
await mkdir(path.join(out,'source-snapshot'),{recursive:true});
for(const name of [...sources].sort()){
  if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..')||/\.(?:env|pem|key|p12|pfx|sqlite|db|csv|xlsx|png|jpe?g)$/i.test(name))throw Error(`Unsafe snapshot source: ${name}`);
  const bytes=await readFile(path.join(root,name)),target=path.join(out,'source-snapshot',name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);sourceManifest.sourceFiles[name]=digest(bytes);
}
await copyFile(path.join(dist,htmlName),path.join(out,htmlName));
await copyFile(path.join(dist,'provenance.json'),path.join(out,'provenance.json'));
for(const name of ['README.md','MAC_CHECKLIST.md'])if(await stat(path.join(harness,name)).catch(()=>null))await copyFile(path.join(harness,name),path.join(out,name));
await mkdir(path.join(out,'acceptance'),{recursive:true});for(const name of await readdir(here))if(/\.(md|txt|json)$/.test(name))await copyFile(path.join(here,name),path.join(out,'acceptance',name));
await writeFile(path.join(out,'SOURCE_SNAPSHOT.json'),JSON.stringify(sourceManifest,null,2)+'\n');
const safety={syntheticOnly:true,artifactSHA256:digest(html),externalResourceAttributes:unsafeLinks,iframe:false,connectCSP:'none',formCSP:'none',sourceSnapshotFiles:sources.size,nodeModulesIncluded:false,databaseFilesIncluded:false,credentialsIncluded:false,realBusinessArraysIncluded:false,productionHostOrGrantEnabled:false,networkOrBrowserOrDatabaseStarted:false,visualPass:false,oldMacFailures:'CODE_FIXED_MAC_RECHECK_PENDING',limitations:['Static parse does not prove runtime network behavior; run unified actualApplication tests which guard global fetch.','Formal auth/client source has credential field names but no credential values; synthetic transport rejects login/password.','Only explicitly authored synthetic fixtures are included; no frozen Demo runtime/data modules.']};
await writeFile(path.join(out,'SAFETY_CHECK.json'),JSON.stringify(safety,null,2)+'\n');
async function files(dir,base=dir){const all=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())all.push(...await files(p,base));else if(e.isFile())all.push(path.relative(base,p));else throw Error('Symlinks/special files forbidden');}return all;}
const all=(await files(out)).sort(),lines=[];for(const name of all)lines.push(`${digest(await readFile(path.join(out,name)))}  ${name}`);
await writeFile(path.join(out,'SHA256SUMS'),lines.join('\n')+'\n');
// New archive name, old frozen evidence is never overwritten.
const archive=out+'.tar.gz';try{await stat(archive);throw Error('Archive already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
execFileSync('tar',['-czf',archive,'-C',path.dirname(out),path.basename(out)]);
console.log(JSON.stringify({directory:out,archive,archiveBytes:(await stat(archive)).size,archiveSHA256:digest(await readFile(archive)),html:provenance.artifact,sourceFiles:sources.size,files:all.length+1},null,2));
