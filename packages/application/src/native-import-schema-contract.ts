import { requireDomain } from "../../domain/src/errors.ts";

/** Compatibility is a reviewed finite set, NEVER `>= minimumVersion`.
 * A registry version is not proof that a privileged operator applied these SQL
 * bytes. The isolated migration runner owns byte verification before execution.
 * Future DDL owners must review native/source/proof/lock/publication effects and
 * append a new explicit prefix here, with frozen source hash and regression tests.
 */
const REVIEWED_NATIVE_IMPORT_LEGACY_SCHEMA_CONTRACTS = Object.freeze([
  Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_11_V1", versions: Object.freeze([1,2,3,4,5,6,7,8,9,10,11]), extensions: Object.freeze([]) }),
  Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_12_V1", versions: Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12]), extensions: Object.freeze([
    Object.freeze({ version: 12, file: "0012_history_header_native_reference.sql",
      sha256: "4a42df55804be3f7fb41fca3230364f392ed4338e3a0a80934f7debe7a04b512",
      compatibility: "Adds typed immutable header native-reference directory and publication source coverage; product/native price/source-proof shapes and product lock order unchanged" })
  ]) }),
  Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_13_V1", versions: Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13]), extensions: Object.freeze([
    Object.freeze({ version: 12, file: "0012_history_header_native_reference.sql",
      sha256: "4a42df55804be3f7fb41fca3230364f392ed4338e3a0a80934f7debe7a04b512",
      compatibility: "Adds typed immutable header native-reference directory and publication source coverage; product/native price/source-proof shapes and product lock order unchanged" }),
    Object.freeze({ version: 13, file: "0013_native_party_import.sql",
      sha256: "950f32f8b1298fadd5de4f45be5ec6dc4bc7783db501456c41778f52374f5d54",
      compatibility: "Adds native party import binding and source staging; native product and history source proof remains compatible" })
  ]) }),
  Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_14_V1", versions: Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13,14]), extensions: Object.freeze([
    Object.freeze({ version: 12, file: "0012_history_header_native_reference.sql",
      sha256: "4a42df55804be3f7fb41fca3230364f392ed4338e3a0a80934f7debe7a04b512",
      compatibility: "Adds typed immutable header native-reference directory and publication source coverage; product/native price/source-proof shapes and product lock order unchanged" }),
    Object.freeze({ version: 13, file: "0013_native_party_import.sql",
      sha256: "950f32f8b1298fadd5de4f45be5ec6dc4bc7783db501456c41778f52374f5d54",
      compatibility: "Adds native party import binding and source staging; native product and history source proof remains compatible" }),
    Object.freeze({ version: 14, file: "0014_native_catalogue_import.sql",
      sha256: "5bc80dd2997c2accf6cc1e492e8db98dbb6dbb6be29034b8417f15d94f2f8022",
      compatibility: "Adds native catalogue source bindings and size-group membership proof; prior native product and party import shapes remain compatible" })
  ]) }),
  Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_15_V1", versions: Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]), extensions: Object.freeze([
    Object.freeze({ version: 12, file: "0012_history_header_native_reference.sql",
      sha256: "4a42df55804be3f7fb41fca3230364f392ed4338e3a0a80934f7debe7a04b512",
      compatibility: "Adds typed immutable header native-reference directory and publication source coverage; product/native price/source-proof shapes and product lock order unchanged" }),
    Object.freeze({ version: 13, file: "0013_native_party_import.sql",
      sha256: "950f32f8b1298fadd5de4f45be5ec6dc4bc7783db501456c41778f52374f5d54",
      compatibility: "Adds native party import binding and source staging; native product and history source proof remains compatible" }),
    Object.freeze({ version: 14, file: "0014_native_catalogue_import.sql",
      sha256: "5bc80dd2997c2accf6cc1e492e8db98dbb6dbb6be29034b8417f15d94f2f8022",
      compatibility: "Adds native catalogue source bindings and size-group membership proof; prior native product and party import shapes remain compatible" }),
    Object.freeze({ version: 15, file: "0015_native_import_record_accounting.sql",
      sha256: "0cadbcc3dbd76a1e3546e6db983adac7d2b129ad76fcb99eba43cfaf0068794a",
      compatibility: "Adds once-only native import record claims and reciprocal checkpoint/publication guards; V2 CHUNK/PUBLISH requires explicit whole-command source authorization and accounting on the original receipt-locked transaction; schema recognition alone never enables migration or native publication" })
  ]) }),
  Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_16_V1", versions: Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]), extensions: Object.freeze([
    Object.freeze({ version: 12, file: "0012_history_header_native_reference.sql",
      sha256: "4a42df55804be3f7fb41fca3230364f392ed4338e3a0a80934f7debe7a04b512",
      compatibility: "Adds typed immutable header native-reference directory and publication source coverage; product/native price/source-proof shapes and product lock order unchanged" }),
    Object.freeze({ version: 13, file: "0013_native_party_import.sql",
      sha256: "950f32f8b1298fadd5de4f45be5ec6dc4bc7783db501456c41778f52374f5d54",
      compatibility: "Adds native party import binding and source staging; native product and history source proof remains compatible" }),
    Object.freeze({ version: 14, file: "0014_native_catalogue_import.sql",
      sha256: "5bc80dd2997c2accf6cc1e492e8db98dbb6dbb6be29034b8417f15d94f2f8022",
      compatibility: "Adds native catalogue source bindings and size-group membership proof; prior native product and party import shapes remain compatible" }),
    Object.freeze({ version: 15, file: "0015_native_import_record_accounting.sql",
      sha256: "0cadbcc3dbd76a1e3546e6db983adac7d2b129ad76fcb99eba43cfaf0068794a",
      compatibility: "Adds once-only native import record claims and reciprocal checkpoint/publication guards; V2 CHUNK/PUBLISH requires explicit whole-command source authorization and accounting on the original receipt-locked transaction; schema recognition alone never enables migration or native publication" })
