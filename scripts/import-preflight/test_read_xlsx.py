#!/usr/bin/env python3
"""All workbooks are small, explicitly synthetic ZIP/XML fixtures generated in temp dirs."""
import importlib.util
import json
import stat
import sys
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("offline_xlsx", HERE / "read-xlsx.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
S = reader.MAIN
R = reader.DOCREL
P = reader.PKGREL


def worksheet(rows):
    return f'<worksheet xmlns="{S}"><sheetData>{"".join(rows)}</sheetData></worksheet>'


def cell(ref, raw=None, kind="str", formula=None):
    value = "" if raw is None else f"<v>{escape(raw)}</v>"
    f = "" if formula is None else f"<f>{escape(formula)}</f>"
    return f'<c r="{ref}" t="{kind}">{f}{value}</c>'


def row(index, *cells):
    return f'<row r="{index}">{"".join(cells)}</row>'


def parts(sheet_name="04客户", data=None):
    if data is None:
        headers = ["*来源编号", "*原编码", "*名称", "*状态"]
        data = [row(1, *(cell(f"{chr(65+i)}1", text) for i, text in enumerate(headers))),
                row(2, cell("A2", "000001"), cell("B2", "000001"), cell("C2", "SYNTHETIC CUSTOMER"), cell("D2", "正常"))]
    return {
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
        "_rels/.rels": f'<Relationships xmlns="{P}"><Relationship Id="r0" Type="{R}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": f'<workbook xmlns="{S}" xmlns:r="{R}"><workbookPr date1904="0"/><sheets><sheet name="{sheet_name}" sheetId="1" r:id="r1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": f'<Relationships xmlns="{P}"><Relationship Id="r1" Type="{R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": worksheet(data),
    }


class ReadXlsxTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="synthetic-offline-import-")
        self.path = Path(self.temp.name) / "SYNTHETIC.xlsx"

    def tearDown(self):
        self.temp.cleanup()

    def write(self, files=None):
        files = parts() if files is None else files
        with zipfile.ZipFile(self.path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in files.items():
                archive.writestr(name, content)
        return self.path

    def assert_code(self, files, code):
        self.write(files)
        with self.assertRaises(reader.XlsxPreflightError) as context:
            reader.read_workbook(self.path)
        self.assertEqual(context.exception.issue["code"], code)
        return context.exception.issue

    def test_preserve_shared_inline_strings_decimal_lexemes_formula_and_date_system(self):
        data = [row(1, cell("A1", "*来源编号")), row(2, cell("A2", "0", "s"), cell("B2", "9999999999999999.99", "n"),
            '<c r="C2" t="inlineStr"><is><r><t>00</t></r><r><t xml:space="preserve"> 1 </t></r></is></c>',
            cell("D2", "128.50", "n", "1+1"), cell("E2", "46315.375", "n"))]
        files = parts(data=data)
        files["xl/sharedStrings.xml"] = f'<sst xmlns="{S}"><si><t>000001</t></si></sst>'
        files["xl/workbook.xml"] = files["xl/workbook.xml"].replace('date1904="0"', 'date1904="1"')
        result = reader.read_workbook(self.write(files))
        cells = result["sheets"][0]["rows"][0]["cells"]
        self.assertEqual(result["dateSystem"], "1904")
        self.assertEqual(cells[0], {"kind": "text", "raw": "000001"})
        self.assertEqual(cells[1], {"kind": "number", "raw": "9999999999999999.99"})
        self.assertEqual(cells[2]["raw"], "00 1 ")
        self.assertEqual(cells[3], {"kind": "formula", "raw": "128.50", "formula": "1+1"})
        self.assertEqual(cells[4]["raw"], "46315.375")

    def test_phonetic_annotations_never_modify_display_text_or_identity(self):
        files = parts(data=[row(1, cell("A1", "*来源编号")), row(2, cell("A2", "0", "s"), '<c r="B2" t="inlineStr"><is><r><t>00</t></r><rPh sb="0" eb="2"><t>READING</t></rPh><r><t>0001</t></r></is></c>')])
        files["xl/sharedStrings.xml"] = f'<sst xmlns="{S}"><si><t>000001</t><rPh sb="0" eb="6"><t>READING</t></rPh></si></sst>'
        cells = reader.read_workbook(self.write(files))["sheets"][0]["rows"][0]["cells"]
        self.assertEqual([c["raw"] for c in cells], ["000001", "000001"])

    def test_formula_without_cache_is_preserved_not_blank(self):
        result = reader.read_workbook(self.write(parts(data=[row(1, cell("A1", "*来源编号")), row(2, cell("A2", formula="1+1"))])))
        self.assertEqual(result["sheets"][0]["rows"][0]["cells"][0]["kind"], "formula")
        self.assertIsNone(result["sheets"][0]["rows"][0]["cells"][0]["raw"])

    def test_known_guide_is_skipped_but_mistyped_name_is_not(self):
        result = reader.read_workbook(self.write(parts(sheet_name="示例勿导入")))
        self.assertEqual(result["sheets"][0]["rows"], [])
        result = reader.read_workbook(self.write(parts(sheet_name="示例勿导人")))
        self.assertEqual(len(result["sheets"][0]["rows"]), 1)

    def test_blank_formatting_rows_ignored_not_invented(self):
        result = reader.read_workbook(self.write(parts(data=[row(1, cell("A1", "*来源编号")), row(2, cell("A2", None, "n"))])))
        self.assertEqual(result["sheets"][0]["rows"], [])

    def test_doctype_rejected_in_utf8_and_utf16_even_unused_part(self):
        for encoding in ("utf-8", "utf-16"):
            with self.subTest(encoding=encoding):
                files = parts()
                files["unused.xml"] = '<!DOCTYPE x [<!ENTITY sample "SYNTHETIC">]><x>&sample;</x>'.encode(encoding)
                self.assert_code(files, "XLSX_XML_DECLARATION_REJECTED")

    def test_external_relationship_and_macro_rejected(self):
        files = parts()
        files["_rels/.rels"] = f'<Relationships xmlns="{P}"><Relationship Id="external" Type="{R}/hyperlink" Target="https://example.invalid/" TargetMode="External"/></Relationships>'
        self.assert_code(files, "XLSX_EXTERNAL_OR_ACTIVE_RELATIONSHIP")
        files = parts(); files["xl/vbaProject.bin"] = b"SYNTHETIC NOT EXECUTABLE"
        self.assert_code(files, "XLSX_ACTIVE_CONTENT_REJECTED")
        files = parts(); files["[Content_Types].xml"] = files["[Content_Types].xml"].replace("spreadsheetml.sheet.main", "sheet.macroEnabled.main")
        self.assert_code(files, "XLSX_ACTIVE_CONTENT_REJECTED")

    def test_zip_path_traversal_and_package_escape_rejected(self):
        files = parts(); files["../SYNTHETIC.xml"] = "<x/>"
        self.assert_code(files, "XLSX_UNSAFE_ARCHIVE_MEMBER")
        files = parts(); files["xl/_rels/workbook.xml.rels"] = files["xl/_rels/workbook.xml.rels"].replace('Target="worksheets/sheet1.xml"', 'Target="../../escape.xml"')
        self.assert_code(files, "XLSX_RELATIONSHIP_TRAVERSAL")

    def test_safe_opc_parent_reference_does_not_extract_or_escape(self):
        files = parts(); files["xl/worksheets/_rels/sheet1.xml.rels"] = f'<Relationships xmlns="{P}"><Relationship Id="table" Type="{R}/table" Target="../tables/table1.xml"/></Relationships>'
        files["xl/tables/table1.xml"] = '<table/>'
        result = reader.read_workbook(self.write(files))
        self.assertEqual(result["sheets"][0]["rows"][0]["cells"][0]["raw"], "000001")

    def test_zip_symlink_and_duplicate_member_rejected(self):
        self.write()
        with zipfile.ZipFile(self.path, "a") as archive:
            info = zipfile.ZipInfo("synthetic-link"); info.create_system = 3; info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, "target")
        with self.assertRaises(reader.XlsxPreflightError) as context:
            reader.read_workbook(self.path)
        self.assertEqual(context.exception.issue["code"], "XLSX_UNSAFE_ARCHIVE_MEMBER")

    def test_row_cell_shared_string_and_column_errors_are_located(self):
        self.assert_code(parts(data=[row(1, cell("A1", "header")), row(2, cell("A2", "0", "s"))]), "XLSX_SHARED_STRING_INVALID")
        issue = self.assert_code(parts(data=[row(1, cell("A1", "header")), row(2, cell("IW2", "SYNTHETIC"))]), "XLSX_COLUMN_LIMIT")
        self.assertEqual((issue["sheet"], issue["excelRow"], issue["field"]), ("04客户", 2, "IW2"))
        self.assert_code(parts(data=[row(1, cell("A1", "header")), row(2, cell("A3", "SYNTHETIC"))]), "XLSX_CELL_LOCATION_INVALID")
        self.assert_code(parts(data=[row(1, cell("A1", "header")), row(2, cell("A2", "SYNTHETIC"), cell("A2", "OTHER"))]), "XLSX_DUPLICATE_CELL")

    def test_compressed_decompressed_row_and_text_bounds_fail_not_truncate(self):
        for limit, value, code in (("MAX_COMPRESSED", 1, "XLSX_COMPRESSED_LIMIT"), ("MAX_PART", 1, "XLSX_PART_SIZE_LIMIT"), ("MAX_UNCOMPRESSED", 1, "XLSX_UNCOMPRESSED_LIMIT"), ("MAX_ROWS", 1, "XLSX_ROW_LIMIT"), ("MAX_CELLS", 1, "XLSX_CELL_LIMIT"), ("MAX_AGGREGATE_TEXT", 1, "XLSX_AGGREGATE_TEXT_LIMIT")):
            with self.subTest(limit=limit):
                previous = getattr(reader, limit)
                try:
                    setattr(reader, limit, value)
                    issue = self.assert_code(parts(), code)
                    self.assertEqual((issue["severity"], issue["category"]), ("CAPABILITY", "TOOL_RESOURCE_LIMIT"))
                finally:
                    setattr(reader, limit, previous)
        self.assert_code(parts(data=[row(1, cell("A1", "header")), row(2, cell("A2", "X" * 32769))]), "XLSX_CELL_TEXT_LIMIT")

    def test_sparse_dense_and_xml_structural_budgets_reject_before_allocation(self):
        old_cells, old_elements, old_depth = reader.MAX_CELLS, reader.MAX_XML_ELEMENTS, reader.MAX_XML_DEPTH
        try:
            reader.MAX_CELLS = 8
            self.assert_code(parts(data=[row(1, cell("A1", "header")), row(2, cell("IV2", "SYNTHETIC"))]), "XLSX_DENSE_CELL_LIMIT")
            reader.MAX_CELLS = old_cells
            reader.MAX_XML_ELEMENTS = 8
            self.assert_code(parts(), "XLSX_XML_ELEMENT_LIMIT")
            reader.MAX_XML_ELEMENTS = old_elements
            reader.MAX_XML_DEPTH = 8
            files = parts(); files["xl/worksheets/sheet1.xml"] = "<x>" * 9 + "</x>" * 9
            self.assert_code(files, "XLSX_XML_DEPTH_LIMIT")
        finally:
            reader.MAX_CELLS, reader.MAX_XML_ELEMENTS, reader.MAX_XML_DEPTH = old_cells, old_elements, old_depth

    def test_batch_budget_is_shared_across_workbooks_before_accumulation(self):
        self.write()
        budget = reader.new_batch_budget()
        first = reader.read_workbook(self.path, budget)
        self.assertEqual(len(first["sheets"][0]["rows"]), 1)
        old_rows = reader.MAX_ROWS
        try:
            reader.MAX_ROWS = budget["rows"] + 1
            with self.assertRaises(reader.XlsxPreflightError) as context:
                reader.read_workbook(self.path, budget)
            self.assertEqual(context.exception.issue["code"], "XLSX_ROW_LIMIT")
        finally:
            reader.MAX_ROWS = old_rows

    def test_cli_unsupported_format_is_capability_not_fabricated_missing_business_data(self):
        unsupported = Path(self.temp.name) / "SYNTHETIC.xls"
        unsupported.write_text("SYNTHETIC unsupported format, not business data")
        command = ["node", str(HERE / "run.mjs"), "--batch", "SYNTHETIC-BATCH", "--namespace", "synthetic.offline", "--mode", "FINAL", str(unsupported)]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertEqual(completed.returncode, 3, completed.stderr)
        report = json.loads(completed.stdout)
        self.assertEqual(report["dataStatus"], "PENDING")
        self.assertEqual(report["readerIssues"][0]["severity"], "CAPABILITY")
        self.assertFalse(any(issue["severity"] == "ERROR" for issue in report["issues"]))
        self.assertEqual(report["identityManifest"]["identities"], [])
        self.assertEqual((report["databaseExecuted"], report["importReady"], report["publishReady"]), (False, False, False))

    def test_cli_old_eight_and_optional_ninth_original_payment_method_snapshot_column(self):
        headers = ["*来源编号", "*单据来源编号", "*原收退行号", "*账户来源编号", "*方向", "*金额", "原账户显示名", "原方式显示名"]
        values = ["SYN-SETTLEMENT", "SYN-SALE", "1", "SYN-ACCOUNT", "收款", "10.00", "SYNTHETIC ACCOUNT", "SYNTHETIC METHOD NAME ONLY"]
        target_ids = []
        for extended in (False, True):
            with self.subTest(extended=extended):
                source_headers = headers + (["原收款方式来源编号"] if extended else [])
                source_values = values + (["000009"] if extended else [])
                data = [row(1, *(cell(f"{chr(65+i)}1", text) for i, text in enumerate(source_headers))), row(2, *(cell(f"{chr(65+i)}2", text) for i, text in enumerate(source_values)))]
                self.write(parts(sheet_name="15历史收退记录", data=data))
                completed = subprocess.run(["node", str(HERE / "run.mjs"), "--batch", "SYNTHETIC", "--namespace", "synthetic.offline", "--mode", "STAGED", str(self.path)], capture_output=True, text=True, timeout=60)
                self.assertEqual(completed.returncode, 0, completed.stderr)
                report = json.loads(completed.stdout)
                record = report["records"][0]
                self.assertEqual(record["normalizedValues"]["原收款方式来源编号"], "000009" if extended else None)
                self.assertFalse(any(issue["code"] == "INPUT_HEADER_MISMATCH" for issue in report["issues"]))
                self.assertEqual(report["historicalPaymentMethodSnapshotPolicy"]["inferredFromDisplayNameOrCurrentAccount"], False)
                target_ids.append(record["targetId"])
        self.assertEqual(target_ids[0], target_ids[1])

    def test_cli_direct_xlsx_no_db_write_and_inputs_unchanged(self):
        self.write()
        before = self.path.read_bytes()
        command = ["node", str(HERE / "run.mjs"), "--batch", "SYNTHETIC-BATCH", "--namespace", "synthetic.offline", "--mode", "STAGED", str(self.path)]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)
        self.assertEqual(report["readerIssues"], [])
        self.assertEqual(report["records"][0]["sourceId"], "000001")
        self.assertEqual(report["records"][0]["normalizedValues"]["*原编码"], "000001")
        self.assertEqual((report["databaseExecuted"], report["importReady"], report["publishReady"]), (False, False, False))
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(sorted(p.name for p in Path(self.temp.name).iterdir()), ["SYNTHETIC.xlsx"])


if __name__ == "__main__":
    unittest.main()
