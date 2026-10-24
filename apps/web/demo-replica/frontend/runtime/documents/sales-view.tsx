/**
 * Hosts the copied Demo's final sales markup without inserting another wrapper
 * around its page/dialog DOM. Source rendering, events, state and commands are
 * supplied separately by the runtime host.
 */
export function SalesView({ pageMarkup, dialogMarkup = '' }: { readonly pageMarkup: string; readonly dialogMarkup?: string }) {
  return <>
    <main id="page" dangerouslySetInnerHTML={{ __html: pageMarkup }} />
    <dialog id="sale-dialog" aria-labelledby="sale-dialog-title" dangerouslySetInnerHTML={{ __html: dialogMarkup }} />
  </>;
}
