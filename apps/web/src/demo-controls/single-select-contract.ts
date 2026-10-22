import type { Ref, ReactNode } from 'react';
/** Presentation input only. No record model, fetching, storage or native bridge. */
export interface DemoSingleSelectFocusHandle { focus(): void }
export interface DemoSingleSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

interface CommonProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly DemoSingleSelectOption[];
  readonly disabled: boolean;
  readonly open: boolean;
  readonly focusOnMount?: boolean;
  readonly placeholder?: string;
  readonly loading?: boolean;
  readonly dropdownRender?: (menu: ReactNode) => ReactNode;
  /** Accessibility metadata only; no native value coercion or business validation. */
  readonly required?: boolean;
  /** Optional remote search. Raw text belongs to the caller; no local filtering. */
  readonly onSearch?: (value: string) => void;
  /** Public installed Select focus API; the owner decides whether it still owns focus. */
  readonly focusRef?: Ref<DemoSingleSelectFocusHandle>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChange: (value: string, option: DemoSingleSelectOption) => void;
}

/**
 * Narrow common subset needed by the three page-size controls: ungrouped,
 * non-clear, controlled applied value. Search is opt-in; no option list is invented.
 * Other single values may use the original tag or flat presentation explicitly.
 */
export type DemoSingleSelectActionProps = CommonProps & (
  | { readonly presentation: 'page-size'; readonly popupWidth?: never; readonly placement?: never }
  | { readonly presentation: 'tag' | 'flat'; readonly popupWidth: number; readonly placement?: 'bl' | 'tl' }
);

/** No Arco, CSS, DOM effects or data access occur until this function is called. */
export function loadDemoSingleSelectAction() {
  return import('./single-select-action.tsx');
}

/** Existing scoped stylesheet lease; no CSS is loaded at contract import. */
export { createDemoSingleSelectStyles } from './single-select-styles.ts';
