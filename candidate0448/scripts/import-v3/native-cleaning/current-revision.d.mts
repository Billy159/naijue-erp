/** Exact source-row pointers only, never target IDs or publication authority. */
export type PgInt32Input = number | string;
export interface SourceDocumentPointer { readonly id: string; readonly current_revision: PgInt32Input; }
export interface SourceRevisionPointer { readonly document_id: string; readonly revision: PgInt32Input; readonly original_imported: boolean; readonly body: unknown; }
export interface CurrentSelection { readonly documentIndex: number; readonly revisionIndex: number; readonly documentId: string; readonly currentRevision: number; readonly originalImported: boolean; }
export interface CurrentRevisionSelection {
 readonly selected: readonly CurrentSelection[];
 readonly counts: { readonly documents: number; readonly revisions: number; readonly selected: number; readonly unselectedRevisions: number; };
}
/** Caller must supply one complete, upstream-bounded snapshot cohort; runtime checks metadata.
 * Opaque body is neither copied nor traversed. Unknown input permits fail-closed validation.
 */
export function selectCurrentRevisionPointers(input: unknown): CurrentRevisionSelection;
