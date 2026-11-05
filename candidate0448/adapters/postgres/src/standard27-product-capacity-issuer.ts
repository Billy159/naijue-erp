import { requireDomain } from '../../../packages/domain/src/errors.ts';
import type { Runtime27CommandCapability } from '../../../packages/application/src/runtime27-command-capability.ts';
import type { MaintenanceCompletion } from '../../../packages/application/src/maintenance-commit-ports.ts';
import type { PgSalesPool } from './sales-unit-of-work.ts';
import type { ProductCapacityFactory } from './product-maintenance-store.ts';
import { assertIssuedRuntime27Pool } from './runtime27-command-issuer.ts';
import { maintenanceContextClient, bindMaintenanceProductGuard, assertMaintenanceProductCompletion, assertMaintenanceManagedProductContext } from './maintenance-command-unit-of-work.ts';
import { createStandard27ProductCapacityFactory } from './standard27-product-capacity-factory.ts';
import { createStandard27CapacityLifecycle } from './standard27-product-capacity-lifecycle.ts';
import { STANDARD27_PRODUCT_IMPORT_PRIVILEGE_BOUNDARY_SQL } from './standard27-product-import-privilege-boundary.ts';
import { STANDARD27_PRODUCT_INSTALLED_GUARDS_SQL } from './standard27-product-installed-guards.ts';
import { standard27ProductPrerequisiteResult } from './standard27-product-prerequisite-result.ts';
import { assertStandard27ProductCatalogLockWitness } from './standard27-product-catalog-stability.ts';

/** Runtime prerequisite only, NOT product capacity authority. A successful call
 * establishes the existing issuer's pool/context checks, not product provenance,
 * finite writer closure, immutable evidence, or product-specific ACLs/triggers.
 * There is deliberately no callback, boolean override, or caller-supplied pin. */
export async function assertStandard27ProductCapacityRuntime(pool: PgSalesPool,
 runtime: Runtime27CommandCapability, context: object): Promise<void> {
 assertIssuedRuntime27Pool(runtime, pool);
 assertMaintenanceManagedProductContext(context, pool);
 const client = maintenanceContextClient(context, pool);
 const active = () => requireDomain(maintenanceContextClient(context, pool) === client,
  'TRANSACTION_SCOPE', 'Original standard27 product transaction required');
 active(); await runtime.assertReady(client, 'DOCUMENT_COMMAND'); active();
 await runtime.assertReady(client, 'CATALOGUE_READ'); active();
}

// No target has an admitted product-specific catalog/ACL/RLS/source/writer
// closure. Runtime27 command authority alone is insufficient. This source gate
// is not environment configuration and cannot be enabled by request data.
const STANDARD27_PRODUCT_CAPACITY_CLOSURE_ADMITTED: boolean = false;
const assertClosureAdmitted = () => requireDomain(STANDARD27_PRODUCT_CAPACITY_CLOSURE_ADMITTED,
 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Standard27 product writer and provenance closure is not admitted');

/** Default-OFF issuer construction. This builds the owned transaction lifecycle
 * around the narrow CREATE/imported-empty EDIT consumer; it does not broaden to
 * general EDIT, DELETE, historical provenance or legacy26. The gate must remain
 * closed until independently reviewed live closure verification replaces the
 * unresolved admission boundary. No issued factory exists while it is closed.
 * The dormant branch is source plumbing, NOT live-tested issuer acceptance. */
export function createStandard27ProductCapacityIssuer(pool: PgSalesPool,
 runtime: Runtime27CommandCapability): ProductCapacityFactory {
 assertClosureAdmitted(); // Before reading inputs, obtaining a lease, or SQL.
 assertIssuedRuntime27Pool(runtime, pool);
 const contexts = new WeakMap<object, (completion: MaintenanceCompletion) => Promise<void>>();
 return context => {
  assertClosureAdmitted();
  assertMaintenanceManagedProductContext(context, pool);
  const client = maintenanceContextClient(context, pool);
  const existing = contexts.get(context); if (existing) return existing;
  const active = () => requireDomain(maintenanceContextClient(context, pool) === client,
   'TRANSACTION_SCOPE', 'Original product client required');
  const ready = async () => {
   assertClosureAdmitted();
   await assertStandard27ProductCatalogLockWitness(pool, runtime, context);
   await assertStandard27ProductCapacityRuntime(pool, runtime, context);
   active();
   const privilegeResult = await client.query(STANDARD27_PRODUCT_IMPORT_PRIVILEGE_BOUNDARY_SQL);
   active();
   const privileges = standard27ProductPrerequisiteResult(privilegeResult, 'import_surface_closed');
   requireDomain(privileges.import_surface_closed === true,
    'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Known import privilege surface must be isolated from the product runtime');
   const installedResult = await client.query(STANDARD27_PRODUCT_INSTALLED_GUARDS_SQL);
   active();
   const installed = standard27ProductPrerequisiteResult(installedResult, 'guards_present');
   requireDomain(installed.guards_present === true,
    'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Exact product and provenance guard identities must be installed and enabled');
   // Dormant counterpart to the uninstalled provenance barrier candidate.
   // A successful lock is cooperation only, never evidence of installed guards.
   // Reject an import-writer lock held by this backend instead of reentrant
   // shared acquisition that would silently permit mixed read/write provenance.
   const barrierResult = await client.query(`/* standard27-product:provenance-read-barrier */
    WITH k AS (SELECT pg_catalog.hashtextextended('naijue:standard27:product-provenance',0) AS value)
    SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE locktype='advisory' AND granted
      AND pid=pg_backend_pid() AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND classid=((k.value >> 32) & 4294967295)::oid AND objid=(k.value & 4294967295)::oid
      AND objsubid=1 AND mode='ExclusiveLock') THEN false
      ELSE pg_catalog.pg_try_advisory_xact_lock_shared(k.value) END AS locked FROM k`);
   active();
   const barrier = standard27ProductPrerequisiteResult(barrierResult, 'locked');
   requireDomain(barrier.locked === true,
    'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Exclusive provenance writer or contention prevents capacity admission');
   requireDomain(maintenanceContextClient(context, pool) === client, 'TRANSACTION_SCOPE', 'Original product client required');
   await assertStandard27ProductCatalogLockWitness(pool, runtime, context);
  };
  const consumer = createStandard27ProductCapacityFactory(pool, {
   profile: 'STANDARD27_PRODUCT_CAPACITY_HOST_V1', async assertReady(actual, purpose) {
    requireDomain(actual === client && ['CREATE', 'EMPTY_IMPORTED_EDIT'].includes(purpose),
     'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Narrow original-client product scope required');
    await ready();
   },
  })(context);
  const lifecycle = createStandard27CapacityLifecycle(consumer, ready,
   fingerprint => assertMaintenanceProductCompletion(context, pool, fingerprint));
  // Register before work; swallowed consumer failures must still reject COMMIT.
  bindMaintenanceProductGuard(context, pool, lifecycle.precommit);
  const invoke = lifecycle.invoke;
  contexts.set(context, invoke); return invoke;
 };
}
