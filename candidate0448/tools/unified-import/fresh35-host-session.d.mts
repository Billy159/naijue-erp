/** Capability declarations; runtime authority is held only by the module's WeakMap. */
declare const ordinaryBrand: unique symbol;
export interface Fresh35OrdinaryAdmissionV2 {readonly profile:'FRESH35_ORDINARY_POOL_ADMISSION_V2';readonly [ordinaryBrand]:true}
export interface Fresh35OrdinaryClient {query(sql:string,values?:unknown[]):Promise<unknown>;getTransactionStatus?():string|null;release(error?:Error|boolean):void}
export interface Fresh35OrdinaryPool {connect():Promise<Fresh35OrdinaryClient>}
export interface Fresh35OrdinaryConnection {readonly host:string;readonly port:number;readonly database:string;readonly user:string}
export interface Fresh35OrdinaryDescription {readonly systemIdentifier:string;readonly databaseOid:string;readonly database:string;readonly user:string;readonly connectHost:string;readonly connectPort:number;readonly serverAddress:string;readonly serverPort:number;readonly postmasterStart:string;readonly recordSha256:string;readonly sourceSetSha256:string}
export function admitFresh35OrdinaryPoolV2(pool:Fresh35OrdinaryPool,connection:Fresh35OrdinaryConnection):Promise<Fresh35OrdinaryAdmissionV2>;
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
