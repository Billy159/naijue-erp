import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createSyntheticPackage,repinSyntheticPackage} from './synthetic-package.ts';
import {NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,sha256} from '../../../packages/application/src/unified-import-contract.ts';
import {BARCODE_SCHEMES} from '../../../packages/application/src/barcode-generation.ts';

/** Explicit synthetic replacement for the legacy-profile numeric-fit reproducer.
 * Only the declared fit/color examples and profile differ from the base fixture.
 * Existing identities, manually supplied barcodes, stock and provenance remain intact.
 * This does not infer a real-source mapping, create a product or open a database. */
export function createNumericFitSyntheticPackage(){
 const pkg=createSyntheticPackage();
 pkg.manifest.schema_contract.source_declarations_sha256=NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256;
 Object.assign(pkg.records.fit[0].fields,{code:'5',name:'SYNTHETIC numeric fit 5'});
 Object.assign(pkg.records.color[0].fields,{code:'001',name:'SYNTHETIC numeric color 001'});
 return repinSyntheticPackage(pkg);
}

/** Parameters for a later, separately authorized product creation and scan test.
 * The expected string is pinned independently, not computed by the implementation. */
export const NUMERIC_FIT_BARCODE_EXAMPLE=Object.freeze({
 schemeId:BARCODE_SCHEMES.y2026,productSegment:'2026001',fitCode:'5',colorCode:'001',sizeCode:'900',
 expectedBarcode:'552026001001900',
});

/** Creates a new output directory only; never overwrites an earlier fixture. */
export async function writeNumericFitSyntheticPackage(output){
 const root=resolve(output),pkg=createNumericFitSyntheticPackage();
 await mkdir(root,{recursive:false,mode:0o700});
 for(const [path,bytes] of Object.entries(pkg.artifacts)){
  const target=resolve(root,path);await mkdir(dirname(target),{recursive:true,mode:0o700});
  await writeFile(target,bytes,{flag:'wx',mode:0o600});
 }
 const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest,null,2)+'\n');
 await writeFile(resolve(root,'manifest.json'),manifestBytes,{flag:'wx',mode:0o600});
 return {package_kind:'SYNTHETIC',schema_declarations_sha256:NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,manifest_sha256:sha256(manifestBytes),business_database_writes:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==4||process.argv[2]!=='--output')throw Error('Usage: node tests/fixtures/unified-import/numeric-fit-synthetic-package.mjs --output /absolute/new-directory');
 const output=process.argv[3];if(resolve(output)!==output)throw Error('ABSOLUTE_NEW_OUTPUT_DIRECTORY_REQUIRED');
 console.log(JSON.stringify(await writeNumericFitSyntheticPackage(output)));
}
