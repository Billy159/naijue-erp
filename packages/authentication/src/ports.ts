import type { EntityId } from "../../domain/src/values.ts";

/** Returned only by trusted storage. Staff is the authoritative source of role and hall. */
export interface AuthenticationAccount {
  readonly accountId: EntityId<"account">;
  readonly staffId: EntityId<"staff">;
  readonly loginName: string;
  readonly passwordHash: string;
  readonly loginEnabled: boolean;
  readonly authVersion: number;
  readonly role: string;
  readonly employmentStatus: string;
  readonly hallId: EntityId<"hall"> | null;
  /** null means no referenced hall; false means the referenced hall is disabled or unavailable. */
  readonly hallEnabled: boolean | null;
}
export interface AuthenticationSession {
  readonly tokenHash: string;
  readonly accountId: EntityId<"account">;
  readonly authVersion: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}
export interface AuthenticationTransaction {
  /** Account reads must serialize login/password changes against the same account and its staff/hall status. */
  findAccountByLogin(loginName: string): Promise<AuthenticationAccount | undefined>;
  getAccount(accountId: EntityId<"account">): Promise<AuthenticationAccount | undefined>;
  /** Non-locking lookup only to identify the owning account. */
  getSession(tokenHash: string): Promise<AuthenticationSession | undefined>;
  /** Re-read and lock after the account lock; never acquire a session lock before its account. */
  lockSession(tokenHash: string, accountId: EntityId<"account">): Promise<AuthenticationSession | undefined>;
  insertSession(session: AuthenticationSession): Promise<void>;
  revokeSession(tokenHash: string, revokedAt: string): Promise<void>;
  /** Atomically replace this exact password/version, increment account/auth versions, and revoke all existing sessions. */
  changePassword(accountId: EntityId<"account">, expectedAuthVersion: number, expectedPasswordHash: string, passwordHash: string, changedAt: string): Promise<boolean>;
}
/** MUST commit or roll back all callback writes together. No default in-memory or real database is selected. */
export interface AuthenticationStore {
  transaction<T>(work: (tx: AuthenticationTransaction) => Promise<T>): Promise<T>;
}
export interface PasswordCodec {
  hash(password: string): Promise<string>;
  /** Exact supported format only. Unknown/malformed/legacy hashes must return false, never accept plaintext. */
  verify(password: string, encoded: string): Promise<boolean>;
}
export interface AuthenticationPolicy {
  readonly sessionTtlSeconds: number;
  /** Explicit persisted codes, not guessed labels. Empty/unknown roles and employment statuses fail closed. */
  readonly activeEmploymentStatuses: readonly string[];
  readonly roleHallScopes: Readonly<Record<string, "OPTIONAL_HALL" | "REQUIRED_HALL">>;
  /** Approved user-facing password rules must come from the host. Missing policy is a configuration error. */
  readonly assertNewPassword: (password: string) => void | Promise<void>;
}
export interface AuthenticationDependencies {
  readonly store: AuthenticationStore;
  readonly now: () => string;
  readonly policy: AuthenticationPolicy;
  readonly passwords: PasswordCodec;
}
export interface AuthenticationPrincipal {
  readonly accountId: EntityId<"account">;
  readonly staffId: EntityId<"staff">;
  readonly loginName: string;
  readonly role: string;
  readonly hallId: EntityId<"hall"> | null;
  readonly authVersion: number;
}
