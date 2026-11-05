#!/usr/bin/env python3
"""Read-only OOXML evidence, not a source-row authorizer or a database importer.

Only the two approved header CSVs and their original header worksheets are read.
No openpyxl/date decoder, float conversion, timezone, rounding, or JSONL scan.
An independently supplied approval SHA pins selection -> manifest -> XLSX/CSV SHA.
The output must remain private and outside the repository and input directories.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKGREL = "http://schemas.openxmlformats.org/package/2006/relationships"
FIELDS = ("业务日期", "原创建时间", "原修改时间", "原审核时间")
TABLES = {
    "SALES_HEADER": ("business/13历史销货单头.csv", "13历史销货单头", "历史销货"),
    "TRANSFER_HEADER": ("business/16历史调拨单头.csv", "16历史调拨单头", "历史调拨"),
}
MAX_FILE = 256 * 1024 * 1024
MAX_XML = 128 * 1024 * 1024
MAX_ROWS = 100_000
MAX_EVIDENCE_BYTES = 512 * 1024 * 1024
SHA = re.compile(r"[a-f0-9]{64}\Z")
CELL = re.compile(r"([A-Z]{1,3})([1-9][0-9]*)\Z")


class EvidenceError(ValueError):
    pass


def require(condition, code):
    if not condition:
        raise EvidenceError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def json_data(data):
    return json.loads(data.decode("utf-8"), object_pairs_hook=unique_object)


def root_path(value):
    p = Path(value).absolute()
    require(not p.is_symlink() and p.is_dir(), "INPUT_ROOT_NOT_PLAIN_DIRECTORY")
    return p.resolve()


def child(root, relative):
    require(isinstance(relative, str) and "\\" not in relative, "UNSAFE_INPUT_PATH")
    parts = PurePosixPath(relative).parts
    require(parts and not relative.startswith("/") and all(x not in (".", "..") for x in parts), "UNSAFE_INPUT_PATH")
    current = root
    for part in parts:
        current /= part
        require(not current.is_symlink(), "INPUT_SYMLINK")
    require(current.resolve().is_relative_to(root), "INPUT_PATH_ESCAPE")
    return current


def read_plain(path, limit=MAX_FILE):
    # Parse and hash the same immutable bytes, never a path reopened by a library.
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_size <= limit, "INPUT_FILE_TYPE_OR_LIMIT")
        data = stream.read(limit + 1)
        require(len(data) == info.st_size and len(data) <= limit, "INPUT_CHANGED_OR_LIMIT")
        return data


def xml_data(data):
    check_xml_bytes(data)
    return ET.fromstring(data)


def check_xml_bytes(data):
    # XML 1.0 UTF-8 cannot contain NUL. Reject UTF-16/32 before the ASCII token
    # check so an alternate encoding cannot hide a DTD from that check.
    upper = data.upper()
    require(len(data) <= MAX_XML and b"\x00" not in data and b"<!DOCTYPE" not in upper
            and b"<!ENTITY" not in upper, "XML_DTD_ENTITY_ENCODING_OR_LIMIT")


def relationship_target(value):
    require(isinstance(value, str) and "\\" not in value and ":" not in value, "OOXML_UNSAFE_RELATIONSHIP")
    relative = value[1:] if value.startswith("/") else "xl/" + value
    require(all(x not in (".", "..") for x in relative.split("/")), "OOXML_UNSAFE_RELATIONSHIP")
    require(relative.startswith("xl/"), "OOXML_RELATIONSHIP_OUTSIDE_XL")
    return relative


def text_runs(container):
    if container is None:
        return ""
    # Only actual text/rich-text runs; phonetic annotation is not the cell value.
    return "".join((node.text or "") for node in container.findall(f"{{{NS}}}t")) + "".join(
        (node.text or "") for run in container.findall(f"{{{NS}}}r") for node in run.findall(f"{{{NS}}}t")
    )


class RawWorkbook:
    def __init__(self, data, expected_sha256):
        require(SHA.fullmatch(expected_sha256 or "") and sha(data) == expected_sha256, "WORKBOOK_SHA_MISMATCH")
        self.file_sha = expected_sha256
        self.archive = zipfile.ZipFile(io.BytesIO(data))
        names = self.archive.namelist()
        require(len(names) <= 4096 and len(names) == len(set(names)), "OOXML_DUPLICATE_OR_EXCESS_PARTS")
        for entry in self.archive.infolist():
            require(not entry.flag_bits & 1 and not entry.filename.startswith("/") and "\\" not in entry.filename
                    and all(x not in (".", "..") for x in entry.filename.split("/")), "OOXML_UNSAFE_ZIP_ENTRY")
        self.workbook_bytes = self.part("xl/workbook.xml", 4 * 1024 * 1024)
        workbook = xml_data(self.workbook_bytes)
        require(workbook.tag == f"{{{NS}}}workbook", "OOXML_WORKBOOK_NAMESPACE")
        properties = workbook.findall(f"{{{NS}}}workbookPr")
        require(len(properties) <= 1, "OOXML_DUPLICATE_WORKBOOK_PROPERTIES")
        self.date1904_raw = properties[0].get("date1904") if properties else None
        require(self.date1904_raw in (None, "0", "1", "false", "true"), "OOXML_INVALID_DATE_SYSTEM")
        self.date_system = "1904" if self.date1904_raw in ("1", "true") else "1900"
        self.date_system_basis = "OOXML_DEFAULT_FALSE" if self.date1904_raw is None else "EXPLICIT_WORKBOOK_PR"
        rels = xml_data(self.part("xl/_rels/workbook.xml.rels", 4 * 1024 * 1024))
        require(rels.tag == f"{{{PKGREL}}}Relationships", "OOXML_RELATIONSHIP_NAMESPACE")
        relationships = {}
        for entry in rels:
            key = entry.get("Id")
            require(key and key not in relationships and entry.get("TargetMode", "Internal") == "Internal", "OOXML_DUPLICATE_OR_EXTERNAL_RELATIONSHIP")
            relationships[key] = (entry.get("Type"), relationship_target(entry.get("Target")))
        self.sheets = {}
        for entry in workbook.findall(f"{{{NS}}}sheets/{{{NS}}}sheet"):
            name, target = entry.get("name"), relationships.get(entry.get(f"{{{REL}}}id"))
            require(name and name not in self.sheets and target and target[0] == REL + "/worksheet", "OOXML_SHEET_RELATIONSHIP")
            self.sheets[name] = target[1]
        styles = [target for kind, target in relationships.values() if kind == REL + "/styles"]
        require(len(styles) == 1, "OOXML_STYLES_RELATIONSHIP")
        self.styles_path = styles[0]
        self.styles_bytes = self.part(styles[0], 8 * 1024 * 1024)
        style = xml_data(self.styles_bytes)
        require(style.tag == f"{{{NS}}}styleSheet", "OOXML_STYLES_NAMESPACE")
        self.formats = {}
        for item in style.findall(f"{{{NS}}}numFmts/{{{NS}}}numFmt"):
            idx = item.get("numFmtId")
            require(idx and idx.isdecimal() and int(idx) not in self.formats and item.get("formatCode") is not None, "OOXML_DUPLICATE_OR_INVALID_FORMAT")
            self.formats[int(idx)] = item.get("formatCode")
        self.xfs = [dict(item.attrib) for item in style.findall(f"{{{NS}}}cellXfs/{{{NS}}}xf")]
        require(0 < len(self.xfs) <= 100_000, "OOXML_CELL_XFS_LIMIT")
        shared = [target for kind, target in relationships.values() if kind == REL + "/sharedStrings"]
        require(len(shared) <= 1, "OOXML_SHARED_STRINGS_RELATIONSHIP")
        self.shared = [] if not shared else [text_runs(e) for e in xml_data(self.part(shared[0], 32 * 1024 * 1024)).findall(f"{{{NS}}}si")]

    def part(self, name, limit=MAX_XML):
        require(name in self.archive.namelist(), "OOXML_REQUIRED_PART_MISSING")
        info = self.archive.getinfo(name)
        require(info.file_size <= limit, "OOXML_PART_LIMIT")
        with self.archive.open(name) as stream:
            result = stream.read(limit + 1)
        require(len(result) == info.file_size and len(result) <= limit, "OOXML_PART_LENGTH")
        return result

    def cell(self, element, row_no):
        address = element.get("r")
        match = CELL.fullmatch(address or "")
        require(match and int(match[2]) == row_no and row_no <= 1_048_576, "OOXML_CELL_ROW_ADDRESS")
        typ, style_raw = element.get("t"), element.get("s")
        require(style_raw is None or re.fullmatch(r"[0-9]+", style_raw), "OOXML_INVALID_STYLE_INDEX")
        style_index = int(style_raw or "0")
        require(style_index < len(self.xfs), "OOXML_STYLE_INDEX_RANGE")
        values = element.findall(f"{{{NS}}}v")
        require(len(values) <= 1 and element.find(f"{{{NS}}}f") is None, "OOXML_FORMULA_OR_DUPLICATE_VALUE")
        raw_v = values[0].text or "" if values else None
        inline = element.find(f"{{{NS}}}is")
        require(not (inline is not None and typ != "inlineStr"), "OOXML_INVALID_INLINE_STRING")
        if typ == "inlineStr":
            require(not values, "OOXML_INLINE_HAS_CACHED_VALUE")
            raw = text_runs(inline)
        elif typ == "s":
            require(raw_v is not None and re.fullmatch(r"[0-9]+", raw_v) and int(raw_v) < len(self.shared), "OOXML_SHARED_STRING_INDEX")
            raw = self.shared[int(raw_v)]
        else:
            require(typ in (None, "n", "str", "d", "b", "e"), "OOXML_UNKNOWN_CELL_TYPE")
            raw = raw_v or ""
        require(len(raw) <= 65536, "OOXML_CELL_VALUE_LIMIT")
        xf = self.xfs[style_index]
        num_fmt = xf.get("numFmtId", "0")
        require(re.fullmatch(r"[0-9]+", num_fmt), "OOXML_INVALID_NUMFMT_ID")
        num_fmt_id = int(num_fmt)
        require(num_fmt_id < 164 or num_fmt_id in self.formats, "OOXML_UNDEFINED_CUSTOM_FORMAT")
        # Built-ins are locale-dependent: retain their ID, do not claim a format.
        number_format = self.formats.get(num_fmt_id, f"OOXML_BUILTIN_NUMFMT_{num_fmt_id}")
        return {"cellRef": address, "cellPresent": True, "xmlType": typ, "xmlStyle": style_raw,
                "rawV": raw_v, "raw": raw, "styleIndex": style_index, "numFmtId": num_fmt_id,
                "numberFormat": number_format, "cellXf": xf}

    def rows(self, sheet):
        require(sheet in self.sheets, "OOXML_EXPECTED_HEADER_SHEET_MISSING")
        sheet_bytes = self.part(self.sheets[sheet])
        # Check declarations before using the streaming parser as well.
        check_xml_bytes(sheet_bytes)
        self.sheet_sha = sha(sheet_bytes)
        last, stack, sheet_data_seen = 0, [], False
        for event, element in ET.iterparse(io.BytesIO(sheet_bytes), events=("start", "end")):
            if event == "start":
                if not stack:
                    require(element.tag == f"{{{NS}}}worksheet", "OOXML_WORKSHEET_NAMESPACE")
                if element.tag == f"{{{NS}}}sheetData":
                    require(stack == [f"{{{NS}}}worksheet"] and not sheet_data_seen, "OOXML_SHEET_DATA_STRUCTURE")
                    sheet_data_seen = True
                if element.tag == f"{{{NS}}}row":
                    require(stack == [f"{{{NS}}}worksheet", f"{{{NS}}}sheetData"], "OOXML_ROW_OUTSIDE_SHEET_DATA")
                if element.tag == f"{{{NS}}}c":
                    require(stack == [f"{{{NS}}}worksheet", f"{{{NS}}}sheetData", f"{{{NS}}}row"], "OOXML_CELL_OUTSIDE_ROW")
                stack.append(element.tag)
                continue
            stack.pop()
            if element.tag != f"{{{NS}}}row":
                continue
            row_raw = element.get("r", "")
            require(re.fullmatch(r"[1-9][0-9]*", row_raw), "OOXML_ROW_NUMBER")
            row_no = int(row_raw)
            require(last < row_no <= 1_048_576, "OOXML_DUPLICATE_OR_UNSORTED_ROW")
            last = row_no
            cells = {}
            for cell in element.findall(f"{{{NS}}}c"):
                value = self.cell(cell, row_no)
                col = CELL.fullmatch(value["cellRef"])[1]
                require(col not in cells, "OOXML_DUPLICATE_CELL")
                cells[col] = value
            yield row_no, cells
            element.clear()
        require(sheet_data_seen, "OOXML_SHEET_DATA_MISSING")


def load_authorization(base, amendment, approval_file, trusted_sha):
    require(SHA.fullmatch(trusted_sha or ""), "INDEPENDENT_APPROVAL_PIN_REQUIRED")
    approval_bytes = read_plain(approval_file, 4 * 1024 * 1024)
    require(sha(approval_bytes) == trusted_sha, "APPROVAL_PIN_MISMATCH")
    approval = json_data(approval_bytes)
    require(approval.get("scope") == "EXCLUDE_EXACT_PRODUCT_BOUND_BARCODE_ARCHIVE_ROWS_FROM_THIS_IMPORT_ONLY"
            and approval.get("nativeDbImportAuthorizedByThisFile") is False
            and approval.get("businessDatabaseDeletionApproved") is False
            and approval.get("sourceEvidenceDeletionApproved") is False, "APPROVAL_POLICY")
    manifest_bytes = read_plain(child(base, "manifest.json"), 4 * 1024 * 1024)
    require(sha(manifest_bytes) == approval.get("baseManifestSha256"), "MANIFEST_APPROVAL_MISMATCH")
    manifest = json_data(manifest_bytes)
    selection_bytes = read_plain(child(amendment, "effective-import-selection.json"), 4 * 1024 * 1024)
    require(sha(selection_bytes) == approval.get("selectionSha256"), "SELECTION_APPROVAL_MISMATCH")
    selection = json_data(selection_bytes)
    require(selection.get("baseManifestSha256") == sha(manifest_bytes)
            and selection.get("schemaVersion") == "NAIJUE_V3_EXPLICIT_BARCODE_EXCLUSION_SELECTION_20261021"
            and selection.get("importReady") is False and manifest.get("importReady") is False, "SELECTION_POLICY")
    source_hashes = manifest.get("sourceInputSha256")
    require(isinstance(source_hashes, dict) and 0 < len(source_hashes) <= 1024
            and all(isinstance(v, str) and SHA.fullmatch(v) for v in source_hashes.values()), "MANIFEST_SOURCE_HASHES")
    payload = {}
    for item in manifest.get("payloadFiles", []):
        require(item.get("file") not in payload, "MANIFEST_DUPLICATE_PAYLOAD")
        payload[item["file"]] = item
    selections = {}
    for item in selection.get("importFiles", []):
        require(item.get("entity") not in selections, "SELECTION_DUPLICATE_ENTITY")
        selections[item["entity"]] = item
    result = {}
    for entity, (csv_path, _, _) in TABLES.items():
        selected, item = selections.get(entity), payload.get(csv_path)
        require(selected and selected.get("source") == "BASE_V2" and selected.get("path") == csv_path
                and item and item.get("sha256") == selected.get("sha256") and SHA.fullmatch(item.get("sha256", "")), "HEADER_SELECTION_BINDING")
        data = read_plain(child(base, csv_path), 32 * 1024 * 1024)
        require(len(data) == item.get("bytes") and sha(data) == selected["sha256"], "HEADER_CSV_HASH_OR_SIZE")
        reader = csv.DictReader(io.StringIO(data.decode("utf-8"), newline=""), strict=True)
        require(reader.fieldnames and len(reader.fieldnames) == len(set(reader.fieldnames))
                and all(f in reader.fieldnames for f in ("来源编号", "原单号", *FIELDS)), "HEADER_CSV_COLUMNS")
        rows = {}
        for row in reader:
            key = row.get("来源编号")
            require(None not in row and all(isinstance(v, str) and len(v) <= 65536 for v in row.values())
                    and key and key not in rows and len(rows) < MAX_ROWS, "HEADER_CSV_ROW_OR_DUPLICATE")
            rows[key] = row
        require(len(rows) == selected.get("count"), "HEADER_CSV_COUNT")
        result[entity] = {"selection": {"baseManifestSha256": sha(manifest_bytes), "selectionSha256": sha(selection_bytes),
                           "approvalSha256": trusted_sha, "entity": entity, "source": "BASE_V2", "path": csv_path,
                           "csvSha256": selected["sha256"]}, "rows": rows}
    return result, source_hashes


def extract_workbook(data, file_ref, expected_sha, entity, canonical):
    workbook = RawWorkbook(data, expected_sha)
    sheet = TABLES[entity][1]
    iterator = workbook.rows(sheet)
    row_no, header = next(iterator, (None, None))
    require(row_no == 1, "OOXML_HEADER_MUST_BE_ROW_ONE")
    columns = {}
    for col, cell in header.items():
        name = cell["raw"].lstrip("*")
        require(name not in columns, "OOXML_DUPLICATE_HEADER")
        columns[name] = col
    require(all(f in columns for f in ("来源编号", "原单号", *FIELDS)), "OOXML_MISSING_HEADER_FIELD")
    count = 0
    for row_no, cells in iterator:
        source_id = cells.get(columns["来源编号"], {}).get("raw", "")
        if not source_id:
            require(all(c["raw"] == "" for c in cells.values()), "OOXML_NONEMPTY_ROW_WITHOUT_SOURCE_ID")
            continue
        row = canonical.pop(source_id, None)
        require(row is not None, "OOXML_SOURCE_ID_MISSING_OR_DUPLICATE")
        document = cells.get(columns["原单号"], {}).get("raw", "")
        require(document == row["原单号"], "OOXML_DOCUMENT_NUMBER_MISMATCH")
        fields, evidence = {}, {}
        for field in FIELDS:
            col = columns[field]
            cell = cells.get(col, {"cellRef": f"{col}{row_no}", "cellPresent": False, "xmlType": None,
                                   "xmlStyle": None, "rawV": None, "raw": "", "styleIndex": None,
                                   "numFmtId": None, "numberFormat": None, "cellXf": None})
            require(cell["raw"] == row[field], "OOXML_TEMPORAL_RAW_MISMATCH")
            fields[field] = cell
            if cell["raw"] and cell["xmlType"] in (None, "n"):
                require(re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", cell["raw"]), "OOXML_NUMERIC_TEMPORAL_LEXEME_UNSUPPORTED")
                # Fail closed on false, whitespace-normalized false, or unknown
                # xs:boolean lexemes. Preserve the actual attribute in cellXf.
                require(cell["cellXf"].get("applyNumberFormat") in (None, "1", "true"), "OOXML_NUMFMT_INHERITANCE_REQUIRES_POLICY")
                from urllib.parse import quote
                evidence[field] = {"encoding": "EXCEL_SERIAL", "dateSystem": workbook.date_system, "cellType": "NUMBER",
                                   "sourceFileSha256": expected_sha, "sheet": sheet, "rowNo": str(row_no),
                                   "field": field, "raw": cell["raw"], "cellRef": cell["cellRef"],
                                   "styleIndex": cell["styleIndex"], "numberFormat": cell["numberFormat"],
                                   "evidenceRef": f"ooxml-cell-v1:sha256:{expected_sha}#{quote(sheet, safe='')}!{cell['cellRef']}"}
        count += 1
        require(count <= MAX_ROWS, "OOXML_HEADER_ROW_LIMIT")
        yield {"schemaVersion": "HISTORY_XLSX_CELL_EVIDENCE_V1", "entityType": entity, "sourceKey": source_id,
               "documentNumber": document, "fileRef": file_ref, "sourceFileSha256": expected_sha,
               "sheet": sheet, "rowNo": str(row_no), "date1904Raw": workbook.date1904_raw,
               "dateSystemBasis": workbook.date_system_basis, "dateSystem": workbook.date_system,
               "worksheetPart": workbook.sheets[sheet], "worksheetPartSha256": workbook.sheet_sha,
               "stylesPart": workbook.styles_path, "stylesPartSha256": sha(workbook.styles_bytes),
               "workbookPartSha256": sha(workbook.workbook_bytes), "cells": fields, "temporalEvidence": evidence}


def run(*, source_root, base, amendment, approval_file, trusted_sha, output_parent, max_evidence_bytes=MAX_EVIDENCE_BYTES):
    require(type(max_evidence_bytes) is int and 0 < max_evidence_bytes <= MAX_EVIDENCE_BYTES, "PRIVATE_EVIDENCE_BOUND")
    source_root, base, amendment = map(root_path, (source_root, base, amendment))
    repo = Path(__file__).resolve().parents[2]
    output_parent = root_path(output_parent)
    require(not any(output_parent == p or output_parent.is_relative_to(p) for p in (source_root, base, amendment, repo))
            and ".git" not in output_parent.parts, "OUTPUT_MUST_BE_OUTSIDE_INPUT_AND_REPO")
    approved, source_hashes = load_authorization(base, amendment, Path(approval_file), trusted_sha)
    output = Path(tempfile.mkdtemp(prefix="history-cell-evidence-", dir=output_parent))
    os.chmod(output, 0o700)
    counts, formats, source_files, numeric_count = Counter(), Counter(), [], 0
    digest, total_bytes = hashlib.sha256(), 0
    try:
        with os.fdopen(os.open(output / "evidence.jsonl", os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "wb") as stream:
            for entity, (_, _, marker) in TABLES.items():
                candidates = sorted(f for f in source_hashes if f.endswith(".xlsx") and marker in PurePosixPath(f).name)
                require(candidates, "APPROVED_ORIGINAL_WORKBOOK_MISSING")
                for file_ref in candidates:
                    original = child(source_root, file_ref)
                    data = read_plain(original)
                    count_before = counts[entity]
                    for record in extract_workbook(data, file_ref, source_hashes[file_ref], entity, approved[entity]["rows"]):
                        record["selection"] = approved[entity]["selection"]
                        line = (json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
                        total_bytes += len(line)
                        require(total_bytes <= max_evidence_bytes, "PRIVATE_EVIDENCE_OUTPUT_LIMIT")
                        stream.write(line)
                        digest.update(line)
                        counts[entity] += 1
                        numeric_count += len(record["temporalEvidence"])
                        for field, cell in record["cells"].items():
                            counts[f"{entity}.{field}.{'EMPTY' if cell['raw'] == '' else 'NUMBER' if field in record['temporalEvidence'] else 'TEXT'}"] += 1
                            if field in record["temporalEvidence"]:
                                formats[f"{entity}.{field}.{cell['styleIndex']}.{cell['numberFormat']}"] += 1
                    source_files.append({"fileRef": file_ref, "sha256": sha(data), "bytes": len(data), "headerRows": counts[entity] - count_before})
                    require(sha(read_plain(original)) == source_hashes[file_ref], "ORIGINAL_CHANGED_AFTER_EXTRACTION")
                require(not approved[entity]["rows"], "APPROVED_HEADER_CSV_NOT_FULLY_COVERED")
            stream.flush()
            os.fsync(stream.fileno())
        require(total_bytes <= max_evidence_bytes, "PRIVATE_EVIDENCE_OUTPUT_LIMIT")
        report = {"kind": "HISTORY_XLSX_CELL_EVIDENCE_V1", "importReady": False, "noSql": True,
                  "sourceRowAuthorizationConnected": False, "rawSnapshotRowsScanned": 0,
                  "binding": "INDEPENDENT_APPROVAL_SHA_TO_SELECTION_TO_BASE_MANIFEST_TO_ORIGINAL_XLSX_AND_HEADER_CSV",
                  "matchedFields": ["来源编号", "原单号", *FIELDS], "headerRows": counts["SALES_HEADER"] + counts["TRANSFER_HEADER"],
                  "numericCellEvidence": numeric_count, "counts": dict(counts), "numericStyles": dict(formats),
                  "sourceFiles": source_files, "selection": {e: a["selection"] for e, a in approved.items()},
                  "evidenceFile": "evidence.jsonl", "evidenceBytes": total_bytes, "evidenceSha256": digest.hexdigest(), "maxEvidenceBytes": max_evidence_bytes,
                  "sourceOriginalsUnchangedAfterRead": True, "dateValuesConverted": False, "timezoneAssigned": False,
                  "timestampPrecisionRounded": False, "dateOnlyMidnightInvented": False,
                  "limitations": ["This authenticates original cell encoding and selected header identity/temporal values, not the full raw-source DTO or native FK bindings.",
                                  "Evidence must be independently regenerated or authenticated by the trusted header reader before database authorization.",
                                  "All nonnumeric source temporal cells stay literal; no date/time or precision policy is introduced."]}
        with os.fdopen(os.open(output / "report.json", os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "w", encoding="utf-8") as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        return output, report
    except BaseException:
        shutil.rmtree(output)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("source-root", "base", "amendment", "approval-file", "trusted-sha", "output-parent"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--max-evidence-bytes", type=int, default=MAX_EVIDENCE_BYTES)
    try:
        out, result = run(**vars(parser.parse_args()))
        print(json.dumps({"outputDirectory": str(out), "headerRows": result["headerRows"],
                          "numericCellEvidence": result["numericCellEvidence"], "evidenceSha256": result["evidenceSha256"],
                          "evidenceBytes": result["evidenceBytes"], "maxEvidenceBytes": result["maxEvidenceBytes"],
                          "importReady": False, "noSql": True}, ensure_ascii=False))
    except (EvidenceError, OSError, ValueError, ET.ParseError, zipfile.BadZipFile, KeyError) as error:
        # Do not leak source cell data or filesystem exception payloads to shared logs.
        print(json.dumps({"kind": "HISTORY_XLSX_CELL_EVIDENCE_V1", "importReady": False, "noSql": True,
                          "error": str(error) if isinstance(error, EvidenceError) else type(error).__name__}), file=sys.stderr)
        sys.exit(1)
