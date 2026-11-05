import type { EntityId } from "../../domain/src/values.ts";

/** Returned only by trusted storage. Staff is the authoritative source of role and hall. */
export interface AuthenticationAccount {
  readonly accountId: EntityId<"account">;
  readonly staffId: EntityId<"staff">;
  readonly loginName: string;
  /** Optional trusted staff.name display value; never a login identifier or binding rule. */
  readonly staffName?: string;
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
/** Calculation evidence only; never an authenticated principal or a substitute for a locked current read. */
export interface AuthenticationLoginSnapshot {
  readonly accountId: EntityId<"account">;
  readonly loginName: string;
  readonly passwordHash: string;
  readonly authVersion: number;
}
export interface AuthenticationPasswordChangeSnapshot {
  readonly account: AuthenticationAccount;
  readonly session: AuthenticationSession;
}
/** One current statement snapshot for query authentication. No password material,
 * session mutation or command authorization/serialization authority. */
export interface AuthenticationSessionSnapshot {
  readonly account: Omit<AuthenticationAccount, 'passwordHash'>;
  readonly session: AuthenticationSession;
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
  /** Optional explicit query-only lane; never fall back to transaction resolution. */
  readSessionSnapshot?(tokenHash: string): Promise<AuthenticationSessionSnapshot | undefined>;
  /** One unlocked statement; its lease MUST be released before this promise resolves or rejects. */
  readLoginSnapshot(loginName: string): Promise<AuthenticationLoginSnapshot | undefined>;
  /** One unlocked statement joining the session/current account/qualification; no transaction or locks. */
  readPasswordChangeSnapshot(tokenHash: string): Promise<AuthenticationPasswordChangeSnapshot | undefined>;
  transaction<T>(work: (tx: AuthenticationTransaction) => Promise<T>): Promise<T>;
}
export interface AuthenticationReadOnlyStore extends AuthenticationStore {
  /** Single unlocked joined statement; release its lease before settling. */
  readSessionSnapshot(tokenHash: string): Promise<AuthenticationSessionSnapshot | undefined>;
}
/** Only the existing locked login operations. No password/session maintenance lane. */
export type AuthenticationLoginTransaction = Pick<AuthenticationTransaction, 'getAccount' | 'insertSession'>;
/** Explicit borrowed contract, NOT AuthenticationStore. The outer owner retains
 * the one connection/transaction and must roll back on any failure. No operation
 * below may borrow/release a lease or issue transaction-control SQL. */
export interface BorrowedAuthenticationLoginOperations {
  readLoginSnapshot(loginName: string): Promise<AuthenticationLoginSnapshot | undefined>;
  withLockedAccount<T>(work: (tx: AuthenticationLoginTransaction) => Promise<T>): Promise<T>;
}
export interface BorrowedAuthenticationLoginStore {
  /** One-shot lifetime. Must await unawaited in-flight work and preserve failures
   * even when a callback catches them. Escaped handles must fail after closing. */
  runInCurrentTransaction(work: (operations: BorrowedAuthenticationLoginOperations) => Promise<void>): Promise<void>;
}
export type BorrowedAuthenticationIssuance =
  /** Acquired and retained by the parent until the physical outer outcome. */
  { readonly kind: 'PARENT_HELD_CAPACITY'; readonly assertValid: () => void }
  /** Deliberate isolated host policy, never an implicit production fallback. */
  | { readonly kind: 'ISOLATED_SYNTHETIC_NO_CAPACITY_POLICY' };
export interface BorrowedAuthenticationDependencies {
  readonly store: BorrowedAuthenticationLoginStore;
  readonly now: () => string;
  readonly policy: AuthenticationPolicy;
  readonly passwords: AuthenticationPasswordWork;
  readonly issuance: BorrowedAuthenticationIssuance;
}
/** Exact current account provisioned by NEW_EMPTY INIT, not a package account. */
export interface BorrowedAuthenticationCredentials {
  readonly loginName: string;
  readonly password: string;
  readonly accountId: EntityId<'account'>;
  readonly staffId: EntityId<'staff'>;
}
export interface ProvisionalAuthenticationSession {
  readonly state: 'PROVISIONAL_CURRENT_TRANSACTION';
  readonly token: string;
  readonly principal: AuthenticationPrincipal;
  readonly expiresAt: string;
}
export interface PasswordCodec {
  hash(password: string): Promise<string>;
  /** Exact supported format only. Unknown/malformed/legacy hashes must return false, never accept plaintext. */
  verify(password: string, encoded: string): Promise<boolean>;
}
export type PasswordWorkKind = "login" | "authenticated";
/** Shared instance budget; native computation must settle before releasing its slot, even after cancellation. */
export interface AuthenticationPasswordWork {
  verify(password: string, encoded: string | undefined, kind: PasswordWorkKind, signal?: AbortSignal): Promise<boolean>;
  hash(password: string, signal?: AbortSignal): Promise<string>;
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
  readonly passwords: AuthenticationPasswordWork;
  /** Trusted host admission for NEW issuance only. Probe before borrowing the final transaction; recheck synchronously before INSERT. */
  readonly sessionAdmission?: {
    acquire(signal?: AbortSignal): Promise<{ assertValid(): void; release(): void }>;
  };
}
export interface AuthenticationPrincipal {
  readonly accountId: EntityId<"account">;
  readonly staffId: EntityId<"staff">;
  readonly loginName: string;
  /** Present only when trusted storage supplied the actual nonblank employee name. */
  readonly staffName?: string;
  readonly role: string;
  readonly hallId: EntityId<"hall"> | null;
  readonly authVersion: number;
}
