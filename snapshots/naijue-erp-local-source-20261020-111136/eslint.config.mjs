import tseslint from 'typescript-eslint';
export default [
  {
    ignores: ['**/node_modules/**','**/assets/**','**/verification/**','**/*.test.ts','references/**','dist/**','work/**','outputs/**','.runtime/**']
  },
  {
    files: ['frontend/*.js','frontend/*.mjs','frontend/*.jsx','server/**/*.ts','scripts/*.mjs'],
    languageOptions: {parser:tseslint.parser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},
    plugins: {'@typescript-eslint':tseslint.plugin},
    rules: {'@typescript-eslint/no-unused-vars':['error',{args:'none',caughtErrors:'none',ignoreRestSiblings:true,varsIgnorePattern:'^(React|ERP_DEMO|PRODUCT_CATALOG|MASTER_DATA|GOLD|SALES_SERVICE|TRANSFER_SERVICE|SALES_MODEL|GOLD_UI)$'}]}
  },
  {
    files: ['server/**/*.ts'],
    rules: {'@typescript-eslint/no-explicit-any':'error','@typescript-eslint/ban-ts-comment':'error'}
  },
  {
    files: ["frontend/gold.js", "frontend/inventory-matrix-experiment.js", "frontend/inventory-workbench.js", "frontend/product-catalog.js", "frontend/product-current.js", "frontend/product-master.js", "frontend/sales-current.js", "frontend/sales-model.js", "frontend/transfer-current.js", "frontend/transfer-golden.js", "frontend/transfer-matrix-experiment.js"],
    languageOptions: {globals: Object.fromEntries(["window", "document", "location", "history", "Node", "innerWidth", "innerHeight", "setTimeout", "clearTimeout", "setInterval", "requestAnimationFrame", "structuredClone", "FormData", "localStorage", "sessionStorage", "FileReader", "Image", "crypto", "URL", "URLSearchParams", "CSS", "performance", "Event", "navigator", "require", "module", "ERP_DEMO", "GOLD", "GOLD_UI", "LEGACY_REAL", "INVENTORY_UI", "INVENTORY_RESULT", "PRODUCT_CATALOG", "PRODUCT_FINDER", "MATRIX_SECTIONS", "TRANSFER_SERVICE", "TRANSFER_UI", "SCAN_WORKBENCH", "MASTER_DATA", "MATRIX_REPORT", "ENTITY_SELECT", "SALES_AUDIT", "SALES_CORE", "SALES_MODEL", "SALES_SERVICE", "INTERACTION_COMMON", "BUSINESS_CONFIG", "SALES_SUMMARY", "SALES_FUNDS_UI", "SALES_EXPORT", "PRODUCT_UI"].map(name=>[name,'readonly']))},
    rules: {'no-undef':'error'}
  }
];
