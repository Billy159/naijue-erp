import type {SourceOccurrenceEvidence,SourceOccurrenceStorage} from '../../packages/application/src/unified-import-source-reconciliation.ts';
export function readOccurrenceFileWithRegister(path:string,trustedSha256:string,register:(ledger:unknown,sha256:string,storage:SourceOccurrenceStorage)=>SourceOccurrenceEvidence):Promise<SourceOccurrenceEvidence>;
export function occurrenceStorage(evidence:SourceOccurrenceEvidence):SourceOccurrenceStorage|undefined;
export function closeOccurrenceEvidence(evidence:SourceOccurrenceEvidence|undefined):void;
