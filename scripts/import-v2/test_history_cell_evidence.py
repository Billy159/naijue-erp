"""Synthetic OOXML only. Does not read private data or connect to a database.

Run: python -m unittest discover -s scripts/import-v2 -p test_history_cell_evidence.py
"""
import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from xml.sax.saxutils import escape
import zipfile

spec = importlib.util.spec_from_file_location("history_cell_extractor", Path(__file__).with_name("extract-history-cell-evidence.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def inline(ref, value, style="0"):
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'


def workbook(*, date1904=None, business="45614", created="45614.12345678912345", modified="", approved="2024-11-19",
             business_type="n", business_style="1", business_formula=False, sheet=None, header_override=None,
             row_override=None, shared=False, format_code="yyyy-mm-dd", apply_number_format=""):
    sheet = sheet or m.TABLES["SALES_HEADER"][1]
    headers = ("*来源编号", "*原单号", "*业务日期", "原创建时间", "原修改时间", "原审核时间")
    head = "".join(inline(f"{chr(65 + i)}1", value) for i, value in enumerate(headers))
    if header_override:
        head = header_override(head)
    business_attrs = (' t="' + business_type + '"') if business_type is not None else ""
    business_attrs += (' s="' + business_style + '"') if business_style is not None else ""
    if business_type == "inlineStr":
        business_cell = inline("C2", business, business_style or "0")
    else:
        formula = "<f>1+1</f>" if business_formula else ""
        business_cell = f'<c r="C2"{business_attrs}>{formula}<v>{business}</v></c>'
    identity = '<c r="A2" t="s"><v>0</v></c>' if shared else inline("A2", "source-001")
    body = identity + inline("B2", "0000123") + business_cell
    body += f'<c r="D2" s="2" t="n"><v>{created}</v></c>' if created else '<c r="D2" s="2" t="n"/>'
    if modified is not None:
        body += inline("E2", modified)
    body += inline("F2", approved, "2")
    rows = f'<row r="1">{head}</row><row r="2">{body}</row>'
    if row_override:
        rows = row_override(rows)
    date_property = "" if date1904 is None else f' date1904="{date1904}"'
    rels = f'<Relationships xmlns="{m.PKGREL}"><Relationship Id="sheet1" Type="{m.REL}/worksheet" Target="/xl/worksheets/header.xml"/><Relationship Id="styles" Type="{m.REL}/styles" Target="styles.xml"/>'
    if shared:
        rels += f'<Relationship Id="strings" Type="{m.REL}/sharedStrings" Target="sharedStrings.xml"/>'
    rels += "</Relationships>"
    styles = f'<styleSheet xmlns="{m.NS}"><numFmts count="2"><numFmt numFmtId="164" formatCode="{format_code}"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164" {apply_number_format}/><xf numFmtId="165"/></cellXfs></styleSheet>'
    parts = {
        "xl/workbook.xml": f'<workbook xmlns="{m.NS}" xmlns:r="{m.REL}"><workbookPr{date_property}/><sheets><sheet name="{sheet}" sheetId="1" r:id="sheet1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": rels,
        "xl/styles.xml": styles,
        "xl/worksheets/header.xml": f'<worksheet xmlns="{m.NS}"><sheetData>{rows}</sheetData></worksheet>',
    }
    if shared:
        parts["xl/sharedStrings.xml"] = f'<sst xmlns="{m.NS}"><si><r><t>source-</t></r><r><t>001</t></r><rPh><t>ignored phonetics</t></rPh></si></sst>'
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, value in parts.items():
            archive.writestr(name, value)
    return data.getvalue()


def canonical(**overrides):
    row = {"来源编号": "source-001", "原单号": "0000123", "业务日期": "45614", "原创建时间": "45614.12345678912345", "原修改时间": "", "原审核时间": "2024-11-19"}
    row.update(overrides)
    return {row["来源编号"]: row}


def extract(data, rows=None, entity="SALES_HEADER"):
    return list(m.extract_workbook(data, "20/synthetic.xlsx", m.sha(data), entity, canonical() if rows is None else rows))


def rewrite_part(data, part, rewrite):
    result = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as before, zipfile.ZipFile(result, "w") as after:
        for item in before.infolist():
            value = before.read(item.filename)
            after.writestr(item.filename, rewrite(value) if item.filename == part else value)
    return result.getvalue()


class CellEvidenceTest(unittest.TestCase):
    def test_raw_exact_precision_and_cell_style(self):
        data = workbook()
        row, = extract(data)
        self.assertEqual(row["cells"]["原创建时间"]["rawV"], "45614.12345678912345")
        temporal = row["temporalEvidence"]["原创建时间"]
        self.assertEqual(temporal["raw"], "45614.12345678912345")
        self.assertEqual(temporal["styleIndex"], 2)
        self.assertEqual(temporal["numberFormat"], "yyyy-mm-dd hh:mm:ss")
        self.assertEqual(temporal["sourceFileSha256"], m.sha(data))
        self.assertEqual(temporal["cellRef"], "D2")
        self.assertEqual(row["documentNumber"], "0000123")
        self.assertNotIn("parsed", temporal)
        self.assertNotIn("instant", temporal)

    def test_date_only_text_does_not_become_numeric_or_midnight(self):
        row, = extract(workbook())
        self.assertNotIn("原审核时间", row["temporalEvidence"])
        self.assertEqual(row["cells"]["原审核时间"]["raw"], "2024-11-19")
        self.assertEqual(row["cells"]["原审核时间"]["xmlType"], "inlineStr")

    def test_absent_date1904_has_spec_default_and_actual_raw_absence(self):
        row, = extract(workbook())
        self.assertEqual(row["dateSystem"], "1900")
        self.assertIsNone(row["date1904Raw"])
        self.assertEqual(row["dateSystemBasis"], "OOXML_DEFAULT_FALSE")

    def test_explicit_date_systems(self):
        for raw, expected in [("0", "1900"), ("false", "1900"), ("1", "1904"), ("true", "1904")]:
            with self.subTest(raw=raw):
                row, = extract(workbook(date1904=raw))
                self.assertEqual(row["temporalEvidence"]["业务日期"]["dateSystem"], expected)
                self.assertEqual(row["date1904Raw"], raw)

    def test_date_system_unknown_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_INVALID_DATE_SYSTEM"):
            extract(workbook(date1904="unknown"))

    def test_numeric_type_default_preserved(self):
        row, = extract(workbook(business_type=None))
        self.assertIsNone(row["cells"]["业务日期"]["xmlType"])
        self.assertIn("业务日期", row["temporalEvidence"])

    def test_numeric_looking_text_never_serial_evidence(self):
        row, = extract(workbook(business_type="inlineStr"))
        self.assertNotIn("业务日期", row["temporalEvidence"])

    def test_missing_cell_is_not_a_zero_or_styled_cell(self):
        row, = extract(workbook(modified=None))
        cell = row["cells"]["原修改时间"]
        self.assertFalse(cell["cellPresent"])
        self.assertEqual(cell["raw"], "")
        self.assertIsNone(cell["styleIndex"])

    def test_empty_numeric_cell_is_not_serial_zero(self):
        row, = extract(workbook(created=""), canonical(**{"原创建时间": ""}))
        self.assertNotIn("原创建时间", row["temporalEvidence"])
        self.assertIsNone(row["cells"]["原创建时间"]["rawV"])

    def test_shared_string_and_rich_text_identity(self):
        row, = extract(workbook(shared=True))
        self.assertEqual(row["sourceKey"], "source-001")

    def test_formula_cache_not_raw_source_fact(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_FORMULA_OR_DUPLICATE_VALUE"):
            extract(workbook(business_formula=True))

    def test_wrong_style_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_STYLE_INDEX_RANGE"):
            extract(workbook(business_style="999"))

    def test_builtin_not_misrepresented_as_known_local_format(self):
        row, = extract(workbook(business_style=None))
        self.assertEqual(row["temporalEvidence"]["业务日期"]["numberFormat"], "OOXML_BUILTIN_NUMFMT_0")

    def test_explicit_format_inheritance_policy_rejected(self):
        for lexical in ("0", "false", " 0 ", " false ", "no"):
            with self.subTest(lexical=lexical), self.assertRaisesRegex(m.EvidenceError, "OOXML_NUMFMT_INHERITANCE_REQUIRES_POLICY"):
                extract(workbook(apply_number_format=f'applyNumberFormat="{lexical}"'))

    def test_explicit_true_format_gate_preserves_raw_attribute(self):
        for lexical in ("1", "true"):
            with self.subTest(lexical=lexical):
                row, = extract(workbook(apply_number_format=f'applyNumberFormat="{lexical}"'))
                self.assertEqual(row["cells"]["业务日期"]["cellXf"]["applyNumberFormat"], lexical)

    def test_mismatched_raw_rejected_without_rounding(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_TEMPORAL_RAW_MISMATCH"):
            extract(workbook(), canonical(**{"原创建时间": "45614.12345678912346"}))

    def test_mismatched_document_number_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_DOCUMENT_NUMBER_MISMATCH"):
            extract(workbook(), canonical(**{"原单号": "123"}))

    def test_mismatched_source_id_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_SOURCE_ID_MISSING_OR_DUPLICATE"):
            extract(workbook(), canonical(**{"来源编号": "other-source"}))

    def test_mismatched_row_reference_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_CELL_ROW_ADDRESS"):
            extract(workbook(row_override=lambda rows: rows.replace('r="C2"', 'r="C3"')))

    def test_duplicate_cell_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_DUPLICATE_CELL"):
            extract(workbook(row_override=lambda rows: rows.replace('</row>', '<c r="A2"/></row>', 1).replace('r="A2"', 'r="A1"', 1)))

    def test_duplicate_header_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_DUPLICATE_HEADER"):
            extract(workbook(header_override=lambda head: head.replace("原修改时间", "原创建时间")))

    def test_duplicate_row_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_DUPLICATE_OR_UNSORTED_ROW"):
            extract(workbook(row_override=lambda rows: rows + '<row r="2"/>'))

    def test_wrong_expected_sheet_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_EXPECTED_HEADER_SHEET_MISSING"):
            extract(workbook(sheet="示例勿导入"))

    def test_workbook_sha_mismatch_rejected(self):
        data = workbook()
        with self.assertRaisesRegex(m.EvidenceError, "WORKBOOK_SHA_MISMATCH"):
            m.RawWorkbook(data, "0" * 64)

    def test_xml_entity_or_doctype_rejected(self):
        for declaration in [b'<!DOCTYPE a>', b'<!ENTITY x "anything">']:
            with self.subTest(declaration=declaration), self.assertRaisesRegex(m.EvidenceError, "XML_DTD_ENTITY_ENCODING_OR_LIMIT"):
                m.xml_data(declaration + b'<x/>')

    def test_utf16_dtd_entity_cannot_bypass_byte_scan(self):
        data = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE x [<!ENTITY e "expanded">]><x>&e;</x>'.encode("utf-16")
        with self.assertRaisesRegex(m.EvidenceError, "XML_DTD_ENTITY_ENCODING_OR_LIMIT"):
            m.xml_data(data)
        hostile = rewrite_part(workbook(), "xl/worksheets/header.xml", lambda value: value.decode().encode("utf-16"))
        with self.assertRaisesRegex(m.EvidenceError, "XML_DTD_ENTITY_ENCODING_OR_LIMIT"):
            extract(hostile)

    def test_wrong_worksheet_root_rejected(self):
        hostile = rewrite_part(workbook(), "xl/worksheets/header.xml", lambda value: value.replace(b"worksheet", b"notWorksheet"))
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_WORKSHEET_NAMESPACE"):
            extract(hostile)

    def test_row_outside_sheet_data_rejected(self):
        hostile = rewrite_part(workbook(), "xl/worksheets/header.xml", lambda value: value.replace(b"sheetData", b"extLst"))
        with self.assertRaisesRegex(m.EvidenceError, "OOXML_ROW_OUTSIDE_SHEET_DATA"):
            extract(hostile)

    def test_duplicate_json_key_rejected(self):
        with self.assertRaisesRegex(m.EvidenceError, "DUPLICATE_JSON_KEY"):
            m.json_data(b'{"a":1,"a":2}')

    def test_path_traversal_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "link").symlink_to(root)
            for path, error in [("../outside", "UNSAFE_INPUT_PATH"), ("/outside", "UNSAFE_INPUT_PATH"), ("link/file", "INPUT_SYMLINK")]:
                with self.subTest(path=path), self.assertRaisesRegex(m.EvidenceError, error):
                    m.child(root, path)


class AuthorizationTest(unittest.TestCase):
    def fixture(self, root):
        source, base, amendment, out = (root / name for name in ("source", "base", "amendment", "out"))
        for path in (source, base, amendment, out):
            path.mkdir()
        sources, payload, selections = {}, [], []
        for entity, (csv_path, sheet, marker) in m.TABLES.items():
            relative = "01/" + marker + ".xlsx"
            target = source / relative
            target.parent.mkdir(exist_ok=True)
            data = workbook(sheet=sheet)
            target.write_bytes(data)
            sources[relative] = m.sha(data)
            row = next(iter(canonical().values()))
            output = io.StringIO(newline="")
            writer = csv.DictWriter(output, fieldnames=list(row), lineterminator="\n")
            writer.writeheader()
            writer.writerow(row)
            csv_bytes = output.getvalue().encode()
            target = base / csv_path
            target.parent.mkdir(exist_ok=True)
            target.write_bytes(csv_bytes)
            payload.append({"file": csv_path, "bytes": len(csv_bytes), "sha256": m.sha(csv_bytes)})
            selections.append({"entity": entity, "source": "BASE_V2", "path": csv_path, "sha256": m.sha(csv_bytes), "count": 1})
        manifest = json.dumps({"importReady": False, "sourceInputSha256": sources, "payloadFiles": payload}).encode()
        (base / "manifest.json").write_bytes(manifest)
        selection = json.dumps({"baseManifestSha256": m.sha(manifest), "schemaVersion": "NAIJUE_V3_EXPLICIT_BARCODE_EXCLUSION_SELECTION_20261021", "importReady": False, "importFiles": selections}).encode()
        (amendment / "effective-import-selection.json").write_bytes(selection)
        approval = json.dumps({"scope": "EXCLUDE_EXACT_PRODUCT_BOUND_BARCODE_ARCHIVE_ROWS_FROM_THIS_IMPORT_ONLY", "nativeDbImportAuthorizedByThisFile": False, "businessDatabaseDeletionApproved": False, "sourceEvidenceDeletionApproved": False, "baseManifestSha256": m.sha(manifest), "selectionSha256": m.sha(selection)}).encode()
        approval_file = root / "approval.json"
        approval_file.write_bytes(approval)
        return {"source_root": source, "base": base, "amendment": amendment, "approval_file": approval_file, "trusted_sha": m.sha(approval), "output_parent": out}

    def test_complete_binding_private_output_and_no_raw_snapshot_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.fixture(Path(directory))
            output, report = m.run(**args)
            self.assertEqual(report["headerRows"], 2)
            self.assertEqual(report["numericCellEvidence"], 4)
            self.assertEqual(report["rawSnapshotRowsScanned"], 0)
            self.assertFalse(report["sourceRowAuthorizationConnected"])
            self.assertFalse(report["importReady"])
            self.assertEqual(m.sha((output / "evidence.jsonl").read_bytes()), report["evidenceSha256"])
            self.assertEqual((output.stat().st_mode & 0o777), 0o700)
            self.assertEqual(((output / "evidence.jsonl").stat().st_mode & 0o777), 0o600)

    def test_independent_pin_required(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.fixture(Path(directory))
            args["trusted_sha"] = ""
            with self.assertRaisesRegex(m.EvidenceError, "INDEPENDENT_APPROVAL_PIN_REQUIRED"):
                m.run(**args)

    def test_wrong_approval_pin_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.fixture(Path(directory))
            args["trusted_sha"] = "0" * 64
            with self.assertRaisesRegex(m.EvidenceError, "APPROVAL_PIN_MISMATCH"):
                m.run(**args)

    def test_changed_manifest_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.fixture(Path(directory))
            (args["base"] / "manifest.json").write_bytes(b"{}")
            with self.assertRaisesRegex(m.EvidenceError, "MANIFEST_APPROVAL_MISMATCH"):
                m.run(**args)

    def test_changed_selection_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.fixture(Path(directory))
            (args["amendment"] / "effective-import-selection.json").write_bytes(b"{}")
            with self.assertRaisesRegex(m.EvidenceError, "SELECTION_APPROVAL_MISMATCH"):
                m.run(**args)

    def test_changed_csv_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.fixture(Path(directory))
            (args["base"] / m.TABLES["SALES_HEADER"][0]).write_text("changed", encoding="utf-8")
            with self.assertRaisesRegex(m.EvidenceError, "HEADER_CSV_HASH_OR_SIZE"):
                m.run(**args)

    def test_changed_original_rejected_and_partial_output_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.fixture(Path(directory))
            (args["source_root"] / "01/历史调拨.xlsx").write_bytes(workbook(business="45615"))
            with self.assertRaisesRegex(m.EvidenceError, "WORKBOOK_SHA_MISMATCH"):
                m.run(**args)
            self.assertEqual(list(args["output_parent"].iterdir()), [])

    def test_output_inside_inputs_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.fixture(Path(directory))
            args["output_parent"] = args["source_root"]
            with self.assertRaisesRegex(m.EvidenceError, "OUTPUT_MUST_BE_OUTSIDE_INPUT_AND_REPO"):
                m.run(**args)


if __name__ == "__main__":
    unittest.main()
