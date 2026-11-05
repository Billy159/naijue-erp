import { requireDomain } from "../../domain/src/errors.ts";

/** Scheme identity is the retained native scheme ID, never a guessed label. */
export const BARCODE_SCHEMES = Object.freeze({
  y2018: "c0b009e7-6f61-447a-b87e-ceea62711ec9",
  y2020: "82656465-2758-4be8-a965-412a971e9c4b",
  y2021: "bc7ff32c-1025-4c30-8950-0b33a492c538",
  y2021fit: "48c4fe44-7521-44c1-a0e3-c547a1691028",
  y2023: "9c584ada-9d42-4159-9e51-208577657021",
  y2026: "0e70e45e-1a51-4d44-afe8-0002cf3fb7ef",
});
const prefixes: Readonly<Record<string, string>> = Object.freeze({
  [BARCODE_SCHEMES.y2018]: "8", [BARCODE_SCHEMES.y2020]: "0",
  [BARCODE_SCHEMES.y2021]: "6", [BARCODE_SCHEMES.y2021fit]: "2",
  [BARCODE_SCHEMES.y2023]: "9", [BARCODE_SCHEMES.y2026]: "5",
});
/** Construct a new value from the product's own default barcode and original
 * reference codes. Historical, already confirmed identities are never changed. */
export function generateSkuBarcode(input: {
  readonly schemeId: string; readonly productSegment: string | null; readonly fitCode: string | null;
  readonly colorCode: string | null; readonly sizeCode: string | null;
}): string {
  const prefix = Object.hasOwn(prefixes, input.schemeId) ? prefixes[input.schemeId] : undefined;
  requireDomain(prefix, "PRODUCT_BARCODE_SCHEME_NOT_READY", "未知条码方案不能生成");
  const valid = (x: string | null): x is string => typeof x === "string" && x.length > 0 && x.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(x);
  requireDomain(valid(input.productSegment), "PRODUCT_BARCODE_ITEM_CODE_REQUIRED", "缺少有效默认条码");
  requireDomain(valid(input.colorCode), "PRODUCT_BARCODE_COLOR_CODE_REQUIRED", "缺少有效颜色编码");
  requireDomain(valid(input.sizeCode), "PRODUCT_BARCODE_SIZE_CODE_REQUIRED", "缺少有效尺码编码");
  const fit = input.schemeId === BARCODE_SCHEMES.y2026 ? input.fitCode : "";
  requireDomain(input.schemeId !== BARCODE_SCHEMES.y2026 || typeof fit === "string" && /^[0-9]+$/.test(fit), "PRODUCT_BARCODE_FIT_CODE_REQUIRED", "缺少数字版型编码");
  const raw = `${prefix}${fit}${input.productSegment}${input.colorCode}${input.sizeCode}`;
  requireDomain(raw.length <= 512, "PRODUCT_BARCODE_TOO_LONG", "条码超过系统可扫码长度，未生成");
  return raw;
}
