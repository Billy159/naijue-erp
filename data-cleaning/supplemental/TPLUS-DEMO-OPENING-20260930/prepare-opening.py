"""Read the supplied matrix and resolve exact original SKU identities."""
from pathlib import Path
from zipfile import ZipFile
from collections import defaultdict, Counter
from decimal import Decimal
import hashlib, json, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[3]
WORK=Path(__file__).resolve().parent
SOURCE=ROOT/'inputs/库存状况表.xlsx'
index=json.loads((WORK/'source-identity-index.json').read_text())
sku=defaultdict(list)
for row in index['skus']:
    sku[(row['product_code'],row['color_name'],row['size_name'])].append(row)
warehouses=defaultdict(list)
for row in index['warehouses']:
    warehouses[row['name']].append(row['id'])
sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
tag='{'+ns['s']+'}row'
def col(ref):
    n=0
    for c in ref:
        if not c.isalpha(): break
        n=n*26+ord(c.upper())-64
    return n
cells=[];issues=[];seen=set();units=defaultdict(Decimal);wh_counts=Counter();signs=Counter();print_date=None
with ZipFile(SOURCE) as z:
    strings=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        strings=[''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
    def value(c):
        if c.attrib.get('t')=='inlineStr': return ''.join(t.text or '' for t in c.findall('.//s:t',ns))
        v=c.find('s:v',ns)
        if v is None:return None
        return strings[int(v.text)] if c.attrib.get('t')=='s' else v.text
    headers={}
    for _,row in ET.iterparse(z.open('xl/worksheets/sheet1.xml'),events=('end',)):
        if row.tag!=tag:continue
        rn=int(row.attrib['r']);vals={c.attrib['r']:value(c) for c in row.findall('s:c',ns)}
        if rn==7:headers={col(k):v for k,v in vals.items()}
        if vals.get('E'+str(rn))=='打印日期:':print_date=vals.get('F'+str(rn))
        code=vals.get('D'+str(rn))
        if rn>=9 and code:
            warehouse=vals.get('B'+str(rn));color=vals.get('H'+str(rn));unit=vals.get('F'+str(rn))
            for ref,q in vals.items():
                if not 15<=col(ref)<=113 or q in (None,''):continue
                size=headers.get(col(ref));matches=sku[(code,color,size)];wh=warehouses[warehouse]
                if len(matches)!=1 or len(wh)!=1:
                    issues.append({'cell':ref,'warehouse':warehouse,'productCode':code,'color':color,'size':size,'quantity':q,'skuMatches':matches,'warehouseMatches':wh});continue
                identity=(wh[0],matches[0]['sku_id'])
                if identity in seen:issues.append({'cell':ref,'issue':'DUPLICATE_SNAPSHOT_KEY','key':identity});continue
                seen.add(identity);quantity=Decimal(q);units[unit]+=quantity;wh_counts[warehouse]+=1;signs['negative' if quantity<0 else 'zero' if quantity==0 else 'positive']+=1
                cells.append({'warehouseId':wh[0],'skuId':matches[0]['sku_id'],'unit':unit,'quantity':str(quantity),'sourceCell':ref,'sourceRow':rn,'sourceProductCode':code,'sourceColorCode':matches[0]['color_code'],'sourceColorName':color,'sourceSizeCode':matches[0]['size_code'],'sourceSizeName':size})
        row.clear()
plan={'revision':'demo-opening-existing-tplus-20260930-v1','mode':'DEMO_ONLY','sourceFile':'库存状况表.xlsx','sourceSha256':sha,'sourceSheet':'第一页','sourcePrintDate':print_date,'businessCutoff':None,'cutoffStatus':'UNCONFIRMED_PRINT_DATE_ONLY','quantityPolicy':'The supplied snapshot is the Demo quantity authority; absent cells and unlisted warehouses have implicit zero for this Demo only.','cells':cells,'issues':issues,'controls':{'cells':len(cells),'warehouses':len(wh_counts),'warehouseCellCounts':dict(wh_counts),'quantitySigns':dict(signs),'byUnit':{k:str(v) for k,v in units.items()}}}
(WORK/'opening-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2))
(WORK/'opening-issues.json').write_text(json.dumps(issues,ensure_ascii=False,indent=2))
print(json.dumps({'controls':plan['controls'],'issues':len(issues),'sourcePrintDate':print_date,'issueExamples':issues[:5]},ensure_ascii=False))
if issues:raise SystemExit(1)
