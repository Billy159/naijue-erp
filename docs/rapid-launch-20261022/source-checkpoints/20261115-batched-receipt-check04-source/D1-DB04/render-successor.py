"""Render the current source slices from the accepted twelve-layer definitions."""
import hashlib
import json
from pathlib import Path

task = Path(__file__).resolve().parent
parent = task.parents[1] / 'D2/20261115-r3-prefix-twelve-source-combination-local-01'
bodies = json.loads((parent / 'BODIES155.json').read_text())
definitions = json.loads((parent / 'DEFINITIONS155.json').read_text())
changes = {
    'naijue_erp.standard_whole_package_inspect_v2(jsonb,text)': 'inspect-prefix.body.sql',
    'naijue_erp.standard_whole_package_validate_context_v2(uuid,bool)': 'durable-context.body.sql',
    'naijue_erp.assert_standard_import_operation(uuid)': 'current-operation.body.sql',
    'naijue_erp.standard_whole_package_step_v2(uuid,int4,text,jsonb)': 'exact-step.body.sql',
    'naijue_erp.standard_import_record_proof(uuid)': 'record-proof.body.sql',
    'naijue_erp.standard_whole_package_closed_v2(uuid)': 'durable-closed.body.sql',
    'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4)': 'legacy-command.body.sql',
    'naijue_erp.standard_import_row_intent(text,jsonb)': 'row-intent.body.sql',
}
parts = ['-- SOURCE CANDIDATE. Host/model admission and PostgreSQL validation pending.', 'BEGIN;', """DO $owner$
BEGIN
 IF current_user::regrole::oid IS DISTINCT FROM (SELECT proowner FROM pg_catalog.pg_proc
   WHERE oid='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)'::regprocedure) THEN
  RAISE EXCEPTION 'BATCH_INSTALL_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
END $owner$;"""]
for signature, filename in changes.items():
    original = bodies[signature]
    successor = (task / filename).read_text()
    assert definitions[signature].count(original) == 1, signature
    assert original != successor, signature
    pin = hashlib.sha256(original.encode()).hexdigest()
    parts.append(f"""DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body${successor}$body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='{signature}'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '{pin}' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='{signature}'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;""")
parts.append((task / 'sql/inspect-kernel.sql').read_text())
parts.append((task / 'sql/bounded-group-inspect.sql').read_text())
parts.append((task / 'sql/current-group-assert.sql').read_text())
command_signature = 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4)'
command_definition = definitions[command_signature]
command_body = bodies[command_signature]
assert command_definition.count('child_ordinal integer)') == 1
command_definition = command_definition.replace('child_ordinal integer)', 'child_ordinal integer, work_batch jsonb)')
command_definition = command_definition.replace(command_body, (task / 'batched-command.body.sql').read_text())
parts.append(command_definition.rstrip('\n') + ';\n')
parts.append('REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer,jsonb) FROM PUBLIC;')
parts.append((task / 'sql/group-entrypoints.sql').read_text())
parts.append((task / 'sql/group-access.sql').read_text())
parts.append((task / 'sql/receipt-result-constraint.sql').read_text())
parts.append('COMMIT;\n')
(task / 'sql/source-slices.sql').write_text('\n'.join(parts))
pins = {
    filename: hashlib.sha256((task / filename).read_bytes()).hexdigest()
    for filename in [*changes.values(), 'batched-command.body.sql',
        'sql/inspect-kernel.sql', 'sql/bounded-group-inspect.sql', 'sql/current-group-assert.sql', 'sql/group-entrypoints.sql', 'sql/group-access.sql',
        'sql/source-slices.sql', 'sql/receipt-result-constraint.sql', 'RECEIPT-CONSTRAINT-CHANGE.json',
        'derive-receipt-constraint.py', 'D2-CONTRACT.md', 'INTERFACE-V1.md', 'HANDOFF.md',
        'render-successor.py', 'derive-batched-command.py', 'command-group-entry.sql']
}
(task / 'SOURCE-PINS.json').write_text(json.dumps(pins, indent=2) + '\n')
print(f'Rendered {len(changes)} exact existing signatures. PostgreSQL not executed.')
