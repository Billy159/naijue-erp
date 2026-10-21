#!/usr/bin/env python3
"""Bounded, read-only XLSX bridge for the offline operator preflight, Python 3 stdlib only.

No archive extraction, formula evaluation, macro execution, network access, date guessing,
float conversion, database operation, or source-file modification. XML numeric lexemes
and the workbook date system survive unchanged for the TypeScript validator.
"""
from __future__ import annotations
import hashlib
import io
import os
import json
import posixpath
import re
import stat
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOCREL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKGREL = "http://schemas.openxmlformats.org/package/2006/relationships"
MAX_COMPRESSED = 32 * 1024 * 1024
MAX_BATCH_COMPRESSED = 64 * 1024 * 1024
MAX_BATCH_UNCOMPRESSED = 128 * 1024 * 1024
MAX_FILES = 64
MAX_UNCOMPRESSED = 64 * 1024 * 1024
MAX_PART = 24 * 1024 * 1024
MAX_MEMBERS = 2048
MAX_SHEETS = 128
MAX_ROWS = 100_000
MAX_CELLS = 2_000_000
MAX_COLUMNS = 256
MAX_TEXT = 32768
MAX_AGGREGATE_TEXT = 32_000_000
MAX_XML_ELEMENTS = 500_000
MAX_XML_DEPTH = 64
GUIDE_SHEETS = frozenset(("字段说明", "示例勿导入", "样例说明", "样例金额核对", "切换与历史边界", "分摊与舍入说明"))
CELL_KINDS = {"n": "number", "b": "boolean", "e": "error", "d": "date"}


class XlsxPreflightError(Exception):
    def __init__(self, code: str, reason: str, sheet: str = "", excel_row: int | None = None, field: str = "", raw_value: str | None = None):
        super().__init__(reason)
        resource_cap = "_LIMIT" in code
        unsupported = code in {"XLSX_EXTENSION_REQUIRED", "XLSX_COMPRESSION_UNSUPPORTED", "XLSX_ENCRYPTED_ARCHIVE", "XLSX_READ_FAILED"}
        self.issue = {"code": code, "reason": reason, "sheet": sheet, "excelRow": excel_row, "field": field, "rawValue": raw_value,
                      "severity": "CAPABILITY" if resource_cap or unsupported else "ERROR",
                      "category": "TOOL_RESOURCE_LIMIT" if resource_cap else "TOOL_SUPPORT_OR_ACCESS_GAP" if unsupported else "SOURCE_PACKAGE_REJECTED"}


def reject(code, reason, **position):
    raise XlsxPreflightError(code, reason, **position)


def safe_part(name: str) -> bool:
    return bool(name) and not name.startswith("/") and "\\" not in name and ":" not in name and all(p not in ("", ".", "..") for p in name.rstrip("/").split("/"))


def checked_xml_bytes(archive, name):
    if name not in archive.namelist():
        reject("XLSX_REQUIRED_PART_MISSING", f"Missing XLSX part: {name}", field=name)
    raw = archive.read(name)
    # Check decoded text too, so UTF-16 XML cannot disguise declarations with NULs.
    declaration_check = raw.replace(b"\x00", b"").upper()
    if b"<!DOCTYPE" in declaration_check or b"<!ENTITY" in declaration_check:
        reject("XLSX_XML_DECLARATION_REJECTED", f"DOCTYPE/ENTITY is not accepted: {name}", field=name)
    return raw


class BudgetTreeBuilder(ET.TreeBuilder):
    """Reject structurally excessive XML while parsing, before building its full tree."""
    def __init__(self, part):
        super().__init__()
        self.part = part
        self.element_count = 0
        self.stack = []

    def start(self, tag, attributes):
        self.element_count += 1
        if self.element_count > MAX_XML_ELEMENTS:
            reject("XLSX_XML_ELEMENT_LIMIT", "XML structural element budget exceeded; not truncated.", field=self.part)
        if len(self.stack) >= MAX_XML_DEPTH:
            reject("XLSX_XML_DEPTH_LIMIT", "XML nesting depth exceeded; not truncated.", field=self.part)
        if len(attributes) > 128 or sum(len(k) + len(v) for k, v in attributes.items()) > 131072:
            reject("XLSX_XML_ATTRIBUTE_LIMIT", "XML attribute budget exceeded; not truncated.", field=self.part)
        self.stack.append([tag, 0])
        return super().start(tag, attributes)

    def data(self, text):
        if self.stack:
            self.stack[-1][1] += len(text)
            limit = MAX_TEXT if self.stack[-1][0] in (f"{{{MAIN}}}t", f"{{{MAIN}}}v", f"{{{MAIN}}}f") else 1024 * 1024
            if self.stack[-1][1] > limit:
                reject("XLSX_CELL_TEXT_LIMIT" if limit == MAX_TEXT else "XLSX_XML_TEXT_LIMIT", "XML text budget exceeded during parsing; not truncated.", field=self.part)
        return super().data(text)

    def end(self, tag):
        self.stack.pop()
        return super().end(tag)


