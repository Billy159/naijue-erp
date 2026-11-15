"""Derive the single receipt CHECK change; no PostgreSQL execution."""
from pathlib import Path
import json

TASK = Path(__file__).resolve().parent
model = json.loads((TASK / 'DB-CANDIDATE-02/EXPECTED161-MODEL.json').read_text())
before = next(c for c in model['constraints'] if c['relation'] == 'operation_receipt' and c['name'] == 'receipt_result_by_kind')
after = dict(before)
original = before['definition']
standard, other = original.split('\n    ELSE (', 1)
allowed = " - 'historicalHallTargetCapturesSha256'::text) = '{}'::jsonb)"
assert standard.count(allowed) == 1
standard = standard.replace(allowed, " - 'historicalHallTargetCapturesSha256'::text) - 'batched_import_v1'::text) = '{}'::jsonb)")
# The extra subtraction adds one expression node around the existing subtract.
start = "AND (((result_data - ARRAY["
assert standard.count(start) == 1
standard = standard.replace(start, "AND ((((result_data - ARRAY[", 1)

marker = "(result_data -> 'batched_import_v1'::text)"
identity = f"({marker} -> 'identity'::text)"
descriptor = f"({marker} -> 'descriptor'::text)"

def array(keys):
    return 'ARRAY[' + ', '.join("'" + key + "'::text" for key in keys) + ']'

def field(value, key):
    return f"({value} -> '{key}'::text)"

def kind(value, expected):
    return f"(jsonb_typeof({value}) = '{expected}'::text)"

def closed(value, keys):
    return [kind(value, 'object'), f'({value} ?& {array(keys)})', f"(({value} - {array(keys)}) = '{{}}'::jsonb)"]

identity_keys = ['rootOperationId','batchId','documentBatchId','packageSha256','planSha256','namespace','cutoffAt']
descriptor_keys = ['phase','first','last','rows','bytes','ordinal','subBatchId','predecessor','descriptorSha256','firstOperationId','lastOperationId','previousLastOperationId','previousDescriptorSha256']
clauses = closed(marker, ['identity','descriptor','full_xid','controller'])
clauses += closed(identity, identity_keys)
clauses += [kind(field(identity, key), 'string') for key in identity_keys]
clauses += closed(descriptor, descriptor_keys)
clauses += [kind(field(descriptor, key), 'string') for key in ['phase','subBatchId','descriptorSha256','firstOperationId','lastOperationId']]
clauses += [kind(field(descriptor, key), 'number') for key in ['first','last','rows','bytes','ordinal']]
for key in ['predecessor','previousLastOperationId','previousDescriptorSha256']:
    clauses.append(f"(jsonb_typeof({field(descriptor, key)}) = ANY (ARRAY['string'::text, 'null'::text]))")
clauses += [kind(field(marker, 'full_xid'), 'string'),
    f"(({marker} ->> 'full_xid'::text) ~ '^[0-9]+$'::text)",
    kind(field(marker, 'controller'), 'string'),
    f"(length(({marker} ->> 'controller'::text)) > 0)"]
optional = "((NOT (result_data ? 'batched_import_v1'::text)) OR (" + ' AND '.join(clauses) + '))'
anchor = " AND ((result_data ->> 'operationId'::text) = (id)::text)"
assert standard.count(anchor) == 1
standard = standard.replace(anchor, ' AND ' + optional + anchor, 1)
after['definition'] = standard + '\n    ELSE (' + other
# Removing only the new allow-key and its guarded shape restores the whole old CHECK.
restored_standard = standard.replace(' AND ' + optional, '', 1)
restored_standard = restored_standard.replace(" - 'historicalHallTargetCapturesSha256'::text) - 'batched_import_v1'::text)", " - 'historicalHallTargetCapturesSha256'::text)", 1)
restored_standard = restored_standard.replace("AND ((((result_data - ARRAY[", start, 1)
assert restored_standard + '\n    ELSE (' + other == original
assert {**after, 'definition': original} == before
spec = {'relation':'operation_receipt','name':'receipt_result_by_kind','before':before,'after':after}
(TASK/'RECEIPT-CONSTRAINT-CHANGE.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n')
# Reuse the existing exact-metadata constraint-install seam, changing just its spec.
base = (TASK.parents[1]/'D3/20261115-r3-batched-pg-local-05/base-install.sql').read_text()
a = base.index('DO $historical_hall_capture_receipt_constraint$')
b = base.index('END $historical_hall_capture_receipt_constraint$;', a) + len('END $historical_hall_capture_receipt_constraint$;')
block = base[a:b]
old_start = block.index(' spec jsonb:=')
old_end = block.index('\n observed jsonb;', old_start)
block = block[:old_start] + ' spec jsonb:=$batched_receipt_spec$' + json.dumps(spec,ensure_ascii=False,separators=(',',':')) + '$batched_receipt_spec$::jsonb;' + block[old_end:]
block = block.replace('$historical_hall_capture_receipt_constraint$', '$batched_receipt_constraint$').replace('HISTORICAL_HALL_RECEIPT_CONSTRAINT_', 'BATCH_RECEIPT_CONSTRAINT_')
(TASK/'sql/receipt-result-constraint.sql').write_text('-- One exact CHECK successor; all other kinds and metadata are preserved.\n'+block+'\n')
print('Derived one source-only receipt CHECK successor; canonical capture remains unverified.')
