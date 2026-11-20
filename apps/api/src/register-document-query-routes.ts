import type { FastifyInstance } from "fastify";
import {
  PostgresOrdinaryDocumentListReader,
  type NativeOrdinaryDocumentListOptions,
} from "../../../adapters/postgres/src/ordinary-document-list-reader.ts";
import type { PublishedDocumentAnchorProfile } from "../../../adapters/postgres/src/published-document-inventory-anchor-reader.ts";
import { PostgresSalesQueryReader, type PgSalesQueryPool } from "../../../adapters/postgres/src/sales-query-reader.ts";
import { PostgresTransferQueryReader } from "../../../adapters/postgres/src/transfer-query-reader.ts";
import type { SalesQueryAuthorization } from "../../../packages/application/src/sales-query-ports.ts";
import type { TransferQueryAuthorization } from "../../../packages/application/src/transfer-query-ports.ts";
import { createSalesQueryHttpPlugin, type SalesQueryHttpOptions } from "./sales-query-http.ts";
import { createTransferQueryHttpPlugin, type TransferQueryHttpOptions } from "./transfer-query-http.ts";

interface DocumentQueryRouteOptions {
  readonly pool: PgSalesQueryPool;
  readonly authenticate: SalesQueryHttpOptions["authenticate"];
  readonly authenticateTransfer: TransferQueryHttpOptions["authenticate"];
  readonly policies: { readonly sales: SalesQueryAuthorization; readonly transfers: TransferQueryAuthorization };
  readonly ordinaryRead: NativeOrdinaryDocumentListOptions["runtime27"];
  readonly anchorProfile: PublishedDocumentAnchorProfile;
}

export function registerDocumentQueryRoutes(app: FastifyInstance, options: DocumentQueryRouteOptions): void {
  const { pool, authenticate, authenticateTransfer, policies, ordinaryRead, anchorProfile } = options;
  const ordinary: NativeOrdinaryDocumentListOptions = { profile: "source-confirmed-unified-native-v1", runtime27: ordinaryRead };
  const lists = new PostgresOrdinaryDocumentListReader(pool, ordinary);
  const sales = new PostgresSalesQueryReader(pool, ordinary, anchorProfile);
  const transfers = new PostgresTransferQueryReader(pool, ordinary);
  app.register(createSalesQueryHttpPlugin({
    authenticate, listProfile: "ordinary-v1", ordinaryHistory: true,
    dependencies: {
      authorization: policies.sales,
      reader: {
        readList: lists.readSalesList.bind(lists),
        readTotals: lists.readSalesTotals.bind(lists),
        readDetail: sales.readDetail.bind(sales),
        readReferences: sales.readReferences.bind(sales),
        readHistory: sales.readHistory.bind(sales),
        readSettlementStatistics: sales.readSettlementStatistics.bind(sales),
      },
    },
  }));
  app.register(createTransferQueryHttpPlugin({
    authenticate: authenticateTransfer, listProfile: "ordinary-v1", ordinaryHistory: true,
    dependencies: {
      authorization: policies.transfers,
      reader: {
        readList: lists.readTransferList.bind(lists),
        readTotals: lists.readTransferTotals.bind(lists),
        readDetail: transfers.readDetail.bind(transfers),
        readHistory: transfers.readHistory.bind(transfers),
        readWarehouses: transfers.readWarehouses.bind(transfers),
      },
    },
  }));
}
