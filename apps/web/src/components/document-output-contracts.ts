import type { SalesDetailDto } from '../sales/contracts.ts';
import type { TransferDetailDto } from '../transfers/contracts.ts';
import { transferMatrix } from '../transfers/matrix.ts';

/** A complete, authorized saved document. Callers must not pass a visible
 * list page, an unconfirmed draft, or a command receipt as the whole document. */
export interface DocumentOutput {
  readonly kind: 'sales' | 'transfer'; readonly id: string; readonly version: number;
  readonly title: string; readonly number: string;
  readonly metadata: readonly (readonly [string, string | null])[];
  readonly sections: readonly DocumentOutputSection[];
  readonly printSections?: readonly DocumentOutputSection[];
  readonly printMetadata?: readonly (readonly [string, string | null])[];
  /** Print-only actual-product count and the already-authorized full category projection. */
  readonly printSummary?: { readonly productCount: string | null; readonly categorySummary?: NonNullable<TransferDetailDto['categorySummary']> };
  readonly totals: readonly (readonly [string, string])[];
  readonly notes: readonly string[];
}
export interface DocumentOutputSection {
  readonly title: string; readonly columns: readonly string[];
  readonly rows: readonly (readonly (string | null)[])[];
}
const statuses = { DRAFT: '未审核', APPROVED: '已审核', VOID: '已作废' } as const;
const types = { SALE: '销售', RETURN: '退货', EXCHANGE: '换货' } as const;
/** The native DTO stores integer minor units. Never route money through Number. */
function money(value: string): string {
  const n = BigInt(value), absolute = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
const lineColumns = ['原行编号', 'SKU 编号', '款号', '商品名称', '颜色', '版型', '尺码', '数量', '原保存条码'] as const;
function printColumns(section: DocumentOutputSection, indices: readonly number[]): DocumentOutputSection {
  return { title: section.title, columns: indices.map(index => section.columns[index]!), rows: section.rows.map(row => indices.map(index => row[index]!)) };
}
export function salesDocumentOutput(data: SalesDetailDto): DocumentOutput {
  const { header: h, lines, settlements } = data.document;
  const names = new Map(data.settlementNames.map(row => [row.settlementId, row]));
  const groups = h.businessType === 'SALE' ? [{ title: '销售商品', lines }]
    : h.businessType === 'RETURN' ? [{ title: '退回商品', lines }]
      : [{ title: '退回商品', lines: lines.filter(row => BigInt(row.quantity) < 0n) }, { title: '换出商品', lines: lines.filter(row => BigInt(row.quantity) >= 0n) }];
  const sections: DocumentOutputSection[] = groups.map(group => ({ title: group.title,
    columns: [...lineColumns, '参考零售价', '折扣（折）', '成交单价', '金额', '分摊优惠', '赠品'],
    rows: group.lines.map(row => [row.id, row.skuId, row.snapshot.productCode, row.snapshot.productName, row.snapshot.colorName, row.snapshot.fitName, row.snapshot.sizeName,
      row.quantity, row.snapshot.barcode, row.referencePrice === null ? null : money(row.referencePrice), row.discountTenths === null ? null : `${Math.trunc(row.discountTenths / 10)}.${row.discountTenths % 10}`,
      money(row.dealPrice), money(row.lineAmount), money(row.allocatedDiscount), row.isGift ? '是' : '否']),
  }));
  sections.push({ title: '收退款明细', columns: ['原记录编号', '方向', '原付款方式编号', '原付款方式名称', '资金账户编号', '原资金账户名称', '金额'],
    rows: settlements.map(row => [row.id, row.direction === 'RECEIVE' ? '收款' : '退款', row.paymentMethodId, names.get(row.id)?.methodNameSnapshot ?? null, row.paymentAccountId, names.get(row.id)?.accountNameSnapshot ?? null, money(row.amount)]) });
  const incoming = lines.filter(row => !row.isGift && BigInt(row.quantity) < 0n).reduce((sum, row) => sum - BigInt(row.quantity), 0n);
  const outgoing = lines.filter(row => !row.isGift && BigInt(row.quantity) > 0n).reduce((sum, row) => sum + BigInt(row.quantity), 0n);
  return { kind: 'sales', id: h.id, version: h.version, title: `奈爵服饰 · 销货单（${types[h.businessType]}）`, number: h.number,
    metadata: [['单据日期', h.businessDate], ['单据编号', h.number], ['状态', statuses[h.status]], ['版本', String(h.version)], ['营业厅', data.referenceNames.hallName], ['客户', data.referenceNames.customerName],
      ['营业员', data.referenceNames.salespersonName], ['仓库', data.referenceNames.warehouseName], ['创建账号编号', h.createdByAccountId], ['创建时间', h.createdAt], ['审核账号编号', h.approvedByAccountId], ['审核时间', h.approvedAt], ['最后更新', h.updatedAt], ['备注', h.note]], sections,
    totals: [...(h.businessType === 'SALE' ? [['数量（不含赠品）', (outgoing - incoming).toString()] as const] : [['退回数量（不含赠品）', incoming.toString()] as const, ['换出数量（不含赠品）', outgoing.toString()] as const]),
      ['商品金额', money(h.grossAmount)], ['整单优惠', money(h.orderDiscount)], ['应结金额', money(h.netDue)], ['收款减退款', money(settlements.reduce((sum, row) => sum + (row.direction === 'RECEIVE' ? 1n : -1n) * BigInt(row.amount), 0n).toString())]],
    printMetadata: [['单据日期', h.businessDate], ['单据编号', h.number], ['状态', statuses[h.status]], ['版本', String(h.version)], ['营业厅', data.referenceNames.hallName], ['客户', data.referenceNames.customerName], ['营业员', data.referenceNames.salespersonName], ['仓库', data.referenceNames.warehouseName], ['备注', h.note]],
    printSections: sections.map((section, index) => index === sections.length - 1
      ? {...printColumns(section,[1,3,5,6]),columns:['方向','收款方式','资金账户','金额']}
      : {title:section.title,columns:['款号／商品','颜色／版型／尺码','数量','单价','金额'],rows:section.rows.map(row=>[
        [row[2],row[3]].map(value=>value??'未记录').join(' / ')+(row[14]==='是'?'（赠品）':''),
        [row[4],row[5],row[6]].map(value=>value??'未记录').join(' / '),
        row[7]?.replace(/^-/,'')??null,row[11]??null,row[12]?.replace(/^-/,'')??null])}),
    notes: ['商品与收退款名称为原保存记录；营业厅、客户、营业员和仓库名称为当前资料。', '金额单位：元；未记录的事实标为“未记录”。', ...(h.status === 'VOID' ? ['本单已作废，不计入有效销售。'] : [])],
  };
}
export function transferDocumentOutput(data: TransferDetailDto): DocumentOutput {
  const { header: h, lines } = data.document;
  const matrices = transferMatrix(data);
  // A current native catalogue must never supply missing historical classification.
  const history = data.stockBasis === 'CUTOFF_HISTORY';
  const categorySummary = history ? { basis: 'UNKNOWN', metric: 'PRODUCT_COUNT', categoryCount: null, items: [], hasMore: false } as const : data.categorySummary;
  return { kind: 'transfer', id: h.id, version: h.version, title: '杰威亚服饰发货单（调拨单）', number: h.number,
    metadata: [['单据日期', h.businessDate], ['单据编号', h.number], ['状态', statuses[h.status]], ['版本', String(h.version)], ['调出仓库', data.references.fromWarehouseName], ['调入仓库', data.references.toWarehouseName],
      ['制单人', data.references.createdByName], ['创建时间', h.createdAt], ['审核人', data.references.approvedByName], ['审核时间', h.approvedAt], ['最后更新', h.updatedAt], ['备注', h.note]],
    sections: [{ title: '调拨原保存明细', columns: lineColumns, rows: lines.map(row => [row.id, row.skuId, row.snapshot.productCode, row.snapshot.productName, row.snapshot.colorName, row.snapshot.fitName, row.snapshot.sizeName, row.quantity, row.snapshot.barcode]) }],
    printSections: matrices.map(section => ({ title: section.group.name, columns: ['商品名称', '款号', '颜色', '版型', ...section.group.members.map(size => size.name), '小计'],
      rows: section.rows.map(row => [row.current.productName, row.current.productCode, row.current.colorName, row.current.fitName, ...section.group.members.map(size => {
        const sku = row.skus.get(size.sizeId); return sku ? row.quantities.get(sku.skuId)?.toString() ?? '' : '—';
      }), row.total.toString()]),
    })),
    printSummary: { productCount: history ? null : String(new Set(matrices.flatMap(section => section.rows.map(row => row.current.productId))).size), ...(categorySummary ? { categorySummary } : {}) },
    totals: [['数量', lines.reduce((sum, row) => sum + BigInt(row.quantity), 0n).toString()]],
    notes: ['打印矩阵按当前规范规格展示；导出逐行保留原保存名称、规格和条码。仓库与人员名称为当前资料。', '数量为本单数量，不代表实时库存。', ...(data.stockBasis === 'CUTOFF_HISTORY' ? ['历史截止导入记录。'] : [])],
  };
}
