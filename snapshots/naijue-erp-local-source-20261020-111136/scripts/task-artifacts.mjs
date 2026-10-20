import {resolve} from 'node:path';
import {root} from './files.mjs';

export const evidenceTask = process.env.ERP_TASK_ID ?? 'T07';
if (!/^T\d{2}$/.test(evidenceTask)) throw new Error('Invalid evidence task ID');
export const releaseDirectory = resolve(root, evidenceTask === 'T07' ? 'outputs/releases' : `outputs/${evidenceTask}/release`);
export const taskLogDirectory = resolve(root,'logs',evidenceTask);
export const taskOutputDirectory = resolve(root,'outputs',evidenceTask);
