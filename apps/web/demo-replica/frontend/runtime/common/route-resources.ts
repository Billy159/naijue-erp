/** Recovery reconstruction, not the original 640-byte source/hash.
 * Behavior follows the retained 64365270 application.js: queue both loaders,
 * await both, and reject an obsolete route before any caller may mount it. */
export async function prepareRouteResources(
 route:string,
 signal:AbortSignal,
 prepareCode:(route:string)=>Promise<unknown>,
 prepareStyles?: (route:string,signal:AbortSignal)=>Promise<unknown>,
):Promise<void>{
 if(signal.aborted)throw new DOMException('Route cancelled','AbortError');
 await Promise.all([
  Promise.resolve().then(()=>prepareCode(route)),
  Promise.resolve().then(()=>prepareStyles?.(route,signal)),
 ]);
 if(signal.aborted)throw new DOMException('Route cancelled','AbortError');
}
