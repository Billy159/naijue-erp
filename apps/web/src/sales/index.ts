export { createSalesHttpReader } from './http-reader.ts';
export { createSalesPageController } from './controller.ts';
export type { SalesPageController } from './controller.ts';
export type { SalesReader, SalesReferenceReader, SalesReferenceParameters, SalesReferencePage, SalesReference, SalesListDto, SalesDetailDto, SalesSummaryDto } from './contracts.ts';
// Import sales-route.tsx lazily on sales navigation. Do not eagerly re-export its
// React route/CSS from the inert reader/controller entry point.
