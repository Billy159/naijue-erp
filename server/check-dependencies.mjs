import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8'));
const all={...pkg.dependencies,...pkg.devDependencies};
for(const [name,version] of Object.entries(all)) {
  const installed=JSON.parse(readFileSync(resolve(root,'node_modules',name,'package.json'),'utf8'));
  if(installed.version!==version||lock.packages['node_modules/'+name]?.version!==version)throw Error('Dependency version mismatch: '+name);
}
const {readdirSync}=await import('node:fs');
const missing=[];
function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){
  const file=resolve(folder,entry.name);
  if(entry.isDirectory()&&!['assets','node_modules','verification'].includes(entry.name))walk(file);
  else if(entry.isFile()&&/\.(mjs|js|jsx|ts)$/.test(file)){
    const source=readFileSync(file,'utf8');
    for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const target=resolve(dirname(file),match[1].split('?')[0]);
      if(!existsSync(target))missing.push({file,target});
    }
  }
}}
walk(resolve(root,'frontend'));walk(resolve(root,'server'));
if(missing.length)throw Error(JSON.stringify(missing,null,2));
console.log('Locked dependencies:',Object.keys(all).length,'; runtime import paths: PASS');
