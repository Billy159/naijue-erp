"""Import one product image archive into the 8877 Demo's durable media overlay."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import os
import zipfile
from pathlib import Path


PRODUCT_CODE = "026MS5133001"
FOLDERS = {
    "01_主图": "主图",
    "02_3比4主图": "辅助图片",
    "03_白底图": "白底图",
    "04_详情图": "详情图",
    "05_吊牌图": "吊牌图",
    "06_颜色配图": "颜色配图",
}
PROJECT = Path(__file__).resolve().parents[2]
DEMO = PROJECT / 'frontend'
ASSETS = DEMO / "assets/product-media" / PRODUCT_CODE
INPUTS = PROJECT / "inputs/product-media"
PSQL = os.environ.get('PSQL_BIN', 'psql')


def sql(value: str | None) -> str:
    if value is None:
        return "NULL"
    if "\0" in value:
        raise ValueError("NUL in image metadata")
    return "'" + value.replace("'", "''") + "'"


def psql(statement: str) -> str:
    result = subprocess.run(
        [PSQL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-U", "billy", '-d', os.environ.get('POSTGRES_DB', 'business_management')],
        input=statement, text=True, capture_output=True, check=True,
    )
    return result.stdout.strip()


def main(archive: Path) -> None:
    if not archive.is_file():
        raise FileNotFoundError(archive)
    INPUTS.mkdir(parents=True, exist_ok=True)
    saved_archive = INPUTS / f"{PRODUCT_CODE}_图片素材.zip"
    source_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
    if not saved_archive.exists() or hashlib.sha256(saved_archive.read_bytes()).hexdigest() != source_hash:
        shutil.copy2(archive, saved_archive)
    ASSETS.mkdir(parents=True, exist_ok=True)

    records = []
    with zipfile.ZipFile(saved_archive) as bundle:
        for entry in bundle.infolist():
            if entry.is_dir():
                continue
            parts = Path(entry.filename).parts
            if len(parts) < 3 or parts[0] != f"{PRODUCT_CODE}_图片素材" or parts[1] not in FOLDERS:
                raise ValueError(f"Unexpected archive path: {entry.filename}")
            if len(parts) > 3 and (parts[1] != "06_颜色配图" or len(parts) != 5):
                raise ValueError(f"Unexpected nested path: {entry.filename}")
            if not parts[-1].lower().endswith((".jpg", ".jpeg")):
                raise ValueError(f"Unexpected file type: {entry.filename}")
            data = bundle.read(entry)
            if len(data) > 8 * 1024 * 1024 or not data.startswith(b"\xff\xd8\xff") or not data.endswith(b"\xff\xd9"):
                raise ValueError(f"Invalid JPEG: {entry.filename}")
            digest = hashlib.sha256(data).hexdigest()
            target = ASSETS / f"{digest}.jpg"
            if target.exists():
                if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
                    raise ValueError(f"Hash mismatch: {target}")
            else:
                target.write_bytes(data)
            # Color folders end after the color name; top-level files continue with an underscore.
            color = re.match(r"^\d+_([^_]+)(?:_|$)", parts[2] if len(parts) > 3 else parts[-1])
            records.append({
                "role": FOLDERS[parts[1]],
                "name": "/".join(parts[2:]),
                "colorName": color.group(1) if color and parts[1] != "05_吊牌图" else None,
                "path": f"/assets/product-media/{PRODUCT_CODE}/{digest}.jpg",
                "sha256": digest,
            })

    if len(records) != 114:
        raise ValueError(f"Expected 114 image records, found {len(records)}")
    product_id = psql(
        "SELECT id FROM tplus_demo_20260922_a2.product "
        f"WHERE code={sql(PRODUCT_CODE)};"
    )
    if not re.fullmatch(r"[a-f0-9-]{36}", product_id):
        raise ValueError("Product was not found exactly once")
    rows = []
    for order, item in enumerate(records):
        rows.append(
            "(" + ",".join([
                sql(product_id) + "::uuid", sql(item["path"]), sql(item["sha256"]),
                "'image/jpeg'", sql(item["role"]), sql(item["colorName"]),
                sql(item["name"]), str(order),
            ]) + ")"
        )
    statement = """
BEGIN;
SET LOCAL search_path=v2_runtime_stage03c,pg_catalog;
CREATE TABLE IF NOT EXISTS product_image (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL,
 path text NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 media_type text NOT NULL, role text NOT NULL, color_name text,
 name text NOT NULL, sort_order integer NOT NULL,
 UNIQUE(product_id,role,name,sha256)
);
CREATE INDEX IF NOT EXISTS product_image_product_order ON product_image(product_id,sort_order);
INSERT INTO product_image(product_id,path,sha256,media_type,role,color_name,name,sort_order)
VALUES
""" + ",\n".join(rows) + """
ON CONFLICT (product_id,role,name,sha256)
DO UPDATE SET path=EXCLUDED.path,media_type=EXCLUDED.media_type,
 color_name=EXCLUDED.color_name,sort_order=EXCLUDED.sort_order;
COMMIT;
SELECT count(*) FROM v2_runtime_stage03c.product_image WHERE product_id=""" + sql(product_id) + "::uuid;"
    count = int(psql(statement).splitlines()[-1])
    if count != len(records):
        raise ValueError(f"Database record count {count} differs from archive {len(records)}")
    manifest = {"productCode": PRODUCT_CODE, "archiveSha256": source_hash, "images": records}
    (INPUTS / f"{PRODUCT_CODE}_import-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Imported {count} image records, {len({r['sha256'] for r in records})} unique JPEGs for {PRODUCT_CODE}")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
