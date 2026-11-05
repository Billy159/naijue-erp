/** Explicit fresh, isolated, synthetic local PG only. Source ready, NOT EXECUTED. */
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {registerWholePackageSqlAtomicity} from './whole-package-sql-atomicity.mjs';
import {createSyntheticPgSetup} from './whole-package-pg-setup.mjs';
if(process.argv.length!==4||process.argv[2]!=='--confirmed-synthetic-config'||!process.argv[3].startsWith('/'))
 throw Error('Usage: node tests/integration/run-whole-package-zero-pg.mjs --confirmed-synthetic-config /absolute/private-config.json');
const bytes=await readFile(process.argv[3]);if(bytes.length>65536)throw Error('Config too large');
let config;try{config=JSON.parse(bytes.toString('utf8'));}catch{throw Error('Invalid synthetic config');}finally{bytes.fill(0);}
const modes=['zero-unknown-success','zero-unknown-rollback'];
registerWholePackageSqlAtomicity(test,createSyntheticPgSetup(config,modes),modes);
