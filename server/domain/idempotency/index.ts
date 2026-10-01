import { createHash } from "node:crypto";

export type CommandQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[];
  rowCount: number;
};

export interface CommandTransaction {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<CommandQueryResult<Row>>;
}

export type IdempotentCommandInput<Result> = {
  actorId: string;
  commandScope: string;
  idempotencyKey: string;
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

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function hashIdempotencyPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/** Must run inside the same transaction as the business command. */
export async function executeIdempotent<Result>(
  tx: CommandTransaction,
  input: IdempotentCommandInput<Result>,
): Promise<Result> {
  if (!input.idempotencyKey.trim() || !input.commandScope.trim()) {
    throw new CommandError("VALIDATION_ERROR", "commandScope and Idempotency-Key are required");
  }
  const payloadHash = hashIdempotencyPayload(input.payload);
  const inserted = await tx.query<{ id: string }>(
    `INSERT INTO idempotency_request(actor_id, command_scope, idempotency_key, payload_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (actor_id, command_scope, idempotency_key) DO NOTHING
     RETURNING id`,
    [input.actorId, input.commandScope, input.idempotencyKey, payloadHash],
  );

  if (inserted.rowCount === 0) {
    const existing = await tx.query<{ payload_hash: string; response: Result | null; completed_at: string | null }>(
      `SELECT payload_hash, response, completed_at
       FROM idempotency_request
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
  await tx.query(
    `UPDATE idempotency_request SET response=$4::jsonb, completed_at=now()
     WHERE actor_id=$1 AND command_scope=$2 AND idempotency_key=$3
     RETURNING id`,
    [input.actorId, input.commandScope, input.idempotencyKey, JSON.stringify(result)],
  );
  return result;
}

export function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string {
  const value = headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key?.trim()) throw new CommandError("VALIDATION_ERROR", "Idempotency-Key header is required");
  return key.trim();
}
