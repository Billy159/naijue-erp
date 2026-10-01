"""Historical replay in isolation; current live batches follow the incremental policy."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

from clean import digest, json_write
from verify import old_state


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[1]


def step(name: str, command: list[str], run: Path) -> None:
    print(f"START {name}", flush=True)
    with (run / f"{name}.log").open("w") as log:
        result = subprocess.run(command, cwd=PROJECT, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(f"{name} stopped ({result.returncode}); see {run / f'{name}.log'}")
    print(f"PASS {name}", flush=True)


def check_existing_preflight(run: Path, batch: str) -> bool:
    path = run / "PREFLIGHT_SUMMARY.json"
    if not path.exists():
        return False
    summary = json.loads(path.read_text())
    if summary["batch"] != batch or summary["status"] != "PASS":
        raise ValueError("existing preflight belongs to a different batch or did not pass")
    manifest = Path(summary["preflight"]) / "IMPORT_MANIFEST.json"
    if digest(manifest) != summary["manifestSha256"]:
        raise ValueError("existing preflight manifest changed")
    meta = json.loads((run / "RUN_META.json").read_text())
    if any(digest(Path(meta["input"]) / rel) != sha for rel, sha in meta["rawHashes"].items()):
        raise ValueError("raw input changed after cleaning")
    if any(digest(Path(meta["output"]) / rel) != sha for rel, sha in meta["cleanedHashes"].items()):
        raise ValueError("cleaned input changed after cleaning")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="new raw T+ folder")
    parser.add_argument("--run", type=Path, required=True, help="distinct output directory")
    parser.add_argument("--clean-batch", required=True)
    parser.add_argument("--import-batch", required=True)
    parser.add_argument("--source", required=True, help="new tplus_clean_* database schema")
    parser.add_argument("--runtime", required=True, help="new v2_runtime_clean_* database schema")
    parser.add_argument("--previous", type=Path, required=True, help="previous accepted preflight folder")
    parser.add_argument("--authority-project", type=Path, default=PROJECT)
    parser.add_argument("--diff-mode", choices=("initial", "future"), default="future")
    parser.add_argument("--preflight-mode", choices=("frozen", "dynamic"), default="dynamic")
    parser.add_argument("--resume", action="store_true", help="reuse an already verified preflight in this run")
    parser.add_argument("--execute", action="store_true", help="explicitly import and initialize isolated schemas")
    parser.add_argument("--historical-replay", action="store_true", help="explicitly acknowledge the archived zero-opening diagnostic model")
    parser.add_argument("--accept-review", action="store_true", help="acknowledge the future batch diff for isolated import only")
    args = parser.parse_args()
    if args.execute and not args.historical_replay:
        parser.error('历史重放写入必须显式 --historical-replay；当前正式口径为增量导入')
    if args.execute:
        import os
        if os.environ.get('POSTGRES_DB','business_management') == 'business_management':
            parser.error('历史重放仅能写隔离数据库，不能写当前业务数据库')
    if not re.fullmatch(r"TPLUS-CLEAN-[0-9]{8}-[A-Z][0-9]+", args.clean_batch) or not re.fullmatch(r"TPLUS-IMPORT-[0-9]{8}-[A-Z][0-9]+", args.import_batch):
        raise ValueError("invalid batch identity")
    if not re.fullmatch(r"tplus_clean_[a-z0-9_]+", args.source) or not re.fullmatch(r"v2_runtime_clean_[a-z0-9_]+", args.runtime):
        raise ValueError("new independent Source and Runtime schemas are required")
    run = args.run.resolve()
    source = args.input.resolve()
    previous = args.previous.resolve()
    if not (previous / "IMPORT_MANIFEST.json").exists():
        raise ValueError("previous accepted preflight manifest not found")
    previous_manifest = json.loads((previous / "IMPORT_MANIFEST.json").read_text())
    if not previous_manifest.get("preflightPassed"):
        raise ValueError("previous preflight was not accepted")
    missing_previous = [item["path"] for item in previous_manifest["datasets"] if not (previous / item["path"]).is_file()]
    if missing_previous:
        raise ValueError(f"previous preflight is incomplete; missing {len(missing_previous)} datasets, e.g. {missing_previous[:3]}")
    run.mkdir(parents=True, exist_ok=True)
    result = {"status": "RUNNING", "cleanBatch": args.clean_batch, "importBatch": args.import_batch, "source": args.source, "runtime": args.runtime, "input": str(source), "run": str(run), "previous": str(previous), "executed": args.execute}
    json_write(run / "RUN_ALL_RESULT.json", result)
    try:
        step("01-clean", [sys.executable, str(BASE / "clean.py"), "--input", str(source), "--run", str(run), "--batch", args.clean_batch], run)
        if not args.resume or not check_existing_preflight(run, args.import_batch):
            command = [sys.executable, str(BASE / "preflight.py"), "--run", str(run), "--authority-project", str(args.authority_project.resolve()), "--batch", args.import_batch]
            if args.preflight_mode == "dynamic":
                command.append("--dynamic")
            step("02-preflight", command, run)
        else:
            print("PASS 02-preflight (verified existing result)", flush=True)
        new_preflight = run / "preflight" / args.import_batch
        diff_script = "batch_diff.py" if args.diff_mode == "initial" else "future_diff.py"
        step("03-diff", [sys.executable, str(BASE / diff_script), "--from", str(previous), "--to", str(new_preflight), "--output", str(run / "TPLUS_BATCH_DIFF_REPORT.json")], run)
        diff = json.loads((run / "TPLUS_BATCH_DIFF_REPORT.json").read_text())
        if diff["status"] == "REVIEW" and not args.accept_review:
            raise ValueError("DIFF_REVIEW_REQUIRED: inspect TPLUS_BATCH_DIFF_REPORT.md, then rerun with --accept-review only after the changes are explained")
        if not args.execute:
            result["status"] = "PREPARED"
            return
        old_baseline = run / "OLD_DB_BASELINE.json"
        if not old_baseline.exists():
            json_write(old_baseline, old_state())
        step("04-import", ["node", "--import", "tsx", "data-cleaning/import/import-tplus.ts", "--preflight", str(new_preflight), "--manifest", str(new_preflight / "IMPORT_MANIFEST.json"), "--batch", args.import_batch, "--schema", args.source, "--report-dir", str(run / "import"), "--execute"], run)
        step("05-runtime", ["node", "--import", "tsx", str(BASE / "runtime-init.ts"), "--source", args.source, "--runtime", args.runtime, "--batch", args.import_batch, "--report-dir", str(run / "runtime")], run)
        step("06-verify", [sys.executable, str(BASE / "verify.py"), "--run", str(run), "--source", args.source, "--runtime", args.runtime, "--batch", args.import_batch], run)
        step("07-report", [sys.executable, str(BASE / "finalize.py"), "--run", str(run)], run)
        result["status"] = "PASS" if diff["status"] == "PASS" else "PASS_REVIEWED"
    except Exception as error:
        result["status"] = "STOP"
        result["reason"] = str(error)
        raise
    finally:
        json_write(run / "RUN_ALL_RESULT.json", result)
        print(json.dumps({"status": result["status"], "run": str(run), "reason": result.get("reason")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
