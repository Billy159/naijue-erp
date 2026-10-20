import {createHash} from 'node:crypto';
import {canonicalJson} from '../idempotency/index.js';
import {formatScaled, parseBusinessDay, parseScaled} from '../transactions/decimal.js';

export const HISTORY_CONTRACT = 'INVENTORY-TARGET-DERIVED-OPENING-20261004-v2';
export const HISTORY_CONTRACT_SHA256 = 'bbdccb1bbc86ee0fe2b0e0fd76359636437ed71592c3485750997b0c03690e79';
export const HISTORY_RULING_SHA256 = '2a39d81c3967f246300ba2ff7a2e5746355f714c7a2a10fb2e5cd73c27b665f7';
export const LEGACY_HISTORY_CONTRACT = 'INVENTORY-HISTORY-RECONCILIATION-20261002-v1';
const LEGACY_CONTRACT_SHA256 = 'd2fa148f5a3337b3387e1dd394ddf4f036b2a171ea0b810abd1c313e9fb2aac8';
const LEGACY_RULING_SHA256 = 'a1e975f14f57fad01204130f6f2d8c7369837be7577803ea2626e45050d15517';
export const historyDigest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

export class HistoryError extends Error {
  constructor(readonly code: string, readonly details: unknown = null) {super(code); this.name = 'HistoryError';}
}
export interface HistoryBoundary {readonly at: string; readonly timezone: 'Asia/Shanghai'; readonly inclusive: boolean}
export interface HistoryKey {readonly warehouseId: string; readonly originalSkuId: string; readonly measurementUnit: string}
export interface HistoryArtifact {readonly file: string; readonly sha256: string; readonly role: 'ORIGINAL_OPENING' | 'OPENING_EXCHANGE' | 'HISTORY_SOURCE' | 'T31_EXCHANGE' | 'IDENTITY_MAP' | 'MAPPING_EXCHANGE' | 'STATE_EVIDENCE' | 'RULE' | 'RULING' | 'CONTRACT' | 'COVERAGE' | 'COVERAGE_EXCHANGE' | 'TARGET_INVENTORY' | 'DERIVED_OPENING'}
export interface HistoryEvidence {readonly file: string; readonly sha256: string; readonly row: string | number; readonly kind?: string}
export interface HistoryMapping {readonly kind: 'WAREHOUSE' | 'SKU'; readonly originalId: string; readonly targetId: string; readonly evidence: readonly HistoryEvidence[]}
export interface OriginalOpening extends HistoryKey {
  readonly quantity: string;
  readonly kind: 'ORIGINAL_OPENING' | 'VERIFIED_NO_OPENING' | 'SOURCE_ORIGINAL_OPENING';
  readonly at: HistoryBoundary;
  readonly includedPeriod: {readonly from: string; readonly through: HistoryBoundary; readonly evidence: readonly HistoryEvidence[]};
  readonly evidence: readonly HistoryEvidence[];
  readonly derivedAudit?: never;
}
export type HistoryQuantityMethod = 'SOURCE_ORIGINAL_OPENING' | 'DERIVED_FROM_TARGET_INVENTORY';
export interface DerivedOpeningAudit extends HistoryKey {
  readonly openingKind: 'DERIVED_FROM_TARGET_INVENTORY'; readonly quantityPolicyRevision: typeof HISTORY_CONTRACT;
  readonly originalSourceOpeningEvidenceClaimed: false; readonly sourceOriginalOpeningAdded: false;
  readonly equalityIndependentlyProvesHistoryComplete: false; readonly missingOrBlankTargetDefaultedToZero: false;
  readonly targetQuantity: string; readonly validInboundQuantity: string; readonly validOutboundQuantity: string;
  readonly validHistoryNet: string; readonly derivedOpeningQuantity: string; readonly reconstructedQuantity: string;
  readonly formula: string; readonly historyWindow: {readonly from: HistoryBoundary; readonly through: HistoryBoundary};
  readonly cutoff: HistoryBoundary; readonly targetRowReferences: readonly HistoryEvidence[];
  readonly canonicalEventReferences: readonly string[]; readonly selectedExchangeSha256: string; readonly effectiveVersion?: string;
  readonly targetCoverage: 'EXPLICIT_REPORTED_CELL' | 'ONE_EXPLICIT_SYNTHETIC_CELL' | 'RULE_PROVEN_ZERO' | 'ASSUMED_TARGET';
  readonly targetQuantityIsSourceValue?: boolean; readonly assumptionsAndUnknowns?: readonly string[];
  readonly coverageEvidence?: readonly HistoryEvidence[]; readonly zeroTargetRuleEvidence?: readonly HistoryEvidence[];
  readonly zeroTargetRule?: {readonly kind: 'REPORT_OMITS_ZERO_CELLS'; readonly cutoff: HistoryBoundary;
    readonly coverageKeysSha256: string; readonly omittedKey: HistoryKey};
}
export interface DerivedOpening extends HistoryKey {
  readonly quantity: string; readonly kind: 'DERIVED_FROM_TARGET_INVENTORY'; readonly at: HistoryBoundary;
  readonly evidence: readonly HistoryEvidence[]; readonly derivedAudit: DerivedOpeningAudit;
  readonly includedPeriod?: OriginalOpening['includedPeriod'];
}
export type HistoryOpening = OriginalOpening | DerivedOpening;
export interface T31Leg extends HistoryKey {
  readonly contributionId: string; readonly lineId: string; readonly eventId: string; readonly versionId: string;
  readonly side: string; readonly candidateQuantity: string; readonly contributionQuantity: string;
  readonly decision: 'CONFIRMED_INPUT'; readonly missingEvidence: readonly string[];
  readonly sourceRowReferences: readonly HistoryEvidence[];
}
export interface T31Inputs {
  readonly schemaVersion: 'T31-HISTORY-CONTRIBUTION-INPUT-v1'; readonly eventId: string;
  readonly family: string; readonly sourceNumber: string; readonly sourceAliases: readonly unknown[];
  readonly stateDecision: {readonly cutoff: HistoryBoundary; readonly stateAtCutoff: string;
    readonly selectedVersionId: string; readonly selectedTransitionId: string;
    readonly missingEvidence: readonly string[]; readonly stateEvidence: readonly HistoryEvidence[]};
  readonly legs: readonly T31Leg[]; readonly programInputResolved: boolean; readonly productionPostingAuthorized: false;
}
export interface HistoryEvent {
  readonly eventId: string; readonly canonicalizationEvidence: readonly HistoryEvidence[];
  readonly atOpening: T31Inputs; readonly atCutoff: T31Inputs;
  readonly sourceNumbers: readonly string[];
  readonly documentBinding?: {readonly documentId: string; readonly revision: number; readonly effectIdentity: string|null; readonly bodySha256: string};
}
export interface HistoryPlanInput {
  readonly schemaVersion: 'T33-HISTORY-PLAN-v1'; readonly revision: string;
  readonly dataClass: 'ISOLATED_FIXTURE' | 'NON_FINAL';
  readonly contractVersion: typeof HISTORY_CONTRACT | typeof LEGACY_HISTORY_CONTRACT; readonly contractSha256: string; readonly rulingSha256: string;
  readonly quantityMethod?: HistoryQuantityMethod;
  readonly quantityScale: 0 | 1 | 2 | 3 | 4;
  readonly cutoff: HistoryBoundary; readonly openingBoundary: HistoryBoundary;
  readonly artifacts: readonly HistoryArtifact[]; readonly mappings: readonly HistoryMapping[];
  readonly coverage: {readonly complete: true; readonly keys: readonly HistoryKey[]; readonly evidence: readonly HistoryEvidence[]};
  readonly originalOpenings: readonly HistoryOpening[]; readonly events: readonly HistoryEvent[];
}
export interface CalculatedHistoryCell extends HistoryKey {
  readonly targetWarehouseId: string; readonly targetSkuId: string;
  readonly originalOpeningQuantity: string | null; readonly validInboundQuantity: string; readonly validOutboundQuantity: string;
  readonly openingKind?: 'DERIVED_FROM_TARGET_INVENTORY'; readonly derivedOpeningQuantity?: string;
  readonly derivedAudit?: DerivedOpeningAudit & {readonly effectiveStateVersionEvidence: readonly unknown[]; readonly assumptionsAndUnknowns: readonly string[]};
  readonly quantity: string; readonly opening: HistoryOpening;
  readonly eventReferences: readonly {eventId: string; fromVersion: string; toVersion: string; fromQuantity: string; toQuantity: string; delta: string}[];
}
export interface CalculatedHistoryPlan {
  readonly manifest: {readonly schemaVersion: 'T33-HISTORY-MANIFEST-v1'; readonly inputSha256: string;
    readonly cellsSha256: string; readonly eventsSha256: string; readonly quantitySource: 'ORIGINAL_OPENING_PLUS_T31_HISTORY' | 'DERIVED_OPENING_PLUS_T31_HISTORY';
    readonly quantityMethod?: HistoryQuantityMethod; readonly inventoryReportIsQuantityInput: boolean; readonly input: HistoryPlanInput};
  readonly manifestSha256: string; readonly cells: readonly CalculatedHistoryCell[]; readonly events: readonly HistoryEvent[];
  readonly duplicateEvents: number;
}

