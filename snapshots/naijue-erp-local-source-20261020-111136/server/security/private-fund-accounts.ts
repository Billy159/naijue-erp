import {createHash} from 'node:crypto';
import {closeSync, constants, fstatSync, openSync, readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {SecurityError} from './errors.js';

export interface ApprovedFundAccount {
  readonly id: string;
  readonly code: string;
  readonly patch: Readonly<Record<string, unknown>>;
}
export interface FundAccountApproval {
  readonly revision: string;
  readonly sourceSha256: string;
  readonly accounts: readonly ApprovedFundAccount[];
  readonly syntheticSource?: boolean;
}
export interface FundAccountApprovalManifest {
  readonly revision: string;
  readonly sourceSha256: string;
  readonly privateSourceSha256: string;
  readonly privateSourceBytes: number;
  readonly counts: {readonly total: number; readonly enabled: number; readonly disabled: number};
}

const unavailable = (code: string): SecurityError => new SecurityError(code,503,'批准的资金账户资料不可用，请联系管理员核对私有资料配置');
const record = (value: unknown): Record<string,unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null;
const exactKeys = (value: Record<string,unknown>, keys: readonly string[]): boolean => Object.keys(value).length === keys.length && keys.every(key=>Object.hasOwn(value,key));

/** The application pins the private file; private input cannot approve its own revision or identities. */
function parse(raw: Buffer, manifest: FundAccountApprovalManifest): FundAccountApproval {
  if (raw.length !== manifest.privateSourceBytes || createHash('sha256').update(raw).digest('hex') !== manifest.privateSourceSha256) throw unavailable('APPROVED_FUND_DATA_VERSION_MISMATCH');
  let input: Record<string,unknown> | null;
  try {input=record(JSON.parse(raw.toString('utf8')) as unknown);} catch {throw unavailable('APPROVED_FUND_DATA_INVALID');}
  if (!input || !exactKeys(input,['schemaVersion','revision','sourceSha256','accounts']) || input['schemaVersion'] !== 'APPROVED_FUND_ACCOUNTS_PRIVATE_V1' || input['revision'] !== manifest.revision || input['sourceSha256'] !== manifest.sourceSha256) throw unavailable('APPROVED_FUND_DATA_VERSION_MISMATCH');
  const rows=input['accounts'];
  if (!Array.isArray(rows) || !rows.length || rows.length !== manifest.counts.total) throw unavailable('APPROVED_FUND_DATA_INVALID');
  const ids=new Set<string>(),codes=new Set<string>(),accounts: ApprovedFundAccount[]=[];
  let enabled=0;
  for (const value of rows) {
    const row=record(value),patch=record(row?.['patch']),id=row?.['id'],code=row?.['code'];
    if (!row || !exactKeys(row,['id','code','patch']) || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) || ids.has(id) || typeof code !== 'string' || !code || code.length>128 || code.trim()!==code || code.includes('\0') || codes.has(code) || !patch || typeof patch['enabled'] !== 'boolean') throw unavailable('APPROVED_FUND_DATA_INVALID');
    const keys=patch['enabled'] ? ['name','type','bank','accountNumber','department','enabled'] : ['enabled'];
    if (!exactKeys(patch,keys) || keys.some(key=>key!=='enabled' && (typeof patch[key]!=='string' || (patch[key] as string).length>256 || (patch[key] as string).includes('\0')))) throw unavailable('APPROVED_FUND_DATA_INVALID');
    if (patch['enabled']) enabled++;
    ids.add(id);codes.add(code);
    accounts.push(Object.freeze({id,code,patch:Object.freeze({...patch})}));
  }
  if (enabled !== manifest.counts.enabled || rows.length-enabled !== manifest.counts.disabled) throw unavailable('APPROVED_FUND_DATA_INVALID');
  return Object.freeze({revision:manifest.revision,sourceSha256:manifest.sourceSha256,accounts:Object.freeze(accounts)});
}

/** A prior verified cache never substitutes for a missing, changed or publicly readable private file. */
export class PrivateFundAccountReader {
  #manifest: FundAccountApprovalManifest;
  #path: () => string | undefined;
  #loaded: {signature:string; approval:FundAccountApproval} | undefined;
  constructor(manifest: FundAccountApprovalManifest, path: () => string | undefined) {
    this.#manifest=Object.freeze({...manifest,counts:Object.freeze({...manifest.counts})});
    this.#path=path;
  }
  load(): FundAccountApproval {
    let fd: number | undefined;
    try {
      const path=this.#path();
      if (!path || !isAbsolute(path)) throw unavailable('APPROVED_FUND_DATA_REQUIRED');
      fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const stat=fstatSync(fd,{bigint:true});
      if (!stat.isFile() || stat.uid!==BigInt(process.getuid?.()??-1) || (stat.mode&0o077n)!==0n || stat.size<1n || stat.size>1048576n) throw unavailable('APPROVED_FUND_DATA_NOT_PRIVATE');
      const signature=[path,stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join('|');
      if (this.#loaded?.signature===signature) return this.#loaded.approval;
      const approval=parse(readFileSync(fd),this.#manifest);
      this.#loaded={signature,approval};
      return approval;
    } catch (error) {
      this.#loaded=undefined;
      if (error instanceof SecurityError) throw error;
      throw unavailable('APPROVED_FUND_DATA_REQUIRED');
    } finally {if (fd!==undefined) closeSync(fd);}
  }
}