,
    Object.freeze({ version: 16, file: "0016_history_insert_dispatch.sql",
      sha256: "518fd6edcadb30f130061986c2074e61f2884a184a731269ab60c9f9afbb8620",
      compatibility: "Repairs polymorphic historical trigger field planning with two nested table branches; all original predicates/trigger OIDs and native accounting ownership guards remain unchanged" })
  ]) }),
  Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_17_V1", versions: Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]), extensions: Object.freeze([
    Object.freeze({ version: 12, file: "0012_history_header_native_reference.sql",
      sha256: "4a42df55804be3f7fb41fca3230364f392ed4338e3a0a80934f7debe7a04b512",
      compatibility: "Adds typed immutable header native-reference directory and publication source coverage; product/native price/source-proof shapes and product lock order unchanged" }),
    Object.freeze({ version: 13, file: "0013_native_party_import.sql",
      sha256: "950f32f8b1298fadd5de4f45be5ec6dc4bc7783db501456c41778f52374f5d54",
      compatibility: "Adds native party import binding and source staging; native product and history source proof remains compatible" }),
    Object.freeze({ version: 14, file: "0014_native_catalogue_import.sql",
      sha256: "5bc80dd2997c2accf6cc1e492e8db98dbb6dbb6be29034b8417f15d94f2f8022",
      compatibility: "Adds native catalogue source bindings and size-group membership proof; prior native product and party import shapes remain compatible" }),
    Object.freeze({ version: 15, file: "0015_native_import_record_accounting.sql",
      sha256: "0cadbcc3dbd76a1e3546e6db983adac7d2b129ad76fcb99eba43cfaf0068794a",
      compatibility: "Adds once-only native import record claims and reciprocal checkpoint/publication guards; V2 CHUNK/PUBLISH requires explicit whole-command source authorization and accounting on the original receipt-locked transaction; schema recognition alone never enables migration or native publication" })
