/** Compatibility export for existing adapter consumers. The driver-independent
 * read lifecycle has one implementation at the public application seam. */
export {awaitRead, acquireReadClient} from '../../../packages/application/src/read-resource.ts';
