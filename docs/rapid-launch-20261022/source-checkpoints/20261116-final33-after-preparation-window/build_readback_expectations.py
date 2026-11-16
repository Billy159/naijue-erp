"""Adapt the pinned final source into the existing private readback formats."""
from collections import defaultdict
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re

BASE = Path('/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-private-data/unified-cleaning-20261116-1100/package')
PACKAGE = BASE / 'standard-ready-20261116-1140-r1'
DEST = BASE / 'r3-readback-expectations-20261116-1140-r1'
MANIFEST_SHA = '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'
CUTOFF = '2026-11-16T11:40:00+08:00'
UUID = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}')
INTEGER = re.compile(r'0|-?[1-9][0-9]*')
MONEY = re.compile(r'(?:0|[1-9][0-9]*)\.[0-9]{2}')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def load_pinned(path, pin):
    raw = path.read_bytes()
    assert digest(raw) == pin, path
    return raw


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def build():
    os.umask(0o077)
    manifest_raw = load_pinned(PACKAGE / 'manifest.json', MANIFEST_SHA)
    manifest = json.loads(manifest_raw)
    assert manifest['package_kind'] == 'REAL'
    rows_by_table = {}
    source_refs = {}
    for table in ['warehouse', 'inventory_baseline', 'sales_settlement']:
        entry, = [r for r in manifest['files'] if r['table'] == table]
        assert entry['relative_path'] == f'tables/{table}.jsonl'
        path = PACKAGE / entry['relative_path']
        raw = load_pinned(path, entry['sha256'])
        assert len(raw) == entry['bytes']
        rows = [json.loads(line) for line in raw.splitlines()]
        assert len(rows) == entry['row_count']
        rows_by_table[table] = rows
        source_refs[table] = {'path': str(path), 'sha256': entry['sha256'], 'bytes': len(raw), 'rows': len(rows)}
    warehouse_ids = [r['fields']['id'] for r in rows_by_table['warehouse']]
    assert len(warehouse_ids) == len(set(warehouse_ids)) == 54
    assert all(UUID.fullmatch(x) for x in warehouse_ids)
    stock = {wid: [] for wid in warehouse_ids}
    for row in rows_by_table['inventory_baseline']:
        assert set(row['fields']) == {'warehouse_id', 'sku_id', 'quantity'}
        fields = row['fields']
        wid, sku, quantity = (fields[k] for k in ['warehouse_id', 'sku_id', 'quantity'])
        assert wid in stock and UUID.fullmatch(sku) and isinstance(quantity, str) and INTEGER.fullmatch(quantity)
        assert row['source_refs'] and 'explicit_zero_evidence' not in row
        stock[wid].append((sku, int(quantity)))
    partition_path = BASE / 'current-materialized-r1/review/baseline-scope-review/per-warehouse-expected.private.jsonl'
    partition_sha = '117a09b061c6db823fa0befb1bf9972c3f0f77531f0f9445573f5171335f7133'
    partition_rows = [json.loads(line) for line in load_pinned(partition_path, partition_sha).splitlines()]
    partition = {r['warehouse_id']: r for r in partition_rows}
    assert len(partition_rows) == len(partition) == 54 and set(partition) == set(stock)
    expected = []
    for wid in sorted(stock):
        values = sorted(stock[wid])
        assert len(values) == len({sku for sku, _ in values})
        quantities = [quantity for _, quantity in values]
        positive = [q for q in quantities if q > 0]
        negative = [q for q in quantities if q < 0]
        zero_count = quantities.count(0)
        prior = partition[wid]
        assert (len(values), sum(quantities), len(positive), len(negative)) == (prior['explicit_count'], int(prior['quantity']), prior['positive_keys'], prior['negative_keys'])
        key_bytes = ''.join(json.dumps([wid, sku, str(q), 'SOURCE_LISTED'], separators=(',', ':')) + '\n' for sku, q in values).encode()
        counts = dict(explicit_keys=len(values), source_listed_keys=len(values), source_listed_zero_keys=zero_count,
                      approved_absence_zero_keys=0, positive_keys=len(positive), negative_keys=len(negative),
                      zero_quantity_keys=zero_count, signed_quantity=sum(quantities) if values else None,
                      positive_quantity=sum(positive) if values else None, negative_quantity=sum(negative) if values else None)
        expected.append(dict(warehouse_id=wid, counts_and_totals=counts, exact_key_sha256=digest(key_bytes) if values else None))
    cash_counts = defaultdict(int)
    cash_cents = defaultdict(int)
    for row in rows_by_table['sales_settlement']:
        fields = row['fields']
        direction, amount = fields['direction'], fields['amount']
        assert direction in ['RECEIVE', 'REFUND'] and isinstance(amount, str) and MONEY.fullmatch(amount)
        cents = Decimal(amount) * 100
        assert cents == cents.to_integral_value() and cents > 0
        cash_counts[direction] += 1
        cash_cents[direction] += int(cents)
    offline_path = BASE / 'current-materialized-r1/review/offline-table-readback.json'
    offline = json.loads(load_pinned(offline_path, 'f619aae80fdf301dea6372c9b5bf6435fef1ad0079cab418c633ab66cc5d840f'))
    inventory = offline['totals']['inventory_baseline']
    assert sum(len(values) for values in stock.values()) == offline['table_sizes']['inventory_baseline'] == 39525
    assert sum(sum(q for _, q in values) for values in stock.values()) == int(inventory['quantity']) == 80658
    assert sum(cash_counts.values()) == offline['table_sizes']['sales_settlement'] == 26647
    assert cash_cents['RECEIVE'] - cash_cents['REFUND'] == int(offline['totals']['sales_settlement']['amount']) == 2386707993
    money_text = lambda n: f'{n // 100}.{n % 100:02d}'
    warehouse = dict(format='R3_WAREHOUSE_SOURCE_EXPECTATIONS_V1', manifest={'sha256': MANIFEST_SHA}, cutoff_at=CUTOFF, warehouse_expectations=expected)
    aggregate = dict(references={'manifest': {'sha256': MANIFEST_SHA}}, fixed_source_expectations={'cash_source_aggregates': dict(
        receive_rows=cash_counts['RECEIVE'], receive_amount=money_text(cash_cents['RECEIVE']),
        refund_rows=cash_counts['REFUND'], refund_absolute_amount=money_text(cash_cents['REFUND']))})
    DEST.mkdir(mode=0o700)
    outputs = {}
    for leaf, value in [('WAREHOUSE-KEY-EXPECTATIONS.private.json', warehouse), ('AGGREGATE-READBACK-EXPECTATIONS.private.json', aggregate)]:
        raw = encode(value)
        with (DEST / leaf).open('xb') as stream:
            stream.write(raw)
        outputs[leaf] = {'path': str(DEST / leaf), 'sha256': digest(raw), 'bytes': len(raw)}
    receipt = dict(state='FINAL33_SOURCE_FORMAT_ADAPTED_OFFLINE_NO_DATABASE_READBACK', manifestSha256=MANIFEST_SHA, cutoff_at=CUTOFF,
                   sources=source_refs, partition={'path': str(partition_path), 'sha256': partition_sha},
                   offlineReadback={'path': str(offline_path), 'sha256': digest(offline_path.read_bytes())},
                   checks={'all54WarehouseCountsAndSignedQuantitiesEqual': True, 'cashNetEqualIndependentReadback': True,
                           'warehouseCount': 54, 'explicitKeys': 39525, 'signedQuantity': 80658, 'cashRows': 26647,
                           'cashNetCents': 2386707993, 'generatedInventoryKeys': 0}, outputs=outputs,
                   databaseContact=False, runtimePassed=False, sourceReviewPending=True)
    with (DEST / 'EXPECTED-SOURCE-INPUTS.receipt.json').open('xb') as stream:
        stream.write(encode(receipt))
    return receipt


if __name__ == '__main__':
    receipt = build()
    print(json.dumps({'state': receipt['state'], 'outputs': receipt['outputs'], 'checks': receipt['checks']}))
