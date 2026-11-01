import { DomainError } from '../../../../packages/domain/src/errors.ts';
import type { ProductEditorDraft } from './product-editor-contracts.ts';

/** Presentation only, after the original versioned parser rejects a draft.
 * Never repairs values, changes the command or authorizes/sends a request.
 * CREATE-only requirements follow product-maintenance-validation.ts; V2's
 * explicit empty season array is valid and is not a missing season choice.
 */
export function productRequiredFeedback(draft: ProductEditorDraft | undefined, error: unknown): string | null {
  if (!(error instanceof DomainError) || ![
    'INVALID_PRODUCT_MAINTENANCE', 'PRODUCT_REQUIRED_FIELDS', 'PRODUCT_SCHEME_REQUIRED',
    'PRODUCT_SPEC_REQUIRED', 'PRODUCT_SPEC_CONFLICT', 'PRODUCT_MAINTENANCE_TOO_LARGE',
    'BARCODE_CONFLICT', 'INVALID_PRODUCT_MEDIA_COMMAND',
  ].includes(error.code)) return null;
  if (!draft || (draft.action !== 'CREATE' && draft.action !== 'EDIT')) return '商品操作资料不符合要求，请检查后重试。未发送保存请求。';
  const v = draft.values, missing: string[] = [];
  const blank = (value: unknown) => typeof value !== 'string' || value.trim().length === 0;
  if (blank(v.productCode)) missing.push('款号');
  if (blank(v.name)) missing.push('商品名称');
  if (blank(v.categoryId)) missing.push('商品分类');
  if (draft.action === 'CREATE') {
    if (v.year === null) missing.push('年份');
    if (v.supplierId === null) missing.push('供应商');
    if (!('seasonIds' in v) && v.seasonId === null) missing.push('季节');
    if (blank(v.systemItemCode)) missing.push('系统货号');
  }
  if (blank(v.sizeGroupId)) missing.push('尺码组（规格页）');
  if (draft.action === 'CREATE') {
    if (v.defaultBarcodeSchemeId === null) missing.push('主条码默认方案（条码页）');
    if (!draft.skus.length) {
      const selected = 'skuSelection' in draft ? draft.skuSelection : undefined;
      if (!selected?.colorIds.length) missing.push('颜色（规格页）');
      if (!selected?.fitIds.length) missing.push('版型（规格页）');
    }
  }
  if (missing.length) return `请补全必填资料：${missing.join('、')}。未发送保存请求。`;
  if (draft.action === 'CREATE' && !/^[A-Za-z0-9_-]+$/.test(v.productCode)) return '款号只能使用英文字母、数字、下划线或短横线。未发送保存请求。';
  if (draft.action === 'CREATE' && 'seasonIds' in v && v.seasonIds === null) return '请明确季节选择；可不选季节，但不能保留未知状态。未发送保存请求。';
  if (error.code === 'PRODUCT_MAINTENANCE_TOO_LARGE') return '商品规格或条码数量超过原有技术上限，请检查后重试。未发送保存请求。';
  if (error.code === 'PRODUCT_SPEC_CONFLICT') return '商品规格身份或颜色、版型、尺码组合重复，请检查规格页。未发送保存请求。';
  if (error.code === 'BARCODE_CONFLICT') return '条码原文或身份重复，请检查条码页。未发送保存请求。';
  return '商品资料不符合保存要求，请检查字段格式、规格、条码和价格。未发送保存请求。';
}