export const historyKey = (k: HistoryKey): string => canonicalJson([k.warehouseId,k.originalSkuId,k.measurementUnit]);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.trim() === v && !v.includes('\0') && v.length <= 512;
const sha = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const reject = (code: string, details?: unknown): never => {throw new HistoryError(code,details);};

/** Only exact Shanghai timestamps are accepted; Date must not normalize invalid calendar input. */
export function historyInstant(at: string): number {
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?\+08:00$/.test(at)) return reject('EXACT_SHANGHAI_TIME_REQUIRED',at);
  try {parseBusinessDay(at.slice(0,10));} catch {return reject('INVALID_HISTORY_DATE',at);}
  if (Number(at.slice(11,13)) > 23 || Number(at.slice(14,16)) > 59 || Number(at.slice(17,19)) > 59) return reject('INVALID_HISTORY_TIME',at);
  const n = Date.parse(at); if (!Number.isFinite(n)) return reject('INVALID_HISTORY_TIME',at); return n;
}
export function validateHistoryBoundary(b: HistoryBoundary): void {
  if (!b || b.timezone !== 'Asia/Shanghai' || typeof b.inclusive !== 'boolean') reject('HISTORY_BOUNDARY_REQUIRED');
  historyInstant(b.at);
}
function keyCheck(k: HistoryKey): void {
  if (!k || !text(k.warehouseId) || !text(k.originalSkuId) || !text(k.measurementUnit) || k.measurementUnit.length > 64) reject('ORIGINAL_IDENTITY_OR_UNIT_REQUIRED',k);
}
function quantity(q: string, scale: number): bigint {
  if (typeof q !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(q) || (q.split('.')[1]?.length ?? 0) > scale) return reject('SOURCE_QUANTITY_PRECISION',q);
  try {return parseScaled(q,4,false);} catch {return reject('QUANTITY_OVERFLOW_OR_INVALID',q);}
}
function evidence(refs: readonly HistoryEvidence[], artifacts: readonly HistoryArtifact[], role?: HistoryArtifact['role']): void {
  if (!Array.isArray(refs) || !refs.length) reject('SOURCE_EVIDENCE_REQUIRED');
  for (const ref of refs) {
    if (!ref || !text(ref.file) || !sha(ref.sha256) || !(typeof ref.row === 'number' && Number.isSafeInteger(ref.row) && ref.row > 0 || text(ref.row))
      || !artifacts.some(a => a.file === ref.file && a.sha256 === ref.sha256 && (!role || a.role === role))) reject('UNBOUND_SOURCE_REFERENCE',ref);
  }
}
export function validateT31Inputs(p: T31Inputs, boundary: HistoryBoundary, artifacts: readonly HistoryArtifact[], scale: number): void {
  validateHistoryBoundary(boundary);
  if (!p || p.schemaVersion !== 'T31-HISTORY-CONTRIBUTION-INPUT-v1' || !text(p.eventId) || !text(p.family)
    || p.programInputResolved !== true || p.productionPostingAuthorized !== false || !p.stateDecision
    || historyDigest(p.stateDecision.cutoff) !== historyDigest(boundary) || !Array.isArray(p.sourceAliases)
    || !Array.isArray(p.legs) || !p.legs.length || p.stateDecision.missingEvidence.length
    || !['EFFECTIVE','UNAUDITED','VOID','UNAPPROVED'].includes(p.stateDecision.stateAtCutoff)
    || !text(p.stateDecision.selectedVersionId) || !text(p.stateDecision.selectedTransitionId)) reject('UNRESOLVED_OR_WRONG_T31_BOUNDARY',p?.eventId);
  evidence(p.stateDecision.stateEvidence,artifacts);
  const ids = new Set<string>();
  for (const leg of p.legs) {
    keyCheck(leg);
    if (!sha(leg.contributionId) || ids.has(leg.contributionId) || !text(leg.lineId) || leg.eventId !== p.eventId
      || leg.versionId !== p.stateDecision.selectedVersionId || leg.decision !== 'CONFIRMED_INPUT' || leg.missingEvidence.length
      || !['IN','OUT'].includes(leg.side)) reject('INVALID_OR_DUPLICATE_T31_LEG',leg);
    if (leg.contributionId !== historyDigest([p.eventId,leg.versionId,leg.lineId,leg.side])) reject('T31_CONTRIBUTION_ID_MISMATCH',leg);
    ids.add(leg.contributionId); evidence(leg.sourceRowReferences,artifacts);
    const candidate = quantity(leg.candidateQuantity,scale), actual = quantity(leg.contributionQuantity,scale);
    if (actual !== (p.stateDecision.stateAtCutoff === 'EFFECTIVE' ? candidate : 0n)) reject('STATE_CONTRIBUTION_MISMATCH',leg);
    if (p.family === 'TRANSFER') {
      const pair = p.legs.filter(x => x.lineId === leg.lineId);
      if (pair.length !== 2 || pair[0]!.side === pair[1]!.side || pair[0]!.warehouseId === pair[1]!.warehouseId
        || pair[0]!.originalSkuId !== pair[1]!.originalSkuId || pair[0]!.measurementUnit !== pair[1]!.measurementUnit
        || quantity(pair[0]!.candidateQuantity,scale) + quantity(pair[1]!.candidateQuantity,scale) !== 0n) reject('TRANSFER_ENDPOINTS_NOT_CONSERVED',leg.lineId);
    }
  }
}
export const t31LegBodyDigest = (legs: T31Inputs['legs']): string => historyDigest(legs.map(l=>({eventId:l.eventId,versionId:l.versionId,lineId:l.lineId,
  side:l.side,warehouseId:l.warehouseId,originalSkuId:l.originalSkuId,measurementUnit:l.measurementUnit,
  candidateQuantity:formatScaled(parseScaled(l.candidateQuantity,4,false),4)})).sort((a,b)=>historyDigest(a).localeCompare(historyDigest(b))));
