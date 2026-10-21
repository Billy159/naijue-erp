/** Opt-in migration-only target. No installation, provisioning, fixture or import. */
import { integrationSettings, safeTarget } from '../tests/integration/safety.ts';
import { openFreshHistoryDatabase } from '../tests/integration/history-database.ts';
const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--run-schema11-migrations-only') {
  console.error('Refused: explicit --run-schema11-migrations-only and prior exact disposable Mac target approval required. No connection attempted.');
  process.exitCode = 2;
} else {
  try {
    const settings = integrationSettings(process.env);
    const database = await openFreshHistoryDatabase(settings);
    try { console.log(JSON.stringify({ phase: 'SCHEMA11_MIGRATIONS_ONLY', target: safeTarget(settings), migrations: [1,2,3,4,5,6,7,8,9,10,11], sourceProofAcceptance: 'NOT_RUN', realImport: false })); }
    finally { await database.close(); }
  } catch (error) {
    // Error messages from our guards are sanitized; never echo arbitrary driver errors.
    console.error('Schema11 migration-only verification failed; inspect sanitized guard diagnostics in an approved local debugger. No business/import success claimed.');
    process.exitCode = 1;
  }
}
