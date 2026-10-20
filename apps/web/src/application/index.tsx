import { createRoot, type Root } from 'react-dom/client';
import { ApplicationRoot } from './application-root.tsx';
import { ApplicationController } from './controller.ts';
import type { ApplicationConfiguration } from './contracts.ts';
export { ApplicationController } from './controller.ts';
export { ApplicationRoot } from './application-root.tsx';
export { createRouteStylesheet } from './stylesheet.ts';
export type { ApplicationConfiguration, ApplicationRoute, ApplicationSnapshot, ApplicationPresentation, RouteStylesheet } from './contracts.ts';

/** Actual single-root host composition, not a preview. Nothing mounts or checks a session implicitly. */
export function createApplication(configuration: ApplicationConfiguration) {
  const controller = new ApplicationController(configuration);
  let root: Root | null = null, disposed = false;
  return Object.freeze({ controller,
    mount(container: Element): void {
      if (disposed || root) throw new Error('Application owner must be mounted once and disposed once.');
      if (!container || container.nodeType !== 1) throw new TypeError('An explicit root element is required.');
      root = createRoot(container); root.render(<ApplicationRoot controller={controller} presentation={configuration.presentation} />);
    },
    /** Clear old identity/read scopes first, then unmount the DOM and ephemeral forms. */
    dispose(): void { if (disposed) return; disposed = true; controller.dispose(); root?.unmount(); root = null; },
  });
}
