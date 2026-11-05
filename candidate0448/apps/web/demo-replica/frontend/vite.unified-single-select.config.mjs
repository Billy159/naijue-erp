import path from 'node:path';
import { fileURLToPath } from 'node:url';

const demo = path.dirname(fileURLToPath(import.meta.url));
const modules = path.resolve(demo, '../node_modules');

export default {
  root: demo,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { alias: {
    '@arco-design/web-react': path.join(modules, '@arco-design/web-react'),
    'react-dom': path.join(modules, 'react-dom'),
    react: path.join(modules, 'react'),
  } },
  build: {
    emptyOutDir: false,
    outDir: path.join(demo, 'assets'),
    lib: { entry: path.join(demo, 'unified-single-select.jsx'), name: 'UnifiedSingleSelect', formats: ['iife'], fileName: () => 'unified-single-select.bundle.js' },
  },
};
