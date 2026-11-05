/** Preload before project imports. Synchronous hooks cover ESM and CommonJS. */
import {registerHooks} from 'node:module';
import {realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export function installSalesModuleBoundary(root){
 if(typeof registerHooks!=='function')throw Error('SALES_INSTALL_NODE_HOOKS_REQUIRED');
 const base=realpathSync(root),inside=path=>path===base||path.startsWith(base+sep);
 return registerHooks({resolve(specifier,context,nextResolve){
  const result=nextResolve(specifier,context);
  if(result.url.startsWith('node:'))return result;
  if(!result.url.startsWith('file:'))throw Error('SALES_INSTALL_DEPENDENCY_OUTSIDE_ROOT');
  const path=fileURLToPath(result.url);
  if(!inside(resolve(path))||!inside(realpathSync(path)))throw Error('SALES_INSTALL_DEPENDENCY_OUTSIDE_ROOT');
  return result;
 }});
}
