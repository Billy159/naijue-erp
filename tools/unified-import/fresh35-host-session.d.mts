/** Capability declarations; runtime authority is held only by the module's WeakMap. */
declare const ordinaryBrand: unique symbol;
export interface Fresh35OrdinaryAdmissionV2 {readonly profile:'FRESH35_ORDINARY_POOL_ADMISSION_V2';readonly [ordinaryBrand]:true}
export interface Fresh35OrdinaryClient {query(sql:string,values?:unknown[]):Promise<unknown>;getTransactionStatus?():string|null;release(error?:Error|boolean):void}
export interface Fresh35OrdinaryPool {connect():Promise<Fresh35OrdinaryClient>}
export interface Fresh35OrdinaryConnection {readonly host:string;readonly port:number;readonly database:string;readonly user:string}
export interface Fresh35CurrentProductionServiceInput {readonly sha256:string;readonly capacityExpiresAt:number;readonly admin154SuccessorSha256?:string}
export interface Fresh35OrdinaryDescription {readonly purpose?:'SYNTHETIC_ISOLATED_ORDINARY_V1';readonly expiresAt?:number;readonly systemIdentifier:string;readonly databaseOid:string;readonly database:string;readonly user:string;readonly connectHost:string;readonly connectPort:number;readonly serverAddress:string;readonly serverPort:number;readonly postmasterStart:string;readonly recordSha256:string;readonly sourceSetSha256:string;readonly admin154Successor?:{readonly recordSha256:string;readonly sourceSetSha256:string;readonly catalogSpecSha256:string}}
export function admitFresh35OrdinaryPoolV2(pool:Fresh35OrdinaryPool,connection:Fresh35OrdinaryConnection,currentService?:Fresh35CurrentProductionServiceInput):Promise<Fresh35OrdinaryAdmissionV2>;
export function admitFresh35SyntheticOrdinaryPoolV1(pool:Fresh35OrdinaryPool,connection:Fresh35OrdinaryConnection):Promise<Fresh35OrdinaryAdmissionV2>;
export function describeFresh35OrdinaryAdmissionV2(cap:Fresh35OrdinaryAdmissionV2):Readonly<Fresh35OrdinaryDescription>;
export function assertFresh35OrdinaryLeaseV2(cap:Fresh35OrdinaryAdmissionV2,pool:Fresh35OrdinaryPool,client:Fresh35OrdinaryClient):Promise<void>;
export function assertFresh35OrdinaryAdmissionCurrentV2(cap:Fresh35OrdinaryAdmissionV2,pool:Fresh35OrdinaryPool):Promise<void>;
export function closeFresh35OrdinaryAdmissionV2(cap:Fresh35OrdinaryAdmissionV2,pool:Fresh35OrdinaryPool):void;
export function describeFresh35HostReadiness(spec:object):Readonly<Record<string,unknown>>;
export function loadFresh35HostContext(sourceRoot:string,referenceDirectory:string):Promise<object>;
export function fresh35HostContext(token:object):any;
export function assertFresh35HostCurrent(token:object):Promise<any>;
export function verifyFresh35InstalledV1(client:object,context:object,sourceProfile?:string):Promise<any>;
export function consumeFresh35VerificationV1(verified:object,client:object):any;
export function openReviewedFresh35Host(config:unknown,sourceRoot:string,target:object,work:(...args:any[])=>unknown,options?:object):Promise<any>;

