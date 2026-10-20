import type {Role} from "./policies.js";

const unavailable = (): never => { const error = new Error("Private ERP employee approval data is omitted from this source snapshot.") as Error & {code?: string}; error.code = "PRIVATE_CONFIGURATION_REQUIRED"; throw error; };
const planBrand: unique symbol = Symbol("private-plan-omitted");
export interface ApprovedInitialEmployee { readonly personKey: string; readonly retainedEmployeeId: string|null; readonly sourceEmployeeCode: string|null; readonly role: Role; readonly hallCode: string|null; }
export interface ApprovedInitialEmployeePlan { readonly [planBrand]: true; }
export const approvedInitialEmployeePlanSha256 = "__PRIVATE_INPUT_REQUIRED__";
export const approvedInitialPrivateResourceSha256 = "__PRIVATE_INPUT_REQUIRED__";
export function readApprovedInitialEmployeePlan(_path: string): ApprovedInitialEmployeePlan { return unavailable(); }
export function approvedInitialEmployees(_plan: ApprovedInitialEmployeePlan): readonly ApprovedInitialEmployee[] { return unavailable(); }
