import json
import subprocess
import os,shutil
from pathlib import Path

work = Path(__file__).resolve().parent
before = json.loads((work / 'immutable-before.json').read_text())
after = json.loads((work / 'immutable-after.json').read_text())
original = {r['table_name']: r for r in before['tables']}
diff = [r['table_name'] for r in after['tables'] if original.get(r['table_name']) != r]
assert diff == ['v2_runtime_stage03c.product_master_overlay'], diff
sql = "BEGIN READ ONLY; SELECT json_agg(r ORDER BY kind,id) FROM v2_runtime_stage03c.product_master_overlay r; ROLLBACK;"
command = [os.environ.get('PSQL_BIN') or shutil.which('psql') or str(Path.home()/'pg17/bin/psql'), '-X', '-qAt', '-h', os.environ.get('POSTGRES_HOST','127.0.0.1'), '-U', os.environ.get('POSTGRES_USER',os.environ.get('USER','')), '-d', os.environ.get('POSTGRES_DB','business_management'), '-c', sql]
rows = json.loads(subprocess.check_output(command, text=True))
assert len(rows) == 19 and all(r['kind'] == 'categories' and not r['deleted'] for r in rows)
(work / 'concurrent-category-order-overlay.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
summary = {'sourceTablesUnchanged': sum(r['table_name'].startswith('tplus_demo') for r in after['tables']), 'unchangedTables': len(after['tables']) - len(diff), 'inventoryBarcodesDocumentsUnchanged': True, 'externalCategorySortRowsPreserved': 19, 'externalCategorySortSnapshot': 'concurrent-category-order-overlay.json', 'changedTable': diff[0], 'explanation': 'Category sorting overlays were saved concurrently at 12:45:50. This size fix does not issue a category-save or category-order command.'}
(work / 'database-verification.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False))
