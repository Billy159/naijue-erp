"""Reproduce the frozen historical diagnostic batch in a restored, isolated database."""
from pathlib import Path
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))
from database import binary, digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, help='restored demo_8877_* database')
    parser.add_argument('--run', type=Path, help='reuse this run path for review and execution')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--accept-review', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'demo_8877_[a-z0-9_]+', args.database):
        parser.error('必须使用 demo_8877_* 隔离数据库，禁止历史重放写入当前业务库')
    run = (args.run or ROOT / 'data-cleaning/runs' / datetime.datetime.now().strftime('%Y%m%d_%H%M%S')).resolve()
    run.mkdir(parents=True, exist_ok=True)
    identity_file = run / 'REPLAY_IDENTITY.json'
    if identity_file.exists():
        identity = json.loads(identity_file.read_text())
        if identity['database'] != args.database:
            parser.error('该复跑目录属于不同的隔离数据库')
    else:
        now = datetime.datetime.now()
        suffix = now.strftime('%Y%m%d_%H%M%S')
        identity = {'database': args.database, 'cleanBatch': 'TPLUS-CLEAN-' + now.strftime('%Y%m%d') + '-A' + now.strftime('%H%M%S'),
                    'importBatch': 'TPLUS-IMPORT-' + now.strftime('%Y%m%d') + '-A' + now.strftime('%H%M%S'),
                    'source': 'tplus_clean_' + suffix, 'runtime': 'v2_runtime_clean_' + suffix}
        identity_file.write_text(json.dumps(identity, indent=2) + '\n')
    previous = run / 'previous'
    archive = ROOT / 'data-cleaning/baselines/TPLUS-20260922-A2.tar.gz'
    metadata = json.loads((ROOT / 'data-cleaning/verification/consolidation-20261001/comparison-baseline.json').read_text())
    expected_hash = metadata.get('sha256') or metadata.get('archiveSha256')
    if not expected_hash or digest(archive) != expected_hash:
        raise ValueError('冻结比对基线哈希不一致')
    if not (previous / 'IMPORT_MANIFEST.json').is_file():
        previous.mkdir(exist_ok=True)
        with tarfile.open(archive) as bundle:
            for item in bundle.getmembers():
                if item.issym() or item.islnk() or not (previous / item.name).resolve().is_relative_to(previous):
                    raise ValueError('比对基线含异常路径')
            bundle.extractall(previous)
    command = [sys.executable, str(ROOT / 'data-cleaning/cleaning/run_all.py'),
               '--input', str(ROOT / 'inputs/tplus-frozen-v1'), '--run', str(run / 'result'),
               '--previous', str(previous), '--clean-batch', identity['cleanBatch'],
               '--import-batch', identity['importBatch'], '--source', identity['source'],
               '--runtime', identity['runtime'], '--resume']
    if args.execute:
        command += ['--execute', '--historical-replay']
    if args.accept_review:
        command.append('--accept-review')
    environment = {**os.environ, 'POSTGRES_DB': args.database, 'POSTGRES_SCHEMA': 'tplus_demo_20260922_a2',
                   'PSQL_BIN': binary('psql')}
    result = subprocess.run(command, cwd=ROOT, env=environment)
    print('复跑目录:', run)
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
