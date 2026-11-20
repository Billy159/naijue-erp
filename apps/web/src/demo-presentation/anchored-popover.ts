import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { positionDemoPopover, type PopoverPosition } from './popover-position.ts';

/** Presentation-only positioning. Opening never loads candidates or business data. */
export function useAnchoredPopover(open: boolean, anchor: RefObject<HTMLElement | null>): CSSProperties {
  const [placement, setPlacement] = useState<PopoverPosition | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPlacement(null); return; }
    const position = () => {
      if (!anchor.current) return;
      const next = positionDemoPopover(anchor.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
      setPlacement(previous => previous && Object.keys(next).every(key => previous[key as keyof PopoverPosition] === next[key as keyof PopoverPosition]) ? previous : next);
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open, anchor]);
  return placement ? { position: 'fixed', ...placement } : { position: 'fixed', visibility: 'hidden' };
}
