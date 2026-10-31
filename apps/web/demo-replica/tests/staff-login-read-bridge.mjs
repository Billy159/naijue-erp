/** TEST ONLY closed synthetic bridge. STAFF uses native HTTP/service/adapter. */
import {createInterface} from 'node:readline';
import {createReplicaPreviewTransport} from '../frontend/runtime-preview-transport.ts';
import {createStaffLoginReadFixture} from './staff-login-read-fixture.mjs';
const native=await createStaffLoginReadFixture(),preview=createReplicaPreviewTransport();
try{for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{const request=JSON.parse(line),url=new URL(request.url),method=request.method??'GET';request.method=method;
  if(url.origin!=='https://synthetic-management.invalid')throw Error('Closed synthetic origin');
  if(native.canHandle(url.pathname,method)){process.stdout.write(JSON.stringify(await native.request(request))+'\n');continue;}
  if(!(method==='GET'&&url.pathname==='/api/auth/session'||method==='POST'&&url.pathname.startsWith('/api/')&&url.pathname.endsWith('/query'))){process.stdout.write(JSON.stringify({status:501,headers:{'content-type':'application/json'},body:JSON.stringify({error:{code:'SYNTHETIC_READ_ONLY'}})})+'\n');continue;}
  const r=await preview.http.fetch(request.url,{method,headers:request.headers??{},credentials:'same-origin',...(request.body?{body:request.body}:{}),signal:new AbortController().signal});
  process.stdout.write(JSON.stringify({status:r.status,headers:Object.fromEntries(r.headers.entries()),body:await r.text()})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({status:500,headers:{'content-type':'application/json'},body:JSON.stringify({error:String(error)})})+'\n');}
}}finally{await native.close();}
