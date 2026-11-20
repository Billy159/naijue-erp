import type { InventoryPage } from '../contracts.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import { InventoryWindowModel, type InventoryLogicalCell, type InventoryScrollPlan, type InventoryWindowLayout, type InventoryWindowViewport, type ScrollAlignment } from './model.ts';

/** Opaque identity tickets are compared by object identity, not caller strings. */
export interface InventoryDataTicket { readonly sequence: number }
export interface InventoryRenderTicket { readonly revision: number; readonly readReference: string }
export interface InventoryFocusRequest {
  readonly ticket: InventoryRenderTicket;
  readonly address: InventoryLogicalCell;
  readonly scroll: InventoryScrollPlan;
}

/**
 * Route-local adapter for already-authorized reads, not a reader or data cache.
 * A query cancellation keeps its prior successful model, like LatestQuery;
 * scope disposal clears every model/focus reference and rejects later work.
 */
export class InventoryWindowSession {
  readonly #signal: AbortSignal;
  readonly #onAbort = () => this.dispose();
  #disposed = false;
  #sequence = 0;
  #revision = 0;
  #pending: InventoryDataTicket | null = null;
  #renderTicket: InventoryRenderTicket | null = null;
  #model: InventoryWindowModel | null = null;
  #focus: InventoryLogicalCell | null = null;

  constructor(scope: Pick<ReadScope, 'signal'>) {
    this.#signal = scope.signal;
    this.#signal.addEventListener('abort', this.#onAbort, { once: true });
    if (this.#signal.aborted) this.dispose();
  }
  get active(): boolean { return !this.#disposed && !this.#signal.aborted; }
  get model(): InventoryWindowModel | null { return this.#model; }
  get focus(): InventoryLogicalCell | null { return this.#focus; }

  /** Call when an executed query starts, not when an editable filter changes. */
  begin(sequence: number): InventoryDataTicket | null {
    if (!this.active) return null;
    if (!Number.isSafeInteger(sequence) || sequence <= this.#sequence) throw new RangeError('Query sequence must strictly increase within its read scope.');
    this.#sequence = sequence;
    this.#pending = Object.freeze({ sequence });
    this.#invalidateRender();
    return this.#pending;
  }

  /** Only a matching current success may replace the previous complete model. */
  accept(ticket: InventoryDataTicket, data: InventoryPage, layout: InventoryWindowLayout): boolean {
    if (!this.active || this.#pending !== ticket) return false;
    const model = new InventoryWindowModel(data, layout);
    // A caller-supplied measurement callback can synchronously cancel/dispose.
    if (!this.active || this.#pending !== ticket) return false;
    this.#pending = null;
    this.#setModel(model);
    return true;
  }

  /** Failure/cancellation cannot re-label or replace the previous read facts. */
  cancel(ticket: InventoryDataTicket): boolean {
    if (!this.active || this.#pending !== ticket) return false;
    this.#pending = null;
    this.#invalidateRender();
    return true;
  }

  /** Recompute only for measured layout/collapse/display changes, not drafts. */
  reflow(layout: InventoryWindowLayout): boolean {
    if (!this.active || !this.#model) return false;
    const previous = this.#model;
    const ticket = this.#renderTicket;
    const model = new InventoryWindowModel(previous.data, layout);
    if (!this.active || previous !== this.#model || ticket !== this.#renderTicket) return false;
    this.#setModel(model);
    return true;
  }

  capture(): InventoryRenderTicket | null { return this.active ? this.#renderTicket : null; }
  isCurrent(ticket: InventoryRenderTicket): boolean { return this.active && this.#renderTicket === ticket; }

  requestFocus(address: InventoryLogicalCell, viewport: InventoryWindowViewport, alignment: ScrollAlignment = 'nearest'): InventoryFocusRequest | null {
    if (!this.active || !this.#model || !this.#renderTicket) return null;
    const scroll = this.#model.scrollToCell(address, viewport, alignment);
    if (!scroll || scroll.location.cell.state === 'not-applicable') return null;
    const copy = Object.freeze({ ...address });
    this.#focus = copy;
    return { ticket: this.#renderTicket, address: copy, scroll };
  }

  /** Check in a scheduled render/focus callback before touching the DOM. */
  isCurrentFocus(request: InventoryFocusRequest): boolean {
    return this.isCurrent(request.ticket) && this.#focus === request.address;
  }

  clearFocus(): void { this.#focus = null; }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#signal.removeEventListener('abort', this.#onAbort);
    this.#pending = null;
    this.#renderTicket = null;
    this.#model = null;
    this.#focus = null;
  }
  #setModel(model: InventoryWindowModel): void {
    this.#model = model;
    if (this.#focus) {
      const location = model.resolveCell(this.#focus);
      if (!location || location.cell.state === 'not-applicable') this.#focus = null;
    }
    this.#invalidateRender();
  }
  #invalidateRender(): void {
    this.#renderTicket = this.#model ? Object.freeze({ revision: ++this.#revision, readReference: this.#model.data.readReference }) : null;
  }
}
