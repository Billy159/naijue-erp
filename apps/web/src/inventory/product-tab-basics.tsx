import { ProductReadOnlyBaseSource } from '../products/product-page-base.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import type { ProductReadOnlyReader } from './product-contracts.ts';
import { assertProductBasics } from './product-model.ts';
import { ProductReadState, useProductRead } from './product-tab-state.tsx';
export function ProductTab({ scope, reader }: { readonly scope: ReadScope; readonly reader: Pick<ProductReadOnlyReader, 'readProductBasics'> }) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.readProductBasics(value), assertProductBasics);
  const data = snapshot.success?.data;
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data&&<ProductReadOnlyBaseSource data={data} inDrawer/>}</ProductReadState>;
}
