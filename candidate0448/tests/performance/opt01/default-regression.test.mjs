/** Default regression entry: current repository only; no external before/profile/golden inputs. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentRepository = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
process.env.OPT01_PHASE_A_SOURCE_ROOT = currentRepository;
const { phaseSourceRoot, repository } = await import('./phase-a-binding.mjs');
assert.equal(path.resolve(repository), currentRepository, 'Default regression entry must belong to this repository');
assert.equal(path.resolve(phaseSourceRoot), currentRepository, 'Default regression entry must test this repository');

await import('./phase-a-protocol.green.mjs');
await import('./phase-a-eligibility.green.mjs');
await import('./phase-a-capacity.green.mjs');
