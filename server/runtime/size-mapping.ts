import { readFileSync } from 'node:fs';
import { currentSizeMapping } from '../../frontend/product-size-groups.mjs';
import { applyAcceptedSizeDecisions } from '../../data-cleaning/size-mapping/accepted-size-decisions.mjs';

type SizeAuditMatch = {
  sku: string;
  targetGroup: string;
  targetSize: string;
  target: [string, string, string, string];
  sourceCode: string;
  sourceSize: string;
  workbookRows: number[];
};

const audit = JSON.parse(readFileSync(new URL('../../data-cleaning/size-mapping/user-size-audit.json', import.meta.url), 'utf8'));
const decisions = JSON.parse(readFileSync(new URL('../../data-cleaning/size-mapping/accepted-size-decisions.json', import.meta.url), 'utf8'));

/** User-audited mapping keyed by the original SKU, never guessed from a size name alone. */
export const sizeMapping = new Map<string, SizeAuditMatch>(applyAcceptedSizeDecisions(audit.matches, decisions).map((row: SizeAuditMatch) => [row.sku, currentSizeMapping(row)]));
