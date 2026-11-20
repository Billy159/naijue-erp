/** Distinct152 record specification only. No fixed record exists in this module,
 * and neither caller JSON nor a newly observed digest can authorize execution. */
import { isDeepStrictEqual } from 'node:util';
import { parseStrictJson } from '../../../packages/application/src/unified-import-contract.ts';
import { describeFresh35CatalogSpec } from './fresh35-catalog-contract.mjs';
const blockers=Object.freeze(['INDEPENDENT_SOURCE_DUMP_AND_PG_DEPEND_REVIEW','NEW_EMPTY_TARGET_AND_MIGRATION_LINEAGE','INDEPENDENT_FULL_CATALOG_AND_ACL_REVIEW','DISTINCT_FIXED_RECORD_AND_PROTECTED_PUBLISHER','SAME_PHYSICAL_CLIENT_FRESH35_IMPORT_ADMISSION','ISOLATED_IMPORT_REPLAY_ROLLBACK_AND_ORDINARY_BUSINESS']);
export const FRESH35_RECORD_BLOCKERS=blockers;
function draft(spec){const source=describeFresh35CatalogSpec(spec);return {format:'FRESH35_INSTALLATION_RECORD_SOURCE_DRAFT_V1',profile:source.profile,
 sourceSpecSha256:source.sourceSpecSha256,sourceSetSha256:source.sourceSetSha256,predecessorSourceSpecSha256:source.predecessorSourceSpecSha256,
 schemaDumpSha256:source.schemaDumpSha256,compiledSchemaSha256:source.compiledSchemaSha256,catalogQuerySha256:source.catalogQuerySha256,
 expectedTables:source.retainedTables,routinePins:source.routinePins,physicalTarget:null,installedAt:null,reviewedCatalog:null,
 migrationLineage:null,installTransactionAcknowledgment:null,blockers,sourceOnly:true,installationReady:false,targetAdmitted:false};}
export function renderFresh35RecordDraft(spec){return JSON.stringify(draft(spec),null,2)+'\n';}
export function validateFresh35RecordDraft(text,spec){if(typeof text!=='string'||Buffer.byteLength(text)>262144)throw Error('FRESH35_RECORD_DRAFT_BOUNDS');if(!isDeepStrictEqual(parseStrictJson(text),draft(spec)))throw Error('FRESH35_RECORD_DRAFT_DIFFERS');return Object.freeze({validDraft:true,sourceOnly:true,installationReady:false,targetAdmitted:false});}
export async function loadFresh35InstalledRecord(){throw Error('FRESH35_DISTINCT_FIXED_RECORD_NOT_IMPLEMENTED');}
export async function publishFresh35InstalledRecord(){throw Error('FRESH35_DISTINCT_FIXED_RECORD_NOT_IMPLEMENTED');}