,
    Object.freeze({ version: 16, file: "0016_history_insert_dispatch.sql",
      sha256: "518fd6edcadb30f130061986c2074e61f2884a184a731269ab60c9f9afbb8620",
      compatibility: "Repairs polymorphic historical trigger field planning with two nested table branches; all original predicates/trigger OIDs and native accounting ownership guards remain unchanged" }),
    Object.freeze({ version: 17, file: "0017_native_payment_import.sql",
      sha256: "d999f9531d925cd320d0d42cf02e00fc6e21b4c010eedb4b90e5e26f1da9b874",
      compatibility: "Adds typed immutable payment creation and optional historical recommendation bindings; prior history/accounting guards remain mandatory, no settlement or nonzero history publication grant" })
  ]) })
] as const);
/** Additive finite18 profile: existing11–17 objects and their exact DDL semantics remain intact.
 * All18 native writers additionally require the full separately pinned runtime capability.
 * Recognition never authorizes a source, existing database migration or publication. */
export const REVIEWED_NATIVE_IMPORT_SCHEMA_CONTRACTS = Object.freeze([
  ...REVIEWED_NATIVE_IMPORT_LEGACY_SCHEMA_CONTRACTS,
  Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_18_V1", versions: Object.freeze([...REVIEWED_NATIVE_IMPORT_LEGACY_SCHEMA_CONTRACTS[6].versions,18] as const), extensions: Object.freeze([
    ...REVIEWED_NATIVE_IMPORT_LEGACY_SCHEMA_CONTRACTS[6].extensions,
    Object.freeze({ version: 18, file: "0018_history_typed_publication.sql",
      sha256: "8cd5595ebfc360564928e456b05e74fa8540bd82bea09ce2e253e4240b9871da",
      compatibility: "Adds complete source-semantic closure manifests and SQL readback; all original provenance/no-adoption/accounting guards plus exact18 runtime routines/ACLs remain required; publication gate remains closed" })
  ]) })
  ,Object.freeze({ id: "NATIVE_IMPORT_SCHEMA_19_V1", versions: Object.freeze([...REVIEWED_NATIVE_IMPORT_LEGACY_SCHEMA_CONTRACTS[6].versions,18,19] as const), extensions: Object.freeze([
    ...REVIEWED_NATIVE_IMPORT_LEGACY_SCHEMA_CONTRACTS[6].extensions,
    Object.freeze({ version: 18, file: "0018_history_typed_publication.sql",
      sha256: "8cd5595ebfc360564928e456b05e74fa8540bd82bea09ce2e253e4240b9871da",
      compatibility: "Adds complete source-semantic closure manifests and SQL readback; all original provenance/no-adoption/accounting guards plus exact18 runtime routines/ACLs remain required; publication gate remains closed" }),
    Object.freeze({ version: 19, file: "0019_history_typed_publish_gate.sql",
      sha256: "d77d7a50d55fafde4a829817b805a7e295dd06c8c62afcc8363b38e1670ae99b",
      compatibility: "Adds independent complete typed publication verification on the original FINAL transaction; exact19 runtime pins, full MAIN source authorization and stock conservation remain mandatory; recognition grants no migration or publication authorization" })
  ]) })
] as const);
function exactOwnPrefix(value: unknown, expected: readonly number[]): boolean {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (length?.value !== expected.length || Reflect.ownKeys(value).length !== expected.length + 1) return false;
  return expected.every((v, i) => { const d = Object.getOwnPropertyDescriptor(value, String(i)); return d?.enumerable && Object.hasOwn(d, "value") && d.value === v; });
}
/** A missing earlier migration, duplicate, empty set or any
 * unknown later version cannot be mistaken for a supported schema. */
export function assertReviewedNativeImportSchema(versions: unknown, options: {
  readonly minimumVersion: number; readonly errorCode: string;
}): typeof REVIEWED_NATIVE_IMPORT_SCHEMA_CONTRACTS[number] {
  const contract = REVIEWED_NATIVE_IMPORT_SCHEMA_CONTRACTS.find(candidate => candidate.versions.length >= options.minimumVersion
    && exactOwnPrefix(versions, candidate.versions));
  requireDomain(Number.isSafeInteger(options.minimumVersion) && options.minimumVersion >= 11 && contract,
    options.errorCode, "Exact explicitly reviewed complete native-import schema prefix required; missing or unknown migrations are rejected");
  return contract;
}
