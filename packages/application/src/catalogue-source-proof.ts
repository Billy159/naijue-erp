import { requireDomain } from "../../domain/src/errors.ts";
import { entityId, version } from "../../domain/src/values.ts";
import { CATALOGUE_PRICE_KEYS, CATALOGUE_PRICE_VALIDATOR_VERSION, validateCompleteCataloguePrices } from "./catalogue-price-input.ts";
import type { CompleteCataloguePrices } from "./catalogue-price-input.ts";

export const CATALOGUE_SOURCE_PRICE_FIELDS = Object.freeze({ purchase_price: "采购价", retail_price: "零售价",
  wholesale5_price: "五级批发价（工厂店供货价）", wholesale6_price: "六级批发价（贴牌价）", wholesale7_price: "七级批发价（批发价）",
  wholesale8_price: "八级批发价（代理商供货价）", wholesale9_price: "九级批发价（工厂店零售价）", wholesale10_price: "十级批发价（葛玉珠）", minimum_price: "最低售价" });
export type CatalogueBlankPricePolicy = "EXPLICIT_NULL_ONLY" | "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET";
export interface CatalogueSourcePriceProof {
  readonly schema_version: 1; readonly validator_version: typeof CATALOGUE_PRICE_VALIDATOR_VERSION;
  readonly product_version: number; readonly blank_price_policy: CatalogueBlankPricePolicy; readonly prices: CompleteCataloguePrices;
}
/** Publication mapping helper, NOT an HTTP input or grant. The caller must own the
 * reviewed source contract, preserve/hash the actual original row, bind a real
 * native target, and persist this metadata in the same import transaction.
 * The V03 policy is the already-reviewed exact price-column blank semantics;
 * it does not apply to omitted columns, whitespace, formulas or unknown sources. */
export function createCatalogueSourcePriceProof(input: { readonly nativeProductId: string; readonly productVersion: number;
  readonly rawFields: Readonly<Record<string, unknown>>; readonly blankPricePolicy: CatalogueBlankPricePolicy }):
  Readonly<{ native_product_id: string; product_input_proof: CatalogueSourcePriceProof }> {
  const nativeProductId = entityId("product", input.nativeProductId), productVersion = version(input.productVersion);
  requireDomain(input.blankPricePolicy === "EXPLICIT_NULL_ONLY" || input.blankPricePolicy === "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET",
    "INCOMPLETE_CATALOGUE_PRICE_INPUT", "A reviewed exact blank policy is required");
  requireDomain(input.rawFields !== null && typeof input.rawFields === "object" && !Array.isArray(input.rawFields),
    "INCOMPLETE_CATALOGUE_PRICE_INPUT", "Actual raw source row required");
  const prices: Record<string, unknown> = {};
  for (const key of CATALOGUE_PRICE_KEYS) {
    const sourceKey = CATALOGUE_SOURCE_PRICE_FIELDS[key];
    requireDomain(Object.hasOwn(input.rawFields, sourceKey), "INCOMPLETE_CATALOGUE_PRICE_INPUT", "Missing source price column is unknown");
    const raw = input.rawFields[sourceKey];
    prices[key] = raw === "" && input.blankPricePolicy === "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" ? null : raw;
  }
  const proof: CatalogueSourcePriceProof = Object.freeze({ schema_version: 1, validator_version: CATALOGUE_PRICE_VALIDATOR_VERSION,
    product_version: productVersion, blank_price_policy: input.blankPricePolicy, prices: validateCompleteCataloguePrices(prices) });
  return Object.freeze({ native_product_id: nativeProductId, product_input_proof: proof });
}
