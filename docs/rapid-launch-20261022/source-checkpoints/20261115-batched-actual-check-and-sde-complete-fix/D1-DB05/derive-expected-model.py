"""Build a source-derived expected model. This is not a PostgreSQL capture."""
import hashlib
import json
import re
import runpy
from pathlib import Path

task = Path(__file__).resolve().parent
rendered = runpy.run_path(str(task / 'render-successor.py'))
parent = rendered['parent']
model = json.loads((parent / 'MODEL155.json').read_text())
definitions = dict(rendered['definitions'])
bodies = dict(rendered['bodies'])
sha = lambda value: hashlib.sha256(value.encode()).hexdigest()

def normal(signature):
    signature = signature.replace('pg_catalog.', '').replace('timestamp with time zone', 'timestamptz')
    signature = re.sub(r'\binteger\b', 'int4', re.sub(r'\bboolean\b', 'bool', signature))
    return re.sub(r'\s*,\s*', ',', re.sub(r'\bbigint\b', 'int8', signature))

for row in model['routines']:
    key = normal(row['signature'])
    assert sha(bodies[key]) == row['bodySha256']
    assert sha(definitions[key]) == row['definitionSha256']
    if key in rendered['changes']:
        new_body = (task / rendered['changes'][key]).read_text()
        definitions[key] = definitions[key].replace(bodies[key], new_body)
        bodies[key] = new_body
        row['bodySha256'] = sha(new_body)
        row['definitionSha256'] = sha(definitions[key])

owner = next(row['owner'] for row in model['routines']
             if normal(row['signature']) == rendered['command_signature'])
initializer = 'erp_unified27_initializer_2393dbc6db9581c2'
importer = 'erp_unified27_importer_2393dbc6db9581c2'
new_functions = []
for filename in ['sql/inspect-kernel.sql', 'sql/bounded-group-inspect.sql', 'sql/current-group-assert.sql', 'sql/group-entrypoints.sql']:
    text = (task / filename).read_text()
    pattern = r'CREATE OR REPLACE FUNCTION ([\w.]+)\((.*?)\)\s*RETURNS (jsonb|void).*?AS \$function\$(.*?)\$function\$;'
    for name, parameters, returns, body in re.findall(pattern, text, re.S):
        parameters = ', '.join(' '.join(item.split()) for item in parameters.split(','))
        types = ','.join(item.strip().split()[-1] for item in parameters.split(','))
        signature = name + '(' + types + ')'
        definition = (f'CREATE OR REPLACE FUNCTION {name}({parameters})\n RETURNS {returns}\n'
            ' LANGUAGE plpgsql\n SECURITY DEFINER\n'
            " SET search_path TO 'pg_catalog', 'naijue_erp', 'pg_temp'\n"
            ' SET "TimeZone" TO \'UTC\'\nAS $function$' + body + '$function$\n')
        new_functions.append((signature, definition, body))
new_functions.append(('naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer,jsonb)',
    rendered['command_definition'], (task / 'batched-command.body.sql').read_text()))
assert len(new_functions) == 6
for signature, definition, body in new_functions:
    key = normal(signature)
    assert key not in definitions
    name = signature.split('(')[0].split('.')[-1]
    grantees = [owner]
    if name in ['standard_batched_import_inspect_v1', 'standard_batched_import_complete_v1']:
        grantees.append(importer)
    if name == 'standard_batched_import_step_v1':
        grantees.extend([initializer, importer])
    model['routines'].append({'acl': sorted(grantee + '=X/' + owner for grantee in grantees),
        'owner': owner, 'signature': signature, 'bodySha256': sha(body), 'definitionSha256': sha(definition)})
    definitions[key] = definition
    bodies[key] = body

assert len(model['routines']) == len(definitions) == len(bodies) == 161
assert len({normal(row['signature']) for row in model['routines']}) == 161
original = json.loads((parent / 'MODEL155.json').read_text())
constraint_change = json.loads((task / 'RECEIPT-CONSTRAINT-CHANGE.json').read_text())
matches = [index for index, row in enumerate(model['constraints'])
           if row['relation'] == constraint_change['relation'] and row['name'] == constraint_change['name']]
assert len(matches) == 1
assert model['constraints'][matches[0]] == constraint_change['before']
assert {**constraint_change['after'], 'definition': constraint_change['before']['definition']} == constraint_change['before']
model['constraints'][matches[0]] = constraint_change['after']
original['constraints'][matches[0]] = constraint_change['after']
assert {key: value for key, value in model.items() if key != 'routines'} == {
    key: value for key, value in original.items() if key != 'routines'}
for filename, value in [('EXPECTED161-MODEL.json', model),
        ('EXPECTED161-DEFINITIONS.json', definitions), ('EXPECTED161-BODIES.json', bodies)]:
    (task / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
pins = json.loads((task / 'SOURCE-PINS.json').read_text())
for filename in ['EXPECTED161-MODEL.json', 'EXPECTED161-DEFINITIONS.json', 'EXPECTED161-BODIES.json',
        'derive-expected-model.py']:
    pins[filename] = hashlib.sha256((task / filename).read_bytes()).hexdigest()
(task / 'SOURCE-PINS.json').write_text(json.dumps(pins, indent=2) + '\n')
print('Derived expected 161-routine source model. New canonical definitions require actual PG comparison.')