def xml_part(archive, name):
    raw = checked_xml_bytes(archive, name)
    try:
        parser = ET.XMLParser(target=BudgetTreeBuilder(name))
        # Chunked feed also bounds parser-side buffering before each budget callback.
        for start in range(0, len(raw), 65536):
            parser.feed(raw[start:start + 65536])
        return parser.close()
    except ET.ParseError as error:
        reject("XLSX_INVALID_XML", f"Malformed XML in {name}: {error}", field=name)


def column_index(reference: str, row_number: int, sheet: str) -> int:
    match = re.fullmatch(r"([A-Z]{1,3})([1-9][0-9]{0,6})", reference)
    if not match or int(match[2]) != row_number or int(match[2]) > 1048576:
        reject("XLSX_CELL_LOCATION_INVALID", "Cell reference does not match its Excel row.", sheet=sheet, excel_row=row_number, field=reference)
    column = 0
    for letter in match[1]:
        column = column * 26 + ord(letter) - 64
    if column > MAX_COLUMNS:
        reject("XLSX_COLUMN_LIMIT", f"Column exceeds bounded offline profile ({MAX_COLUMNS}); not truncated.", sheet=sheet, excel_row=row_number, field=reference)
    return column - 1


def visible_string(container):
    """OOXML display text only: direct t or rich-text r/t, never phonetic rPh/t."""
    if container is None:
        return ""
    pieces = []
    for child in container:
        if child.tag == f"{{{MAIN}}}t":
            pieces.append(child.text or "")
        elif child.tag == f"{{{MAIN}}}r":
            pieces.extend(text.text or "" for text in child if text.tag == f"{{{MAIN}}}t")
    return "".join(pieces)


def cell_value(cell, strings, sheet, row_number):
    reference = cell.attrib.get("r", "")
    value = cell.find(f"{{{MAIN}}}v")
    raw = value.text if value is not None else None
    formula = cell.find(f"{{{MAIN}}}f")
    if formula is not None:
        result = {"kind": "formula", "raw": raw, "formula": formula.text or ""}
    else:
        kind = cell.attrib.get("t", "n")
        if kind == "s":
            if raw is None or not re.fullmatch(r"[0-9]+", raw) or len(raw) > 9 or int(raw) >= len(strings):
                reject("XLSX_SHARED_STRING_INVALID", "Shared-string index is missing or outside its table.", sheet=sheet, excel_row=row_number, field=reference, raw_value=raw)
            result = {"kind": "text", "raw": strings[int(raw)]}
        elif kind == "inlineStr":
            result = {"kind": "text", "raw": visible_string(cell.find(f"{{{MAIN}}}is"))}
        elif kind == "str":
            result = {"kind": "text", "raw": raw or ""}
        elif kind in CELL_KINDS:
            result = {"kind": CELL_KINDS[kind] if raw is not None else "blank", "raw": raw}
        else:
            reject("XLSX_CELL_TYPE_UNSUPPORTED", "Unsupported XLSX cell type; not coerced.", sheet=sheet, excel_row=row_number, field=reference, raw_value=kind)
    for text in (result["raw"], result.get("formula")):
        if text is not None and len(text) > MAX_TEXT:
            reject("XLSX_CELL_TEXT_LIMIT", "Cell text/formula exceeds bounded profile; not truncated.", sheet=sheet, excel_row=row_number, field=reference)
    # Metadata is preserved, not trusted as date or identity conversion authority.
    if "s" in cell.attrib:
        if not re.fullmatch(r"[0-9]{1,10}", cell.attrib["s"]):
            reject("XLSX_STYLE_INDEX_INVALID", "Invalid style-index metadata; not guessed.", sheet=sheet, excel_row=row_number, field=reference)
        result["styleIndex"] = cell.attrib["s"]
    return result


def new_batch_budget():
    return {"compressed": 0, "uncompressed": 0, "rows": 0, "cells": 0, "dense_cells": 0, "text": 0, "sheets": 0}


