"""Convert source sales/settlements to an isolated, read-only historical package.

No runtime repositories, audit commands, databases, browser storage or source writes.
Source worksheets are reread on every run; OOXML provides independent control totals.
"""
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from datetime import date, datetime
import hashlib
import json
import os
import zipfile
import xml.etree.ElementTree as ET

from common import (
    OUT, SRC, ROOT, stable_id, raw_row_id, lineage, historical, source_rows,
    SpecResolver, control, decimal_text, dec, text, sha, dumps, save_json,
    save_jsonl, jsonl, JsonlWriter, load_json,
)

SALE_FILE = '单据数据/销货单.xlsx'
RECEIPT_FILE = '单据数据/收款单.xlsx'
ZERO = Decimal(0)
DIAG = defaultdict(list)


def value(v):
    """Keep source values losslessly in JSON's explicit decimal-text convention."""
    if isinstance(v, (int, float, Decimal)) and not isinstance(v, bool):
        return decimal_text(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


def source_snapshot(fields):
    # source_rows suffixes duplicate captions, preserving both discounts/notes.
    return {k: value(v) for k, v in fields.items()}


def required_decimal(v, description):
    d = dec(v)
    if d is None or not d.is_finite():
        raise ValueError(f'Missing/invalid number: {description}')
    return d


def source_date(v):
    if not isinstance(v, (date, datetime)):
        raise ValueError(f'Invalid source date: {v!r}')
    return v.date().isoformat() if isinstance(v, datetime) else v.isoformat()


def unique_master(rel, sheet, header, code_field):
    out = {}
    for row, vals, fields in source_rows(rel, sheet, header):
        code = text(fields[code_field])
        if not code or code in out:
            raise ValueError(f'Missing/duplicate master key {rel}:{row}:{code}')
        out[code] = fields
    return out


MASTERS = {
    'party': unique_master('基础档案/往来单位.xlsx', '往来单位', 2, '往来单位编码'),
    'employee': unique_master('基础档案/员工.xlsx', '员工', 2, '员工编码'),
    'department': unique_master('基础档案/部门.xlsx', '部门', 1, '部门编码'),
    'warehouse': unique_master('基础档案/仓库.xlsx', '仓库', 1, '仓库编码'),
    'product': unique_master('基础档案/存货.xlsx', '存货', 2, '存货编码'),
    'payment_method': unique_master('基础档案/结算方式.xlsx', '结算方式', 1, '结算方式编码'),
    'fund_account': unique_master('基础档案/账号.xlsx', '账号', 2, '账号编码'),
}
HALL_CODES = {code for code, r in MASTERS['department'].items()
              if text(r['上级部门编码']) == '009'}
ACCOUNT_NAME_TO_CODE = {}
for code, fields in MASTERS['fund_account'].items():
    name = text(fields['账号名称'])
    if name in ACCOUNT_NAME_TO_CODE:
        raise ValueError('Account names must be unique for exact name lookup')
    ACCOUNT_NAME_TO_CODE[name] = code
RESOLVER = SpecResolver()
FK_COUNTS = defaultdict(Counter)
IDS = defaultdict(set)
DUP_SEEN = defaultdict(dict)
DUP_COUNTS = Counter()
ROW_COUNTS = Counter()
SOURCE_TOTALS = Counter()


def put(writer, entity, obj):
    if obj['id'] in IDS[entity]:
        DIAG['unique_key_conflicts'].append({'entity': entity, 'id': obj['id'], 'lineage': obj['lineage']})
        raise ValueError(f'Unique output key collision: {entity}:{obj["id"]}')
    IDS[entity].add(obj['id'])
    writer.write(obj)


def duplicate(entity, fields, row_lineage, record_id):
    fp = hashlib.sha256(dumps(source_snapshot(fields)).encode()).hexdigest()
    prior = DUP_SEEN[entity].get(fp)
    if prior:
        DUP_COUNTS[entity] += 1
        DIAG['duplicates_preserved'].append({
            'entity': entity, 'firstId': prior['id'], 'id': record_id,
            'firstLineage': prior['lineage'], 'lineage': row_lineage,
            'treatment': 'preserve_as_distinct_source_row',
        })
    else:
        DUP_SEEN[entity][fp] = {'id': record_id, 'lineage': row_lineage}


def fk(entity, kind, code, field, loc, allow_null=False):
    code = text(code)
    if not code:
        FK_COUNTS[entity]['source_missing'] += 1
        DIAG['missing_fk'].append({
            'entity': entity, 'field': field, 'kind': kind, 'sourceValue': None,
            'classification': 'source_missing', 'nullableHistoricalField': allow_null,
            'reason': '源字段为空；保持null，不回填当前人员/部门', 'lineage': loc,
        })
        if not allow_null:
            raise ValueError(f'Missing required {kind} at {loc}')
        return None
    if code not in MASTERS[kind]:
        FK_COUNTS[entity]['unresolved'] += 1
        DIAG['missing_fk'].append({
            'entity': entity, 'field': field, 'kind': kind, 'sourceValue': code,
            'classification': 'nonblank_unresolved', 'lineage': loc,
        })
        raise ValueError(f'Unknown {kind}:{code} at {loc}')
    return stable_id(kind, code)


def context(entity, fields, loc, receipt=False, diagnose_functional=True):
    customer_code = text(fields['*结算客户编码' if receipt else '*客户编码'])
    dep = text(fields['部门编码'])
    emp = text(fields['业务员编码' if receipt else '*业务员编码'])
    out = {
        'customerId': fk(entity, 'party', customer_code, 'customerId', loc),
        'sourceCustomerCode': customer_code,
        'departmentId': fk(entity, 'department', dep, 'departmentId', loc, True),
        'sourceDepartmentCode': dep or None,
        'employeeId': fk(entity, 'employee', emp, 'employeeId', loc, True),
        'sourceEmployeeCode': emp or None,
        'hallId': stable_id('hall', dep) if dep in HALL_CODES else None,
        'hallResolution': 'source_department_is_hall' if dep in HALL_CODES else
                          'source_department_missing' if not dep else 'functional_department_not_a_hall',
    }
    if dep and dep not in HALL_CODES and diagnose_functional:
        DIAG['functional_department'].append({
            'entity': entity, 'departmentId': out['departmentId'], 'sourceDepartmentCode': dep,
            'hallId': None, 'classification': 'valid_department_not_missing_fk',
            'reason': '职能部门有效，不能伪装为营业厅，也不计为无法解析外键', 'lineage': loc,
        })
    if not receipt:
        settle = text(fields['结算客户编码'])
        out['settlementCustomerId'] = fk(entity, 'party', settle, 'settlementCustomerId', loc)
        out['sourceSettlementCustomerCode'] = settle
    return out


def account_fields(entity, fields, loc):
    method = text(fields['*结算方式编码'])
    name = text(fields['*账号名称'])
    account = ACCOUNT_NAME_TO_CODE.get(name)
    if account is None:
        raise ValueError(f'Unknown/empty account name at {loc}')
    return {
        'paymentMethodId': fk(entity, 'payment_method', method, 'paymentMethodId', loc),
        'fundAccountId': fk(entity, 'fund_account', account, 'fundAccountId', loc),
        'sourcePaymentMethodCode': method, 'sourcePaymentMethodName': fields['结算方式'],
        'sourceFundAccountCode': account, 'sourceFundAccountName': name,
        'currentPrimaryMethodApplied': False,
    }


def purpose(fields):
    return ['source_note_inventory_adjustment'] if '库存调整' in text(fields.get('备注')) else []


def verify_source_hashes():
    baseline = load_json(OUT / 'BASELINE.json')
    protected = {x['path']: x['sha256'] for x in baseline['protected_files']}
    checked = []
    for rel in [SALE_FILE, RECEIPT_FILE]:
        # common.sha caches for repeated row lineage; integrity checks must reread bytes.
        h = hashlib.sha256()
        with (SRC / rel).open('rb') as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b''):
                h.update(chunk)
        actual = h.hexdigest()
        assert actual == sha(SRC / rel), f'Lineage SHA is stale: {rel}'
        assert actual == protected['T+数据/' + rel], f'Source changed: {rel}'
        checked.append({'sourceFile': 'T+数据/' + rel, 'sha256': actual, 'matchesBaseline': True})
    return checked