export interface Fresh35ProductionPreparedImport {readonly packageKind:'REAL';readonly initialize:any;readonly identity:any;readonly steps:AsyncIterable<any>;readonly encodedScrypt:string}
export const FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH:string;
export function loadFresh35ProductionImportContext(sourceRoot:string,referenceDirectory:string):Promise<object>;
export function describeFresh35ProductionImportBinding(context:object,prepared:Fresh35ProductionPreparedImport):Promise<Readonly<Record<string,string|number>>>;
export function loadFresh35ProductionImportAuthorization(context:object,binding:Readonly<Record<string,string|number>>):Promise<object>;
export function fresh35ProductionImportQueryGuard(context:object,authorization:object,prepared:Fresh35ProductionPreparedImport):Readonly<{check(sql:string,values?:unknown[]):Promise<void>;close():Promise<void>;expiresAt:number;authorizationSha256:string}>;
export function openReviewedFresh35ProductionHost(config:unknown,sourceRoot:string,target:object,prepare:(admission:object)=>Promise<Fresh35ProductionPreparedImport>,work:(client:any,admission:object,binding:Readonly<Record<string,string|number>>)=>unknown,options?:{referenceDirectory?:string;sourceProfileSha256?:string;explicitZeroApproval?:object;prepareOnly?:boolean}):Promise<any>;
export interface Fresh35Admin154HostOptions {readonly purpose:'ADMIN_PROVISION_ONLY'|'FIRST_REAL_BUSINESS_IMPORT';readonly currentService:{readonly sha256:string;readonly capacityExpiresAt:number};readonly successorSha256:string;readonly referenceDirectory:string;readonly sourceProfileSha256?:string;readonly explicitZeroApproval?:object;readonly prepareOnly?:boolean}
export interface Fresh35Admin154PreparedImport extends Fresh35ProductionPreparedImport {readonly purpose:'FIRST_REAL_BUSINESS_IMPORT'}
export interface Fresh35CompactZeroParentPins {readonly sha256:string;readonly sourceSetSha256:string;readonly catalogSpecSha256:string}
export interface Fresh35CompactZeroHostOptions extends Omit<Fresh35Admin154HostOptions,'purpose'> {readonly purpose:'FIRST_REAL_BUSINESS_IMPORT';readonly parentPins:Fresh35CompactZeroParentPins}
export function loadFresh35CompactZeroContext(sourceRoot:string,referenceDirectory:string,currentService:{sha256:string;capacityExpiresAt:number},parentPins:Fresh35CompactZeroParentPins,successorSha256:string):Promise<object>;
export function openReviewedFresh35CompactZeroHost(config:unknown,sourceRoot:string,target:object,prepare:(admission:object|undefined)=>Promise<Fresh35Admin154PreparedImport>,work:(client:any,admission:object|undefined,binding:object)=>unknown,options:Fresh35CompactZeroHostOptions):Promise<any>;
export function admitFresh35CompactZeroOrdinaryPoolV2(pool:unknown,connection:unknown,currentService:{sha256:string;capacityExpiresAt:number},parentPins:Fresh35CompactZeroParentPins,successorSha256:string):Promise<object>;
export function loadFresh35Admin154Context(sourceRoot:string,referenceDirectory:string,currentService:{sha256:string;capacityExpiresAt:number},successorSha256:string,purpose?:Fresh35Admin154HostOptions['purpose']):Promise<object>;
export function openReviewedFresh35Admin154Host(config:unknown,sourceRoot:string,target:object,prepare:(admission:object|undefined)=>Promise<any>,work:(client:any,admission:object|undefined,binding:object)=>unknown,options:Fresh35Admin154HostOptions):Promise<any>;
export function prepareFresh35Admin154Import(plan:object,indexPath:string,summary:object,admin:object,origin:{operation_id:string;request_sha256:string},encodedScrypt:string,options?:object):Promise<Fresh35Admin154PreparedImport>;
export function runFresh35Admin154Setup(config:unknown,sourceRoot:string,target:object,request:object,encodedScrypt:string,options:Omit<Fresh35Admin154HostOptions,'purpose'>):Promise<any>;
export function runFresh35Admin154Import(config:unknown,sourceRoot:string,target:object,prepare:(admission:object|undefined)=>Promise<Fresh35Admin154PreparedImport>,options:Omit<Fresh35Admin154HostOptions,'purpose'>):Promise<any>;