export function mappedHistoryLegs(inputs: T31Inputs, mappings: readonly HistoryMapping[]): {warehouseId: string; skuId: string; unit: string; quantity: string; lineId: string}[] {
  return inputs.legs.map(l => {
    const warehouseId = mappings.find(m => m.kind === 'WAREHOUSE' && m.originalId === l.warehouseId)?.targetId;
    const skuId = mappings.find(m => m.kind === 'SKU' && m.originalId === l.originalSkuId)?.targetId;
    if (!warehouseId || !skuId) return reject('UNMAPPED_ORIGINAL_IDENTITY',l);
    return {warehouseId,skuId,unit:l.measurementUnit,quantity:formatScaled(parseScaled(l.contributionQuantity,4,false),4),lineId:l.lineId};
  });
}

/** Recompute the supplied derivation against resolved, deduplicated history; do not trust its totals. */
function derivedProof(opening: DerivedOpening, input: HistoryPlanInput, start: bigint, inbound: bigint, outbound: bigint,
  refs: CalculatedHistoryCell['eventReferences'], events: ReadonlyMap<string,HistoryEvent>): NonNullable<CalculatedHistoryCell['derivedAudit']> {
  const a = opening.derivedAudit, scale = input.quantityScale;
  if (!a || a.openingKind !== 'DERIVED_FROM_TARGET_INVENTORY' || a.quantityPolicyRevision !== input.contractVersion
    || a.originalSourceOpeningEvidenceClaimed !== false || a.sourceOriginalOpeningAdded !== false
    || a.equalityIndependentlyProvesHistoryComplete !== false || a.missingOrBlankTargetDefaultedToZero !== false
    || !text(a.warehouseId) || !text(a.originalSkuId) || !text(a.measurementUnit)
    || historyKey(a) !== historyKey(opening) || !a.historyWindow || !a.historyWindow.from || !a.historyWindow.through || !a.cutoff
    || historyDigest(a.historyWindow.from) !== historyDigest(input.openingBoundary)
    || historyDigest(a.historyWindow.through) !== historyDigest(input.cutoff) || historyDigest(a.cutoff) !== historyDigest(input.cutoff)
    || !input.artifacts.some(x => x.role === 'T31_EXCHANGE' && x.sha256 === a.selectedExchangeSha256)) reject('DERIVED_METHOD_PROOF_REQUIRED',opening);
  evidence(opening.evidence,input.artifacts);
  if (opening.evidence.some(ref => ref.kind !== 'DERIVED_FROM_TARGET_INVENTORY'
    || !input.artifacts.some(x => x.file === ref.file && ['DERIVED_OPENING','RULE'].includes(x.role)))) reject('DERIVED_OPENING_EVIDENCE_REQUIRED');
  evidence(a.targetRowReferences,input.artifacts);
  if (input.dataClass !== 'ISOLATED_FIXTURE' && a.targetRowReferences.some(ref =>
    !input.artifacts.some(x => x.file === ref.file && x.role === 'TARGET_INVENTORY'))) reject('TARGET_INVENTORY_EVIDENCE_REQUIRED');
  if (!['EXPLICIT_REPORTED_CELL','ONE_EXPLICIT_SYNTHETIC_CELL','RULE_PROVEN_ZERO','ASSUMED_TARGET'].includes(a.targetCoverage)
    || a.targetCoverage === 'ONE_EXPLICIT_SYNTHETIC_CELL' && (input.dataClass !== 'ISOLATED_FIXTURE' || input.coverage.keys.length !== 1)
    || a.assumptionsAndUnknowns !== undefined && (!Array.isArray(a.assumptionsAndUnknowns) || a.assumptionsAndUnknowns.some(x => !text(x)))
    || a.assumptionsAndUnknowns === undefined && a.targetCoverage !== 'ONE_EXPLICIT_SYNTHETIC_CELL') reject('DERIVED_COVERAGE_OR_ASSUMPTIONS_REQUIRED');
  const target = quantity(a.targetQuantity,scale), net = inbound-outbound;
  if (a.targetCoverage === 'RULE_PROVEN_ZERO') {
    if (target !== 0n || a.targetQuantityIsSourceValue !== false || !a.zeroTargetRule || a.zeroTargetRule.kind !== 'REPORT_OMITS_ZERO_CELLS'
      || !a.zeroTargetRule.omittedKey || !a.zeroTargetRule.cutoff || historyKey(a.zeroTargetRule.omittedKey) !== historyKey(opening)
      || historyDigest(a.zeroTargetRule.cutoff) !== historyDigest(input.cutoff)
      || a.zeroTargetRule.coverageKeysSha256 !== historyDigest(input.coverage.keys)) reject('UNPROVEN_ZERO_TARGET');
    evidence(a.coverageEvidence!,input.artifacts,'COVERAGE'); evidence(a.zeroTargetRuleEvidence!,input.artifacts,'RULE');
  } else if (a.targetCoverage === 'ASSUMED_TARGET') {
    if (a.targetQuantityIsSourceValue !== false || !a.assumptionsAndUnknowns?.length) reject('UNDECLARED_TARGET_ASSUMPTION');
  } else if (a.targetQuantityIsSourceValue === false) reject('EXPLICIT_TARGET_SOURCE_VALUE_REQUIRED');
  if (quantity(a.validInboundQuantity,scale) !== inbound || quantity(a.validOutboundQuantity,scale) !== outbound
    || quantity(a.validHistoryNet,scale) !== net || quantity(a.derivedOpeningQuantity,scale) !== target-net
    || start !== target-net || quantity(a.reconstructedQuantity,scale) !== target) reject('DERIVED_HISTORY_OR_FORMULA_MISMATCH');
  const formula = typeof a.formula === 'string' ? a.formula.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)$/) : null;
  if (!formula || quantity(formula[1]!,scale) !== target || quantity(formula[2]!,scale) !== net
    || quantity(formula[3]!,scale) !== start) reject('DERIVED_HISTORY_OR_FORMULA_MISMATCH');
  const ids = refs.map(r => r.eventId).sort();
  if (!Array.isArray(a.canonicalEventReferences) || a.canonicalEventReferences.some(id => !text(id))
    || historyDigest([...a.canonicalEventReferences].sort()) !== historyDigest(ids)
    || a.effectiveVersion !== undefined && (!text(a.effectiveVersion) || refs.some(r => r.toVersion !== a.effectiveVersion))) reject('DERIVED_EVENT_VERSION_PROOF_MISMATCH');
  return {...a,assumptionsAndUnknowns:a.assumptionsAndUnknowns ?? ['Synthetic explicit-cell preparation supplied coverage/unknown flags instead of a separate assumptions list.'],
    effectiveStateVersionEvidence:ids.map(id => {
      const e = events.get(id)!;
      return {eventId:id,atOpening:e.atOpening.stateDecision,atCutoff:e.atCutoff.stateDecision,
        canonicalizationEvidence:e.canonicalizationEvidence,sourceNumbers:e.sourceNumbers,
        sourceAliases:e.atCutoff.sourceAliases,contributionEvidence:{eventId:id,warehouseId:opening.warehouseId,
          originalSkuId:opening.originalSkuId,measurementUnit:opening.measurementUnit,boundaries:['OPENING','CUTOFF']}};
    })};
}

