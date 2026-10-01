"""Compare a restored database against the exact snapshot used for the latest dump."""
from pathlib import Path
import subprocess,json,os,sys

ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=ROOT/'data-cleaning/verification/consolidation-20261001'
checkpoint=json.loads((ROOT/'data-cleaning/verification/database-backup-current.json').read_text())
database=sys.argv[1] if len(sys.argv)>1 else 'demo_8877_restore_20261001'
psql=os.environ.get('PSQL_BIN','psql')
args=['-h',os.environ.get('POSTGRES_HOST','127.0.0.1'),'-p',os.environ.get('POSTGRES_PORT','5432'),'-U',os.environ.get('POSTGRES_USER',os.environ.get('USER','')),'-d',database,'-X','-qAt','-v','ON_ERROR_STOP=1']
results=[]
for item in checkpoint['tableFingerprints']:
    qualified='"'+item['schema']+'"."'+item['table']+'"'
    sql="SELECT json_build_object('rows',count(*),'digest',md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM (SELECT md5(row_to_json(r)::text) h FROM "+qualified+" r) x"
    current=json.loads(subprocess.check_output([psql,*args,'-c',sql],text=True))
    results.append({'schema':item['schema'],'table':item['table'],'expectedRows':item['rows'],'rows':current['rows'],'equal':current['rows']==item['rows'] and current['digest']==item['digest']})
report={'database':database,'status':'PASS' if all(r['equal'] for r in results) else 'FAIL','tables':results,'exactContentDifferences':sum(not r['equal'] for r in results)}
(ROOT/'data-cleaning/verification/database-recovery-last.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='tables'}),'tables:',len(results),flush=True)
if report['status']!='PASS':raise SystemExit(1)
