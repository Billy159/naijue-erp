import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
if (process.env.APP_ENV && process.env.APP_ENV !== 'local') throw new Error('T13_LOCAL_MEDIA_MIGRATION_ONLY');
if (Object.keys(process.env).some(key => key.startsWith('POSTGRES_') || ['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGPASSFILE','PGSERVICE'].includes(key))) {
  throw new Error('T13_AMBIENT_DATABASE_CONFIGURATION_FORBIDDEN');
}
const {readMediaConfig} = await import(pathToFileURL(resolve(root, 'server/media/config.ts')));
const {MediaStore} = await import(pathToFileURL(resolve(root, 'server/media/store.ts')));
const env = {MEDIA_STORAGE_ROOT: process.env.MEDIA_STORAGE_ROOT};
const config = readMediaConfig(env, 'local', 'local', root);
const store = new MediaStore(config);
const result = await store.importRegisteredMedia(root, resolve(root, 'outputs/T07/copied-source-manifest.json'));
const evidence = {task: 'T13', status: 'PASS', createdAt: new Date().toISOString(), environment: 'local',
  databaseConnections: 0, serverOperations: 0, sourceManifest: 'outputs/T07/copied-source-manifest.json',
  sourceBytesVerified: result.bytes, registeredFiles: result.files, originalImages: result.originals,
  historicalThumbnails: result.legacyThumbnails, generatedThumbnails: result.originals,
  index: result.indexPath.replace(root + '/', ''), dataClassification: 'pre-registered project media files only'};
mkdirSync(resolve(root, 'outputs/T13'), {recursive: true});
writeFileSync(resolve(root, 'outputs/T13/media-migration.json'), JSON.stringify(evidence, null, 2) + '\n', {mode: 0o600});
console.log(JSON.stringify(evidence));
