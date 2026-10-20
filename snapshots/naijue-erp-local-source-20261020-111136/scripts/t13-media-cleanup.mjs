import {lstatSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {isAbsolute, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
const {readConfig} = await import(pathToFileURL(resolve(root, 'server/config.ts')));
const {assertIsolatedTarget} = await import(pathToFileURL(resolve(root, 'server/database/config.ts')));
const {PgDataAccess} = await import(pathToFileURL(resolve(root, 'server/database/access.ts')));
const {MediaStore} = await import(pathToFileURL(resolve(root, 'server/media/store.ts')));
const config = readConfig(process.env);
if (!config.database) throw new Error('T13_DATABASE_CONFIGURATION_REQUIRED');
assertIsolatedTarget(config.database);
const backupPath = process.env.MEDIA_BACKUP_REFERENCE_FILE;
if (!backupPath || !isAbsolute(backupPath)) throw new Error('T13_BACKUP_REFERENCE_FILE_REQUIRED');
const backupStat = lstatSync(backupPath);
if (!backupStat.isFile() || backupStat.isSymbolicLink() || (backupStat.mode & 0o077) !== 0 || backupStat.uid !== process.getuid?.()) {
  throw new Error('T13_BACKUP_REFERENCE_FILE_NOT_PRIVATE');
}
const backupIndex = JSON.parse(readFileSync(backupPath, 'utf8'));
if (backupIndex.version !== 1 || !Array.isArray(backupIndex.sha256) || backupIndex.sha256.some(value => !/^[0-9a-f]{64}$/.test(value))) {
  throw new Error('T13_BACKUP_REFERENCE_INDEX_INVALID');
}
const access = new PgDataAccess(config.database);
let result;
try {
  const references = await access.read(async session => {
    const {source, runtime} = config.database.schemas;
    const rows = await session.query(`SELECT id::text,sha256 FROM "${source}".product_image
      UNION ALL SELECT id::text,sha256 FROM "${runtime}".product_image`);
    return rows.rows;
  });
  result = await new MediaStore(config.media).cleanupStaging({referencedIds: new Set(references.map(row => row.id)),
    referencedHashes: new Set(references.map(row => row.sha256)), backupHashes: new Set(backupIndex.sha256)});
} finally {await access.close();}
const evidence = {task: 'T13', status: 'PASS', createdAt: new Date().toISOString(), environment: config.environment,
  database: config.database.database, instanceId: config.database.instanceId, databaseMode: 'read-only isolated demo_8877_*',
  backupReferenceFile: backupPath, result, permanentFilesDeleted: result.persistentFilesRemoved,
  permanentHashesCleaned: result.persistentHashesCleaned, permanentBytesDeleted: result.persistentBytesRemoved};
const output = resolve(root, 'outputs/T13'); mkdirSync(output, {recursive: true});
writeFileSync(resolve(output, 'media-cleanup.json'), JSON.stringify(evidence, null, 2) + '\n', {mode: 0o600});
console.log(JSON.stringify(evidence));
