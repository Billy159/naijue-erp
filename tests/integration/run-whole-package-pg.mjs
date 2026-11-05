/** Does not install/grant or select a target implicitly. See accompanying README. */
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {registerWholePackageSqlAtomicity} from './whole-package-sql-atomicity.mjs';
import {createSyntheticPgSetup} from './whole-package-pg-setup.mjs';
if(process.argv.length!==4||process.argv[2]!=='--confirmed-synthetic-config')throw Error('Usage: node tests/integration/run-whole-package-pg.mjs --confirmed-synthetic-config /absolute/private-config.json');
if(!process.argv[3].startsWith('/'))throw Error('Explicit absolute config path required');
const bytes=await readFile(process.argv[3]);if(bytes.length>65536)throw Error('Config too large');
let config;try{config=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Invalid synthetic config');}finally{bytes.fill(0);}
registerWholePackageSqlAtomicity(test,createSyntheticPgSetup(config));
