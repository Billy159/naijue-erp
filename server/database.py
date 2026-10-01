"""Create a snapshot-consistent backup and verify an isolated restore before replacement."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / 'backup/business-management-current-20261001.dump'
META = ROOT / 'data-cleaning/verification/database-backup-current.json'
SCHEMAS = ['tplus_demo_20260922_a2', 'v2_runtime_stage03c']


def binary(name):
    value = os.environ.get(name.upper() + '_BIN')
    if value:
        return value
    candidates = [Path(os.environ.get('PG_BIN', '')) / name,
                  Path.home() / 'pg17/bin' / name]
    return shutil.which(name) or next((str(p) for p in candidates if p.is_file()), name)


def connection(database):
    return ['-h', os.environ.get('POSTGRES_HOST', '127.0.0.1'),
            '-p', os.environ.get('POSTGRES_PORT', '5432'),
            '-U', os.environ.get('POSTGRES_USER', os.environ.get('USER', '')),
            '-d', database]


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def fingerprint_sql(schema, table):
    qualified = '"' + schema + '"."' + table + '"'
    return ("SELECT json_build_object('rows',count(*),'digest',"
            "md5(coalesce(string_agg(h,'' ORDER BY h),''))) FROM "
            "(SELECT md5(row_to_json(r)::text) h FROM " + qualified + " r) x")


def query(database, sql):
    text = subprocess.check_output([binary('psql'), *connection(database),
                                   '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], text=True)
    return json.loads(text.strip().splitlines()[-1])


def restore(archive, database, expected):
    if not re.fullmatch(r'demo_8877_[a-z0-9_]+', database):
        raise ValueError('恢复目标必须是新的 demo_8877_* 数据库；不会覆盖正在使用的业务库')
    subprocess.run([binary('createdb'), *connection('postgres')[:-2], database], check=True)
    subprocess.run([binary('pg_restore'), *connection(database), '--exit-on-error',
                    '--no-owner', '--no-acl', str(archive)], check=True)
    differences = []
    for item in expected:
        actual = query(database, fingerprint_sql(item['schema'], item['table']))
        if actual != {'rows': item['rows'], 'digest': item['digest']}:
            differences.append(item['schema'] + '.' + item['table'])
    if differences:
        raise ValueError('恢复内容不一致: ' + ', '.join(differences))
    return {'database': database, 'tables': len(expected), 'exactContentDifferences': 0}


def backup():
    database = os.environ.get('POSTGRES_DB', 'business_management')
    stamp = datetime.datetime.now().astimezone().isoformat()
    BACKUP.parent.mkdir(exist_ok=True)
    META.parent.mkdir(parents=True, exist_ok=True)
    partial = BACKUP.with_suffix('.dump.partial')
    if partial.exists():
        raise ValueError('存在未完成的 .partial 备份，请先核对上次运行；现有最新备份未被替换')
    process = subprocess.Popen([binary('psql'), *connection(database), '-X', '-qAt',
                                '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, text=True, bufsize=1)

    def snapshot_query(sql):
        process.stdin.write(sql + ';\n')
        process.stdin.flush()
        text = process.stdout.readline().strip()
        if not text:
            raise RuntimeError('数据库快照连接异常')
        return text

    process.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n')
    process.stdin.flush()
    snapshot = snapshot_query('SELECT pg_export_snapshot()')
    dump = None
    try:
        dump = subprocess.Popen([binary('pg_dump'), *connection(database), '--format=custom',
                                 '--no-owner', '--no-acl', '--snapshot=' + snapshot,
                                 *['--schema=' + s for s in SCHEMAS], '--file=' + str(partial)])
        tables = json.loads(snapshot_query("SELECT json_agg(json_build_object('schema',table_schema,"
                           "'table',table_name) ORDER BY table_schema,table_name) FROM information_schema.tables "
                           "WHERE table_schema IN ('tplus_demo_20260922_a2','v2_runtime_stage03c') "
                           "AND table_type='BASE TABLE'"))
        fingerprints = [{**item, **json.loads(snapshot_query(fingerprint_sql(item['schema'], item['table'])))}
                        for item in tables]
        if dump.wait() != 0:
            raise RuntimeError('数据库导出失败；现有备份未被替换')
    finally:
        if dump is not None and dump.poll() is None:
            dump.terminate()
            dump.wait()
        process.stdin.write('ROLLBACK;\n\\q\n')
        process.stdin.flush()
        process.wait()
    temporary = 'demo_8877_backup_check_' + str(int(time.time()))
    verified = restore(partial, temporary, fingerprints)
    subprocess.run([binary('dropdb'), *connection('postgres')[:-2], temporary], check=True)
    result = {'time': stamp, 'database': database, 'schemas': SCHEMAS,
              'file': str(BACKUP.relative_to(ROOT)), 'bytes': partial.stat().st_size,
              'sha256': digest(partial), 'tableFingerprints': fingerprints,
              'restoreVerified': True, 'restoreVerification': verified}
    # Only a successfully restored candidate replaces the previous canonical backup.
    partial.replace(BACKUP)
    META.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'tableFingerprints'}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['backup', 'restore'])
    parser.add_argument('--database', help='new demo_8877_* recovery database')
    args = parser.parse_args()
    if args.action == 'backup':
        backup()
        return
    metadata = json.loads(META.read_text())
    if digest(BACKUP) != metadata['sha256']:
        raise ValueError('备份 SHA256 不一致')
    database = args.database or ('demo_8877_recovery_' + str(int(time.time())))
    result = restore(BACKUP, database, metadata['tableFingerprints'])
    (META.parent / 'database-recovery-last.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
