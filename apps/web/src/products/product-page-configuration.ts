import { productReadOnlyPageTabs, productPageTabAvailable, type ProductFullPageConfiguration, type ProductFullPageReadOnlyReader, type ProductReadOnlyPageTab } from './product-page-contracts.ts';
const invalid = (): never => { throw new TypeError('Explicit own-data product full-page capabilities are required.'); };
function own(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.some(key => typeof key !== 'string' || !required.includes(key) && !optional.includes(key)) || required.some(key => !Object.hasOwn(descriptors, key))) return invalid();
  const captured: Record<string, unknown> = Object.create(null);
  for (const key of keys as string[]) { const d = descriptors[key]!; if (!Object.hasOwn(d, 'value')) return invalid(); captured[key] = d.value; }
  return captured;
}
function method(value: unknown): (...args: never[]) => unknown { if (typeof value !== 'function') return invalid(); return value as (...args: never[]) => unknown; }
/** Capture data descriptors once; getter/symbol/inherited providers cannot run
 * while checking capabilities. Caller mutation cannot alter the captured map. */
export function captureProductFullPageConfiguration(value: unknown): ProductFullPageConfiguration {
  const row = own(value, ['stylesheet', 'allowedTabs', 'initialTab', 'reader']), style = own(row.stylesheet, ['load', 'dispose']);
  const load = method(style.load) as ProductFullPageConfiguration['stylesheet']['load'], dispose = method(style.dispose) as () => void;
  const source = row.allowedTabs;
  if (!Array.isArray(source) || !source.length || Object.getOwnPropertySymbols(source).length) return invalid();
  const tabs: ProductReadOnlyPageTab[] = [];
  for (let i = 0; i < source.length; i++) {
    const d = Object.getOwnPropertyDescriptor(source, String(i));
    if (!d || !Object.hasOwn(d, 'value') || !productReadOnlyPageTabs.includes(d.value) || tabs.includes(d.value)) return invalid();
    tabs.push(d.value);
  }
  if (Reflect.ownKeys(source).length !== source.length + 1 || !tabs.includes(row.initialTab as ProductReadOnlyPageTab)) return invalid();
  const input = own(row.reader, [], [...productReadOnlyPageTabs]);
  const reader: { -readonly [K in keyof ProductFullPageReadOnlyReader]: ProductFullPageReadOnlyReader[K] } = {};
  if (Object.hasOwn(input, 'base')) { const x = own(input.base, ['read']); reader.base = Object.freeze({ read: method(x.read) as NonNullable<ProductFullPageReadOnlyReader['base']>['read'] }); }
  if (Object.hasOwn(input, 'specs')) { const x = own(input.specs, ['read']); reader.specs = Object.freeze({ read: method(x.read) as NonNullable<ProductFullPageReadOnlyReader['specs']>['read'] }); }
  if (Object.hasOwn(input, 'images')) { const x = own(input.images, ['read', 'readImage'], ['classified']);
    type Images=NonNullable<ProductFullPageReadOnlyReader['images']>;type Classified=NonNullable<Images['classified']>;
    let classified:Classified|undefined;
    if(Object.hasOwn(x,'classified')){const c=own(x.classified,['media','readSpecifications']),m=own(c.media,['readImages','readOriginal']);classified=Object.freeze({readSpecifications:method(c.readSpecifications) as Classified['readSpecifications'],media:Object.freeze({readImages:method(m.readImages) as Classified['media']['readImages'],readOriginal:method(m.readOriginal) as Classified['media']['readOriginal']})});}
    reader.images = Object.freeze({ read: method(x.read) as Images['read'], readImage: method(x.readImage) as Images['readImage'],...(classified?{classified}:{}) }); }
  if (Object.hasOwn(input, 'barcodes')) { const x = own(input.barcodes, ['read']); reader.barcodes = Object.freeze({ read: method(x.read) as NonNullable<ProductFullPageReadOnlyReader['barcodes']>['read'] }); }
  if (Object.hasOwn(input, 'prices')) { const x = own(input.prices, ['read']); reader.prices = Object.freeze({ read: method(x.read) as NonNullable<ProductFullPageReadOnlyReader['prices']>['read'] }); }
  if (Object.hasOwn(input, 'stock')) { const x = own(input.stock, ['read'], ['readOverview']); reader.stock = Object.freeze({ read: method(x.read) as NonNullable<ProductFullPageReadOnlyReader['stock']>['read'], ...(Object.hasOwn(x,'readOverview')?{readOverview:method(x.readOverview) as NonNullable<NonNullable<ProductFullPageReadOnlyReader['stock']>['readOverview']>}: {}) }); }
  if (!productPageTabAvailable(reader, row.initialTab as ProductReadOnlyPageTab)) return invalid();
  return Object.freeze({ stylesheet: Object.freeze({ load: () => load(), dispose: () => dispose() }), allowedTabs: Object.freeze(tabs), initialTab: row.initialTab as ProductReadOnlyPageTab, reader: Object.freeze(reader) });
}
export function ownProductFullPageConfiguration(products: object): ProductFullPageConfiguration | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(products, 'fullPage');
  if (!descriptor) { if ('fullPage' in products) return invalid(); return undefined; }
  if (!Object.hasOwn(descriptor, 'value')) return invalid();
  return captureProductFullPageConfiguration(descriptor.value);
}
