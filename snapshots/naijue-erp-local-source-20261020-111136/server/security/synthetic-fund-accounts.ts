import {createHash} from 'node:crypto';
import {closeSync, constants, fstatSync, openSync, readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import type {DatabaseConfig} from '../database/config.js';
import type {ApprovedFundAccount, FundAccountApproval} from './private-fund-accounts.js';
import type {PartyRole} from './private-party-roles.js';
import {SecurityError} from './errors.js';
import {isDeepStrictEqual} from 'node:util';

export interface SyntheticFundAccountConfig {
  readonly file: string;
  readonly sha256: string;
  readonly database: string;
  readonly instanceId: string;
}

function assertQa(config: SyntheticFundAccountConfig, database: DatabaseConfig): void {
  if (database.environment!=='qa'||!/^demo_8877_[a-z0-9_]+$/.test(database.database)||config.database!==database.database||config.instanceId!==database.instanceId)
    throw new Error('QA_SYNTHETIC_FUND_SOURCE_QA_ONLY');
  if (!isAbsolute(config.file)||!/^[a-f0-9]{64}$/.test(config.sha256)) throw new Error('EXPLICIT_QA_SYNTHETIC_FUND_PROFILE_REQUIRED');
}

/** An opt-in test-data source, never a fallback for a missing production approval. */
export function readSyntheticFundAccountConfig(env: NodeJS.ProcessEnv, database: DatabaseConfig|null): SyntheticFundAccountConfig|null {
  const file=env['QA_SYNTHETIC_FUND_ACCOUNTS_FILE'],sha256=env['QA_SYNTHETIC_FUND_ACCOUNTS_SHA256'];
  if (file===undefined&&sha256===undefined) return null;
  if (env['APP_ENV']!=='qa'||!database) throw new Error('QA_SYNTHETIC_FUND_SOURCE_QA_ONLY');
  if (env['APPROVED_FUND_ACCOUNTS_FILE']!==undefined||env['APPROVED_PARTY_ROLES_FILE']!==undefined) throw new Error('MIXED_PRIVATE_AND_SYNTHETIC_FUND_SOURCES_REFUSED');
  if (!file||!sha256) throw new Error('EXPLICIT_QA_SYNTHETIC_FUND_PROFILE_REQUIRED');
  const config=Object.freeze({file,sha256,database:database.database,instanceId:database.instanceId});
  assertQa(config,database);
  return config;
}

const unavailable=(code:string): SecurityError=>new SecurityError(code,503,'合成测试资金资料不可用，请核对QA资料源与实例');
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const exact=(value:Record<string,unknown>,keys:readonly string[]):boolean=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const partyBodyKeys=new Set(['code','name','enabled','usage','tags','sourceFacts']);
function validPartyFacts(value: unknown): value is Record<string,unknown> {
  const facts=object(value),records=facts?.['records'];
  return !!facts&&exact(facts,['records'])&&Array.isArray(records)&&records.length>0&&records.length<=10&&!records.some(value=>{
    const source=object(value);
    return !source||source['origin']!=='QA_SYNTHETIC'||Object.keys(source).some(key=>!['origin','enabled'].includes(key))||Object.hasOwn(source,'enabled')&&typeof source['enabled']!=='boolean';
  });
}

export class SyntheticFundAccountReader {
  readonly config: SyntheticFundAccountConfig;
  #loaded: {signature:string;approval:FundAccountApproval;parties:readonly SyntheticParty[]}|undefined;
  constructor(config:SyntheticFundAccountConfig,database:DatabaseConfig) {
    assertQa(config,database);
    this.config=Object.freeze({...config});
  }
  load(): FundAccountApproval {
    return this.#read().approval;
  }
  partyRole(code:string,body?:Record<string,unknown>,id?:string,returnedFacts?:Record<string,unknown>): PartyRole {
    const party=this.#read().parties.find(row=>row.code===code),facts=body?.['sourceFacts'],usage=body?.['usage'],tags=body?.['tags'];
    if (!party||party.id!==id||!body||Object.keys(body).some(key=>!partyBodyKeys.has(key))||body['name']!==party.name
      ||Object.hasOwn(body,'code')&&body['code']!==code||Object.hasOwn(body,'enabled')&&typeof body['enabled']!=='boolean'
      ||!Array.isArray(usage)||usage.length!==1||usage[0]!==party.role
      ||Object.hasOwn(body,'tags')&&(!Array.isArray(tags)||tags.length!==1||tags[0]!==party.role)
      ||!validPartyFacts(facts)||returnedFacts!==undefined&&(!validPartyFacts(returnedFacts)||!isDeepStrictEqual(facts,returnedFacts)))
      throw unavailable('QA_SYNTHETIC_PARTY_SOURCE_MISMATCH');
    return party.role;
  }
  #read(): {signature:string;approval:FundAccountApproval;parties:readonly SyntheticParty[]} {
    let fd:number|undefined;
    try {
      fd=openSync(this.config.file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const stat=fstatSync(fd,{bigint:true});
      if (!stat.isFile()||stat.uid!==BigInt(process.getuid?.()??-1)||(stat.mode&0o077n)!==0n||stat.size<1n||stat.size>1048576n)
        throw unavailable('QA_SYNTHETIC_FUND_PROFILE_NOT_PRIVATE');
      const signature=[this.config.file,stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join('|');
      if (this.#loaded?.signature===signature) return this.#loaded;
      const raw=readFileSync(fd),digest=createHash('sha256').update(raw).digest('hex');
      if (digest!==this.config.sha256) throw unavailable('QA_SYNTHETIC_FUND_PROFILE_CHANGED');
      const profile=object(JSON.parse(raw.toString('utf8')) as unknown);
      if (!profile||!exact(profile,['schemaVersion','database','instanceId','accounts','parties'])||profile['schemaVersion']!=='QA_SYNTHETIC_FUND_ACCOUNTS_V1'||profile['database']!==this.config.database||profile['instanceId']!==this.config.instanceId)
        throw unavailable('QA_SYNTHETIC_FUND_PROFILE_IDENTITY_MISMATCH');
      const rows=profile['accounts'];
      if (!Array.isArray(rows)||!rows.length||rows.length>500) throw unavailable('QA_SYNTHETIC_FUND_PROFILE_INVALID');
      const ids=new Set<string>(),codes=new Set<string>(),accounts:ApprovedFundAccount[]=[];
      for (const value of rows) {
        const row=object(value),patch=object(row?.['patch']),id=row?.['id'],code=row?.['code'];
        if (!row||!exact(row,['id','code','patch'])||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)||ids.has(id)||typeof code!=='string'||!/^SYNTHETIC[-_][A-Z0-9_-]{1,100}$/.test(code)||codes.has(code)||!patch||!exact(patch,['name','type','bank','accountNumber','department','enabled']))
          throw unavailable('QA_SYNTHETIC_FUND_PROFILE_INVALID');
        if (typeof patch['name']!=='string'||!/^Synthetic [A-Za-z0-9 _.-]{1,100}$/.test(patch['name'])||!['checking','cash','wechat','alipay'].includes(String(patch['type']))||patch['bank']!=='Synthetic bank'||patch['accountNumber']!=='SYNTHETIC-NONPAYABLE'||patch['department']!=='SYNTHETIC'||typeof patch['enabled']!=='boolean')
          throw unavailable('QA_SYNTHETIC_FUND_PROFILE_INVALID');
        ids.add(id);codes.add(code);
        accounts.push(Object.freeze({id,code,patch:Object.freeze({...patch})}));
      }
      const partyRows=profile['parties'];
      if (!Array.isArray(partyRows)||partyRows.length>500) throw unavailable('QA_SYNTHETIC_FUND_PROFILE_INVALID');
      const parties:SyntheticParty[]=[];
      for (const value of partyRows) {
        const row=object(value),id=row?.['id'],code=row?.['code'],name=row?.['name'],role=row?.['role'];
        if (!row||!exact(row,['id','code','name','role'])||typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)||ids.has(id)||typeof code!=='string'||!/^SYNTHETIC[-_][A-Z0-9_-]{1,100}$/.test(code)||codes.has(code)||typeof name!=='string'||!/^Synthetic [A-Za-z0-9 _.-]{1,100}$/.test(name)||(role!=='customer'&&role!=='supplier'))
          throw unavailable('QA_SYNTHETIC_FUND_PROFILE_INVALID');
        ids.add(id);codes.add(code);parties.push(Object.freeze({id,code,name,role}));
      }
      const approval=Object.freeze({revision:'qa-synthetic-funds-'+digest,sourceSha256:digest,syntheticSource:true,accounts:Object.freeze(accounts)});
      this.#loaded={signature,approval,parties:Object.freeze(parties)};
      return this.#loaded;
    } catch (error) {
      this.#loaded=undefined;
      if (error instanceof SecurityError) throw error;
      throw unavailable('QA_SYNTHETIC_FUND_PROFILE_REQUIRED');
    } finally {if (fd!==undefined) closeSync(fd);}
  }
}

interface SyntheticParty {readonly id:string;readonly code:string;readonly name:string;readonly role:PartyRole}
