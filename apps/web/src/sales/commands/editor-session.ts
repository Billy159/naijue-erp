import type { AuthenticationPrincipal } from '../../authentication/contracts.ts';
import type { SalesCommandDto, SalesCommandSnapshot, SalesCommandWorkspaceOptions, SalesFormPreparationProvider } from './contracts.ts';
import { SalesCommandError } from './contracts.ts';
import { SalesCommandWorkspace } from './controller.ts';
import { compileSalesForm, salesFormInput, type SalesFormInput } from './form-model.ts';
import { frozenSnapshot } from './validation.ts';

export interface SalesEditorSnapshot {
  readonly command: SalesCommandSnapshot; readonly input: SalesFormInput | null;
  readonly errors: Readonly<Record<string, string>>; readonly preparing: boolean; readonly notice: string | null;
  readonly commitRevision: number;
}
export interface SalesEditorSessionOptions extends SalesCommandWorkspaceOptions {
  readonly principal: AuthenticationPrincipal; readonly preparation?: SalesFormPreparationProvider;
}
/** Session owner for BOTH invalid raw input and the original native operation.
 * Route unmount never discards either. Current references are not fabricated. */
export class SalesEditorSession {
  readonly commands: SalesCommandWorkspace;
  readonly #options: SalesEditorSessionOptions;
  readonly #listeners = new Set<() => void>();
  #state: SalesEditorSnapshot;
  #baseline: string | null = null;
  #preparing: AbortController | null = null;
  #sequence = 0;
  #committedOperation: string | null = null;
  #unsubscribe: () => void;
  constructor(options: SalesEditorSessionOptions) {
    if (!options.principal || options.principal.accountId !== options.scope.identity.accountId) throw new TypeError('Current sales principal must match its session scope.');
    this.#options = Object.freeze({ ...options, principal: Object.freeze({ ...options.principal }) });
    this.commands = new SalesCommandWorkspace(options);
    this.#state = Object.freeze({ command: this.commands.getSnapshot(), input: null, errors: Object.freeze({}), preparing: false, notice: null, commitRevision: 0 });
    this.#unsubscribe = this.commands.subscribe(() => {
      const command = this.commands.getSnapshot();
      let commitRevision = this.#state.commitRevision;
      if (command.write.phase === 'committed' && command.write.result && command.write.result.operationId !== this.#committedOperation) {
        this.#committedOperation = command.write.result.operationId; commitRevision++;
      }
      if (command.disposed) { this.#sequence++; this.#preparing?.abort(); this.#preparing = null; this.#baseline = null; }
      this.#publish({ ...this.#state, command, commitRevision, ...(command.disposed ? { input: null, errors: Object.freeze({}), preparing: false, notice: null } : {}) });
    });
  }
  readonly getSnapshot = (): SalesEditorSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get canCreate(): boolean { return !!this.#options.preparation && !this.#state.command.disposed; }
  get hasDirtyDraft(): boolean {
    return this.#state.command.write.phase !== 'committed' && !!this.#state.input
      && (this.#state.command.editor?.mode === 'CREATE' || JSON.stringify(this.#state.input) !== this.#baseline);
  }
  canLeave(): boolean { return !this.#state.preparing && !this.hasDirtyDraft && this.commands.canLeave(); }
  get editable(): boolean {
    const { editor, write, stale, disposed } = this.#state.command;
    return !disposed && !this.#state.preparing && !!editor?.draft && editor.phase === 'ready' && !editor.current && !stale
      && !['submitting', 'checking', 'replaying', 'uncertain', 'committed'].includes(write.phase) && this.actionAllowed('SAVE');
  }
  /** UI affordances mirror only the confirmed action rule, never grant authority. */
  actionAllowed(action: SalesCommandDto['action']): boolean {
    const { editor, disposed } = this.#state.command, principal = this.#options.principal;
    if (disposed || !editor || !['ADMIN', 'WAREHOUSE', 'SALESPERSON'].includes(principal.role)) return false;
    const header = editor.detail?.document.header ?? editor.draft?.header;
    if (!header) return false;
    if (principal.role !== 'SALESPERSON') return true;
    if (principal.hallId === null || principal.hallId !== header.hallId || action === 'UNAPPROVE') return false;
    return action !== 'APPROVE' || editor.detail?.document.header.createdByAccountId === principal.accountId;
  }
  async openExisting(salesId: string): Promise<boolean> {
    if (!this.canLeave()) return false;
    const sequence = ++this.#sequence, ok = await this.commands.openExisting(salesId);
    if (sequence !== this.#sequence || !this.#options.scope.active) return false;
    this.#adoptInput(); return ok;
  }
  async openCreate(): Promise<boolean> {
    if (!this.canLeave() || !this.#options.preparation) { this.#notice('新增尚缺当前授权资料、价格及编号准备，未创建单据。'); return false; }
    const sequence = ++this.#sequence, request = new AbortController(); this.#preparing = request;
    this.#publish({ ...this.#state, preparing: true, notice: null });
    try {
      const draft = await this.#options.preparation.prepareCreate(AbortSignal.any([request.signal, this.#options.scope.signal]));
      if (sequence !== this.#sequence || request.signal.aborted || !this.#options.scope.active) return false;
      const ok = this.commands.openCreate(draft); if (ok) this.#adoptInput(); return ok;
    } catch (error) {
      if (sequence !== this.#sequence || request.signal.aborted || !this.#options.scope.active) return false;
      if (error instanceof SalesCommandError && ['unauthenticated', 'forbidden'].includes(error.kind)) {
        this.#options.scope.dispose(); try { this.#options.onAccessFailure(error); } catch { /* Old facts already cleared. */ }
      } else this.#notice('当前新单资料准备失败，未创建单据，未发送业务命令。');
      return false;
    } finally {
      if (this.#preparing === request) { this.#preparing = null; this.#publish({ ...this.#state, preparing: false }); }
    }
  }
  updateInput(input: SalesFormInput): boolean {
    if (!this.editable) return false;
    this.#publish({ ...this.#state, input: frozenSnapshot(input), errors: Object.freeze({}), notice: null }); return true;
  }
  async save(): Promise<boolean> {
    if (!this.editable || !this.#state.input) return false;
    const base = this.#state.command.editor!.draft!, result = compileSalesForm(base, this.#state.input);
    if (!result.ok) { this.#publish({ ...this.#state, errors: result.errors, notice: '输入尚未通过校验，未发送保存请求。' }); return false; }
    if (!this.commands.replaceDraft(result.draft)) return false;
    if (!this.commands.hasDirtyDraft) { this.#baseline = JSON.stringify(this.#state.input); this.#notice('业务内容未改变，无需保存。'); return false; }
    return this.commands.submit('SAVE');
  }
  submit(action: Exclude<SalesCommandDto['action'], 'SAVE'>): Promise<boolean> {
    if (!this.actionAllowed(action) || this.#state.preparing) return Promise.resolve(false);
    if (this.hasDirtyDraft) { this.#notice('请先保存本次输入并重新读取、采用后，再执行审核或作废。'); return Promise.resolve(false); }
    return this.commands.submit(action);
  }
  /** The view obtains the explicit discard decision before passing true. */
  adoptCurrent(discardEdits = false): boolean {
    if (this.hasDirtyDraft && !discardEdits) return false;
    const ok = this.commands.adoptCurrent(); if (ok) this.#adoptInput(); return ok;
  }
  discardEditor(discardEdits = false): boolean {
    if (this.hasDirtyDraft && !discardEdits) return false;
    const ok = this.commands.discardEditor(); if (ok) this.#adoptInput(); return ok;
  }
  suspend(): void {
    this.#sequence++; this.#preparing?.abort(); this.#preparing = null;
    this.commands.suspend(); this.#publish({ ...this.#state, preparing: false });
  }
  dispose(): void {
    this.#sequence++; this.#preparing?.abort(); this.#preparing = null;
    this.commands.dispose(); this.#unsubscribe(); this.#listeners.clear();
  }
  #adoptInput(): void {
    const draft = this.commands.getSnapshot().editor?.draft; const input = draft ? salesFormInput(draft) : null;
    this.#baseline = input ? JSON.stringify(input) : null;
    this.#publish({ ...this.#state, input, errors: Object.freeze({}), notice: null });
  }
  #notice(notice: string): void { if (!this.#state.command.disposed) this.#publish({ ...this.#state, notice }); }
  #publish(state: SalesEditorSnapshot): void { this.#state = Object.freeze(state); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* One view cannot prevent session cleanup. */ } } }
}
