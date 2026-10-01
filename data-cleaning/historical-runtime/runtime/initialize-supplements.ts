// Explicit, idempotent supplemental installation; never invoked by page load.
import {installBarcodes,generateHistoricalBarcodes} from './barcodes.ts';
await installBarcodes();
const result=await generateHistoricalBarcodes();
console.log(JSON.stringify({inserted:result.inserted,total:result.total,exceptions:result.issues.length},null,2));
