/** Presentation input only. No record model, fetching, storage or native bridge. */
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
  readonly onOpenChange: (open: boolean) => void;
  readonly onChange: (value: string, option: DemoSingleSelectOption) => void;
}

/**
 * Narrow common subset needed by both existing page-size controls: ungrouped,
 * non-search, non-clear, controlled applied value. No option list is invented.
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
