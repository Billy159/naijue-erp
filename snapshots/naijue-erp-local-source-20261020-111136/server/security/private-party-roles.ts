import {createHash} from 'node:crypto';
import {closeSync, constants, fstatSync, openSync, readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {SecurityError} from './errors.js';

export type PartyRole = 'customer' | 'supplier';
export interface PartyApprovalManifest {
  readonly decisionId: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly counts: {readonly suppliers: number; readonly customers: number; readonly excluded: number};
}

const unavailable = (code: string): SecurityError => new SecurityError(code,503,'批准的往来单位分类资料不可用，请联系管理员核对私有资料配置');
const record = (value: unknown): Record<string,unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null;

/** The manifest is supplied by application code, never by environment or private input. */
function parse(raw: Buffer, manifest: PartyApprovalManifest): ReadonlyMap<string,PartyRole|null> {
  if (raw.length !== manifest.sourceBytes || createHash('sha256').update(raw).digest('hex') !== manifest.sourceSha256) throw unavailable('APPROVED_PARTY_DATA_VERSION_MISMATCH');
  let input: Record<string,unknown> | null;
  try {input=record(JSON.parse(raw.toString('utf8')) as unknown);} catch {throw unavailable('APPROVED_PARTY_DATA_INVALID');}
  if (!input || input['decision_id'] !== manifest.decisionId || input['status'] !== 'approved_classification_input_not_imported') throw unavailable('APPROVED_PARTY_DATA_VERSION_MISMATCH');
  const roles=new Map<string,PartyRole|null>();
  const groups: readonly [string,PartyRole|null,number][] = [
    ['suppliers','supplier',manifest.counts.suppliers],
    ['customers','customer',manifest.counts.customers],
    ['excluded_from_current_supplier_and_customer_views',null,manifest.counts.excluded],
  ];
  for (const [field,role,count] of groups) {
    const rows=input[field];
    if (!Array.isArray(rows) || rows.length !== count) throw unavailable('APPROVED_PARTY_DATA_INVALID');
    for (const row of rows) {
      const code: unknown=role===null?row:record(row)?.['code'];
      if (typeof code !== 'string' || !code || code.length>128 || code.trim()!==code || code.includes('\0') || roles.has(code)) throw unavailable('APPROVED_PARTY_DATA_INVALID');
      roles.set(code,role);
    }
  }
  if (!roles.size || roles.size !== manifest.counts.suppliers+manifest.counts.customers+manifest.counts.excluded) throw unavailable('APPROVED_PARTY_DATA_INVALID');
  return roles;
}

/** Open only a private regular file. A cached, verified map never substitutes for a missing/changed file. */
export class PrivatePartyRoleReader {
  #manifest: PartyApprovalManifest;
  #path: () => string | undefined;
  #loaded: {signature:string; roles:ReadonlyMap<string,PartyRole|null>} | undefined;
  constructor(manifest: PartyApprovalManifest, path: () => string | undefined) {
    this.#manifest=Object.freeze({...manifest,counts:Object.freeze({...manifest.counts})});
    this.#path=path;
  }
  #read(): ReadonlyMap<string,PartyRole|null> {
    let fd: number | undefined;
    try {
      const path=this.#path();
      if (!path || !isAbsolute(path)) throw unavailable('APPROVED_PARTY_DATA_REQUIRED');
      fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const stat=fstatSync(fd,{bigint:true});
      if (!stat.isFile() || stat.uid!==BigInt(process.getuid?.()??-1) || (stat.mode&0o077n)!==0n || stat.size<1n || stat.size>1048576n) throw unavailable('APPROVED_PARTY_DATA_NOT_PRIVATE');
      const signature=[path,stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join('|');
      if (this.#loaded?.signature===signature) return this.#loaded.roles;
      const roles=parse(readFileSync(fd),this.#manifest);
      this.#loaded={signature,roles};
      return roles;
    } catch (error) {
      this.#loaded=undefined;
      if (error instanceof SecurityError) throw error;
      throw unavailable('APPROVED_PARTY_DATA_REQUIRED');
    } finally {if (fd!==undefined) closeSync(fd);}
  }
  assertReady(): void {this.#read();}
  role(code: string): PartyRole|null|undefined {return this.#read().get(code.trim());}
}
