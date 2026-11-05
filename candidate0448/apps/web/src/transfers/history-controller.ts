import { LatestQuery } from '../loading/latest-query.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { transferTarget } from './model.ts';
import type { TransferHistoryReader } from './history-http-reader.ts';

/** One user-opened history layer. Only native audit reads, independent of write recovery. */
export class TransferHistoryController {
  readonly query;
  readonly #scope: ReadScope; readonly #parent: ReadScope; readonly #transferId: ReturnType<typeof transferTarget>['transferId'];
  constructor(parent: ReadScope, reader: TransferHistoryReader, transferId: string) {
    this.#parent = parent; this.#transferId = transferTarget(transferId).transferId;
    this.#scope = new ReadScope(parent.identity, `${parent.routeInstanceId}:transfer-history`, this.#transferId, () => {});
    this.query = new LatestQuery({ scope: this.#scope, execute: (read: Parameters<TransferHistoryReader['readHistory']>[0]) => reader.readHistory(read) });
    parent.signal.addEventListener('abort', this.dispose, { once: true });
    if (!parent.active) this.dispose();
  }
  start(): void { if (this.query.getSnapshot().phase === 'idle') void this.query.run({ transferId: this.#transferId, page: 1, pageSize: 20 }); }
  retry(): void {
    const state = this.query.getSnapshot();
    if (state.phase === 'error' && state.request) void this.query.run(state.request.parameters);
  }
  page(page: number): void {
    const state = this.query.getSnapshot(), current = state.success;
    if (state.phase !== 'success' || !current || !Number.isSafeInteger(page) || page < 1 || BigInt(page - 1) * BigInt(current.data.pageSize) >= BigInt(current.data.exactTotal)) return;
    void this.query.run({ transferId: this.#transferId, page, pageSize: current.data.pageSize });
  }
  readonly dispose = () => { this.#parent.signal.removeEventListener('abort', this.dispose); this.#scope.dispose(); this.query.dispose(); };
}
