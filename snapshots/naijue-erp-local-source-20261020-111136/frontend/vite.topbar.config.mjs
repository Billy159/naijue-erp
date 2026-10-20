import path from 'node:path';
import {fileURLToPath} from 'node:url';
const frontend=path.dirname(fileURLToPath(import.meta.url)),modules=path.resolve(frontend,'../node_modules');
export default {
 root:frontend,
 define:{'process.env.NODE_ENV':JSON.stringify('production')},
 resolve:{alias:{'@arco-design/web-react':path.join(modules,'@arco-design/web-react'),'react-dom':path.join(modules,'react-dom'),react:path.join(modules,'react')}},
 build:{emptyOutDir:false,outDir:path.join(frontend,'assets'),lib:{entry:path.join(frontend,'topbar-entry.jsx'),name:'ERPTopbarAccount',formats:['iife'],fileName:()=>'topbar-account.bundle.js'}},
};
