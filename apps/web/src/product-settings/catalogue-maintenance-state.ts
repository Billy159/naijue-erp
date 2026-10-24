import { useEffect, useState } from 'react';
import { parseCatalogueMaintenanceCommand } from '../../../../packages/application/src/catalogue-maintenance-validation.ts';
import { snapshotQueryParameters } from '../loading/query-parameters.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { CatalogueMaintenanceError, validateCatalogueResult, type CatalogueMaintenanceKind, type CatalogueMaintenanceClient, type CatalogueMaintenanceCommand, type CatalogueMaintenanceResult, type CatalogueMaintenanceReceipt } from './catalogue-maintenance-http-client.ts';
import type { CatalogueMaintenanceCapability } from './colors/contracts.ts';
type WithoutKey<T> = T extends unknown ? Omit<T,'requestKey'> : never;
export type CatalogueEditorDraft=WithoutKey<CatalogueMaintenanceCommand>;
export interface CatalogueEditorOptions {readonly kind:CatalogueMaintenanceKind;readonly scope:ReadScope;readonly client:CatalogueMaintenanceClient;readonly newRequestKey:()=>string;readonly onRecoveryRequired:(command:CatalogueMaintenanceCommand)=>void;readonly onAccessFailure:(error:CatalogueMaintenanceError)=>void}
export interface CatalogueWriteState {readonly phase:'idle'|'submitting'|'checking'|'uncertain'|'rejected'|'committed'|'disposed';readonly command:CatalogueMaintenanceCommand|null;readonly result:CatalogueMaintenanceResult|null;readonly receipt:CatalogueMaintenanceReceipt|null;readonly recovery:'unqueried'|'absent'|'failed'|'found';readonly error:CatalogueMaintenanceError|null}
export function useCatalogueEditor(scope:ReadScope,capability:CatalogueMaintenanceCapability,onAccessFailure:(kind:'unauthenticated'|'forbidden')=>void){
 const [owner,setOwner]=useState<{scope:ReadScope;capability:CatalogueMaintenanceCapability;controller:CatalogueEditorController}|null>(null);
 useEffect(()=>{const controller=new CatalogueEditorController({...capability,scope,onAccessFailure:error=>{scope.dispose();onAccessFailure(error.kind==='unauthenticated'?'unauthenticated':'forbidden');}});setOwner({scope,capability,controller});return()=>controller.dispose();},[scope,capability,onAccessFailure]);
 return owner?.scope===scope&&owner.capability===capability?owner.controller:null;
}
const initial = (): CatalogueWriteState => Object.freeze({ phase: 'idle', command: null, result: null, receipt: null, recovery: 'unqueried', error: null });
/** One immutable request key/body while an outcome is uncertain. No automatic write retry. */
export class CatalogueEditorController {
  readonly #options: CatalogueEditorOptions;
  readonly #listeners = new Set<() => void>();
  #state = initial();
  #sequence = 0;
  readonly #abort = () => this.dispose();
  constructor(options: CatalogueEditorOptions) {
    if(options.client.kind!==options.kind)throw new TypeError('Catalogue client kind must match its editor.');
    if (typeof options.newRequestKey !== 'function' || typeof options.onRecoveryRequired !== 'function' || typeof options.onAccessFailure !== 'function') throw new TypeError('Explicit product editor session owners are required.');
    this.#options = options; options.scope.signal.addEventListener('abort', this.#abort, { once: true });
    if (!options.scope.active) this.dispose();
  }
  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(state: CatalogueWriteState) {
    this.#state = Object.freeze(state);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* A view notification cannot change a command outcome or prevent identity cleanup. */ } }
  }
  #active(sequence: number) { return this.#options.scope.active && this.#state.phase !== 'disposed' && sequence === this.#sequence; }
  async submit(draft: CatalogueEditorDraft): Promise<void> {
    if (!this.#options.scope.active || !['idle', 'rejected'].includes(this.#state.phase)) throw new Error('当前目录资料操作尚未完成，请先查回原请求结果。');
    const command = snapshotQueryParameters(parseCatalogueMaintenanceCommand(this.#options.kind, { ...draft, requestKey: this.#options.newRequestKey() }));
    await this.#execute(command);
  }
  async retryOriginal(): Promise<void> {
    if (this.#state.phase !== 'uncertain' || !this.#state.command || !this.#options.scope.active) throw new Error('当前没有可按原请求恢复的目录资料操作。');
    await this.#execute(this.#state.command, this.#state.command.action === 'REORDER' || this.#state.command.action === 'UNDO_REORDER');
  }
  async #execute(command: CatalogueMaintenanceCommand, retainUnknownOrder = false): Promise<void> {
    const sequence = ++this.#sequence;
    this.#publish({ ...initial(), phase: 'submitting', command });
    try {
      const result = await this.#options.client.execute(command, this.#options.scope.signal);
      if (!this.#active(sequence)) return;
      this.#checkResult(result, command);
      this.#publish({ ...this.#state, phase: 'committed', result, error: null });
    } catch (error) { if (this.#active(sequence)) this.#fail(error, false, retainUnknownOrder); }
  }
  async recover(): Promise<void> {
    if (this.#state.phase !== 'uncertain' || !this.#state.command || !this.#options.scope.active) throw new Error('当前没有待查回的目录资料操作。');
    const command = this.#state.command, sequence = ++this.#sequence;
    this.#publish({ ...this.#state, phase: 'checking', error: null });
    try {
      const receipt = await this.#options.client.receipt(command, this.#options.scope.signal);
      if (!this.#active(sequence)) return;
      if (receipt.requestKey !== command.requestKey || receipt.action !== command.action || receipt.status !== 'COMMITTED') throw new CatalogueMaintenanceError('malformed-response', 'INVALID_CATALOGUE_RECEIPT', 'read');
      this.#checkResult(receipt.result, command);
      this.#publish({ ...this.#state, phase: 'committed', result: receipt.result, receipt, recovery: 'found', error: null });
    } catch (error) { if (this.#active(sequence)) this.#fail(error, true); }
  }
  #checkResult(result: CatalogueMaintenanceResult, command: CatalogueMaintenanceCommand) {
    try { validateCatalogueResult(result, command, this.#options.kind); }
    catch { throw new CatalogueMaintenanceError('malformed-response', 'INVALID_CATALOGUE_RESULT', 'uncertain'); }
  }
  #fail(raw: unknown, read: boolean, retainUnknownOrder = false) {
    const error = raw instanceof CatalogueMaintenanceError ? raw : new CatalogueMaintenanceError('network', 'CATALOGUE_OUTCOME_UNKNOWN', read ? 'read' : 'uncertain');
    this.#publish({ ...this.#state, phase: read || retainUnknownOrder || error.outcome === 'uncertain' ? 'uncertain' : 'rejected', error,
      recovery: read ? error.kind === 'not-found' && error.code === 'RECEIPT_NOT_FOUND' ? 'absent' : 'failed' : this.#state.recovery });
    if (error.kind === 'unauthenticated' || error.kind === 'forbidden') {
      this.dispose(); this.#options.onAccessFailure(error);
    }
  }
  /** Caller must reload the authoritative aggregate before editing a committed version. */
  resetAfterReload(targetId: string, version: number) {
    if (this.#state.phase !== 'committed' || !this.#state.result || targetId !== this.#state.result.targetId || !Number.isSafeInteger(version) || version > 2147483647 || version < this.#state.result.version) throw new Error('请先读取已保存的目录资料版本。');
    this.#publish(initial());
  }
  /** Order owners call only after a successful authoritative complete-tree read.
   * Later edits may have removed the original anchor; never restore old values. */
  resetAfterOrderReload() {
    if (this.#state.phase !== 'committed' || !this.#state.result || !this.#state.command || !['REORDER','UNDO_REORDER'].includes(this.#state.command.action)) throw new Error('请先确认排序提交并读取完整分类目录。');
    this.#publish(initial());
  }
  dispose() {
    if (this.#state.phase === 'disposed') return;
    const pending = ['submitting', 'checking', 'uncertain'].includes(this.#state.phase) ? this.#state.command : null;
    ++this.#sequence; this.#options.scope.signal.removeEventListener('abort', this.#abort);
    this.#publish({ ...initial(), phase: 'disposed' }); this.#listeners.clear();
    if (pending) this.#options.onRecoveryRequired(pending);
  }
}
