import type { ProductMaintenanceCommand as ProductMaintenanceCommandV1, ProductMaintenanceCommandV2, ProductMaintenanceResult, ProductWriteValues as ProductWriteValuesV1, ProductWriteValuesV2, ProductMaintenanceDetail as ProductMaintenanceDetailV1, ProductMaintenanceDetailV2 } from '../../../../packages/application/src/product-maintenance-ports.ts';
import type { Selection } from '../inventory/contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import type { ProductMaintenanceCandidateQuery, ProductMaintenanceCandidatePage } from '../../../../packages/application/src/product-maintenance-ports.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import type { DictionaryBrowserReader } from '../product-settings/size-groups/contracts.ts';
import type { HttpQueryError } from '../transport/http-query.ts';
import type { ProductFullPageReadOnlyReader } from './product-page-contracts.ts';
import type { CatalogueSettingsBrowserReader } from '../product-settings/colors/contracts.ts';
export type { ProductMaintenanceResult, ProductAggregate, ProductSkuInput, ProductBarcodeInput, ProductMaintenanceCommandV2, ProductMaintenanceDetailV2, ProductWriteValuesV2 } from '../../../../packages/application/src/product-maintenance-ports.ts';
export type { ProductMaintenanceCandidateQuery, ProductMaintenanceCandidateKind, ProductMaintenanceCandidatePage } from '../../../../packages/application/src/product-maintenance-ports.ts';
export type ProductMaintenanceCommand = ProductMaintenanceCommandV1 | ProductMaintenanceCommandV2;
export type ProductMaintenanceDetail = ProductMaintenanceDetailV1 | ProductMaintenanceDetailV2;
export type ProductWriteValues = ProductWriteValuesV1 | ProductWriteValuesV2;
export interface ProductMaintenanceReader {
  /** Omitted only for retained v1 adapters. Activation remains host-owned. */
  readonly contractVersion?: 1 | 2;
  readDetail(read: QueryRead<{ readonly productId: string }>): Promise<ProductMaintenanceDetail>;
  readCandidates(read: QueryRead<ProductMaintenanceCandidateQuery>): Promise<ProductMaintenanceCandidatePage>;
}
/** Host UI opt-in only; the server independently authorizes every read/write. */
export interface ProductEditorCapability {
  readonly loadStyles: () => Promise<unknown>;
  readonly reader: ProductMaintenanceReader; readonly client: ProductMaintenanceClient;
  readonly newRequestKey: () => string;
  readonly allowedActions: readonly ProductMaintenanceCommand['action'][];
  readonly onRecoveryRequired: (command: ProductMaintenanceCommand) => void;
  readonly productReader: ProductReadOnlyReader;
  readonly dictionaryReader: Pick<DictionaryBrowserReader, 'readSizeGroups'>;
  /** Separate authorized scheme-description read; never executes barcode rules. */
  readonly barcodeSchemeReader?: Pick<DictionaryBrowserReader, 'readBarcodeScheme'>;
  /** Full category-directory enumeration is an explicit independent host grant. */
  readonly categoryReader?: Pick<CatalogueSettingsBrowserReader, 'readCategories'>;
  readonly stock?: ProductFullPageReadOnlyReader['stock'];
  /** Opt in only when the richer authenticated media endpoint is mounted. */
  readonly media?: ProductEditorMediaReader;
}
export interface ProductEditorProps {
  readonly initialTab?: 'stock';
  readonly onOpenInventory?: (product: Selection) => Promise<boolean>;
  readonly parent: ReadScope; readonly productId: string | null; readonly capability: ProductEditorCapability;
  readonly onAccessFailure: (error: HttpQueryError) => void;
  readonly onCanLeaveChange: (guard: (() => boolean) | null) => void;
  readonly onClose: () => void; readonly onSaved: (productId: string) => void;
}
type WithoutKey<T> = T extends unknown ? Omit<T, 'requestKey'> : never;
type WithEditorValues<T> = T extends { readonly values: unknown } ? Omit<T, 'values'> & { readonly values: ProductWriteValues } : T;
export type ProductEditorDraft = WithEditorValues<WithoutKey<ProductMaintenanceCommand>>;
export interface ProductMaintenanceReceipt {
  readonly requestKey: string; readonly action: ProductMaintenanceCommand['action']; readonly status: 'COMMITTED';
  readonly completedAt: string; readonly result: ProductMaintenanceResult;
}
export type ProductMaintenanceErrorKind = 'invalid-request' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'network' | 'timeout' | 'aborted' | 'malformed-response' | 'server';
export class ProductMaintenanceError extends Error {
  readonly kind: ProductMaintenanceErrorKind; readonly code: string; readonly outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read'; readonly status: number | null;
  constructor(kind: ProductMaintenanceErrorKind, code: string, outcome: 'not-sent' | 'rejected' | 'uncertain' | 'read', status: number | null = null) {
    super(({ PRODUCT_EDIT_CONTRACT_UPGRADE_REQUIRED: '商品维护版本已更新，请重新打开页面。', PRODUCT_SEASON_UNKNOWN_RESET: '已确认的季节不能改回历史未知，请重新读取商品。', PRODUCT_SEASON_NOT_READY: '季节维护服务尚未就绪。', MAINTENANCE_PREPARE_NOT_READY: '商品维护服务尚未就绪。' } as Record<string, string>)[code] ?? ({ 'invalid-request': '商品请求未通过校验。', unauthenticated: '登录已失效。', forbidden: '无权执行当前操作。', 'not-found': '未找到商品或操作回执。', conflict: '商品版本或状态已改变。', network: '连接中断。', timeout: '请求超时。', aborted: '已停止等待请求。', 'malformed-response': '服务器返回无效。', server: '服务器暂未完成请求。' } as const)[kind]);
    this.name = kind === 'aborted' ? 'AbortError' : 'ProductMaintenanceError';
    this.kind = kind; this.code = code; this.outcome = outcome; this.status = status;
  }
}
export interface ProductMaintenanceClient {
  readonly contractVersion?: 1 | 2;
  execute(command: ProductMaintenanceCommand, signal: AbortSignal): Promise<ProductMaintenanceResult>;
  receipt(command: ProductMaintenanceCommand, signal: AbortSignal): Promise<ProductMaintenanceReceipt>;
}
export interface ProductEditorOptions {
  readonly scope: ReadScope; readonly client: ProductMaintenanceClient; readonly newRequestKey: () => string;
  readonly onAccessFailure: (error: ProductMaintenanceError) => void;
  /** The session owner must retain the original command when detaching an unsettled editor. */
  readonly onRecoveryRequired: (command: ProductMaintenanceCommand) => void;
}
export interface ProductEditorWriteState {
  readonly phase: 'idle' | 'submitting' | 'checking' | 'uncertain' | 'rejected' | 'committed' | 'disposed';
  readonly command: ProductMaintenanceCommand | null; readonly result: ProductMaintenanceResult | null;
  readonly receipt: ProductMaintenanceReceipt | null; readonly recovery: 'unqueried' | 'absent' | 'failed' | 'found';
  readonly error: ProductMaintenanceError | null;
}

/** Separate from the frozen drawer wire format; unknown legacy roles stay null. */
export type ProductImageRole = 'MAIN' | 'WHITE_BACKGROUND' | 'HANG_TAG' | 'DETAIL' | 'COLOR';
export interface ProductEditorImage {
  readonly id: string; readonly version: number; readonly role: ProductImageRole | null;
  readonly colorId: string | null; readonly displayOrder: number;
  readonly mime: 'image/png' | 'image/jpeg' | 'image/webp'; readonly byteSize: string;
  readonly createdAt: string; readonly createdByAccountId: string | null;
  readonly thumbnailUrl: string | null; readonly thumbnailState: 'READY' | 'UNAVAILABLE';
}
export interface ProductEditorImages {
  readonly productId: string; readonly version: number; readonly images: readonly ProductEditorImage[];
}
export interface ProductEditorMediaReader {
  readImages(read: QueryRead<{ readonly productId: string }>): Promise<ProductEditorImages>;
  /** Only called after the user explicitly requests an original. */
  readOriginal(read: QueryRead<{ readonly productId: string; readonly imageId: string }>): Promise<{
    readonly productId: string; readonly imageId: string; readonly url: string;
  }>;
}