/** Explicit methods share F(T)-F(start); a derived basis never becomes original-source evidence. */
export function calculateHistoryPlan(input: HistoryPlanInput): CalculatedHistoryPlan {
  const currentPolicy = input?.contractVersion === HISTORY_CONTRACT && input.contractSha256 === HISTORY_CONTRACT_SHA256 && input.rulingSha256 === HISTORY_RULING_SHA256;
  const legacyPolicy = input?.contractVersion === LEGACY_HISTORY_CONTRACT && input.contractSha256 === LEGACY_CONTRACT_SHA256 && input.rulingSha256 === LEGACY_RULING_SHA256;
  if (!input || input.schemaVersion !== 'T33-HISTORY-PLAN-v1' || !text(input.revision) || !['ISOLATED_FIXTURE','NON_FINAL'].includes(input.dataClass)
    || !currentPolicy && !legacyPolicy
    || !Number.isInteger(input.quantityScale) || input.quantityScale < 0 || input.quantityScale > 4) reject('INVALID_HISTORY_PLAN_OR_POLICY');
  const allowed = ['schemaVersion','revision','dataClass','contractVersion','contractSha256','rulingSha256','quantityMethod','quantityScale','cutoff','openingBoundary','artifacts','mappings','coverage','originalOpenings','events'];
  if (Object.keys(input).some(k => !allowed.includes(k))) reject('UNEXPECTED_QUANTITY_INPUT');
  validateHistoryBoundary(input.cutoff); validateHistoryBoundary(input.openingBoundary);
  if (historyInstant(input.openingBoundary.at) >= historyInstant(input.cutoff.at)) reject('INVALID_OPENING_PERIOD');
  if (!Array.isArray(input.artifacts) || !input.artifacts.length || !Array.isArray(input.mappings) || !Array.isArray(input.events) || !Array.isArray(input.originalOpenings)) reject('SOURCE_BINDINGS_REQUIRED');
  const method = input.quantityMethod ?? (input.originalOpenings.some(o => o.kind === 'DERIVED_FROM_TARGET_INVENTORY') ? 'DERIVED_FROM_TARGET_INVENTORY' : 'SOURCE_ORIGINAL_OPENING');
  if (!['SOURCE_ORIGINAL_OPENING','DERIVED_FROM_TARGET_INVENTORY'].includes(method)
    || method === 'DERIVED_FROM_TARGET_INVENTORY' && !currentPolicy
    || input.originalOpenings.some(o => (o.kind === 'DERIVED_FROM_TARGET_INVENTORY') !== (method === 'DERIVED_FROM_TARGET_INVENTORY'))) reject('MIXED_OR_UNAUTHORIZED_OPENING_METHOD');
  const artifacts = new Set<string>();
  for (const a of input.artifacts) {
    if (!text(a.file) || a.file.startsWith('/') || a.file.split('/').some(s => !s || s === '.' || s === '..') || !sha(a.sha256)
      || !['ORIGINAL_OPENING','OPENING_EXCHANGE','HISTORY_SOURCE','T31_EXCHANGE','IDENTITY_MAP','MAPPING_EXCHANGE','STATE_EVIDENCE','RULE','RULING','CONTRACT','COVERAGE','COVERAGE_EXCHANGE','TARGET_INVENTORY','DERIVED_OPENING'].includes(a.role)
      || artifacts.has(a.file)) reject('INVALID_ARTIFACT_BINDING',a);
    artifacts.add(a.file);
  }
  if (!input.artifacts.some(a => a.role === 'CONTRACT' && a.sha256 === input.contractSha256)
    || !input.artifacts.some(a => a.role === 'RULING' && a.sha256 === input.rulingSha256)
    || !input.artifacts.some(a => a.role === 'T31_EXCHANGE') || !input.artifacts.some(a => a.role === 'RULE')
    || !input.artifacts.some(a => a.role === 'IDENTITY_MAP')) reject('REQUIRED_POLICY_OR_EXCHANGE_ARTIFACT_MISSING');
  const mappingKeys = new Set<string>(), mappingTargets = new Set<string>();
  for (const m of input.mappings) {
    if (!['SKU','WAREHOUSE'].includes(m.kind) || !text(m.originalId) || !uuid(m.targetId) || m.kind === 'SKU' && (!uuid(m.originalId) || m.targetId !== m.originalId)
      || uuid(m.originalId) && m.targetId !== m.originalId || mappingKeys.has(m.kind+':'+m.originalId)
      || mappingTargets.has(m.kind+':'+m.targetId)) reject('AMBIGUOUS_OR_MERGED_ORIGINAL_MAPPING',m);
    mappingKeys.add(m.kind+':'+m.originalId); mappingTargets.add(m.kind+':'+m.targetId); evidence(m.evidence,input.artifacts,'IDENTITY_MAP');
  }
  if (!input.coverage || input.coverage.complete !== true || !Array.isArray(input.coverage.keys) || !input.coverage.keys.length) reject('COMPLETE_QUANTITY_COVERAGE_REQUIRED');
  evidence(input.coverage.evidence,input.artifacts,'COVERAGE');
  const keys = new Set<string>();
  for (const k of input.coverage.keys) {keyCheck(k); if (keys.has(historyKey(k))) reject('DUPLICATE_COVERAGE_KEY',k); keys.add(historyKey(k));}
  const cells = new Map<string,{opening: HistoryOpening; start: bigint; inbound: bigint; outbound: bigint; refs: CalculatedHistoryCell['eventReferences'][number][]}>();
  for (const opening of input.originalOpenings) {
    keyCheck(opening); const k = historyKey(opening);
    if (!keys.has(k) || cells.has(k) || !['ORIGINAL_OPENING','VERIFIED_NO_OPENING','SOURCE_ORIGINAL_OPENING','DERIVED_FROM_TARGET_INVENTORY'].includes(opening.kind)
      || historyDigest(opening.at) !== historyDigest(input.openingBoundary)) reject('OPENING_PERIOD_OR_IDENTITY_NOT_PROVEN',opening);
    if (opening.kind !== 'DERIVED_FROM_TARGET_INVENTORY') {
      if (Object.hasOwn(opening,'derivedAudit') || !opening.includedPeriod || historyDigest(opening.includedPeriod.through) !== historyDigest(opening.at)
        || historyInstant(opening.includedPeriod.from) > historyInstant(opening.at.at)) reject('OPENING_PERIOD_OR_IDENTITY_NOT_PROVEN',opening);
      evidence(opening.evidence,input.artifacts,'ORIGINAL_OPENING'); evidence(opening.includedPeriod.evidence,input.artifacts);
    }
    const start = quantity(opening.quantity,input.quantityScale);
    if (opening.kind === 'VERIFIED_NO_OPENING' && start !== 0n) reject('NO_OPENING_IS_NOT_ZERO',opening);
    cells.set(k,{opening,start,inbound:0n,outbound:0n,refs:[]});
  }
  if (cells.size !== keys.size) reject(method === 'DERIVED_FROM_TARGET_INVENTORY' ? 'MISSING_DERIVED_OPENING' : 'MISSING_ORIGINAL_OPENING',input.coverage.keys.filter(k => !cells.has(historyKey(k))));
  const unique = new Map<string,HistoryEvent>(); let duplicates = 0;
  for (const e of input.events) {
    if (!text(e.eventId) || !Array.isArray(e.sourceNumbers) || !e.sourceNumbers.length || e.sourceNumbers.some(n => !text(n))) reject('CANONICAL_EVENT_IDENTITY_REQUIRED',e);
    evidence(e.canonicalizationEvidence,input.artifacts);
    const previous = unique.get(e.eventId);
    if (previous) {if (historyDigest(previous) !== historyDigest(e)) reject('CONFLICTING_CANONICAL_EVENT',e.eventId); duplicates++; continue;}
    unique.set(e.eventId,e);
    validateT31Inputs(e.atOpening,input.openingBoundary,input.artifacts,input.quantityScale);
    validateT31Inputs(e.atCutoff,input.cutoff,input.artifacts,input.quantityScale);
    if (e.atOpening.eventId !== e.eventId || e.atCutoff.eventId !== e.eventId || e.atOpening.family !== e.atCutoff.family) reject('CANONICAL_EVENT_PACKET_MISMATCH',e.eventId);
    if (e.atOpening.stateDecision.selectedVersionId === e.atCutoff.stateDecision.selectedVersionId
      && t31LegBodyDigest(e.atOpening.legs) !== t31LegBodyDigest(e.atCutoff.legs)) reject('IMMUTABLE_T31_VERSION_CHANGED',e.eventId);
    if (e.documentBinding && (!uuid(e.documentBinding.documentId) || !Number.isSafeInteger(e.documentBinding.revision) || e.documentBinding.revision < 1
      || e.documentBinding.effectIdentity!==null && (!text(e.documentBinding.effectIdentity) || !e.documentBinding.effectIdentity.startsWith('baseline:'))
      || (e.documentBinding.effectIdentity!==null)!==(e.atCutoff.stateDecision.stateAtCutoff==='EFFECTIVE') || !sha(e.documentBinding.bodySha256))) reject('INVALID_RUNTIME_DOCUMENT_BINDING',e.documentBinding);
    const before = new Map<string,bigint>(), after = new Map<string,bigint>();
    for (const [p,totals] of [[e.atOpening,before],[e.atCutoff,after]] as const) for (const l of p.legs) {
      const k = historyKey(l); if (!cells.has(k)) reject('EVENT_OUTSIDE_OPENING_COVERAGE',l);
      totals.set(k,(totals.get(k) ?? 0n)+quantity(l.contributionQuantity,input.quantityScale));
    }
    for (const k of new Set([...before.keys(),...after.keys()])) {
      const from = before.get(k) ?? 0n, to = after.get(k) ?? 0n, delta = to-from, c = cells.get(k)!;
      if (delta >= 0n) c.inbound += delta; else c.outbound -= delta;
      c.refs.push({eventId:e.eventId,fromVersion:e.atOpening.stateDecision.selectedVersionId,toVersion:e.atCutoff.stateDecision.selectedVersionId,
        fromQuantity:formatScaled(from,4),toQuantity:formatScaled(to,4),delta:formatScaled(delta,4)});
    }
  }
  const aliases = new Map<string,string>(), docs = new Set<string>();
  for (const e of unique.values()) {
    for (const n of e.sourceNumbers) {if (aliases.has(n) && aliases.get(n) !== e.eventId) reject('CONFLICTING_SOURCE_NUMBER_RELATION',n); aliases.set(n,e.eventId);}
    if (e.documentBinding) {if (docs.has(e.documentBinding.documentId)) reject('DUPLICATE_RUNTIME_DOCUMENT_BINDING'); docs.add(e.documentBinding.documentId);}
  }
  const result = [...cells.values()].map(c => {
    const w = input.mappings.find(m => m.kind === 'WAREHOUSE' && m.originalId === c.opening.warehouseId);
    const s = input.mappings.find(m => m.kind === 'SKU' && m.originalId === c.opening.originalSkuId);
    if (!w || !s) return reject('UNMAPPED_ORIGINAL_IDENTITY',c.opening);
    const derived = c.opening.kind === 'DERIVED_FROM_TARGET_INVENTORY';
    return {warehouseId:c.opening.warehouseId,originalSkuId:c.opening.originalSkuId,measurementUnit:c.opening.measurementUnit,
      targetWarehouseId:w.targetId,targetSkuId:s.targetId,originalOpeningQuantity:derived ? null : formatScaled(c.start,4),
      ...(c.opening.kind === 'DERIVED_FROM_TARGET_INVENTORY' ? {openingKind:c.opening.kind,derivedOpeningQuantity:formatScaled(c.start,4),
        derivedAudit:derivedProof(c.opening,input,c.start,c.inbound,c.outbound,c.refs,unique)} : {}),validInboundQuantity:formatScaled(c.inbound,4),
      validOutboundQuantity:formatScaled(c.outbound,4),quantity:formatScaled(c.start+c.inbound-c.outbound,4),opening:c.opening,eventReferences:c.refs};
  }).sort((a,b) => historyKey(a).localeCompare(historyKey(b)));
  const events = [...unique.values()].sort((a,b) => a.eventId.localeCompare(b.eventId));
  const manifest = {schemaVersion:'T33-HISTORY-MANIFEST-v1' as const,inputSha256:historyDigest(input),cellsSha256:historyDigest(result),
    eventsSha256:historyDigest(events),quantitySource:method === 'DERIVED_FROM_TARGET_INVENTORY' ? 'DERIVED_OPENING_PLUS_T31_HISTORY' as const : 'ORIGINAL_OPENING_PLUS_T31_HISTORY' as const,
    ...(currentPolicy ? {quantityMethod:method} : {}),inventoryReportIsQuantityInput:method === 'DERIVED_FROM_TARGET_INVENTORY',input};
  return {manifest,manifestSha256:historyDigest(manifest),cells:result,events,duplicateEvents:duplicates};
}
