// Explicit, idempotent supplemental installation; never invoked by page load.
import {installBarcodes} from './barcodes.ts';
import {applyExcelBarcodeAuthority} from './excel-barcode-authority.ts';
await installBarcodes();
console.log(JSON.stringify(await applyExcelBarcodeAuthority(),null,2));
