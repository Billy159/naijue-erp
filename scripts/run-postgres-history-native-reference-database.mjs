/** Separate opt-in schema12 migration-only runner. No provisioning, .env loading,
 * fixtures, source import, source-proof acceptance or publication. */
const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--run-schema12-migrations-only') {
  console.error('Refused: explicit --run-schema12-migrations-only and prior exact disposable local target approval required. No connection attempted.');
  process.exitCode = 2;
} else {
  try {
    // Refuse missing/old flags without loading TypeScript helpers or pg at all.
    const { nativeReferenceIntegrationSettings, openFreshHistoryNativeReferenceDatabase } = await import('../tests/integration/history-native-reference-database.ts');
    const { safeTarget } = await import('../tests/integration/safety.ts');
    const settings = nativeReferenceIntegrationSettings(process.env);
    const database = await openFreshHistoryNativeReferenceDatabase(settings);
    try {
      console.log(JSON.stringify({ phase: 'SCHEMA12_MIGRATIONS_ONLY', target: safeTarget(settings), migrations: [1,2,3,4,5,6,7,8,9,10,11,12],
        migrationExecution: 'PASS', sourceProofAcceptance: 'NOT_RUN', nativeReferenceAcceptance: 'NOT_RUN', realImport: false, published: false }));
    } finally { await database.close(); }
  } catch {
    console.error('Schema12 migration-only verification failed; no engine/source/import acceptance is claimed. Inspect sanitized guard diagnostics in an approved local debugger.');
    process.exitCode = 1;
  }
}