def read_workbook(path: Path, budget=None):
    budget = new_batch_budget() if budget is None else budget
    if path.suffix.lower() != ".xlsx":
        reject("XLSX_EXTENSION_REQUIRED", "Only .xlsx is supported; .xls/.xlsm are not silently accepted.")
    if path.is_symlink() or not path.is_file():
        reject("XLSX_SOURCE_NOT_REGULAR_FILE", "Source must be a regular, non-symlink file.")
    if path.stat().st_size > MAX_COMPRESSED:
        reject("XLSX_COMPRESSED_LIMIT", "Compressed XLSX exceeds 32 MiB; not truncated.")
    # Hash and parse one bounded snapshot, not two reads that could disagree.
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as source:
        if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
            reject("XLSX_SOURCE_NOT_REGULAR_FILE", "Source is not a regular file.")
        payload = source.read(MAX_COMPRESSED + 1)
    if len(payload) > MAX_COMPRESSED:
        reject("XLSX_COMPRESSED_LIMIT", "Compressed XLSX grew beyond 32 MiB; not truncated.")
    budget["compressed"] += len(payload)
    if budget["compressed"] > MAX_BATCH_COMPRESSED:
        reject("XLSX_BATCH_COMPRESSED_LIMIT", "Batch compressed XLSX bytes exceed 64 MiB; not truncated.")
    digest = hashlib.sha256(payload).hexdigest()
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
    except (zipfile.BadZipFile, OSError) as error:
        reject("XLSX_INVALID_ARCHIVE", f"Cannot open XLSX: {error}")
    with archive:
        members = archive.infolist()
        if len(members) > MAX_MEMBERS:
            reject("XLSX_MEMBER_LIMIT", "XLSX has too many ZIP members; not truncated.")
        names = set()
        total_size = 0
        for part in members:
            name = part.filename
            if not safe_part(name) or name in names or stat.S_ISLNK((part.external_attr >> 16) & 0xFFFF):
                reject("XLSX_UNSAFE_ARCHIVE_MEMBER", "ZIP member is duplicate, symlink, absolute, or traversing.", field=name)
            names.add(name)
            if part.flag_bits & 1:
                reject("XLSX_ENCRYPTED_ARCHIVE", "Encrypted XLSX is unsupported.", field=name)
            if part.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                reject("XLSX_COMPRESSION_UNSUPPORTED", "Unsupported ZIP compression method.", field=name)
            if part.file_size > MAX_PART:
                reject("XLSX_PART_SIZE_LIMIT", "Uncompressed XLSX part exceeds 24 MiB; not truncated.", field=name)
            total_size += part.file_size
            budget["uncompressed"] += part.file_size
            if budget["uncompressed"] > MAX_BATCH_UNCOMPRESSED:
                reject("XLSX_BATCH_UNCOMPRESSED_LIMIT", "Batch uncompressed XLSX bytes exceed 128 MiB; not truncated.")
            if total_size > MAX_UNCOMPRESSED:
                reject("XLSX_UNCOMPRESSED_LIMIT", "Total uncompressed XLSX exceeds 64 MiB; not truncated.")
            lower = name.lower()
            if "vbaproject" in lower or lower.startswith("xl/externallinks/") or lower.startswith("xl/embeddings/") or lower.startswith("xl/macrosheets/"):
                reject("XLSX_ACTIVE_CONTENT_REJECTED", "Macros, embedded objects, or external workbook links are not accepted.", field=name)
        # Validate all relationship documents, including unused guide-sheet relationships.
        for name in names:
            if name.endswith(".rels"):
                root = xml_part(archive, name)
                for rel in root:
                    target = rel.attrib.get("Target", "")
                    rel_type = rel.attrib.get("Type", "").lower()
                    if rel.attrib.get("TargetMode", "Internal").lower() != "internal" or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or "vbaproject" in rel_type or "externallink" in rel_type:
                        reject("XLSX_EXTERNAL_OR_ACTIVE_RELATIONSHIP", "External or active XLSX relationship rejected.", field=name, raw_value=target)
                    # OPC legitimately uses ../tables from a worksheet relationship. Resolve
                    # against the owning part, never the filesystem, and reject package escape.
                    owner_dir = name.rsplit("/_rels/", 1)[0] if "/_rels/" in name else ""
                    normalized = posixpath.normpath(target.lstrip("/") if target.startswith("/") else posixpath.join(owner_dir, target))
                    if "\\" in target or "\x00" in target or not safe_part(normalized):
                        reject("XLSX_RELATIONSHIP_TRAVERSAL", "XLSX relationship escapes the ZIP package.", field=name, raw_value=target)
        # Reject declarations even in otherwise unused XML/guide parts.
        for name in names:
            if name.endswith(".xml"):
                checked_xml_bytes(archive, name)
        content_types = xml_part(archive, "[Content_Types].xml")
        for item in content_types:
            if any(word in item.attrib.get("ContentType", "").lower() for word in ("macroenabled", "vbaproject", "macrosheet")):
                reject("XLSX_ACTIVE_CONTENT_REJECTED", "Macro-enabled XLSX content type rejected.", field="[Content_Types].xml")
        workbook = xml_part(archive, "xl/workbook.xml")
        workbook_properties = workbook.find(f"{{{MAIN}}}workbookPr")
        date1904 = workbook_properties.attrib.get("date1904", "0") if workbook_properties is not None else "0"
        if date1904 not in ("0", "1", "false", "true"):
            reject("XLSX_DATE_SYSTEM_INVALID", "Unknown workbook date1904 metadata; no guess.")
        date_system = "1904" if date1904 in ("1", "true") else "1900"
        relations = {}
        for rel in xml_part(archive, "xl/_rels/workbook.xml.rels"):
            key = rel.attrib.get("Id", "")
            if not key or key in relations:
                reject("XLSX_RELATIONSHIP_ID_INVALID", "Missing or duplicate workbook relationship ID.")
            relations[key] = (rel.attrib.get("Target", ""), rel.attrib.get("Type", ""))
        strings = []
        aggregate_text = budget["text"]
        if "xl/sharedStrings.xml" in names:
            for item in xml_part(archive, "xl/sharedStrings.xml"):
                text = visible_string(item)
                if len(text) > MAX_TEXT:
                    reject("XLSX_CELL_TEXT_LIMIT", "Shared string exceeds bounded text limit; not truncated.", field="xl/sharedStrings.xml")
                aggregate_text += len(text)
                budget["text"] = aggregate_text
                if aggregate_text > MAX_AGGREGATE_TEXT or len(strings) >= MAX_CELLS:
                    reject("XLSX_AGGREGATE_TEXT_LIMIT", "Shared strings exceed bounded aggregate profile.")
                strings.append(text)
        sheet_list = workbook.find(f"{{{MAIN}}}sheets")
        if sheet_list is None or len(sheet_list) > MAX_SHEETS:
            reject("XLSX_SHEET_LIMIT_OR_MISSING", "Workbook sheets are missing or exceed bounded profile.")
        budget["sheets"] += len(sheet_list)
        if budget["sheets"] > MAX_SHEETS:
            reject("XLSX_BATCH_SHEET_LIMIT", "Batch exceeds bounded aggregate sheet count; not truncated.")
        results = []
        seen_sheets = set()
        row_count, cell_count, dense_cell_count = budget["rows"], budget["cells"], budget["dense_cells"]
        for sheet in sheet_list:
            name = sheet.attrib.get("name", "")
            if not name or name in seen_sheets:
                reject("XLSX_SHEET_NAME_INVALID", "Missing or duplicate sheet name.", sheet=name)
            seen_sheets.add(name)
            rid = sheet.attrib.get(f"{{{DOCREL}}}id", "")
            target, rel_type = relations.get(rid, ("", ""))
            if not rel_type.endswith("/worksheet") or not target:
                reject("XLSX_WORKSHEET_RELATIONSHIP_INVALID", "Worksheet relationship missing or wrong type.", sheet=name)
            part = target.lstrip("/") if target.startswith("/") else posixpath.join("xl", target)
            if not safe_part(part) or not part.startswith("xl/"):
                reject("XLSX_WORKSHEET_PATH_INVALID", "Worksheet part is outside the workbook.", sheet=name)
            if part not in names:
                reject("XLSX_REQUIRED_PART_MISSING", "Worksheet ZIP part is missing.", sheet=name, field=part)
            # Exact, known guide/example names only. Their bytes remain covered by file digest.
            if name in GUIDE_SHEETS:
                results.append({"name": name, "headerRow": 1, "headers": [], "rows": []})
                continue
            xml = xml_part(archive, part)
            rows = []
            headers = []
            seen_rows = set()
            data = xml.find(f"{{{MAIN}}}sheetData")
            if data is None:
                reject("XLSX_SHEET_DATA_MISSING", "Worksheet has no sheetData.", sheet=name)
            for row in data:
                index_raw = row.attrib.get("r", "")
                if not re.fullmatch(r"[1-9][0-9]{0,6}", index_raw) or int(index_raw) > 1048576:
                    reject("XLSX_ROW_LOCATION_INVALID", "Missing or invalid Excel row position.", sheet=name, raw_value=index_raw)
                row_number = int(index_raw)
                if row_number in seen_rows:
                    reject("XLSX_DUPLICATE_ROW", "Duplicate Excel row position.", sheet=name, excel_row=row_number)
                seen_rows.add(row_number)
                row_count += 1
                budget["rows"] = row_count
                if row_count > MAX_ROWS:
                    reject("XLSX_ROW_LIMIT", "Workbook exceeds bounded row count; not truncated.", sheet=name, excel_row=row_number)
                cells = []
                seen_columns = set()
                for cell in row:
                    if cell.tag != f"{{{MAIN}}}c":
                        continue
                    reference = cell.attrib.get("r", "")
                    column = column_index(reference, row_number, name)
                    if column in seen_columns:
                        reject("XLSX_DUPLICATE_CELL", "Duplicate Excel cell position.", sheet=name, excel_row=row_number, field=reference)
                    seen_columns.add(column)
                    cell_count += 1
                    budget["cells"] = cell_count
                    if cell_count > MAX_CELLS:
                        reject("XLSX_CELL_LIMIT", "Workbook exceeds bounded cell count; not truncated.", sheet=name, excel_row=row_number, field=reference)
                    result = cell_value(cell, strings, name, row_number)
                    aggregate_text += len(result["raw"] or "") + len(result.get("formula", ""))
                    budget["text"] = aggregate_text
                    if aggregate_text > MAX_AGGREGATE_TEXT:
                        reject("XLSX_AGGREGATE_TEXT_LIMIT", "Workbook text exceeds bounded aggregate profile.", sheet=name, excel_row=row_number, field=reference)
                    padding = max(0, column + 1 - len(cells))
                    dense_cell_count += padding
                    budget["dense_cells"] = dense_cell_count
                    if dense_cell_count > MAX_CELLS:
                        reject("XLSX_DENSE_CELL_LIMIT", "Sparse rows exceed bounded dense-cell budget before allocation; not truncated.", sheet=name, excel_row=row_number, field=reference)
                    if padding:
                        # Shared immutable-by-convention blanks avoid per-hole dict allocation.
                        cells.extend([{"kind": "blank", "raw": None}] * padding)
                    cells[column] = result
                if row_number == 1:
                    headers = cells
                elif any(cell["kind"] != "blank" and cell["raw"] not in (None, "") or cell["kind"] == "formula" for cell in cells):
                    rows.append({"excelRow": row_number, "cells": cells})
            results.append({"name": name, "headerRow": 1, "headers": headers, "rows": rows})
        # Styles remain source evidence only. Preserve actual XML rather than infer dates.
        styles_xml = archive.read("xl/styles.xml").decode("utf-8-sig") if "xl/styles.xml" in names else None
        if styles_xml is not None:
            budget["text"] += len(styles_xml)
            if budget["text"] > MAX_AGGREGATE_TEXT:
                reject("XLSX_AGGREGATE_TEXT_LIMIT", "Batch styles and source text exceed bounded aggregate profile; not truncated.", field="xl/styles.xml")
            xml_part(archive, "xl/styles.xml")
        return {"fileName": path.name, "sha256": digest, "dateSystem": date_system, "sheets": results, "styleMetadataXml": styles_xml}


def main():
    files = []
    issues = []
    budget = new_batch_budget()
    if len(sys.argv) - 1 > MAX_FILES:
        print(json.dumps({"files": [], "readerIssues": [{"fileName": "", "code": "XLSX_BATCH_FILE_LIMIT", "severity": "CAPABILITY", "category": "TOOL_RESOURCE_LIMIT", "reason": "Batch exceeds 64 input files; no input truncated.", "sheet": "", "excelRow": None, "field": "", "rawValue": None}]}))
        return 2
    for argument in sys.argv[1:]:
        path = Path(argument)
        try:
            files.append(read_workbook(path, budget))
        except XlsxPreflightError as error:
            issues.append({"fileName": path.name, **error.issue})
        except (OSError, zipfile.BadZipFile, RuntimeError, UnicodeError) as error:
            issues.append({"fileName": path.name, "code": "XLSX_READ_FAILED", "severity": "CAPABILITY", "category": "TOOL_SUPPORT_OR_ACCESS_GAP", "reason": str(error), "sheet": "", "excelRow": None, "field": "", "rawValue": None})
    print(json.dumps({"files": files, "readerIssues": issues}, ensure_ascii=False, separators=(",", ":")))
    return 2 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
