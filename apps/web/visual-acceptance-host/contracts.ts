import type { ComponentType } from 'react';
import type { ReadScope } from '../src/loading/read-scope.ts';
import type { ReportRead } from '../preview-core-pages/catalog.ts';
export type AcceptanceRoute = 'inventory' | 'sales' | 'transfers';
export interface AcceptanceRouteProps { readonly scope: ReadScope; readonly report: ReportRead }
export interface AcceptanceRouteModule { readonly View: ComponentType<AcceptanceRouteProps> }
