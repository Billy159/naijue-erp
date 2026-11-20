import { transferCount } from './format.ts';

/** Presentation only. Callers explicitly choose current catalogue or saved
 * snapshot facts; these helpers never resolve or substitute a domain value. */
export function transferReadProduct(code: string, name: string) {
  return <><strong title={code}>{code}</strong><span className="transfer-read-product-name" title={name}>{name}</span></>;
}
export function transferReadText(value: string) { return { props: { title: value }, children: value }; }
export function transferReadQuantity(value: string) { return transferReadText(transferCount(value)); }
