"""Offline only: AST-extracted probes, closed HTTP doubles, no deployment import."""
import ast, json, os, pathlib, subprocess, types, unittest
HERE=pathlib.Path(__file__).parent
PLAN={'sourceCommit':'a'*40,'buildId':'synthetic-build'}
class Refused(Exception): pass
def need(ok,code):
    if not ok: raise Refused(code)
def extracted():
    tree=ast.parse((HERE/'deploy-candidate.py').read_text())
    ns={'Refused':Refused,'need':need,'time':types.SimpleNamespace(sleep=lambda _:None),'json':json,'HOST':'1n5635n614.goho.co'}
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('health','loopback_health')],type_ignores=[]),'<offline-extracted>','exec'),ns)
    return ns
JS=r'''
const vm=require('node:vm'),{EventEmitter}=require('node:events');
const input=JSON.parse(process.argv[1]),calls=[];let out='',code=0,stopped=false;
class Halt extends Error{}
const fakeProcess={argv:['node',...input.argv],stdout:{write:s=>out+=s},exit:n=>{code=n;stopped=true;throw new Halt()}};
const http={get:(options,cb)=>{calls.push(options);const item=input.responses[calls.length-1],req=new EventEmitter();req.destroy=()=>{};req.setTimeout=(ms,fn)=>{req.timeout=fn;return req};
setImmediate(()=>{if(stopped)return;try{if(!item)throw Error('unexpected request');if(item.timeout){req.timeout();return}if(item.error){req.emit('error',Error('synthetic'));return}const res=new EventEmitter();res.statusCode=item.status;cb(res);res.emit('data',Buffer.from(typeof item.body==='string'?item.body:JSON.stringify(item.body)));res.emit('end')}catch(e){if(!(e instanceof Halt)){code=98;out=String(e)}}});return req}};
try{vm.runInNewContext(input.script,{require:n=>{if(n!=='node:http')throw Error('forbidden require');return http},process:fakeProcess,Buffer})}catch(e){if(!(e instanceof Halt)){code=99;out=String(e)}}
setTimeout(()=>process.stdout.write(JSON.stringify({out,code,calls})),25);
'''
class Docker:
    def __init__(self,responses):self.responses=responses;self.runs=[]
    def run(self,args,timeout):
        assert args[:4]==['exec','synthetic-app','node','-e']
        raw=subprocess.run([os.environ.get('NODE','node'),'-e',JS,json.dumps({'script':args[4],'argv':args[5:],'responses':self.responses})],capture_output=True,text=True,check=True,timeout=3)
        result=json.loads(raw.stdout);self.runs.append(result)
        if result['code']:raise Refused('OFFLINE_PROBE_REJECTED')
        return result['out'].encode()
def responses(ready='READY'):
    return [{'status':200,'body':dict(status='HOST_ALIVE',databaseChecked=False,**PLAN)},{'status':200,'body':{'status':ready}}]
class HealthReadiness(unittest.TestCase):
    def test_fresh_identity_and_readiness(self):
        for target,port in [(None,3000),('synthetic-web',8080)]:
            ns=extracted();d=Docker(responses());value=ns['health'](PLAN,d,'synthetic-app',target)
            self.assertFalse(value['databaseChecked']);self.assertEqual(value['readiness']['path'],'/readyz')
            self.assertEqual([x['path'] for x in d.runs[0]['calls']],['/healthz','/readyz'])
            self.assertTrue(all(x['host']==(target or '127.0.0.1') and x['port']==port for x in d.runs[0]['calls']))
            d.responses=responses('NOT_READY')
            with self.assertRaises(Refused):ns['health'](PLAN,d,'synthetic-app',target)
    def test_rejections(self):
        mutations=[lambda r:r[0]['body'].update(status='HOST_READY'),lambda r:r[0]['body'].update(databaseChecked=True),lambda r:r[0]['body'].update(sourceCommit='wrong'),lambda r:r[0]['body'].update(buildId='wrong'),lambda r:r[0].update(status=503),lambda r:r[0].update(body='{'),lambda r:r[0].update(body='x'*4097),lambda r:r[1].update(status=503),lambda r:r[1]['body'].update(status='NOT_READY'),lambda r:r[1].update(timeout=True),lambda r:r[1].update(error=True)]
        for i,mutate in enumerate(mutations):
            with self.subTest(case=i):
                rows=responses();mutate(rows);d=Docker(rows)
                with self.assertRaises(Refused):extracted()['health'](PLAN,d,'synthetic-app')
                self.assertEqual(len(d.runs),15);self.assertTrue(all(len(x['calls'])<=2 for x in d.runs))
    def test_loopback(self):
        for failure in (None,'identity','not_ready','status','malformed','large'):
            with self.subTest(case=failure):
                ns=extracted();self.assertTrue(callable(ns.get('loopback_health')));rows=responses();opened=[];outer=self
                if failure=='identity':rows[0]['body']['sourceCommit']='wrong'
                if failure=='not_ready':rows[1]['body']['status']='NOT_READY'
                if failure=='status':rows[1]['status']=503
                if failure=='malformed':rows[1]['body']='['
                if failure=='large':rows[1]['body']='x'*4097
                class Connection:
                    def __init__(self,host,port,timeout):outer.assertEqual((host,port,timeout),('127.0.0.1',18080,5));self.index=len(opened);self.closed=False;opened.append(self)
                    def request(self,method,path,headers):outer.assertEqual((method,path,headers),('GET',('/healthz','/readyz')[self.index],{'Host':ns['HOST']}))
                    def getresponse(self):
                        row=rows[self.index];body=(row['body'] if isinstance(row['body'],str) else json.dumps(row['body'])).encode()
                        return types.SimpleNamespace(status=row['status'],read=lambda limit:body[:limit])
                    def close(self):self.closed=True
                ns['http']=types.SimpleNamespace(client=types.SimpleNamespace(HTTPConnection=Connection))
                if failure:
                    with self.assertRaises(Refused):ns['loopback_health'](PLAN)
                else:ns['loopback_health'](PLAN)
                self.assertEqual(len(opened),1 if failure=='identity' else 2);self.assertTrue(all(x.closed for x in opened))
    def test_consumers(self):
        for filename,expected in [('deploy-candidate.py',{'stage':2,'activate':2}),('boot-entry.py',{'arm':1,'boot_start':2})]:
            tree=ast.parse((HERE/filename).read_text())
            for name,count in expected.items():
                function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
                names=[n.func.id if isinstance(n.func,ast.Name) else n.func.attr if isinstance(n.func,ast.Attribute) else '' for n in ast.walk(function) if isinstance(n,ast.Call)]
                self.assertEqual(names.count('health'),count)
                if name=='activate':self.assertEqual(names.count('loopback_health'),1)
if __name__=='__main__':unittest.main()