def raw_xml_control(rel, worksheet, first_row, amount_col, qty_col=None):
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    count = 0; amount = ZERO; qty = ZERO
    with zipfile.ZipFile(SRC / rel) as z, z.open('xl/worksheets/' + worksheet) as f:
        for _, row in ET.iterparse(f, events=['end']):
            if row.tag != '{' + ns['m'] + '}row':
                continue
            if int(row.attrib['r']) < first_row:
                row.clear(); continue
            cells = {''.join(x for x in c.attrib['r'] if x.isalpha()): c
                     for c in row.findall('m:c', ns)}
            if amount_col in cells:
                count += 1
                amount += Decimal(cells[amount_col].find('m:v', ns).text)
                if qty_col:
                    qty += Decimal(cells[qty_col].find('m:v', ns).text)
            row.clear()
    return {'rows': count, 'amount': decimal_text(amount),
            'quantity': decimal_text(qty) if qty_col else None,
            'sourceFile': 'T+数据/' + rel, 'xmlWorksheet': worksheet}


def main():
    hashes = verify_source_hashes()
    docs = {}
    line_writer = JsonlWriter('data/history/sales_lines.jsonl')
    units = Counter(); gift_units = Counter()
    for row, vals, fields in source_rows(SALE_FILE, '销货单', 2):
        ROW_COUNTS['sales_lines'] += 1
        no = text(fields['*单据编号']); assert no
        docid = stable_id('sale', no)
        loc = lineage(SALE_FILE, '销货单', row)
        qty = required_decimal(fields['*数量'], loc)
        amount = required_decimal(fields['含税金额'], loc)
        price = required_decimal(fields['含税单价'], loc)
        rounding = required_decimal(fields['抹零'], loc)
        unit = text(fields['销售单位'])
        prod = text(fields['存货编码'])
        fk('sales_lines', 'product', prod, 'productId', loc)
        spec = RESOLVER.resolve(prod, fields['颜色'], fields['尺码'])
        warehouse_code = text(fields['仓库编码'])
        warehouse_id = fk('sales_lines', 'warehouse', warehouse_code, 'warehouseId', loc)
        ctx = context('sales_lines', fields, loc, diagnose_functional=False)
        lid = raw_row_id('sale_line', SALE_FILE, '销货单', row)
        obj = {
            'id': lid, 'documentId': docid, 'sourceDocumentNumber': no,
            **spec, **ctx, 'warehouseId': warehouse_id, 'sourceWarehouseCode': warehouse_code,
            'quantity': decimal_text(qty), 'amount': decimal_text(amount),
            'unitPrice': decimal_text(price), 'unit': unit,
            'sourceProductName': fields['存货名称'], 'gift': bool(fields['赠品']),
            'note': fields['备注__2'], 'sourcePurposeTags': purpose(fields),
            'historicalCategorySnapshot': None, 'performanceClassification': 'not_evaluated',
            'participatesInStockReconstruction': True, 'stockQuantityContribution': decimal_text(-qty),
            'runtimeStockEffect': False, 'runtimeFundsEffect': False, 'executed': False,
            'lineage': loc, 'source': source_snapshot(fields), **historical(),
        }
        duplicate('sales_lines', fields, loc, lid)
        put(line_writer, 'sales_lines', obj)
        SOURCE_TOTALS['sales_amount'] += amount; SOURCE_TOTALS['sales_quantity'] += qty
        units[unit] += qty
        if obj['gift']: gift_units[unit] += qty
        header = {k: v for k, v in list(fields.items())[:40]}
        if no not in docs:
            docs[no] = {'id': docid, 'firstRow': row, 'rows': [], 'fields': fields,
                        'header': header, 'quantity': ZERO, 'amount': ZERO, 'rounding': rounding,
                        'signs': set(), 'warehouses': set(), 'lineCount': 0,
                        'settlementCount': 0, 'settlementAmount': ZERO}
        a = docs[no]
        if header != a['header']:
            DIAG['header_conflicts'].append({'documentId': docid, 'lineage': loc})
            raise ValueError(f'Inconsistent header for {no}')
        a['rows'].append(row); a['quantity'] += qty; a['amount'] += amount
        a['lineCount'] += 1; a['warehouses'].add(warehouse_code)
        a['signs'].add(-1 if qty < 0 else 1 if qty > 0 else 0)
        difference = amount - (qty * price).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        if difference:
            DIAG['line_amount_difference'].append({'documentId': docid, 'id': lid,
                'sourceDocumentNumber': no, 'lineage': loc, 'quantity': decimal_text(qty),
                'unitPrice': decimal_text(price), 'sourceAmount': decimal_text(amount),
                'difference': decimal_text(difference), 'treatment': 'preserve_source_amount_no_recalculation'})
        emp = text(fields['*业务员编码']); dep = text(fields['部门编码'])
        if emp and dep and text(MASTERS['employee'][emp]['所属部门编码']) != dep:
            DIAG['employee_current_department_difference'].append({'documentId': docid, 'lineId': lid,
                'sourceEmployeeCode': emp, 'sourceDepartmentCode': dep,
                'masterCurrentDepartmentCode': MASTERS['employee'][emp]['所属部门编码'],
                'lineage': loc, 'treatment': 'keep_source_historical_department'})
    line_writer.close()

    fund_writer = JsonlWriter('data/history/sales_funds.jsonl')
    for row, vals, fields in source_rows(SALE_FILE, '现结', 1):
        ROW_COUNTS['sales_funds'] += 1
        no = text(fields['所属销货单单据编号']); loc = lineage(SALE_FILE, '现结', row)
        if no not in docs:
            FK_COUNTS['sales_funds']['unresolved'] += 1
            raise ValueError(f'Unresolved explicit sales reference: {loc}')
        amount = required_decimal(fields['*收款金额'], loc)
        fid = raw_row_id('sale_fund', SALE_FILE, '现结', row)
        obj = {'id': fid, 'settlementId': raw_row_id('sale_settlement', SALE_FILE, '现结', row),
            'documentId': docs[no]['id'], 'sourceDocumentNumber': no,
            **account_fields('sales_funds', fields, loc),
            'amount': decimal_text(amount), 'absoluteAmount': decimal_text(abs(amount)),
            'direction': 'receipt' if amount > 0 else 'refund' if amount < 0 else 'zero',
            'settledAt': None, 'sourceBusinessDate': source_date(docs[no]['fields']['*单据日期']),
            'dateBasis': 'sales_document_date_only_not_settlement_time',
            'relationshipBasis': 'exact_source_sales_document_number',
            'zeroAmountSourcePreserved': amount == 0,
            'runtimeStockEffect': False, 'runtimeFundsEffect': False, 'executed': False,
            'lineage': loc, 'source': source_snapshot(fields), **historical()}
        duplicate('sales_funds', fields, loc, fid)
        put(fund_writer, 'sales_funds', obj)
        docs[no]['settlementCount'] += 1; docs[no]['settlementAmount'] += amount
        SOURCE_TOTALS['funds_amount'] += amount
    fund_writer.close()

    doc_writer = JsonlWriter('data/history/sales_documents.jsonl')
    purpose_count = 0; unmatched_count = 0; multi_count = 0
    for no, a in docs.items():
        f = a['fields']; assert len(a['warehouses']) == 1
        loc = lineage(SALE_FILE, '销货单', a['firstRow'], rows=a['rows'])
        ctx = context('sales_documents', f, loc)
        net = a['amount'] - a['rounding']
        tags = purpose(f)
        if tags:
            purpose_count += 1
            DIAG['source_purpose'].append({'documentId': a['id'], 'sourceDocumentNumber': no,
                'sourcePurposeTags': tags, 'sourceNote': f['备注'], 'lineage': loc,
                'treatment': 'source_sales_preserved_not_reclassified_as_new_inventory_adjustment'})
        if not a['settlementCount']: unmatched_count += 1
        if a['settlementCount'] > 1: multi_count += 1
        delta = a['settlementAmount'] - net
        if a['settlementCount'] and delta:
            DIAG['settlement_difference'].append({'documentId': a['id'], 'sourceDocumentNumber': no,
                'lineage': loc, 'sourceAmount': decimal_text(a['amount']),
                'rounding': decimal_text(a['rounding']), 'amountAfterRounding': decimal_text(net),
                'sourceSettlementAmount': decimal_text(a['settlementAmount']),
                'difference': decimal_text(delta), 'treatment': 'preserve_source_no_forced_balancing'})
        obj = {'id': a['id'], 'sourceDocumentNumber': no, 'date': source_date(f['*单据日期']),
            'datePrecision': 'day', 'sourceBusinessTypeCode': text(f['*业务类型编码']),
            'sourceBusinessTypeName': f['业务类型'],
            'businessType': '销售' if a['signs'] == {1} else '退货/换货', **ctx,
            'warehouseId': stable_id('warehouse', next(iter(a['warehouses']))),
            'sourceWarehouseCode': next(iter(a['warehouses'])),
            'lineCount': a['lineCount'], 'quantityControlTotal': decimal_text(a['quantity']),
            'quantityControlUnit': 'mixed_source_units_do_not_label_all_as_pieces',
            'amount': decimal_text(a['amount']), 'rounding': decimal_text(a['rounding']),
            'amountAfterRounding': decimal_text(net),
            'settlementCount': a['settlementCount'], 'settlementAmount': decimal_text(a['settlementAmount']),
            'settlementCompleteness': 'no_source_settlement_rows_unknown_payment_status' if not a['settlementCount'] else
                'source_totals_match_not_proof_of_audit' if delta == 0 else 'source_totals_differ',
            'sourcePurposeTags': tags, 'performanceClassification': 'not_evaluated',
            'sourcePaymentTerm': f['收款方式'], 'note': f['备注'],
            'runtimeStockEffect': False, 'runtimeFundsEffect': False, 'executed': False,
            'lineage': loc, 'source': source_snapshot(a['header']), **historical()}
        put(doc_writer, 'sales_documents', obj)
        SOURCE_TOTALS['sales_rounding'] += a['rounding']
    doc_writer.close()
    ROW_COUNTS['sales_documents'] = len(docs)

    receipts = {}
    receipt_writer = JsonlWriter('quarantine/independent_receipt_lines.jsonl')
    for row, vals, fields in source_rows(RECEIPT_FILE, '收款单', 2):
        ROW_COUNTS['independent_receipt_lines'] += 1
        no = text(fields['*单据编号']); assert no
        docid = stable_id('independent_receipt', no)
        loc = lineage(RECEIPT_FILE, '收款单', row)
        rid = raw_row_id('independent_receipt_line', RECEIPT_FILE, '收款单', row)
        amount = required_decimal(fields['*收款金额'], loc)
        ctx = context('independent_receipt_lines', fields, loc, receipt=True, diagnose_functional=False)
        obj = {'id': rid, 'documentId': docid, 'salesDocumentId': None,
            'sourceDocumentNumber': no, **ctx, **account_fields('independent_receipt_lines', fields, loc),
            'amount': decimal_text(amount), 'absoluteAmount': decimal_text(abs(amount)),
            'direction': 'receipt' if amount > 0 else 'refund' if amount < 0 else 'zero',
            'stockEffect': False, 'fundsEffect': False,
            'runtimeStockEffect': False, 'runtimeFundsEffect': False,
            'participatesInStockReconstruction': False, 'participatesInFundsReconstruction': False,
            'quarantined': True, 'quarantineReason': 'no_reliable_sales_or_writeoff_relationship',
            'executed': False, 'lineage': loc, 'source': source_snapshot(fields), **historical()}
        duplicate('independent_receipt_lines', fields, loc, rid)
        put(receipt_writer, 'independent_receipt_lines', obj)
        SOURCE_TOTALS['receipt_amount'] += amount
        header = {k: v for k, v in list(fields.items())[:15]}
        if no not in receipts:
            receipts[no] = {'id': docid, 'firstRow': row, 'rows': [], 'fields': fields,
                            'header': header, 'amount': ZERO, 'lineCount': 0}
        a = receipts[no]
        if header != a['header']:
            raise ValueError(f'Inconsistent receipt header: {no}')
        a['rows'].append(row); a['amount'] += amount; a['lineCount'] += 1
    receipt_writer.close()
    receipt_doc_writer = JsonlWriter('quarantine/independent_receipt_documents.jsonl')
    for no, a in receipts.items():
        f = a['fields']; loc = lineage(RECEIPT_FILE, '收款单', a['firstRow'], rows=a['rows'])
        obj = {'id': a['id'], 'sourceDocumentNumber': no, 'salesDocumentId': None,
            'date': source_date(f['*单据日期']), 'datePrecision': 'day',
            'sourceBusinessTypeCode': text(f['*业务类型编码']), 'sourceBusinessTypeName': f['业务类型'],
            **context('independent_receipt_documents', f, loc, receipt=True),
            'lineCount': a['lineCount'], 'amount': decimal_text(a['amount']),
            'sourceDiscount': decimal_text(f['折让']), 'note': f['备注'],
            'stockEffect': False, 'fundsEffect': False,
            'runtimeStockEffect': False, 'runtimeFundsEffect': False,
            'participatesInStockReconstruction': False, 'participatesInFundsReconstruction': False,
            'quarantined': True, 'quarantineReason': 'no_reliable_sales_or_writeoff_relationship',
            'executed': False, 'lineage': loc, 'source': source_snapshot(a['header']), **historical()}
        put(receipt_doc_writer, 'independent_receipt_documents', obj)
    receipt_doc_writer.close()
    ROW_COUNTS['independent_receipt_documents'] = len(receipts)

    entities = []
    for entity in ['sales_documents', 'sales_lines', 'sales_funds', 'independent_receipt_documents', 'independent_receipt_lines']:
        quarantine = entity.startswith('independent_')
        fks = FK_COUNTS[entity]
        entities.append(control(entity, ROW_COUNTS[entity], 0 if quarantine else ROW_COUNTS[entity],
            quarantined_count=ROW_COUNTS[entity] if quarantine else 0,
            duplicate_count=DUP_COUNTS[entity],
            missing_fk_count=fks['source_missing'] + fks['unresolved'],
            source_missing_fk_count=fks['source_missing'], unresolved_fk_count=fks['unresolved'],
            source_missing_fk_by_field=dict(Counter(x['field'] for x in DIAG['missing_fk']
                if x['entity'] == entity and x['classification'] == 'source_missing')),
            missing_fk_count_basis='missing_or_unresolved_reference_fields_on_this_output_entity',
            duplicate_count_basis='exact_source_row_excess_preserved_not_deleted',
            output_count=len(IDS[entity]), unique_key_conflict_count=0,
            conservation='source_count = converted_count + quarantined_count + rejected_count',
            all_source_rows_preserved=True))
    controls = {'stage': '③A-2', 'executed': False, 'sourceReading': 'fresh_read_only_xlsx',
        'sourceHashes': hashes, 'entities': entities,
        'totals': {k: decimal_text(v) for k, v in SOURCE_TOTALS.items()},
        'salesQuantityByUnit': {k: decimal_text(v) for k, v in units.items()},
        'giftQuantityByUnit': {k: decimal_text(v) for k, v in gift_units.items()},
        'sales_document_count_with_multiple_settlements': multi_count,
        'sales_document_count_without_settlements': unmatched_count,
        'source_purpose_inventory_adjustment_document_count': purpose_count,
        'diagnostic_counts': {k: len(v) for k, v in DIAG.items()},
        'source_duplicate_headers_preserved': {'sales': ['折扣', '折扣__2', '备注', '备注__2'],
                                              'receipts': ['备注', '备注__2']},
        'missing_source_reference_policy': 'nullable_history_fields_remain_null_with_row_diagnostics',
        'functional_department_policy': 'valid_departmentId_and_null_hallId_not_missing_fk',
        'sale_stock_formula': 'negative_of_original_signed_quantity_once',
        'rounding_policy': 'document_header_once_never_sum_repeated_line_headers',
        'independent_receipt_policy': 'quarantine_all_no_stock_or_funds_effect',
        'sourceAuditStatusKnown': False, 'runtimeAuditReplayAllowed': False}

    independent = [raw_xml_control(SALE_FILE, 'sheet1.xml', 3, 'BC', 'AX'),
                   raw_xml_control(SALE_FILE, 'sheet2.xml', 2, 'E'),
                   raw_xml_control(RECEIPT_FILE, 'sheet1.xml', 3, 'S')]
    assert [x['rows'] for x in independent] == [ROW_COUNTS['sales_lines'], ROW_COUNTS['sales_funds'], ROW_COUNTS['independent_receipt_lines']]
    xml_amounts = [dec(x['amount']) for x in independent]
    converted_amounts = [SOURCE_TOTALS['sales_amount'], SOURCE_TOTALS['funds_amount'], SOURCE_TOTALS['receipt_amount']]
    if os.environ.get('TPLUS_DYNAMIC_COUNTS'):
        # A newly exported XLSX may serialize floats with sub-cent binary noise.
        # The converter reads the same cells through openpyxl; tolerate only
        # sub-1e-8 aggregate noise in the independent XML cross-check.
        assert all(abs(a - b) <= Decimal('0.00000001') for a, b in zip(xml_amounts, converted_amounts))
        assert abs(dec(independent[0]['quantity']) - SOURCE_TOTALS['sales_quantity']) <= Decimal('0.00000001')
    else:
        assert xml_amounts == converted_amounts
        assert dec(independent[0]['quantity']) == SOURCE_TOTALS['sales_quantity']
    assert len(docs) == ROW_COUNTS['sales_documents'] and len(receipts) == ROW_COUNTS['independent_receipt_documents']
    if not os.environ.get('TPLUS_DYNAMIC_COUNTS'):
        assert dec(independent[0]['quantity']) == Decimal('70992')
        assert len(docs) == 27903 and len(receipts) == 25155
        assert SOURCE_TOTALS['sales_amount'] == Decimal('23659584.19')
        assert SOURCE_TOTALS['funds_amount'] == Decimal('22462044.59')
        assert SOURCE_TOTALS['receipt_amount'] == Decimal('24307370.65')
        assert SOURCE_TOTALS['sales_rounding'] == Decimal('9111')
        assert (multi_count, unmatched_count, purpose_count) == (470, 2971, 70)
        assert len(DIAG['line_amount_difference']) == 5 and len(DIAG['settlement_difference']) == 21
        assert FK_COUNTS['sales_lines']['source_missing'] == 15
        assert [DUP_COUNTS[k] for k in ['sales_lines', 'sales_funds', 'independent_receipt_lines']] == [140, 1, 1]
    assert all(x['unresolved'] == 0 for x in FK_COUNTS.values())

    # Read back all generated records; verify normalized amounts, ids/FKs and no fabricated audit metadata.
    paths = {'sales_documents': 'data/history/sales_documents.jsonl',
             'sales_lines': 'data/history/sales_lines.jsonl',
             'sales_funds': 'data/history/sales_funds.jsonl',
             'independent_receipt_documents': 'quarantine/independent_receipt_documents.jsonl',
             'independent_receipt_lines': 'quarantine/independent_receipt_lines.jsonl'}
    readback = {}; output_fund_ids = set(); check_line_sums = defaultdict(Decimal)
    for entity, path in paths.items():
        n = 0; total = ZERO; quantity = ZERO; ids = set()
        for obj in jsonl(OUT / path):
            n += 1; assert obj['id'] not in ids; ids.add(obj['id'])
            assert obj['isHistorical'] and obj['readOnly'] and not obj['runtimeAuditReplayAllowed']
            assert all(obj[k] is None for k in ['auditStatus', 'auditedBy', 'auditedAt', 'createdBy', 'createdAt'])
            assert obj['executed'] is False and obj['lineage']['row'] >= 2
            assert isinstance(obj['amount'], str); total += dec(obj['amount'])
            if 'quantity' in obj:
                assert isinstance(obj['quantity'], str); quantity += dec(obj['quantity'])
            if entity in ['sales_lines', 'sales_funds']:
                assert obj['documentId'] in IDS['sales_documents']
            if entity == 'sales_lines':
                assert obj['skuId'] == stable_id('sku', obj['sourceProductCode'], obj['sourceColorCode'], obj['sourceSizeCode'])
                check_line_sums[obj['documentId']] += dec(obj['amount'])
                assert obj['stockQuantityContribution'] == decimal_text(-dec(obj['quantity']))
            if entity == 'sales_funds':
                assert obj['settlementId'] not in output_fund_ids
                output_fund_ids.add(obj['settlementId'])
            if entity.startswith('independent_'):
                assert not obj['stockEffect'] and not obj['fundsEffect']
                assert not obj['participatesInStockReconstruction'] and not obj['participatesInFundsReconstruction']
                assert obj['salesDocumentId'] is None and obj['quarantined']
            assert 'source' in obj
        assert n == ROW_COUNTS[entity]
        readback[entity] = {'count': n, 'amount': decimal_text(total), 'quantity': decimal_text(quantity)}
    for no, a in docs.items():
        assert check_line_sums[a['id']] == a['amount']
    assert dec(readback['sales_lines']['amount']) == SOURCE_TOTALS['sales_amount']
    assert dec(readback['sales_funds']['amount']) == SOURCE_TOTALS['funds_amount']
    assert dec(readback['independent_receipt_lines']['amount']) == SOURCE_TOTALS['receipt_amount']
    assert verify_source_hashes() == hashes
    controls['verification'] = {'result': 'PASS', 'independentRawXml': independent,
        'outputReadback': readback, 'all_source_amounts_and_counts_conserved': True,
        'all_ids_unique': True, 'funds_sales_fk_valid': True,
        'zero_runtime_import_writes': True,
        'rounding_not_allocated_to_history_lines': True,
        'source_primary_method_not_applied_to_historical_funds': True}
    for name in ['unique_key_conflicts', 'header_conflicts', 'missing_fk', 'duplicates_preserved',
                 'functional_department', 'line_amount_difference', 'settlement_difference',
                 'source_purpose', 'employee_current_department_difference']:
        save_jsonl('diagnostics/sales_' + name + '.jsonl', DIAG[name])
    controls['diagnostic_counts'] = {k: len(v) for k, v in DIAG.items()}
    save_json('controls/sales.json', controls)
    notes = OUT / 'notes/SALES.md'; notes.parent.mkdir(parents=True, exist_ok=True)
    notes.write_text('''# 历史销售/现结及独立收款转换

本目录仅为③A-2隔离转换包；未写正式存储或Demo，也没有运行历史审核命令。所有记录只读，审核状态、审核人/时间、创建人/时间均null；日期只保留日精度，原Excel日期表示另在source保留。

## 完整守恒

- 销货27,903单、79,508行，原有符号数量70,992（混合主单位），原成交金额23,659,584.19；按单取一次抹零9,111.00。库存重建只取每行原数量的负值一次，退货不二次翻号。
- 现结25,416行，以真实所属销货号关联24,932单；470单多笔、2,971单无现结。每笔id和settlementId独立，原方式/账号/正负及零值保留，合计22,462,044.59；不套当前主要方式，不按单号去重。
- 独立收款25,155单、25,622行全部隔离，原金额24,307,370.65。salesDocumentId=null，stockEffect/fundsEffect=false，不猜关联、不产生库存/资金效果。
- 销货完全重复余行140，现结1、收款1全部保留。重复源行拥有不同行身份；它们不是输出唯一键冲突。输出唯一键冲突0。

## 历史差异与空值

5行数量×已显示两位单价与原成交额不同，21单现结与成交额减抹零不同，都只输出diagnostics，不改变原金额。70单备注含库存调整仍保留来源销货和purpose标签，未改为新库存调整单，也未擅自分类为销售业绩。所有交易historicalCategorySnapshot=null，不用当前分类冒充历史快照。

销货行原部门缺1、业务员缺14；保持null并逐行诊断。文档粒度部门缺1、业务员缺8，故文档缺来源引用计数9、行粒度15。独立收款也保留原缺部门/人员，见控制表。missing_fk_count按当前实体的空/未解析字段次数计，额外拆source_missing_fk_count与unresolved_fk_count；不能跨不同粒度相加。非空未解析FK为0。

职能部门departmentId有效、hallId=null，单独标记functional_department_not_a_hall，不计孤儿。历史业务员现档部门与单据部门不同只列诊断，保持原部门，未改人员归属。hallId只来自源部门属于已确认47厅，不从仓库或员工现在所属厅反填。

## 来源与身份

直接重新只读读取原销货/现结/收款xlsx；source保留完整原行（包括重复表头的折扣/备注后缀）、原字段数值按十进制文本保存，null/空字符串区分。销售/收款主表source保留表头；全部原行则完整保存在明细source。未改原文件。来源文件SHA+Sheet+行号只保证本导出批次稳定，非跨导出版本明细主键。

销售id=stable_id('sale',原单号)，行id用raw_row_id('sale_line',...)，现结id用raw_row_id('sale_fund',...)且settlementId用独立sale_settlement来源行身份。SKU由共用SpecResolver按原商品码/颜色码/尺码码生成，仓库不参与SKU身份；所有line字段均可用于主包建立实际观察SKU及零期初累计。

## 验证

controls/sales.json保存五类六计数、全部金额/数量/抹零控制量及自验。直接解析原OOXML独立复算三Sheet行数与金额，和源读取、输出读回一致；逐笔真实销货FK、所有id/settlementId唯一、SKU确定性、审核/创建元数据全null、独立收款零效果均验证通过。所有源和业务运行文件均无写路径。
''')
    print(dumps({'result': 'PASS', 'entities': entities, 'totals': controls['totals'],
                 'diagnostics': controls['diagnostic_counts']}))


if __name__ == '__main__':
    main()
