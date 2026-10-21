import type { ComponentType } from 'react';
import type { CandidateKind, InventoryReader, Selection } from '../inventory/contracts.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { DemoMultiSelectPopupHost } from '../demo-controls/multi-select.tsx';
export interface CandidateSelectorProps {
  readonly label: string;
  readonly kind: CandidateKind;
  readonly selected: readonly Selection[];
  readonly multiple?: boolean;
  readonly reader: InventoryReader;
  readonly productReader?: ProductReadOnlyReader;
  readonly scope: ReadScope;
  readonly popupHost?: DemoMultiSelectPopupHost | null;
  readonly categoryIds: readonly string[];
  readonly placeholder?: string;
  readonly onChange: (items: readonly Selection[]) => void;
}
export interface ProductCandidateActionProps extends CandidateSelectorProps {
  readonly open: boolean;
  readonly activationScope: ReadScope | null;
  readonly search: string;
  readonly onSearch: (search: string) => void;
  readonly onOpen: (open: boolean) => void;
  readonly focusOnMount: boolean;
}
export interface ProductCandidateActionModule {
  readonly ProductCandidateAction: ComponentType<ProductCandidateActionProps>;
  readonly createInventoryProductSelectStyles: (document: Document) => { load(): Promise<void>; dispose(): void };
}
