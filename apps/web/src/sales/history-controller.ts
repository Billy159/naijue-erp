import { LatestQuery } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { salesTarget } from './model.ts';
import type { SalesHistoryReader } from './history-http-reader.ts';

/** One user-opened history layer. Only native audit reads, independent of write recovery. */
export class SalesHistoryController {
  readonly query;
  readonly #scope: ReadScope; readonly #parent: ReadScope; readonly #salesId: ReturnType<typeof salesTarget>['salesId'];
  constructor(parent: ReadScope, reader: SalesHistoryReader, salesId: string) {
    this.#parent = parent; this.#salesId = salesTarget(salesId).salesId;
    this.#scope = new ReadScope(parent.identity, `${parent.routeInstanceId}:sales-history`, this.#salesId, () => {});
    this.query = new LatestQuery({ scope: this.#scope, execute: (read: Parameters<SalesHistoryReader['readHistory']>[0]) => reader.readHistory(read) });
    parent.signal.addEventListener('abort', this.dispose, { once: true });
    if (!parent.active) this.dispose();
  }
  start(): void { if (this.query.getSnapshot().phase === 'idle') void this.query.run({ salesId: this.#salesId, page: 1, pageSize: 20 }); }
  retry(): void {
    const state = this.query.getSnapshot();
    if (state.phase === 'error' && state.request) void this.query.run(state.request.parameters);
  }
  page(page: number): void {
    const state = this.query.getSnapshot(), current = state.success;
    if (state.phase !== 'success' || !current || !Number.isSafeInteger(page) || page < 1 || BigInt(page - 1) * BigInt(current.data.pageSize) >= BigInt(current.data.exactTotal)) return;
    void this.query.run({ salesId: this.#salesId, page, pageSize: current.data.pageSize });
  }
  readonly dispose = () => { this.#parent.signal.removeEventListener('abort', this.dispose); this.#scope.dispose(); this.query.dispose(); };
}
