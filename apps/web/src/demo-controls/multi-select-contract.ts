import type { ReactNode, UIEvent } from 'react';

/** Presentation input only. Candidates and completeness belong to the caller. */
export interface DemoMultiOption {
  readonly id: string;
  readonly name: string;
  readonly searchTerms?: readonly string[];
  /** Native relationship only; absence never fabricates a parent candidate. */
  readonly parentId?: string | null;
  /** Prevents a new selection, not removal of an already-selected value. */
  readonly disabled?: boolean;
}

export interface DemoMultiSelectActionProps {
  readonly label: string;
  readonly allLabel: string;
  readonly options: readonly DemoMultiOption[];
  readonly selectedOptions?: readonly DemoMultiOption[];
  /** Opt-in bounded category branches; flat sales/transfer behavior is unchanged. */
  readonly hierarchy?: 'category-branches';
  /** An empty array is the canonical all-selection, never an empty subset. */
  readonly value: readonly string[];
  readonly completeUniverse?: boolean;
  readonly disabled?: boolean;
  readonly focusOnMount?: boolean;
  readonly onChange: (ids: readonly string[]) => void;
  /** Refuses an all-minus operation without inventing a complete candidate set. */
  readonly onIncompleteSelection?: (option: DemoMultiOption, reason?: 'branch-exclusion') => void;
  readonly open?: boolean;
  readonly onOpen?: (open: boolean) => void;
  readonly search?: string;
  readonly onSearch?: (search: string) => void;
  readonly onMenuScroll?: (event: UIEvent<HTMLElement>) => void;
  readonly renderMenu?: (menu: ReactNode) => ReactNode;
  /** Rendering threshold only; it neither fetches nor truncates candidates. */
  readonly menuItemLimit?: number;
}
