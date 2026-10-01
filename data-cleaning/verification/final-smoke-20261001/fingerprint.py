from pathlib import Path
import sys,json,subprocess,importlib.util
root=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('database_tools',root/'server/database.py')
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
name=sys.argv[1];out=Path(sys.argv[2])
tables=db.query(name,"SELECT json_agg(json_build_object('schema',table_schema,'table',table_name) ORDER BY table_schema,table_name) FROM information_schema.tables WHERE table_schema IN ('tplus_demo_20260922_a2','v2_runtime_stage03c') AND table_type='BASE TABLE'")
results=[]
for i,item in enumerate(tables):
 results.append({**item,**db.query(name,db.fingerprint_sql(item['schema'],item['table']))})
 if i%20==0: print('Fingerprint',name,i+1,'/',len(tables),flush=True)
out.write_text(json.dumps({'database':name,'tables':results},indent=2))
print('Fingerprint complete',name,len(results),flush=True)
