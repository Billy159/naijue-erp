import { createHash } from "node:crypto";
import type {SqlValue} from "../../database/session.js";
import type {QueryResultRow} from "pg";

export type CommandQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[];
  rowCount: number | null;
};

export interface CommandTransaction {
  query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    parameters?: readonly SqlValue[],
  ): Promise<CommandQueryResult<Row>>;
}

export type IdempotentCommandInput<Result> = {
  actorId: string;
  commandScope: string;
  idempotencyKey: string;
  runtimeSchema: string;
  payload: unknown;
  execute: () => Promise<Result>;
};

export class CommandError extends Error {
  constructor(
    public readonly code: "VALIDATION_ERROR" | "IDEMPOTENCY_CONFLICT" | "TRANSACTION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  const visit = (item: unknown, depth: number): string => {
    if (depth > 32) throw new CommandError("VALIDATION_ERROR", "Command payload is too deeply nested");
    if (item === null || typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new CommandError("VALIDATION_ERROR", "Command payload contains a non-finite number");
      return JSON.stringify(item);
    }
    if (!item || typeof item !== "object") throw new CommandError("VALIDATION_ERROR", "Command payload is not canonical JSON");
    if (active.has(item)) throw new CommandError("VALIDATION_ERROR", "Command payload contains a cycle");
    active.add(item);
    try {
      if (Array.isArray(item)) {
        const values: string[] = [];
        for (let i = 0; i < item.length; i++) {
          if (!Object.hasOwn(item, i)) throw new CommandError("VALIDATION_ERROR", "Command payload contains a sparse array");
          values.push(visit(item[i], depth + 1));
        }
        return `[${values.join(",")}]`;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) throw new CommandError("VALIDATION_ERROR", "Command payload contains a non-JSON object");
      const record = item as Record<string, unknown>;
      return `{${Object.keys(record).sort().map(key => {
        if (record[key] === undefined) throw new CommandError("VALIDATION_ERROR", "Command payload contains an undefined value");
        return `${JSON.stringify(key)}:${visit(record[key], depth + 1)}`;
      }).join(",")}}`;
    } finally { active.delete(item); }
  };
  return visit(value, 0);
}

export function hashIdempotencyPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/** Must run inside the same transaction as the business command. */
export async function executeIdempotent<Result>(
  tx: CommandTransaction,
  input: IdempotentCommandInput<Result>,
): Promise<Result> {
  if (typeof input.runtimeSchema !== "string" || !/^\"[a-z][a-z0-9_]{0,62}\"$/.test(input.runtimeSchema)) {
    throw new CommandError("VALIDATION_ERROR", "runtime schema is invalid");
  }
  const idempotencyTable = `${input.runtimeSchema}.idempotency_request`;
  if (typeof input.actorId !== "string" || !input.actorId.trim() || typeof input.idempotencyKey !== "string"
    || !input.idempotencyKey.trim() || input.idempotencyKey.length > 200 || input.idempotencyKey.includes("\0")
    || typeof input.commandScope !== "string" || !input.commandScope.trim() || input.commandScope.length > 128 || input.commandScope.includes("\0")) {
    throw new CommandError("VALIDATION_ERROR", "commandScope and Idempotency-Key are required");
  }
  const payloadHash = hashIdempotencyPayload(input.payload);
  const inserted = await tx.query<{ id: string }>(
    `INSERT INTO ${idempotencyTable}(actor_id, command_scope, idempotency_key, payload_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (actor_id, command_scope, idempotency_key) DO NOTHING
     RETURNING id`,
    [input.actorId, input.commandScope, input.idempotencyKey, payloadHash],
  );

  if (inserted.rowCount === 0) {
    const existing = await tx.query<{ payload_hash: string; response: Result | null; completed_at: string | null }>(
      `SELECT payload_hash, response, completed_at
       FROM ${idempotencyTable}
       WHERE actor_id=$1 AND command_scope=$2 AND idempotency_key=$3
       FOR UPDATE`,
      [input.actorId, input.commandScope, input.idempotencyKey],
    );
    const request = existing.rows[0];
    if (!request) throw new CommandError("TRANSACTION_FAILED", "idempotency request disappeared");
    if (request.payload_hash !== payloadHash) {
      throw new CommandError("IDEMPOTENCY_CONFLICT", "Idempotency-Key is already bound to a different payload");
    }
    if (!request.completed_at || request.response === null) {
      throw new CommandError("TRANSACTION_FAILED", "idempotency request has no committed result");
    }
    return request.response;
  }

  const result = await input.execute();
  const completed = await tx.query(
    `UPDATE ${idempotencyTable} SET response=$4::jsonb, completed_at=now()
     WHERE actor_id=$1 AND command_scope=$2 AND idempotency_key=$3
     RETURNING id`,
    [input.actorId, input.commandScope, input.idempotencyKey, JSON.stringify(result)],
  );
  if (completed.rowCount !== 1) throw new CommandError("TRANSACTION_FAILED", "idempotency result was not recorded");
  return result;
}

export function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string {
  const value = headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key?.trim()) throw new CommandError("VALIDATION_ERROR", "Idempotency-Key header is required");
  return key.trim();
}
