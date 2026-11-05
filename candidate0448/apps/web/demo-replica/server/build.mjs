import {build} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const name of ['product','inventory-select','inventory-category','inventory-filters','transfer-date','unified-single-select','basic-settings']) {
  await build({configFile:resolve(root,`frontend/vite.${name}.config.mjs`)});
}
