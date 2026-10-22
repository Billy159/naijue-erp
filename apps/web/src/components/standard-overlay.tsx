import { cloneElement, useCallback, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Drawer, Modal } from '@arco-design/web-react';
import { UIButton } from './standard-controls.tsx';
import './standard-overlay.css';

export interface StandardOverlayProps {
  readonly kind?: 'modal' | 'drawer'; readonly title: ReactNode;
  readonly closeLabel: string; readonly close: () => void;
  readonly label?: string;
  readonly children: ReactNode | ((close: () => void) => ReactNode); readonly footer?: ReactNode | ((close: () => void) => ReactNode);
  readonly className?: string; readonly width?: number | string;
  readonly maskClosable?: boolean; readonly initialFocus?: string;
  readonly role?: 'dialog' | 'alertdialog';
  /** Action owners may defer reads until their visible layer can be dismissed. */
  readonly onReady?: () => void;
}
/** Real Arco layer, one focus/cancel boundary. The portal stays in its route
 * owner so route/identity teardown also removes every child layer and style.
 * No global static Modal or cross-route cached element is retained. */
export function StandardOverlay(props: StandardOverlayProps) {
  const host = useRef<HTMLDivElement>(null), attached = useRef(false);
  const [ready, setReady] = useState(false);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const current = useRef(props); current.current = props;
  const container = useCallback(() => host.current ?? document.body, []);
  const restore = useCallback(() => {
    if (attached.current) return; // StrictMode cleanup replay did not close this layer.
    const element = opener.current;
    if (!element?.isConnected || element.matches(':disabled') || element.closest('[hidden],[inert]')) return;
    const document = element.ownerDocument, active = document.activeElement;
    if (active && active !== document.body && active !== element && active.isConnected) return;
    // A child layer may restore into its still-open parent, but must never
    // override a newer unrelated layer or navigation target.
    if (Array.from(document.querySelectorAll('dialog[open],.erp-overlay')).some(layer => !layer.contains(element))) return;
    const style = document.defaultView?.getComputedStyle(element);
    if (style?.display !== 'none' && style?.visibility !== 'hidden') element.focus({ preventScroll: true });
  }, []);
  const close = useCallback(() => {
    // Release Arco FocusLock before a caller focuses/navigates elsewhere in the
    // same event. Otherwise it can pull that new focus back into a dying layer.
    if (attached.current) { flushSync(() => current.current.close()); if (!attached.current) restore(); }
  }, [restore]);
  useLayoutEffect(() => {
    attached.current = true;
    setReady(true);
    return () => {
      attached.current = false;
      // Arco's portal/focus lock teardown completes after its owner's commit.
      // Return only if no newer page/control/layer has already taken focus.
      requestAnimationFrame(restore);
    };
  }, [restore]);
  const placeFocus = () => {
    if (!attached.current) return;
    const target = host.current?.querySelector<HTMLElement>(current.current.initialFocus ?? '[data-erp-overlay-close]')
      ?? host.current?.querySelector<HTMLElement>('[data-erp-overlay-close]');
    // Entrance/StrictMode callbacks may repeat after the user has already
    // focused a field. Only establish focus when it is outside this layer.
    if (!host.current?.contains(document.activeElement)) target?.focus({ preventScroll: true });
  };
  const focus = () => {
    placeFocus();
    if (attached.current) current.current.onReady?.();
  };
  // Candidate kind/page replacement can remove the focused row while retaining
  // this layer. Re-home lost focus without re-running the read-ready callback.
  useLayoutEffect(() => { if (ready) queueMicrotask(placeFocus); });
  useLayoutEffect(() => {
    if (!ready) return;
    queueMicrotask(focus);
    const frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [ready]);
  const children = <><UIButton data-erp-overlay-close className="erp-overlay-close" aria-label={props.closeLabel} onClick={close}>×</UIButton>{typeof props.children === 'function' ? props.children(close) : props.children}</>;
  const common = { visible: true, title: props.title, onCancel: close, getPopupContainer: container, closable: false,
    maskClosable: props.maskClosable ?? false, focusLock: true, autoFocus: false, escToExit: false,
    unmountOnExit: true, afterOpen: focus, footer: typeof props.footer === 'function' ? props.footer(close) : props.footer ?? null, className: `erp-overlay ${props.className ?? ''}` };
  return <div ref={host} className="erp-overlay-anchor" onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close(); }
    // Drawer enables its FocusLock only after the entrance animation. Keep the
    // two boundaries locked during that interval as well as in reduced motion.
    if (event.key === 'Tab' && !event.defaultPrevented) {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('.erp-overlay button:not(:disabled),.erp-overlay input:not(:disabled),.erp-overlay textarea:not(:disabled),.erp-overlay a[href],.erp-overlay [tabindex="0"]'))
        .filter(element => element.tabIndex >= 0 && !element.hasAttribute('data-focus-guard')
          && element.getAttribute('aria-disabled') !== 'true' && !element.closest('[hidden],[aria-hidden="true"]'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); event.stopPropagation(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); event.stopPropagation(); first?.focus(); }
    }
  }}>{ready && (props.kind === 'drawer' ? <Drawer {...common} {...{ role: 'dialog', 'aria-modal': true, 'aria-label': props.label ?? (typeof props.title === 'string' ? props.title : props.closeLabel) }} width={props.width ?? 660}>{children}</Drawer>
    : <Modal {...common}
      modalRender={node => cloneElement(node as ReactElement<{ role?: string; 'aria-label'?: string; 'aria-labelledby'?: string | undefined }>, {
        role: props.role ?? 'dialog', ...(props.label ? { 'aria-label': props.label, 'aria-labelledby': undefined } : {}),
      })}
      style={{ width: props.width ?? 480, maxWidth: 'calc(100vw - 32px)' }}>{children}</Modal>)}</div>;
}
