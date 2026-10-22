import { StandardReadTable } from '../components/standard-read-table.tsx';
import type { ProductBarcodeDetails, ProductBarcodePage } from '../../../../packages/application/src/product-details-query-ports.ts';
import { productBarcodesResponse } from './product-page-validation.ts';
import { ProductPagedRead, type ProductPageTabProps } from './product-page-view.tsx';

export function View({ scope, reader }: ProductPageTabProps) {
  return <ProductPagedRead<ProductBarcodePage> scope={scope} read={reader.barcodes!.read} validate={productBarcodesResponse} label="商品条码分页">{data => <>
    <div className="product-barcode-tools"><span>主条码默认方案</span><span>未提供</span></div>
    <StandardReadTable<ProductBarcodeDetails> label="商品规格条码" rows={data.items} columns={[
      { title: '规格编码', dataIndex: 'skuCode' }, { title: '条码', render: (_, item) => <span className="product-raw-barcode">{item.barcode}</span> },
      { title: '类型', render: (_, item) => item.kind === 'MAIN' ? '主条码' : '已确认旧码' },
      { title: '状态', render: (_, item) => item.enabled ? '启用' : '停用' },
    ]} />{!data.items.length && <p className="product-field-hint">当前商品没有已绑定的规格条码。</p>}
  </>}</ProductPagedRead>;
}
