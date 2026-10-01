"""Reuse validated detail comparisons and verify every two-sided legacy transfer identity."""
from pathlib import Path
import hashlib
import json
import subprocess
import os,shutil

WORK = Path(__file__).resolve().parent
summary = json.loads((WORK / 'summary.json').read_text())
matches = json.loads((WORK / 'original-transfer-matches.json').read_text())
remaining = json.loads((WORK / 'legacy-new-without-exact-match.json').read_text())
differences = json.loads((WORK / 'same-serial-transfer-differences-and-status.json').read_text())
for item in summary['inputs']:
    h = hashlib.sha256()
    with (WORK.parents[2]/item['path']).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
    assert h.hexdigest() == item['sha256'], ('input changed', item['path'])

assert len(matches) == len({m['newNumber'] for m in matches}) == 13945
assert len(remaining) == 1
assert all('AL' + m['newNumber'] in m['oldNumbers'] for m in matches)
new_old_numbers = {'AL' + m['newNumber'] for m in matches} | {'AL' + d['number'] for d in remaining}
assert len(new_old_numbers) == 13946

query = """
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object('number',source_number,'date',business_date,
  'lines',line_count,'quantity',quantity_total,
  'outLines',jsonb_array_length(source_payload->'sourceLineRows'->'out'),
  'inLines',jsonb_array_length(source_payload->'sourceLineRows'->'in'),
  'pairEvidence',source_payload->>'pairEvidence')
FROM tplus_demo_20260922_a2.tplus_history_document
WHERE document_kind='transfer' ORDER BY source_number;
COMMIT;
"""
command = [os.environ.get('PSQL_BIN') or shutil.which('psql') or str(Path.home()/'pg17/bin/psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
           '-h', os.environ.get('POSTGRES_HOST','127.0.0.1'), '-p', os.environ.get('POSTGRES_PORT','5432'), '-U', os.environ.get('POSTGRES_USER',os.environ.get('USER','')), '-d', os.environ.get('POSTGRES_DB','business_management'), '-c', query]
raw = subprocess.run(command, check=True, text=True, capture_output=True).stdout
old_documents = [json.loads(line) for line in raw.splitlines() if line.strip()]
old_numbers = {d['number'] for d in old_documents}
assert len(old_numbers) == len(old_documents) == 13946
assert new_old_numbers == old_numbers, {'missing':sorted(new_old_numbers-old_numbers),
                                      'extra':sorted(old_numbers-new_old_numbers)}
expected_pair = 'exact source number + unique matching header + complete detail multiset + distinct known warehouses'
assert all(d['pairEvidence'] == expected_pair for d in old_documents)
assert all(d['outLines'] == d['inLines'] == d['lines'] and d['lines'] > 0 for d in old_documents)
assert sum(d['outLines'] for d in old_documents) == sum(d['inLines'] for d in old_documents) == 254519
assert summary['newExport']['lines'] - summary['newExport']['ignoredNewLines'] == 254519
assert summary['inputs'][0]['documents'] == 13946 + 52
assert summary['inputs'][1]['documents'] == 13946 + 79
assert summary['inputs'][0]['lines'] == 254519 + 44402
assert summary['inputs'][1]['lines'] == 254519 + 44398

content_difference = next(d for d in differences if not d['comparison']['equalNonzeroSkuQuantities'])
assert content_difference['new']['number'] == 'AL-2026-09-0128'
assert content_difference['new']['quantity'] == content_difference['oldOut']['quantity'] == content_difference['oldIn']['quantity'] == '71'
assert content_difference['new']['lineCount'] == content_difference['oldOut']['lineCount'] == content_difference['oldIn']['lineCount'] == 70

result = {'status':'PASS','cutoff':'2026-09-10','inputFilesUnchanged':True,
  'legacyTransferDocuments':13946,'documentsWithBothOriginalInOut':13946,
  'missingOriginalInDocuments':0,'missingOriginalOutDocuments':0,'documentCoveragePercent':100,
  'originalInTransferLines':254519,'originalOutTransferLines':254519,'directLegacyTransferLines':254519,
  'sameOriginalSkuQuantityDocuments':13945,'differentOriginalSizeDocuments':1,
  'sizeDifference':content_difference,'ignoredNewTransferDocuments':270,
  'extraOriginalInStockGainDocuments':79,'extraOriginalOutStockLossDocuments':52,
  'unapprovedButCoveredTransferNumbers':['AL-2026-09-0157','AL-2026-09-0158'],
  'numberMapping':'其他入库/出库单号 = AL + 调拨单导出中的原单号',
  'databaseWritten':False,'sourceWorkbookEdited':False}
(WORK / 'coverage-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='sizeDifference'},ensure_ascii=False))
