import {install,initialize,RUNTIME} from './runtime.ts';
if(process.env.POSTGRES_DB!=='business_management'||process.env.POSTGRES_SCHEMA!=='tplus_demo_20260922_a2')throw Error('EXPLICIT_DATABASE_SCHEMA_REQUIRED');
await install();console.log(JSON.stringify({schema:RUNTIME,...await initialize()}));
