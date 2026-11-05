/** Frozen inventory-workbench.js:65 geometry, without legacy state or bridges. */
export interface PopoverAnchor { readonly left: number; readonly top: number; readonly bottom: number }
export interface PopoverViewport { readonly width: number; readonly height: number }
export interface PopoverPosition {
  readonly width: number;
  readonly left: number;
  readonly maxHeight: number;
  readonly top: number | 'auto';
  readonly bottom: number | 'auto';
}
export function positionDemoPopover(anchor: PopoverAnchor, viewport: PopoverViewport, preferredWidth = 360): PopoverPosition {
  if (![anchor.left, anchor.top, anchor.bottom, viewport.width, viewport.height, preferredWidth].every(Number.isFinite) || viewport.width < 0 || viewport.height < 0 || preferredWidth < 0) throw new TypeError('Popover geometry must be finite and nonnegative in size.');
  // The source assumes a normal positive viewport. Clamp the exceptional <24px
  // width at zero instead of emitting an invalid negative CSS width.
  const width = Math.min(preferredWidth, Math.max(0, viewport.width - 24));
  const below = viewport.height - anchor.bottom - 16;
  const above = anchor.top - 16;
  const up = below < 230 && above > below;
  return {
    width,
    left: Math.max(8, Math.min(anchor.left, viewport.width - width - 8)),
    maxHeight: Math.max(100, Math.min(450, up ? above : below)),
    top: up ? 'auto' : anchor.bottom + 5,
    bottom: up ? viewport.height - anchor.top + 5 : 'auto',
  };
}
