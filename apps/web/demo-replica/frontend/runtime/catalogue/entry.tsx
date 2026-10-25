import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import type { CatalogueMaintenanceCapability } from '../../../../src/product-settings/colors/contracts.ts';
import { createCatalogueSettingsHttpReader } from '../../../../src/product-settings/colors/http-reader.ts';
import { createDictionaryHttpReader } from '../../../../src/product-settings/size-groups/http-reader.ts';
import type { ProductSettingTab } from '../../../../src/product-settings/size-groups/contracts.ts';
import type { CatalogueEditorController } from '../../../../src/product-settings/catalogue-maintenance-state.ts';

export interface CatalogueRuntimeOptions {
  readonly scope: ReadScope;
  readonly http: HttpQueryOptions;
  readonly initialSettingTab?: ProductSettingTab;
  /** Internal subset of the existing public settings flags; omitted keeps all four. */
  readonly allowedSettingTabs?: readonly ProductSettingTab[];
  readonly maintenance?: Partial<Record<'CATEGORY' | 'COLOR' | 'FIT', CatalogueMaintenanceCapability>>;
  /** Existing controllers owned by the current session, not by page mount. */
  readonly commandOwners?: Partial<Record<'CATEGORY' | 'COLOR' | 'FIT', CatalogueEditorController>>;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
  readonly onCanLeaveChange: (guard: (() => boolean) | null) => void;
  /** Current product consumers invalidate their own affected directory reads. */
  readonly onChanged: (kind: 'CATEGORY' | 'COLOR' | 'FIT') => void;
  /** Legacy host slot retained for C's other callers; catalogue now consumes the
   * shared inventory/Pagination React component in its existing page root. */
  readonly renderPager?: (options: Record<string, unknown>) => string;
  /** Unchanged product-arco.jsx arcoCss + local `css`, supplied by C's one runtime. */
  readonly categoryControlCss: string;
  /** Original INVENTORY_EMPTY mount and its paired beforeRender cleanup. */
  readonly mountEmpty: (host: HTMLElement) => () => void;
}
export type CataloguePageOptions = CatalogueRuntimeOptions & {
  readonly catalogue: ReturnType<typeof createCatalogueSettingsHttpReader>;
  readonly dictionaries: ReturnType<typeof createDictionaryHttpReader>;
};

/** C calls on the actual menu transition after retiring that route's frozen
 * renderer/listeners. No page code or data is loaded before this call. */
export async function mountCatalogue(host: HTMLElement, route: 'product-categories' | 'product-settings' | 'barcode-schemes', options: CatalogueRuntimeOptions): Promise<() => void> {
  if (route === 'product-settings') {
    const allowed = options.allowedSettingTabs ?? ['colors', 'groups', 'fits', 'seasons'];
    if (allowed.length === 0 || allowed.some(tab => !['colors', 'groups', 'fits', 'seasons'].includes(tab))
      || options.initialSettingTab !== undefined && !allowed.includes(options.initialSettingTab)) throw new TypeError('Initial product setting tab must belong to the allowed settings.');
    options = { ...options, allowedSettingTabs: [...allowed] };
  }
  for (const kind of ['CATEGORY', 'COLOR', 'FIT'] as const) {
    const capability = options.maintenance?.[kind];
    if (capability && (capability.kind !== kind || capability.client.kind !== kind)) throw new TypeError('Catalogue maintenance kind does not match this route capability.');
  }
  const page = route === 'product-categories' ? await import('./category-page.tsx')
    : route === 'product-settings' ? await import('./dictionary-page.tsx') : await import('./scheme-page.tsx');
  if (!options.scope.active) return () => {};
  // Frozen product-current.js activates the page's final layout selectors.
  // Keep that presentation mode local to these routes, not the shared shell.
  const body = host.ownerDocument.body;
  const hadProductMode = body.classList.contains('pc-mode');
  body.classList.add('pc-mode');
  let release: () => void;
  try {
    release = page.mount(host, { ...options, catalogue: createCatalogueSettingsHttpReader(options.http), dictionaries: createDictionaryHttpReader(options.http) });
  } catch (error) {
    if (!hadProductMode) body.classList.remove('pc-mode');
    throw error;
  }
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try { release(); } finally { if (!hadProductMode) body.classList.remove('pc-mode'); }
  };
  const abort = () => dispose();
  options.scope.signal.addEventListener('abort', abort, { once: true });
  return () => { options.scope.signal.removeEventListener('abort', abort); dispose(); };
}

/** F2's original product consumer calls this only on View scheme. Its own child
 * scope retains cancellation/identity ownership; there is no list prefetch. */
export async function mountBarcodeSchemeDetail(host: HTMLElement, schemeId: string, options: Pick<CatalogueRuntimeOptions, 'scope' | 'http' | 'onAccessFailure'>, close: () => void): Promise<() => void> {
  const page = await import('./scheme-page.tsx');
  if (!options.scope.active) return () => {};
  const release = page.mountDetail(host, schemeId, { scope: options.scope, onAccessFailure: options.onAccessFailure, dictionaries: createDictionaryHttpReader(options.http) }, close);
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; release(); } };
  options.scope.signal.addEventListener('abort', dispose, { once: true });
  return () => { options.scope.signal.removeEventListener('abort', dispose); dispose(); };
}
