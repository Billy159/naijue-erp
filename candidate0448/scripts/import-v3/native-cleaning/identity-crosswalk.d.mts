/** Source namespace/kind/ID are opaque labels, not SQL identifiers or approval. */
export type UuidTargetKind = 'CATEGORY' | 'COLOR' | 'FIT' | 'SIZE' | 'SIZE_GROUP' | 'SEASON' |
 'PRODUCT' | 'SKU' | 'CUSTOMER' | 'SUPPLIER' | 'HALL' | 'WAREHOUSE' | 'STAFF' | 'USER_ACCOUNT' |
 'PAYMENT_METHOD' | 'PAYMENT_ACCOUNT';
export interface IdentityDemand { readonly sourceKind: string; readonly sourceId: string; readonly targetKind: UuidTargetKind; }
export interface IdentityMapping extends IdentityDemand { readonly targetId: string; }
export interface IdentityReference extends IdentityDemand { readonly referenceId: string; }
export interface IdentityCrosswalkInput {
 readonly sourceNamespace: string; readonly targetNamespace: string;
 readonly demands: readonly IdentityDemand[]; readonly mappings: readonly IdentityMapping[];
 readonly references: readonly IdentityReference[];
}
export interface ResolvedIdentity extends IdentityMapping { readonly demandIndex: number; readonly mappingIndex: number; }
export interface ResolvedReference extends IdentityReference { readonly referenceIndex: number; readonly demandIndex: number; readonly mappingIndex: number; readonly targetId: string; }
export interface ConsistentIdentityCrosswalk {
 readonly status: 'CONSISTENT_GIVEN_COHORT_NOT_AUTHORIZED';
 readonly sourceNamespace: string; readonly targetNamespace: string;
 readonly identities: readonly ResolvedIdentity[]; readonly references: readonly ResolvedReference[];
 readonly counts: { readonly demands: number; readonly mappings: number; readonly references: number; };
}
/** Pure consistency only; unknown input validated without reading accessor/proxy values.
 * No UUID allocation, DB access, role/credential choice, actual FK or source completeness proof.
 * All arrays <=100000 entries; aggregate input metadata text <=32 MiB UTF-8. See IDENTITY-CROSSWALK.zh-CN.md for scope and exact limits.
 */
export function validateIdentityCrosswalk(input: unknown): ConsistentIdentityCrosswalk;
