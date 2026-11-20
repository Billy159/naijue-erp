import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import type { MaintenanceCompletion } from '../../../packages/application/src/maintenance-commit-ports.ts';
import { safeStandard27CapacitySnapshot } from './standard27-product-create-capacity.ts';

/** Transaction state machine only. These callbacks are NOT proof and this helper
 * issues no capacity, pool, or runtime authority. The closed issuer owns the
 * actual callbacks and must bind precommit to its managed transaction. */
export function createStandard27CapacityLifecycle(
 consumer: (completion: MaintenanceCompletion) => Promise<void>, ready: () => Promise<void>,
 assertCompleted: (fingerprint: string) => void,
): Readonly<{invoke: (input: MaintenanceCompletion) => Promise<void>; precommit: () => Promise<void>}> {
 let fingerprint: string | undefined, busy = false, failed = false, closed = false;
 const check = (value: unknown, message: string) => requireDomain(value, 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', message);
 const invoke = async (input: MaintenanceCompletion) => {
  if (busy || closed) failed = true;
  check(!busy && !failed && !closed, 'Product issuer scope busy, closed or poisoned');
  busy = true;
  try {
   const completion = safeStandard27CapacitySnapshot(input) as MaintenanceCompletion;
   const next = requestHash(completion);
   check(fingerprint === undefined || fingerprint === next, 'Only original admitted completion may replay');
   await consumer(completion); await ready();
   check(!failed && !closed, 'Concurrent activity poisoned product admission');
   fingerprint = next;
  } catch (error) { failed = true; throw error; } finally { busy = false; }
 };
 const precommit = async () => {
  const previouslyClosed = closed;
  closed = true; // Close admission synchronously, before the first await.
  try {
   check(!previouslyClosed && !busy && !failed && fingerprint !== undefined, 'Complete successful product admission required');
   const original = fingerprint!;
   assertCompleted(original);
   await ready();
   check(!busy && !failed && fingerprint === original, 'Product scope changed during precommit');
   assertCompleted(original); // Completion itself must still match after await.
  } catch (error) { failed = true; throw error; }
 };
 return Object.freeze({invoke, precommit});
}
