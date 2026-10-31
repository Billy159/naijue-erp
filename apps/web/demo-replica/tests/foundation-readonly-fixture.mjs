import {createInterface} from 'node:readline';
import {createReplicaPreviewTransport} from '../frontend/runtime-preview-transport.ts';
const transport=createReplicaPreviewTransport();
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{const request=JSON.parse(line),url=new URL(request.url),method=request.method??'GET';
 const partyRead=method==='GET'&&/^\/api\/(customers|suppliers)(?:\/(?:candidates|[0-9a-f-]{36}))?$/.test(url.pathname);
 if(url.origin!=='https://synthetic-management.invalid'||!(partyRead||method==='GET'&&url.pathname==='/api/auth/session'||method==='POST'&&url.pathname.startsWith('/api/')&&url.pathname.endsWith('/query'))){process.stdout.write(JSON.stringify({status:501,headers:{'content-type':'application/json'},body:'{"error":"SYNTHETIC_READ_ONLY"}'})+'\n');continue;}
 const response=await transport.http.fetch(request.url,{method,credentials:'same-origin',headers:request.headers??{},...(request.body?{body:request.body}:{}),signal:new AbortController().signal});
 process.stdout.write(JSON.stringify({status:response.status,headers:Object.fromEntries(response.headers.entries()),body:await response.text()})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({status:500,headers:{'content-type':'application/json'},body:JSON.stringify({error:String(error)})})+'\n');}
}
