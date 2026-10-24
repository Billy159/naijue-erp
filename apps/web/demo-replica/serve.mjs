import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {dirname,join,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const frontend=join(root,'frontend');
const port=Number(process.argv[2]);
if(port!==57896)throw Error('Use the reserved replica localhost port 57896');
const original=await readFile(join(frontend,'index.html'),'utf8');
const auth='<script src="auth-entry.js';
const bridge=/<script type="module" src="real-data-bridge\.mjs[^\"]*"><\/script>/;
if(!original.includes('window.REAL_DATA_MODE=true')||!original.includes(auth)||!bridge.test(original))throw Error('Frozen entry boundary changed');
const entry=original.replace('window.REAL_DATA_MODE=true','window.REAL_DATA_MODE=false').replace(auth,'<script src="/replica-sample-bootstrap.js"></script>'+auth).replace(bridge,'');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"connect-src 'none'");
 res.setHeader('X-Naijue-Replica','b8bcfe3-phase1-samples-only');
 try {
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end('No backend on the phase-one replica');return;}
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(url.pathname==='/'||url.pathname==='/index.html'){res.setHeader('Content-Type',mime['.html']);res.end(req.method==='HEAD'?'':entry);return;}
  let file;
  if(url.pathname==='/replica-sample-bootstrap.js'||url.pathname==='/replica-identity.json')file=join(root,url.pathname.slice(1));
  else {
   file=resolve(frontend,'.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(frontend+sep)||url.pathname.startsWith('/verification/')){res.writeHead(404);res.end();return;}
  }
  if(!(await stat(file)).isFile())throw Error('Not a file');
  const bytes=await readFile(file);res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(req.method==='HEAD'?'':bytes);
 } catch {res.writeHead(404);res.end('Replica resource not found');}
});
server.listen(port,'127.0.0.1',()=>process.stdout.write(JSON.stringify({ready:true,port,root,entry:'http://127.0.0.1:'+port+'/#inventory',sourceCommit:'b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3',mode:'PHASE1_LOCAL_DEMO_SAMPLES_NO_BACKEND'})+'\n'));
