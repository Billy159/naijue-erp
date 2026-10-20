import {loadApprovedFundAccounts, type ApprovedFundAccount, type FundAccountApproval} from './approved-fund-accounts-data.js';
import {SecurityError} from './errors.js';
import {isDeepStrictEqual} from 'node:util';

const revisionKey = '_approvedFundAccountRevision';

const syntheticBodyKeys = new Set(['code','name','enabled','primaryPaymentMethodId','type','bank','accountNumber','department','sourceFacts']);

function syntheticFacts(value: unknown, revision?: string): Record<string,unknown> | null {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
  if (!source||source['origin']!=='QA_SYNTHETIC'||Object.keys(source).some(key=>!['origin','hallIds','enabled'].includes(key)&&!(key===revisionKey&&revision!==undefined))
    ||Object.hasOwn(source,'enabled')&&typeof source['enabled']!=='boolean'||!Array.isArray(source['hallIds'])
    ||(source['hallIds'] as unknown[]).some(value=>typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value))
    ||Object.hasOwn(source,revisionKey)&&source[revisionKey]!==revision) return null;
  // Only the existing, correctly bound internal receipt is omitted from public facts.
  const facts={...source};delete facts[revisionKey];return facts;
}

function approval(update: FundAccountApproval, id: string, body: Record<string, unknown>, storedFacts?: Record<string,unknown>): ApprovedFundAccount | undefined {
  const account = update.accounts.find(account=>account.code===String(body['code'] ?? ''));
  if (account && account.id !== id) throw new SecurityError('FUND_ACCOUNT_IDENTITY_CHANGED',409,'资金账户编码与原身份不一致，请核对历史关联');
  if (update.syntheticSource) {
    const facts=syntheticFacts(body['sourceFacts']),returnedFacts=storedFacts===undefined?null:syntheticFacts(storedFacts,update.revision);
    if (!account||Object.keys(body).some(key=>!syntheticBodyKeys.has(key))
      ||['name','type','bank','accountNumber','department','enabled'].some(key=>body[key]!==account.patch[key])||!facts
      ||storedFacts!==undefined&&(!returnedFacts||!isDeepStrictEqual(facts,returnedFacts)))
      throw new SecurityError('QA_SYNTHETIC_FUND_SOURCE_MISMATCH',503,'资金资料与已声明的合成QA资料不一致');
  }
  return account;
}

/** Apply this source revision until a subsequent, ordinary maintenance save acknowledges it. */
export function projectApprovedFundAccount(id: string, body: Record<string, unknown>, storedFacts: Record<string, unknown> = {}, update: FundAccountApproval = loadApprovedFundAccounts()): Record<string, unknown> {
  const account = approval(update,id,body,storedFacts);
  if (!account || storedFacts[revisionKey] === update.revision) return body;
  return {...body,...account.patch};
}

/** Keep the internal maintenance receipt outside the original source facts shown to clients. */
export function fundAccountSourceFacts(storedFacts: Record<string, unknown>): Record<string, unknown> {
  const facts = {...storedFacts};
  delete facts[revisionKey];
  return facts;
}

export function acknowledgeFundAccountUpdate(id: string, body: Record<string, unknown>, sourceFacts: Record<string, unknown>, update: FundAccountApproval = loadApprovedFundAccounts()): Record<string, unknown> {
  return approval(update,id,body,sourceFacts) ? {...sourceFacts,[revisionKey]:update.revision} : sourceFacts;
}
