from pathlib import Path
import re,hashlib,sys
root=Path(__file__).resolve().parents[1]
raw=(root/'adapters/postgres/src/sales-query-reader.ts').read_text();q=re.search(r'const lineRows = \(await query\(`(SELECT l.id, l.sales_id.*?)`, \[header.id, SALES_DETAIL_MAX_CURRENT_LINES \+ 1\]\)',raw,re.S).group(1)
uid=lambda n:'00000000-0000-4000-8000-'+str(n).zfill(12)
q=q.replace('$1',"'"+uid(1)+"'::uuid").replace('$2','2001')
start="""\\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'Refuse existing schema'; END IF; END $$;
CREATE SCHEMA naijue_erp;
CREATE TABLE naijue_erp.product_category(id uuid PRIMARY KEY,name text);
CREATE TABLE naijue_erp.product(id uuid PRIMARY KEY,category_id uuid,enabled boolean);
CREATE TABLE naijue_erp.sku(id uuid PRIMARY KEY,product_id uuid,enabled boolean);
CREATE TABLE naijue_erp.sales_line(id uuid,sales_id uuid,line_no integer,sku_id uuid,quantity bigint,reference_price numeric,deal_price numeric,line_amount numeric,allocated_discount numeric,is_gift boolean,pricing_rule text,discount_tenths integer,zero_confirmed boolean,product_code_snapshot text,product_name_snapshot text,color_name_snapshot text,fit_name_snapshot text,size_name_snapshot text,barcode_snapshot text,is_current boolean);
"""
start+=f"INSERT INTO naijue_erp.product_category VALUES('{uid(10)}','同名'),('{uid(11)}','同名');\nINSERT INTO naijue_erp.product VALUES('{uid(20)}','{uid(10)}',false),('{uid(21)}','{uid(11)}',true);\nINSERT INTO naijue_erp.sku VALUES('{uid(30)}','{uid(20)}',false),('{uid(31)}','{uid(21)}',true);\n"
for i,(sku,qty,gift,current) in enumerate([(30,9007199254740993,False,True),(31,-2,False,True),(30,7,True,True),(30,999,False,False)]):
 start+=f"INSERT INTO naijue_erp.sales_line VALUES('{uid(40+i)}','{uid(1)}',{i+1},'{uid(sku)}',{qty},NULL,0,0,0,{str(gift).lower()},NULL,NULL,NULL,'SNAPSHOT','原名','白','Y','S',NULL,{str(current).lower()});\n"
start+='CREATE TEMP VIEW actual_line_projection AS '+q+';\n'
start+="""DO $$ BEGIN
 IF (SELECT count(*) FROM actual_line_projection)<>3 THEN RAISE EXCEPTION 'wrong current row count'; END IF;
 IF (SELECT sum(quantity::numeric) FROM actual_line_projection WHERE NOT is_gift)<>9007199254740991 THEN RAISE EXCEPTION 'rounded/lost signed quantity'; END IF;
 IF (SELECT count(DISTINCT product_id) FROM actual_line_projection)<>2 OR (SELECT count(DISTINCT category_id) FROM actual_line_projection)<>2 THEN RAISE EXCEPTION 'identity merged'; END IF;
 IF EXISTS(SELECT 1 FROM actual_line_projection WHERE product_name_snapshot<>'原名' OR category_name<>'同名') THEN RAISE EXCEPTION 'snapshot substituted'; END IF;
END $$;
SELECT 'COMPONENT SQL projection: disabled preserved, exact signed quantities, current-only, distinct same-name category IDs PASS' AS result;
ROLLBACK;
SELECT NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp') AS component_schema_rolled_back;
"""
Path(sys.argv[1]).write_text('-- Source SHA256 '+hashlib.sha256(raw.encode()).hexdigest()+'\n'+start)
