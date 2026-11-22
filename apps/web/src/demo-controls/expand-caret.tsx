/** Use one triangle in each state so the icon cannot change size with the font. */
export function ExpandCaret({ direction }: { readonly direction: 'down' | 'up' | 'right' }) {
  const rotation = direction === 'up' ? 'rotate(180 4 4)' : direction === 'right' ? 'rotate(-90 4 4)' : undefined;
  return (
    <svg aria-hidden="true" focusable="false" data-expand-caret={direction} width="8" height="8" viewBox="0 0 8 8" style={{flexShrink: 0, verticalAlign: 'middle'}}>
      <path d="M.5 2h7L4 6Z" transform={rotation} fill="currentColor" />
    </svg>
  );
}
