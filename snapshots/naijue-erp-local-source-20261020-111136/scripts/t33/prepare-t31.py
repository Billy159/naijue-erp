"""Consume the reviewed T31 selector. No database connection; no stock report input.

Canonical events already contain adjudicated identities/aliases. SALE/INBOUND/OUTBOUND
use T31's same state selection and signed-leg helper, retaining the real event family.
"""
import argparse, copy, hashlib, importlib.util, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROGRAM = ROOT / 'outputs/T31/revisions/history-contributions-v1/program/contribution_inputs.py'
def inputs(event, cutoff, t31):
    direction = {'SALE': 'STOCKTAKING_LOSS', 'INBOUND': 'STOCKTAKING_GAIN', 'OUTBOUND': 'STOCKTAKING_LOSS'}
    delegated = copy.deepcopy(event)
    delegated['family'] = direction.get(event['family'], event['family'])
    result = t31.contribution_inputs(delegated, cutoff)
    result['family'] = event['family']
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--expected-program-sha256', required=True)
    args = parser.parse_args()
    if hashlib.sha256(PROGRAM.read_bytes()).hexdigest() != args.expected_program_sha256:
        raise ValueError('T31_PROGRAM_HASH_CHANGED')
    spec = importlib.util.spec_from_file_location('reviewed_t31', PROGRAM)
    t31 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(t31)
    source = json.loads(Path(args.source).read_text())
    result = {'schemaVersion': 'T33-T31-SELECTED-v1', 'openingBoundary': source['openingBoundary'],
              'cutoff': source['cutoff'], 'events': []}
    for event in source['events']:
        selected = {'eventId': event['eventId'],
          'canonicalizationEvidence': event['canonicalizationEvidence'],
          'sourceNumbers': event['sourceNumbers'], 'atOpening': inputs(event, source['openingBoundary'], t31),
          'atCutoff': inputs(event, source['cutoff'], t31),
          **({'documentBinding': event['documentBinding']} if 'documentBinding' in event else {})}
        if 'baselineCutoff' in source:
            selected['atBaseline'] = inputs(event, source['baselineCutoff'], t31)
        result['events'].append(selected)
    with Path(args.output).open('x') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(json.dumps({'events': len(result['events']), 'resolved': sum(
        e['atOpening']['programInputResolved'] and e['atCutoff']['programInputResolved'] for e in result['events']),
        't31ProgramSha256': args.expected_program_sha256}))

if __name__ == '__main__':
    main()
